<script setup lang="ts">
// Page publique de réservation d'un chauffeur (marque blanche, mobile-first).
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_SHORT_LABELS,
  type PaymentMethod,
} from '~/lib/payment-methods'

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

interface BookingModePublic {
  // La demande aboutit sans validation manuelle du chauffeur.
  instant: boolean
  autoConfirm: boolean
  onlineAvailable: boolean
  onlineRequired: boolean
  onSiteMethods: PaymentMethod[]
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
  bookingMode: BookingModePublic
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

function toDatetimeLocal(d: Date): string {
  // format pour <input type="datetime-local"> (heure locale)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

function defaultDateTime(): string {
  const leadMs = (driver.value?.minLeadTimeMinutes ?? 180) * 60_000
  const d = new Date(Date.now() + Math.max(leadMs, 3 * 3600_000))
  d.setMinutes(0, 0, 0)
  // L'arrondi à l'heure ne doit pas retomber sous le délai minimum.
  if (d.getTime() < Date.now() + leadMs) d.setTime(d.getTime() + 3600_000)
  return toDatetimeLocal(d)
}

// Borne basse du sélecteur : impossible de choisir une date déjà passée ou sous le
// délai minimum de réservation (l'erreur n'apparaissait sinon qu'à l'estimation).
const minScheduledAt = computed(() =>
  toDatetimeLocal(new Date(Date.now() + (driver.value?.minLeadTimeMinutes ?? 0) * 60_000)),
)

const estimate = ref<{ amountCents: number; currency: string; breakdown: { label: string; amountCents: number; detail?: string }[] } | null>(null)
const estimating = ref(false)
const submitting = ref(false)
const errorMsg = ref('')
const submitted = ref(false)
// Résultat d'une confirmation immédiate (règlement sur place, créneau libre).
const confirmedBooking = ref(false)
const manageUrl = ref<string | null>(null)
// La demande envoyée attend-elle un règlement sur place ? (adapte le message de succès)
const submittedOnSite = ref(false)

// ─── Choix du règlement (quand plusieurs options existent) ───
interface PaymentOption {
  value: PaymentMethod
  label: string
  hint: string
}

const paymentOptions = computed<PaymentOption[]>(() => {
  const m = driver.value?.bookingMode
  if (!m) return []
  const options: PaymentOption[] = []
  if (m.onlineAvailable) {
    options.push({
      value: 'STRIPE_PREPAYMENT',
      label: m.autoConfirm ? t('public.payOnlineNow') : t('public.payOnlineLater'),
      hint: m.autoConfirm ? t('public.payOnlineNowHint') : t('public.payOnlineLaterHint'),
    })
  }
  for (const method of m.onSiteMethods) {
    options.push({
      value: method,
      label: t('public.payOnSiteOption', { method: PAYMENT_METHOD_SHORT_LABELS[method] }),
      hint: m.autoConfirm ? t('public.payOnSiteInstantHint') : t('public.payOnSiteManualHint'),
    })
  }
  return options
})

const selectedPayment = ref<PaymentMethod | null>(null)
watchEffect(() => {
  if (!selectedPayment.value && paymentOptions.value.length) {
    selectedPayment.value = paymentOptions.value[0]!.value
  }
})
const selectedIsOnline = computed(() => selectedPayment.value === 'STRIPE_PREPAYMENT')

// Flux en deux étapes : 1) course + estimation, 2) coordonnées du client.
// Les coordonnées ne sont demandées qu'après avoir estimé et cliqué sur « Réserver ».
const step = ref<'details' | 'contact'>('details')

// Toute modification de la course invalide l'estimation (et ramène à l'étape 1) :
// on ne peut pas réserver sur un prix périmé.
watch([type, pickup, dropoff, roundTrip, durationHours, scheduledAt], () => {
  estimate.value = null
  step.value = 'details'
})

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
    // Mise à disposition : le lieu de prise en charge est requis aussi.
    const p = await geocode(pickup.value)
    base.pickup = { lat: p.lat, lng: p.lng }
    base.pickupAddress = pickup.value
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
    const res = await $fetch<{
      ok: boolean
      payUrl?: string | null
      confirmed?: boolean
      manageUrl?: string | null
    }>(`/api/public/${slug}/request`, {
      method: 'POST',
      body: {
        ...payload,
        customer,
        notes: notes.value,
        cgvAccepted: true,
        paymentMethod: selectedPayment.value ?? undefined,
      },
    })
    // Paiement en ligne immédiat : on emmène directement le client sur la page
    // de paiement du devis (pas d'attente de validation).
    if (res.payUrl) {
      await navigateTo(res.payUrl, { external: true })
      return
    }
    // Confirmation immédiate (règlement sur place) : la course est déjà réservée.
    if (res.confirmed) {
      confirmedBooking.value = true
      manageUrl.value = res.manageUrl ?? null
      return
    }
    submittedOnSite.value = selectedPayment.value
      ? !selectedIsOnline.value
      : !driver.value?.bookingMode.onlineAvailable
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
  type.value === 'TRANSFER'
    ? pickup.value.length > 3 && dropoff.value.length > 3
    : pickup.value.length > 3 && durationHours.value >= 1,
)
const canSubmit = computed(
  () => Boolean(estimate.value) && customer.name.length >= 2 && customer.phone.length >= 6 && customer.email.includes('@'),
)

// Libellé du bouton de réservation : « Réserver et payer » quand l'envoi mène
// directement au paiement en ligne, sinon « Réserver ».
const reserveLabel = computed(() =>
  selectedIsOnline.value && driver.value?.bookingMode.autoConfirm
    ? t('public.reserveAndPay')
    : t('public.reserve'),
)

// Passage à l'étape « coordonnées » une fois le prix estimé.
function goToContact() {
  if (!estimate.value) return
  errorMsg.value = ''
  step.value = 'contact'
}
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
        <span
          v-if="driver.bookingMode.instant"
          class="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700"
        >
          ⚡ {{ $t('public.instantBooking') }}
        </span>
        <span v-else class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
          ✋ {{ $t('public.driverConfirms') }}
        </span>
        <span v-if="driver.vehicle.class" class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
          {{ driver.vehicle.class }}<template v-if="driver.vehicle.seats"> · {{ $t('common.places', { count: driver.vehicle.seats }) }}</template>
        </span>
        <span v-if="driver.serviceArea" class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
          {{ driver.serviceArea }}
        </span>
      </div>
    </div>

