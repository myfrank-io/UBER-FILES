<script setup lang="ts">
// Accueil chauffeur, recentré sur l'actionnable : demandes à valider, relances,
// courses du jour. Le planning complet et l'historique vivent dans l'onglet
// « Courses » ; les anciens sous-onglets Gains/Clients ont été retirés (Clients
// est désormais une vue de l'onglet Courses).
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Accueil' })
const { formatMoney, formatDateTime } = useFormat()

// lazy : la navigation s'affiche immédiatement, les données arrivent ensuite.
const { data, refresh, pending } = await useFetch('/api/dashboard/overview', { lazy: true })

// Slug + statut (même clé auto-générée que le layout → une seule requête) :
// icône « voir ma page publique » à côté du titre, seulement quand la page
// est en ligne (profil ACTIVE — sinon elle renverrait un 404).
const { data: me } = await useFetch('/api/dashboard/me')
const publicPath = computed(() => {
  const d = me.value as { slug?: string; status?: string } | null
  return d?.status === 'ACTIVE' && d?.slug ? `/${d.slug}` : null
})
const { error: toastError, success: toastSuccess } = useToast()

const busyId = ref<string | null>(null)
const adjustValue = reactive<Record<string, number>>({})

// Les devis en attente de paiement restent discrets : section repliée par
// défaut (le compteur reste visible), dépliable d'un clic.
const showSent = ref(false)

// ─── Courses du jour ─────────────────────────────────────────────────────────
// L'accueil ne montre que les courses d'aujourd'hui ; le reste du planning est
// dans l'onglet Courses (une seule source de vérité, plus de liste en doublon).

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

const todayRides = computed(() =>
  (data.value?.upcomingBookings ?? []).filter((b) => isToday(b.scheduledAt)),
)
// Prochaine course (hors aujourd'hui) : affichée quand la journée est vide,
// pour ne jamais laisser l'accueil muet sur la suite.
const nextRide = computed(() =>
  (data.value?.upcomingBookings ?? []).find((b) => !isToday(b.scheduledAt)) ?? null,
)

// Fiche course partagée (mêmes actions que dans l'onglet Courses).
const selectedBookingId = ref<string | null>(null)

