<script setup lang="ts">
// Page publique de réservation d'un chauffeur (marque blanche, mobile-first).
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '~/lib/payment-methods'

const route = useRoute()
const slug = route.params.slug as string
const { formatMoney, formatDateTime } = useFormat()
const { t } = useI18n()

interface PublicVehicle {
  id: string
  make: string
  modelFamily: string
  modelLabel: string
  vehicleClass: string | null
  seats: number | null
  color: string | null
  isPrimary: boolean
}

interface DriverPublic {
  slug: string
  displayName: string
  tagline: string | null
  bio: string | null
  photoUrl: string | null
  phone: string | null
  contactEmail: string | null
  vehicle: { make: string | null; model: string | null; class: string | null; seats: number | null }
  vehicles: PublicVehicle[]
  services: string | null
  serviceArea: string | null
  currency: string
  minimumFareCents: number
  minLeadTimeMinutes: number
  hasTransfer: boolean
  bookingEnabled: boolean
  hasHourly: boolean
  fromKmCents: number | null
  fromHourCents: number | null
  acceptedPaymentMethods: PaymentMethod[]
}

const { data: driver, error } = await useFetch<DriverPublic>(`/api/public/${slug}`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable', fatal: true })
}
const appBase = useRuntimeConfig().public.appBaseUrl

// Véhicule agrandi au clic (lightbox).
const zoomedVehicle = ref<PublicVehicle | null>(null)

useHead(() => {
  const d = driver.value
  if (!d) return { title: t('common.appName') }
  const description = d.tagline ?? t('public.metaDescription', { name: d.displayName })
  const url = `${appBase}/${d.slug}`
  // La photo est servie en URL http (absolue ou chemin /api/public/…/photo) :
  // on la rend absolue pour les crawlers des réseaux sociaux.
  const image = d.photoUrl
    ? d.photoUrl.startsWith('http')
      ? d.photoUrl
      : `${appBase}${d.photoUrl}`
    : `${appBase}/og-default.jpg`
  return {
    title: t('public.metaTitle', { name: d.displayName }),
    meta: [
      { name: 'description', content: description },
      // Open Graph
      { property: 'og:title', content: d.displayName },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { property: 'og:type', content: 'website' },
      // Twitter Card
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: d.displayName },
      { name: 'twitter:description', content: description },
    ],
    link: [{ rel: 'canonical', href: url }],
  }
})

// ─── État du formulaire ───
const type = ref<'TRANSFER' | 'HOURLY'>(driver.value?.hasTransfer ? 'TRANSFER' : 'HOURLY')
const pickup = ref('')
const dropoff = ref('')
const roundTrip = ref(false)
const durationHours = ref(2)
const scheduledAt = ref(defaultDateTime())
const customer = reactive({ name: '', phone: '', email: '' })
const notes = ref('')
const cgvAccepted = ref(false)

