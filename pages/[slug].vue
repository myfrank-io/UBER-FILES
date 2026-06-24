<script setup lang="ts">
// Page publique de réservation d'un chauffeur (marque blanche, mobile-first).
const route = useRoute()
const slug = route.params.slug as string
const { formatMoney, formatDateTime } = useFormat()

interface DriverPublic {
  slug: string
  displayName: string
  tagline: string | null
  bio: string | null
  photoUrl: string | null
  vehicle: { make: string | null; model: string | null; class: string | null; seats: number | null }
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
}

const { data: driver, error } = await useFetch<DriverPublic>(`/api/public/${slug}`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable', fatal: true })
}
const appBase = useRuntimeConfig().public.appBaseUrl

useHead(() => {
  const d = driver.value
  if (!d) return { title: 'Réservation VTC' }
  const description = d.tagline ?? `Réservez votre course avec ${d.displayName}. Devis instantané, paiement sécurisé.`
  const url = `${appBase}/${d.slug}`
  // Les crawlers (réseaux sociaux) ne peuvent pas récupérer une data URL : on ne
  // l'utilise comme image de partage que si c'est une URL http(s) accessible.
  const image = d.photoUrl?.startsWith('http') ? d.photoUrl : `${appBase}/og-default.jpg`
  return {
    title: `${d.displayName} — Réservation VTC`,
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
    errorMsg.value = 'Veuillez accepter les conditions générales de vente.'
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
  return err?.data?.statusMessage || err?.data?.message || err?.statusMessage || 'Une erreur est survenue.'
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
          {{ driver.vehicle.class }}<template v-if="driver.vehicle.seats"> · {{ driver.vehicle.seats }} places</template>
        </span>
        <span v-if="driver.serviceArea" class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
          {{ driver.serviceArea }}
        </span>
      </div>
    </div>

    <!-- Confirmation -->
    <div v-if="submitted" class="card mt-5 border-green-200 bg-green-50 text-center">
      <p class="text-3xl">✅</p>
      <h2 class="mt-2 text-lg font-bold text-green-900">Demande envoyée !</h2>
      <p class="mt-2 text-sm text-green-800">
        {{ driver.displayName }} va valider votre devis. Vous recevrez un email à
        <strong>{{ customer.email }}</strong> avec le lien de paiement.
      </p>
    </div>

    <!-- Réservations désactivées (Stripe pas encore actif) -->
    <div v-else-if="!driver.bookingEnabled" class="card mt-5 rounded-2xl border-amber-200 bg-amber-50 p-6 text-center">
      <p class="text-2xl">⏳</p>
      <p class="mt-2 font-semibold text-amber-900">Réservations bientôt disponibles</p>
      <p class="mt-1 text-sm text-amber-800">
        Le paiement en ligne n'est pas encore activé. Contactez
        <template v-if="driver.phone">
          <a :href="`tel:${driver.phone}`" class="underline">{{ driver.phone }}</a>
        </template>
        <template v-else-if="driver.contactEmail">
          <a :href="`mailto:${driver.contactEmail}`" class="underline">{{ driver.contactEmail }}</a>
        </template>
        <template v-else>le chauffeur directement</template>
        pour réserver.
      </p>
    </div>

    <!-- Formulaire -->
    <form v-else class="card mt-5 space-y-5" @submit.prevent="submit">
      <h2 class="text-lg font-bold text-slate-900">Réservez votre course</h2>

      <!-- Type de prestation -->
      <div class="grid grid-cols-2 gap-2">
        <button
          v-if="driver.hasTransfer"
          type="button"
          class="rounded-xl border-2 px-3 py-3 text-sm font-semibold transition"
          :class="type === 'TRANSFER' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'"
          @click="type = 'TRANSFER'"
        >
          Transfert (A → B)
          <span v-if="driver.fromKmCents" class="block text-xs font-normal text-slate-500">
            dès {{ formatMoney(driver.fromKmCents, driver.currency) }}/km
          </span>
        </button>
        <button
          v-if="driver.hasHourly"
          type="button"
          class="rounded-xl border-2 px-3 py-3 text-sm font-semibold transition"
          :class="type === 'HOURLY' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'"
          @click="type = 'HOURLY'"
        >
          Mise à disposition
          <span v-if="driver.fromHourCents" class="block text-xs font-normal text-slate-500">
            dès {{ formatMoney(driver.fromHourCents, driver.currency) }}/h
          </span>
        </button>
      </div>

      <!-- Transfert -->
      <template v-if="type === 'TRANSFER'">
        <div>
          <label class="label" for="pickup">Adresse de départ</label>
          <AddressField id="pickup" v-model="pickup" placeholder="Ex : Aéroport CDG, Terminal 2E" />
        </div>
        <div>
          <label class="label" for="dropoff">Adresse d'arrivée</label>
          <AddressField id="dropoff" v-model="dropoff" placeholder="Ex : 10 rue de Rivoli, Paris" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input v-model="roundTrip" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
          Aller-retour
        </label>
      </template>

      <!-- Mise à disposition -->
      <template v-else>
        <div>
          <label class="label" for="duration">Durée souhaitée (heures)</label>
          <input id="duration" v-model.number="durationHours" type="number" min="1" max="24" class="field" />
        </div>
      </template>

      <div>
        <label class="label" for="datetime">Date et heure</label>
        <input id="datetime" v-model="scheduledAt" type="datetime-local" class="field" />
        <p class="mt-1 text-xs text-slate-500">
          Réservation au plus tôt {{ Math.round(driver.minLeadTimeMinutes / 60) }}h à l'avance.
        </p>
      </div>

      <!-- Estimation -->
      <button type="button" class="btn-ghost w-full" :disabled="!canEstimate || estimating" @click="getEstimate">
        {{ estimating ? 'Calcul…' : 'Estimer le prix' }}
      </button>

      <div v-if="estimate" class="rounded-xl bg-slate-50 p-4">
        <div class="flex items-baseline justify-between">
          <span class="text-sm text-slate-600">Estimation</span>
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
        <p class="mt-2 text-xs text-slate-400">Prix indicatif, soumis à validation du chauffeur.</p>
      </div>

      <!-- Coordonnées client -->
      <div class="space-y-3 border-t border-slate-100 pt-4">
        <div>
          <label class="label" for="name">Votre nom</label>
          <input id="name" v-model="customer.name" type="text" class="field" required />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="phone">Téléphone</label>
            <input id="phone" v-model="customer.phone" type="tel" class="field" required />
          </div>
          <div>
            <label class="label" for="email">Email</label>
            <input id="email" v-model="customer.email" type="email" class="field" required />
          </div>
        </div>
        <div>
          <label class="label" for="notes">Précisions (optionnel)</label>
          <textarea id="notes" v-model="notes" rows="2" class="field" />
        </div>
      </div>

      <!-- CGV -->
      <label class="flex items-start gap-2 text-xs text-slate-600">
        <input v-model="cgvAccepted" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>
          J'accepte les conditions générales de vente et reconnais que, s'agissant d'un service
          daté, le droit de rétractation de 14 jours ne s'applique pas (art. L221-28 du Code de la
          consommation).
        </span>
      </label>

      <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

      <button type="submit" class="btn-primary w-full" :disabled="!canSubmit || submitting">
        {{ submitting ? 'Envoi…' : 'Envoyer la demande' }}
      </button>
    </form>

    <p class="mt-6 text-center text-xs text-slate-400">
      Paiement sécurisé · Créneau garanti après paiement
    </p>
  </div>
</template>
