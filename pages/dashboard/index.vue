<script setup lang="ts">
// Tableau de bord chauffeur : devis à valider + courses à venir + statistiques.
// Les anciens onglets « Gains » et « Clients » sont désormais intégrés ici en
// sous-onglets pour épurer la navigation principale.
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Tableau de bord' })
const { formatMoney, formatDateTime } = useFormat()

// Onglets internes, synchronisés avec l'URL (?tab=) pour être partageables et
// résister au rafraîchissement.
const tabs = [
  { key: 'overview', label: 'Vue d’ensemble' },
  { key: 'gains', label: 'Gains' },
  { key: 'clients', label: 'Clients' },
] as const
type TabKey = (typeof tabs)[number]['key']

const route = useRoute()
const router = useRouter()
const tab = computed<TabKey>(() => {
  const q = route.query.tab
  return tabs.some((t) => t.key === q) ? (q as TabKey) : 'overview'
})
function selectTab(key: TabKey) {
  router.replace({ query: key === 'overview' ? {} : { tab: key } })
}

// lazy : la navigation s'affiche immédiatement, les données arrivent ensuite.
const { data, refresh, pending } = await useFetch('/api/dashboard/overview', { lazy: true })
const { error: toastError, success: toastSuccess } = useToast()

const busyId = ref<string | null>(null)
const adjustValue = reactive<Record<string, number>>({})

// Les demandes expirées sont « archivées » : repliées par défaut pour épurer le
// tableau de bord, mais toujours accessibles d'un clic.
const showExpired = ref(false)

// Les devis en attente de paiement restent discrets : section repliée par
// défaut (le compteur reste visible), dépliable d'un clic.
const showSent = ref(false)

async function validate(quoteId: string, custom = false) {
  busyId.value = quoteId
  try {
    const body = custom && adjustValue[quoteId] ? { amountCents: Math.round(adjustValue[quoteId] * 100) } : {}
    const res = await $fetch<{ confirmed?: boolean }>(`/api/dashboard/quotes/${quoteId}/validate`, { method: 'POST', body })
    // Acceptation directe (règlement sur place) : la course est confirmée sans
    // étape client ; sinon le devis part au client (lien de paiement/confirmation).
    toastSuccess(
      res?.confirmed
        ? 'Course confirmée — le client a été prévenu par email.'
        : 'Devis envoyé au client.',
    )
    await refresh()
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    busyId.value = null
  }
}

async function reject(quoteId: string) {
  if (!confirm('Refuser cette demande ? Le client sera prévenu par email.')) return
  busyId.value = quoteId
  try {
    await $fetch(`/api/dashboard/quotes/${quoteId}/reject`, { method: 'POST' })
    await refresh()
  } finally {
    busyId.value = null
  }
}