function defaultDateTime(): string {
  const d = new Date(Date.now() + 3 * 3600_000)
  d.setMinutes(0, 0, 0)
  // format pour <input type="datetime-local"> (heure locale)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

const estimate = ref<{ amountCents: number; currency: string; breakdown: { label: string; amountCents: number; detail?: string }[] } | null>(null)
const estimating = ref(false)
const submitting = ref(false)
const errorMsg = ref('')
const submitted = ref(false)

async function geocode(address: string) {
  return $fetch<{ lat: number; lng: number; formatted: string }>('/api/public/geocode', {
    method: 'POST',
    body: { address },
  })
}

function isoScheduledAt(): string {
  return new Date(scheduledAt.value).toISOString()
}

async function buildPayload() {
  const base: Record<string, unknown> = { type: type.value, scheduledAt: isoScheduledAt() }
  if (type.value === 'TRANSFER') {
    const [p, d] = await Promise.all([geocode(pickup.value), geocode(dropoff.value)])
    base.pickup = { lat: p.lat, lng: p.lng }
    base.dropoff = { lat: d.lat, lng: d.lng }
    base.pickupAddress = pickup.value
    base.dropoffAddress = dropoff.value
    base.roundTrip = roundTrip.value
  } else {
    base.durationHours = durationHours.value
  }
  return base
}

async function getEstimate() {
  errorMsg.value = ''
  estimating.value = true
  estimate.value = null
  try {
    const payload = await buildPayload()
    estimate.value = await $fetch(`/api/public/${slug}/estimate`, { method: 'POST', body: payload })
  } catch (e) {
    errorMsg.value = errMessage(e)
  } finally {
    estimating.value = false
  }
}

async function submit() {
  errorMsg.value = ''
  if (!cgvAccepted.value) {
    errorMsg.value = t('public.cgvError')
    return
  }
  submitting.value = true
  try {
    const payload = await buildPayload()
    await $fetch(`/api/public/${slug}/request`, {
      method: 'POST',
      body: { ...payload, customer, notes: notes.value, cgvAccepted: true },
    })
    submitted.value = true
  } catch (e) {
    errorMsg.value = errMessage(e)
  } finally {
    submitting.value = false
  }
}

function errMessage(e: unknown): string {
  const err = e as { statusMessage?: string; data?: { statusMessage?: string; message?: string } }
  return err?.data?.statusMessage || err?.data?.message || err?.statusMessage || t('common.genericError')
}

const canEstimate = computed(() =>
  type.value === 'TRANSFER' ? pickup.value.length > 3 && dropoff.value.length > 3 : durationHours.value >= 1,
)
const canSubmit = computed(
  () => canEstimate.value && customer.name.length >= 2 && customer.phone.length >= 6 && customer.email.includes('@'),
)
</script>

<template>
  <div v-if="driver" class="mx-auto max-w-lg px-5 pb-24 pt-8">
    <!-- En-tête chauffeur -->
    <div class="card">
      <div class="flex items-center gap-4">
        <img
          v-if="driver.photoUrl"
          :src="driver.photoUrl"
          :alt="driver.displayName"
          class="h-16 w-16 rounded-full object-cover"
        />
        <div v-else class="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">
          {{ driver.displayName.charAt(0) }}
        </div>
        <div>
          <h1 class="text-xl font-bold text-slate-900">{{ driver.displayName }}</h1>
          <p v-if="driver.tagline" class="text-sm text-slate-500">{{ driver.tagline }}</p>
        </div>
      </div>
      <p v-if="driver.bio" class="mt-4 text-sm text-slate-600">{{ driver.bio }}</p>
      <div class="mt-4 flex flex-wrap gap-2 text-xs">
        <span v-if="driver.vehicle.class" class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
          {{ driver.vehicle.class }}<template v-if="driver.vehicle.seats"> · {{ $t('common.places', { count: driver.vehicle.seats }) }}</template>
        </span>
        <span v-if="driver.serviceArea" class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
          {{ driver.serviceArea }}
        </span>
      </div>
    </div>

    <!-- Véhicules -->
    <div v-if="driver.vehicles && driver.vehicles.length" class="card mt-5">
      <h2 class="text-lg font-bold text-slate-900">
        {{ driver.vehicles.length > 1 ? 'Véhicules' : 'Véhicule' }}
      </h2>
      <div class="mt-4 grid gap-4" :class="driver.vehicles.length > 1 ? 'sm:grid-cols-2' : ''">
        <button
          v-for="v in driver.vehicles"
          :key="v.id"
          type="button"
          class="group text-left"
          @click="zoomedVehicle = v"
        >
          <div class="flex h-40 items-center justify-center overflow-hidden rounded-xl bg-slate-50 transition group-hover:bg-slate-100">
            <VehicleImage
              :make="v.make"
              :model-family="v.modelFamily"
              :vehicle-class="v.vehicleClass"
              :color="v.color"
              :alt="v.modelLabel"
              class="h-full w-full p-2 transition group-hover:scale-105"
            />
          </div>
          <p class="mt-2 font-semibold text-slate-900">{{ v.modelLabel }}</p>
          <p class="text-xs text-slate-500">
            <span v-if="v.vehicleClass">{{ v.vehicleClass }}</span>
            <span v-if="v.seats"> · {{ v.seats }} places</span>
            <span v-if="v.color"> · {{ v.color }}</span>
          </p>
        </button>
      </div>
    </div>

    <!-- Lightbox véhicule -->
    <AppModal v-if="zoomedVehicle" @close="zoomedVehicle = null">
      <div class="flex h-64 items-center justify-center rounded-xl bg-slate-50">
        <VehicleImage
          :make="zoomedVehicle.make"
          :model-family="zoomedVehicle.modelFamily"
          :vehicle-class="zoomedVehicle.vehicleClass"
          :color="zoomedVehicle.color"
          :alt="zoomedVehicle.modelLabel"
          class="h-full w-full p-2"
        />
      </div>
      <p class="mt-4 text-center text-lg font-bold text-slate-900">{{ zoomedVehicle.modelLabel }}</p>
      <p class="text-center text-sm text-slate-500">
        <span v-if="zoomedVehicle.vehicleClass">{{ zoomedVehicle.vehicleClass }}</span>
        <span v-if="zoomedVehicle.seats"> · {{ zoomedVehicle.seats }} places</span>
        <span v-if="zoomedVehicle.color"> · {{ zoomedVehicle.color }}</span>
      </p>
      <div class="mt-5 flex justify-end">
        <button class="btn-ghost" @click="zoomedVehicle = null">Fermer</button>
      </div>
    </AppModal>

    <!-- Confirmation -->
    <div v-if="submitted" class="card mt-5 border-green-200 bg-green-50 text-center">
      <p class="text-3xl">✅</p>
      <h2 class="mt-2 text-lg font-bold text-green-900">{{ $t('public.submittedTitle') }}</h2>
      <p class="mt-2 text-sm text-green-800">
        {{ $t('public.submittedBody', { name: driver.displayName, email: customer.email }) }}
      </p>
    </div>

    <!-- Formulaire (toujours disponible, même si le paiement en ligne n'est pas activé) -->
    <form v-else class="card mt-5 space-y-5" @submit.prevent="submit">
      <h2 class="text-lg font-bold text-slate-900">{{ $t('public.formTitle') }}</h2>

      <!-- Moyens de paiement acceptés -->
      <div v-if="driver.acceptedPaymentMethods.length" class="rounded-xl bg-slate-50 p-3">
        <p class="text-xs font-medium text-slate-500">Moyens de paiement acceptés</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="m in driver.acceptedPaymentMethods"
            :key="m"
            class="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
          >
            {{ PAYMENT_METHOD_LABELS[m] }}
          </span>
        </div>
      </div>

      <!-- Type de prestation -->
      <div class="grid grid-cols-2 gap-2">
        <button
          v-if="driver.hasTransfer"
          type="button"
          class="rounded-xl border-2 px-3 py-3 text-sm font-semibold transition"
          :class="type === 'TRANSFER' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'"
          @click="type = 'TRANSFER'"
        >
          {{ $t('public.typeTransfer') }}
          <span v-if="driver.fromKmCents" class="block text-xs font-normal text-slate-500">
            {{ $t('public.fromPerKm', { price: formatMoney(driver.fromKmCents, driver.currency) }) }}
          </span>
        </button>
        <button
          v-if="driver.hasHourly"
          type="button"
          class="rounded-xl border-2 px-3 py-3 text-sm font-semibold transition"
          :class="type === 'HOURLY' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'"
          @click="type = 'HOURLY'"
        >
          {{ $t('public.typeHourly') }}
          <span v-if="driver.fromHourCents" class="block text-xs font-normal text-slate-500">
            {{ $t('public.fromPerHour', { price: formatMoney(driver.fromHourCents, driver.currency) }) }}
          </span>
        </button>
      </div>

      <!-- Transfert -->
      <template v-if="type === 'TRANSFER'">
        <div>
          <label class="label" for="pickup">{{ $t('public.pickupLabel') }}</label>
          <AddressField id="pickup" v-model="pickup" :placeholder="$t('public.pickupPlaceholder')" />
        </div>
        <div>
          <label class="label" for="dropoff">{{ $t('public.dropoffLabel') }}</label>
          <AddressField id="dropoff" v-model="dropoff" :placeholder="$t('public.dropoffPlaceholder')" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input v-model="roundTrip" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
          {{ $t('public.roundTrip') }}
        </label>
      </template>

      <!-- Mise à disposition -->
      <template v-else>
        <div>
          <label class="label" for="duration">{{ $t('public.durationLabel') }}</label>
          <input id="duration" v-model.number="durationHours" type="number" min="1" max="24" class="field" />
        </div>
      </template>

      <div>
        <label class="label" for="datetime">{{ $t('public.datetimeLabel') }}</label>
        <input id="datetime" v-model="scheduledAt" type="datetime-local" class="field" />
        <p class="mt-1 text-xs text-slate-500">
          {{ $t('public.leadTime', { hours: Math.round(driver.minLeadTimeMinutes / 60) }) }}
        </p>
      </div>

      <!-- Estimation -->
      <button type="button" class="btn-ghost w-full" :disabled="!canEstimate || estimating" @click="getEstimate">
        {{ estimating ? $t('public.estimating') : $t('public.estimateButton') }}
      </button>

      <div v-if="estimate" class="rounded-xl bg-slate-50 p-4">
        <div class="flex items-baseline justify-between">
          <span class="text-sm text-slate-600">{{ $t('public.estimateLabel') }}</span>
          <span class="text-2xl font-bold text-slate-900">
            {{ formatMoney(estimate.amountCents, estimate.currency) }}
          </span>
        </div>
        <ul class="mt-2 space-y-1 text-xs text-slate-500">
          <li v-for="(line, i) in estimate.breakdown" :key="i" class="flex justify-between">
            <span>{{ line.label }}<span v-if="line.detail"> — {{ line.detail }}</span></span>
            <span>{{ formatMoney(line.amountCents, estimate.currency) }}</span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-slate-400">{{ $t('public.estimateIndicative') }}</p>
      </div>

      <!-- Coordonnées client -->
      <div class="space-y-3 border-t border-slate-100 pt-4">
        <div>
          <label class="label" for="name">{{ $t('public.nameLabel') }}</label>
          <input id="name" v-model="customer.name" type="text" class="field" required />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="phone">{{ $t('public.phoneLabel') }}</label>
            <input id="phone" v-model="customer.phone" type="tel" class="field" required />
          </div>
          <div>
            <label class="label" for="email">{{ $t('public.emailLabel') }}</label>
            <input id="email" v-model="customer.email" type="email" class="field" required />
          </div>
        </div>
        <div>
          <label class="label" for="notes">{{ $t('public.notesLabel') }}</label>
          <textarea id="notes" v-model="notes" rows="2" class="field" />
        </div>
      </div>

      <!-- CGV -->
      <label class="flex items-start gap-2 text-xs text-slate-600">
        <input v-model="cgvAccepted" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>{{ $t('public.cgv') }}</span>
      </label>

      <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

      <button type="submit" class="btn-primary w-full" :disabled="!canSubmit || submitting">
        {{ submitting ? $t('public.submitting') : $t('public.submitButton') }}
      </button>
    </form>

    <p class="mt-6 text-center text-xs text-slate-400">
      {{ $t('common.securePayment') }}
    </p>
  </div>
</template>