    <!-- Véhicules (compact, intégré) -->
    <div v-if="driver.vehicles && driver.vehicles.length" class="mt-3">
      <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        {{ driver.vehicles.length > 1 ? 'Véhicules' : 'Véhicule' }}
      </p>
      <div class="flex gap-2.5 overflow-x-auto pb-1">
        <button
          v-for="v in driver.vehicles"
          :key="v.id"
          type="button"
          class="group flex w-32 shrink-0 flex-col rounded-xl border border-slate-100 bg-white p-2 transition hover:border-slate-200 hover:shadow-sm"
          @click="zoomedVehicle = v"
        >
          <div class="flex h-16 w-full items-center justify-center">
            <VehicleImage
              :make="v.make"
              :model-family="v.modelFamily"
              :vehicle-class="v.vehicleClass"
              :color="v.color"
              :alt="v.modelLabel"
              class="h-full w-full transition group-hover:scale-105"
            />
          </div>
          <p class="mt-1.5 w-full truncate text-xs font-medium text-slate-700">{{ v.modelLabel }}</p>
          <p class="w-full truncate text-[11px] text-slate-400">
            <span v-if="v.vehicleClass">{{ v.vehicleClass }}</span>
            <span v-if="v.seats"> · {{ v.seats }} pl.</span>
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

    <!-- Course confirmée immédiatement (règlement sur place, créneau libre) -->
    <div v-if="confirmedBooking" class="card mt-5 border-green-200 bg-green-50 text-center">
      <p class="text-3xl">✅</p>
      <h2 class="mt-2 text-lg font-bold text-green-900">{{ $t('public.confirmedTitle') }}</h2>
      <p class="mt-2 text-sm text-green-800">
        {{ $t('public.confirmedBody', { name: driver.displayName, email: customer.email }) }}
      </p>
      <a v-if="manageUrl" :href="manageUrl" class="btn-primary mt-4 inline-block">
        {{ $t('public.manageBooking') }}
      </a>
    </div>