async function resend(quoteId: string) {
  busyId.value = quoteId
  try {
    await $fetch(`/api/dashboard/quotes/${quoteId}/resend`, { method: 'POST', body: {} })
    toastSuccess('Email envoyé au client.')
    await refresh()
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div>
    <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">Tableau de bord</h1>

    <!-- Onglets internes -->
    <div class="mt-4 flex gap-1 border-b border-slate-200">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors"
        :class="tab === t.key
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'"
        @click="selectTab(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Onglet Gains -->
    <DashboardGains v-if="tab === 'gains'" class="mt-6" />

    <!-- Onglet Clients -->
    <DashboardClients v-else-if="tab === 'clients'" class="mt-6" />

    <!-- Onglet Vue d'ensemble -->
    <div v-else class="mt-6">
    <p v-if="pending && !data" class="mt-4 text-sm text-slate-400">Chargement…</p>

    <!-- Stats -->
    <div v-if="data" class="mt-5 grid grid-cols-3 gap-3">
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Courses confirmées</p>
        <p class="mt-1 font-serif text-2xl font-medium tracking-tight text-slate-900">{{ data.stats.confirmed }}</p>
      </div>
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Annulées</p>
        <p class="mt-1 font-serif text-2xl font-medium tracking-tight text-slate-900">{{ data.stats.cancelled }}</p>
      </div>
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Encaissé</p>
        <p class="mt-1 font-serif text-2xl font-medium tracking-tight text-slate-900">
          {{ formatMoney(data.stats.totalRevenueCents) }}
        </p>
      </div>
    </div>

    <!-- Devis en attente -->
    <section class="mt-8">
      <h2 class="text-lg font-semibold text-slate-900">
        Demandes à valider
        <span v-if="data?.pendingQuotes.length" class="ml-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white">
          {{ data.pendingQuotes.length }}
        </span>
      </h2>

      <p v-if="data && !data.pendingQuotes.length" class="mt-3 text-sm text-slate-500">
        Aucune demande en attente.
      </p>

      <div v-for="q in data?.pendingQuotes" :key="q.id" class="card mt-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-semibold text-slate-900">{{ q.ride.customerName }}</p>
            <ContactActions class="mt-1" :phone="q.ride.customerPhone" />
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
              {{ q.ride.type === 'TRANSFER' ? 'Transfert' : 'Mise à dispo' }}
            </span>
            <!-- Règlement attendu, en un coup d'œil -->
            <span
              v-if="q.payment"
              class="rounded-full px-2.5 py-1 text-xs font-medium"
              :class="q.payment.kind === 'ONLINE' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'"
            >
              {{ q.payment.kind === 'ONLINE' ? '💳' : '📍' }} {{ q.payment.label }}
            </span>
          </div>
        </div>

        <div class="mt-3 space-y-1 text-sm text-slate-600">
          <p>📅 {{ formatDateTime(q.ride.scheduledAt) }}</p>
          <div v-if="q.ride.type === 'TRANSFER'">
            <RideRoute nav wrap :pickup="q.ride.pickupAddress" :dropoff="q.ride.dropoffAddress" />
            <span v-if="q.ride.roundTrip" class="mt-0.5 inline-block text-xs text-slate-400">Aller-retour</span>
          </div>
          <p v-else>⏱️ {{ q.ride.durationHours }} h</p>
          <p v-if="q.ride.notes" class="italic text-slate-400">« {{ q.ride.notes }} »</p>
        </div>

        <div class="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
          <span class="text-xs text-slate-500">Prix calculé</span>
          <span class="font-serif text-xl font-medium tracking-tight text-slate-900">{{ formatMoney(q.amountCents, q.currency) }}</span>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button class="btn-primary flex-1" :disabled="busyId === q.id" @click="validate(q.id)">
            {{ busyId === q.id ? '…' : q.directAccept ? 'Accepter la réservation' : 'Valider & envoyer' }}
          </button>
          <button class="btn-ghost" :disabled="busyId === q.id" @click="reject(q.id)">Refuser</button>
        </div>
        <p v-if="q.directAccept" class="mt-2 text-xs text-slate-500">
          En acceptant, la course est confirmée immédiatement — le client est prévenu par email.
        </p>
        <div class="mt-2 flex items-center gap-2">
          <input
            v-model.number="adjustValue[q.id]"
            type="number"
            step="0.01"
            class="field !py-2 text-sm"
            :placeholder="`Ajuster (${(q.amountCents / 100).toFixed(2)} €)`"
          />
          <button class="btn-ghost !py-2 text-sm" :disabled="busyId === q.id || !adjustValue[q.id]" @click="validate(q.id, true)">
            Ajuster
          </button>
        </div>
        <p class="mt-1 text-xs text-slate-400">
          Si vous ajustez le prix, le client devra accepter le nouveau tarif (envoyé par email).
        </p>
      </div>
    </section>

    <!-- Devis envoyés : en attente de paiement/confirmation du client.
         Repliés par défaut pour rester discrets (compteur toujours visible). -->
    <section v-if="data?.sentQuotes.length" class="mt-8">
      <button
        class="flex w-full items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700"
        :aria-expanded="showSent"
        @click="showSent = !showSent"
      >
        <span class="transition-transform" :class="showSent ? 'rotate-90' : ''">›</span>
        <span>En attente du client</span>
        <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          ⏳ {{ data.sentQuotes.length }}
        </span>
      </button>

      <div v-show="showSent" class="mt-3">
      <p class="text-xs text-slate-500">
        Devis envoyés — la course sera confirmée dès le paiement (ou la réservation) du client.
      </p>

      <div v-for="q in data.sentQuotes" :key="q.id" class="card mt-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-semibold text-slate-900">{{ q.ride.customerName }}</p>
            <ContactActions class="mt-1" :phone="q.ride.customerPhone" :email="q.ride.customerEmail" />
          </div>
          <!-- Ce que l'on attend du client : paiement en ligne ou acceptation (sur place) -->
          <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            ⏳ {{ q.payment?.kind === 'ONSITE' ? "Attente d'acceptation" : 'Attente paiement' }}
          </span>
        </div>
        <div class="mt-2 space-y-1 text-sm text-slate-600">
          <p>📅 {{ formatDateTime(q.ride.scheduledAt) }}</p>
          <div v-if="q.ride.type === 'TRANSFER'">
            <RideRoute nav wrap :pickup="q.ride.pickupAddress" :dropoff="q.ride.dropoffAddress" />
            <span v-if="q.ride.roundTrip" class="mt-0.5 inline-block text-xs text-slate-400">Aller-retour</span>
          </div>
          <p v-else>⏱️ {{ q.ride.durationHours }} h</p>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            <span class="font-bold text-slate-900">{{ formatMoney(q.amountCents, q.currency) }}</span>
            <p class="text-xs text-slate-400">Valable jusqu'au {{ formatDateTime(q.expiresAt) }}</p>
          </div>
          <button class="btn-ghost text-sm" :disabled="busyId === q.id" @click="resend(q.id)">
            {{ busyId === q.id ? '…' : '↩ Relancer le client' }}
          </button>
        </div>
      </div>
      </div>
    </section>

    <!-- Courses à venir -->
    <section class="mt-8">
      <h2 class="text-lg font-semibold text-slate-900">Courses à venir</h2>
      <p v-if="data && !data.upcomingBookings.length" class="mt-3 text-sm text-slate-500">
        Aucune course planifiée.
      </p>
      <div v-for="b in data?.upcomingBookings" :key="b.id" class="card mt-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-semibold text-slate-900">{{ b.customerName }}</p>
          <p class="text-sm text-slate-600">{{ formatDateTime(b.scheduledAt) }}</p>
          <RideRoute
            v-if="b.type === 'TRANSFER'"
            nav
            class="text-xs text-slate-500"
            :pickup="b.pickupAddress"
            :dropoff="b.dropoffAddress"
          />
          <p v-else class="text-xs text-slate-500">
            Mise à disposition — {{ b.durationHours }} h<template v-if="b.pickupAddress"> · <NavAddress :address="b.pickupAddress" /></template>
          </p>
          <!-- Règlement de la course, en un coup d'œil -->
          <PaymentBadge
            v-if="b.payment"
            class="mt-1.5"
            :method="b.payment.method"
            :status="b.payment.status"
          />
          <ContactActions class="mt-2" :phone="b.customerPhone" :show-phone="false" />
        </div>
        <span class="shrink-0 font-bold text-slate-900">{{ formatMoney(b.amountCents, b.currency) }}</span>
      </div>
    </section>

    <!-- Demandes expirées (archivées) : repliées par défaut, discrètes, en fin de page -->
    <section v-if="data?.expiredQuotes.length" class="mt-8">
      <button
        class="flex w-full items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-600"
        :aria-expanded="showExpired"
        @click="showExpired = !showExpired"
      >
        <span class="transition-transform" :class="showExpired ? 'rotate-90' : ''">›</span>
        <span>Demandes expirées</span>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {{ data.expiredQuotes.length }}
        </span>
      </button>

      <div v-show="showExpired" class="mt-3 space-y-3">
      <div v-for="q in data.expiredQuotes" :key="q.id" class="card opacity-75 hover:opacity-100">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-semibold text-slate-900">{{ q.ride.customerName }}</p>
            <ContactActions class="mt-1" :email="q.ride.customerEmail" />
          </div>
          <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Expiré</span>
        </div>
        <div class="mt-2 space-y-1 text-sm text-slate-600">
          <p>📅 {{ formatDateTime(q.ride.scheduledAt) }}</p>
          <div v-if="q.ride.type === 'TRANSFER'">
            <RideRoute nav wrap :pickup="q.ride.pickupAddress" :dropoff="q.ride.dropoffAddress" />
            <span v-if="q.ride.roundTrip" class="mt-0.5 inline-block text-xs text-slate-400">Aller-retour</span>
          </div>
          <p v-else>⏱️ {{ q.ride.durationHours }} h</p>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span class="font-bold text-slate-900">{{ formatMoney(q.amountCents, q.currency) }}</span>
          <span class="text-xs text-slate-400">Expirée — le client peut refaire une demande</span>
        </div>
      </div>
      </div>
    </section>

    <p v-if="pending" class="mt-4 text-sm text-slate-400">Chargement…</p>
    </div>
  </div>
</template>