// ─── Actions sur les devis ───────────────────────────────────────────────────

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
    <div class="flex items-center gap-2.5">
      <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">Accueil</h1>
      <!-- Ouvre la vitrine publique du chauffeur dans un nouvel onglet -->
      <a
        v-if="publicPath"
        :href="publicPath"
        target="_blank"
        rel="noopener"
        class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:text-brand-700"
        aria-label="Voir ma page publique"
        title="Voir ma page publique"
      >
        <svg class="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" />
          <path d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" />
        </svg>
      </a>
    </div>

    <!-- Onboarding guidé : disparaît une fois la configuration obligatoire faite. -->
    <DashboardOnboarding class="mt-5" />

    <p v-if="pending && !data" class="mt-4 text-sm text-slate-400">Chargement…</p>

    <!-- Devis en attente -->
    <section class="mt-6">
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
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
              {{ q.ride.type === 'TRANSFER' ? 'Transfert' : 'Mise à dispo' }}
            </span>
            <!-- Règlement attendu, en un coup d'œil -->
            <span
              v-if="q.payment"
              class="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
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
          <button class="btn-primary flex-1 whitespace-nowrap" :disabled="busyId === q.id" @click="validate(q.id)">
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
            class="field !py-2"
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

    <!-- Aujourd'hui : les courses du jour, fiche complète au tap. Le planning
         entier vit dans l'onglet Courses. -->
    <section class="mt-8">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-lg font-semibold text-slate-900">Aujourd'hui</h2>
        <NuxtLink to="/dashboard/courses" class="text-sm font-medium text-brand-700 hover:text-brand-800">
          Tout le planning →
        </NuxtLink>
      </div>

      <p v-if="data && !todayRides.length" class="mt-3 text-sm text-slate-500">
        Aucune course aujourd'hui.
      </p>

      <!-- Nom + prix sur la première ligne, le trajet en pleine largeur dessous. -->
      <button
        v-for="b in todayRides"
        :key="b.id"
        class="card mt-3 block w-full cursor-pointer text-left transition-colors hover:border-brand-200"
        @click="selectedBookingId = b.id"
      >
        <div class="flex items-baseline justify-between gap-3">
          <p class="min-w-0 truncate font-semibold text-slate-900">{{ b.customerName }}</p>
          <span class="shrink-0 font-bold text-slate-900">{{ formatMoney(b.amountCents, b.currency) }}</span>
        </div>
        <p class="text-sm text-slate-600">{{ formatDateTime(b.scheduledAt) }}</p>
        <RideRoute
          v-if="b.type === 'TRANSFER'"
          class="mt-1 text-xs text-slate-500"
          :pickup="b.pickupAddress"
          :dropoff="b.dropoffAddress"
        />
        <p v-else class="mt-1 text-xs text-slate-500">
          Mise à disposition — {{ b.durationHours }} h
        </p>
        <!-- Règlement de la course, en un coup d'œil -->
        <PaymentBadge
          v-if="b.payment"
          class="mt-1.5"
          :method="b.payment.method"
          :status="b.payment.status"
        />
      </button>

      <!-- Journée vide : on montre quand même la prochaine course planifiée. -->
      <button
        v-if="data && !todayRides.length && nextRide"
        class="card mt-3 block w-full cursor-pointer text-left transition-colors hover:border-brand-200"
        @click="selectedBookingId = nextRide.id"
      >
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Prochaine course</p>
        <div class="mt-1 flex items-baseline justify-between gap-3">
          <p class="min-w-0 truncate font-semibold text-slate-900">{{ nextRide.customerName }}</p>
          <span class="shrink-0 font-bold text-slate-900">{{ formatMoney(nextRide.amountCents, nextRide.currency) }}</span>
        </div>
        <p class="text-sm text-slate-600">{{ formatDateTime(nextRide.scheduledAt) }}</p>
        <RideRoute
          v-if="nextRide.type === 'TRANSFER'"
          class="mt-1 text-xs text-slate-500"
          :pickup="nextRide.pickupAddress"
          :dropoff="nextRide.dropoffAddress"
        />
        <p v-else class="mt-1 text-xs text-slate-500">
          Mise à disposition — {{ nextRide.durationHours }} h
        </p>
      </button>
    </section>

    <!-- Devis envoyés : en attente de paiement/confirmation du client.
         Repliés par défaut pour rester discrets (compteur toujours visible). -->
    <section v-if="data?.sentQuotes.length" class="mt-8">
      <button
        class="flex min-h-[44px] w-full items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700"
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
          <span class="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            ⏳ {{ q.payment?.kind === 'ONSITE' ? 'Attente client' : 'Attente paiement' }}
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
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div class="min-w-0">
            <span class="font-bold text-slate-900">{{ formatMoney(q.amountCents, q.currency) }}</span>
            <p class="text-xs text-slate-400">Valable jusqu'au {{ formatDateTime(q.expiresAt) }}</p>
          </div>
          <button class="btn-ghost shrink-0 whitespace-nowrap text-sm" :disabled="busyId === q.id" @click="resend(q.id)">
            {{ busyId === q.id ? '…' : '↩ Relancer' }}
          </button>
        </div>
      </div>
      </div>
    </section>

    <p v-if="pending" class="mt-4 text-sm text-slate-400">Chargement…</p>

    <!-- Fiche course partagée (courses du jour / prochaine course) -->
    <BookingDetail
      v-if="selectedBookingId"
      :booking-id="selectedBookingId"
      @close="selectedBookingId = null"
      @changed="refresh()"
    />
  </div>
</template>