    <!-- Demande transmise, en attente de validation du chauffeur -->
    <div v-else-if="submitted" class="card mt-5 border-green-200 bg-green-50 text-center">
      <p class="text-3xl">✅</p>
      <h2 class="mt-2 text-lg font-bold text-green-900">{{ $t('public.submittedTitle') }}</h2>
      <p class="mt-2 text-sm text-green-800">
        {{
          submittedOnSite
            ? $t('public.submittedBodyOnSite', { name: driver.displayName, email: customer.email })
            : $t('public.submittedBody', { name: driver.displayName, email: customer.email })
        }}
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

      <!-- Étape 1 : course + estimation (les coordonnées ne sont pas encore demandées) -->
      <template v-if="step === 'details'">
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
            <label class="label" for="pickup-hourly">{{ $t('public.pickupLabel') }}</label>
            <AddressField id="pickup-hourly" v-model="pickup" :placeholder="$t('public.pickupPlaceholder')" />
          </div>
          <div>
            <label class="label" for="duration">{{ $t('public.durationLabel') }}</label>
            <input id="duration" v-model.number="durationHours" type="number" min="1" max="24" class="field" />
          </div>
        </template>

        <div>
          <label class="label" for="datetime">{{ $t('public.datetimeLabel') }}</label>
          <input id="datetime" v-model="scheduledAt" type="datetime-local" class="field" :min="minScheduledAt" />
          <p class="mt-1 text-xs text-slate-500">
            {{ $t('public.leadTime', { hours: Math.round(driver.minLeadTimeMinutes / 60) }) }}
          </p>
        </div>

        <!-- Estimation -->
        <button type="button" class="btn-ghost w-full" :disabled="!canEstimate || estimating" @click="getEstimate">
          {{ estimating ? $t('public.estimating') : $t('public.estimateButton') }}
        </button>

        <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

        <template v-if="estimate">
          <div class="rounded-xl bg-slate-50 p-4">
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

          <!-- Réserver → passe à la saisie des coordonnées -->
          <button type="button" class="btn-primary w-full" @click="goToContact">
            {{ reserveLabel }}
          </button>
        </template>
      </template>

      <!-- Étape 2 : coordonnées du client -->
      <template v-else>
        <!-- Rappel de la course estimée -->
        <div v-if="estimate" class="rounded-xl bg-slate-50 p-4">
          <div class="flex items-baseline justify-between">
            <span class="text-sm text-slate-600">{{ $t('public.estimateLabel') }}</span>
            <span class="text-2xl font-bold text-slate-900">
              {{ formatMoney(estimate.amountCents, estimate.currency) }}
            </span>
          </div>
          <button
            type="button"
            class="mt-2 text-xs font-medium text-brand-700 hover:underline"
            @click="step = 'details'"
          >
            ← {{ $t('public.modifyTrip') }}
          </button>
        </div>

        <!-- Coordonnées client -->
        <div class="space-y-3">
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

        <!-- Règlement : choix quand plusieurs options, simple rappel sinon -->
        <div v-if="paymentOptions.length > 1" class="space-y-2">
          <p class="label">{{ $t('public.paymentQuestion') }}</p>
          <label
            v-for="opt in paymentOptions"
            :key="opt.value"
            class="flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition"
            :class="selectedPayment === opt.value ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-brand-200'"
          >
            <input v-model="selectedPayment" type="radio" :value="opt.value" class="mt-0.5" name="payment-choice" />
            <span class="flex-1">
              <span class="text-sm font-medium text-slate-800">{{ opt.label }}</span>
              <span class="mt-0.5 block text-xs text-slate-500">{{ opt.hint }}</span>
            </span>
          </label>
        </div>
        <p v-else-if="paymentOptions.length === 1" class="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {{ paymentOptions[0]!.label }} · {{ paymentOptions[0]!.hint }}
        </p>

        <!-- CGV -->
        <label class="flex items-start gap-2 text-xs text-slate-600">
          <input v-model="cgvAccepted" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>{{ $t('public.cgv') }}</span>
        </label>

        <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="!canSubmit || submitting">
          {{ submitting ? $t('public.submitting') : reserveLabel }}
        </button>
      </template>
    </form>

    <!-- Mention paiement sécurisé : uniquement si le paiement en ligne est proposé -->
    <p v-if="driver.bookingMode.onlineAvailable" class="mt-6 text-center text-xs text-slate-400">
      {{ $t('common.securePayment') }}
    </p>
  </div>
</template>
