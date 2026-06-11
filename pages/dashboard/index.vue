<script setup lang="ts">
// Tableau de bord chauffeur : devis à valider + courses à venir + statistiques.
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Tableau de bord' })
const { formatMoney, formatDateTime } = useFormat()

const { data, refresh, pending } = await useFetch('/api/dashboard/overview')

const busyId = ref<string | null>(null)
const adjustValue = reactive<Record<string, number>>({})
const errorMsg = ref('')

async function validate(quoteId: string, custom = false) {
  busyId.value = quoteId
  errorMsg.value = ''
  try {
    const body = custom && adjustValue[quoteId] ? { amountCents: Math.round(adjustValue[quoteId] * 100) } : {}
    await $fetch(`/api/dashboard/quotes/${quoteId}/validate`, { method: 'POST', body })
    await refresh()
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    busyId.value = null
  }
}

async function reject(quoteId: string) {
  if (!confirm('Refuser ce devis ?')) return
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
  errorMsg.value = ''
  try {
    await $fetch(`/api/dashboard/quotes/${quoteId}/resend`, { method: 'POST' })
    await refresh()
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-slate-900">Tableau de bord</h1>

    <!-- Stats -->
    <div v-if="data" class="mt-5 grid grid-cols-3 gap-3">
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Courses confirmées</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">{{ data.stats.confirmed }}</p>
      </div>
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Annulées</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">{{ data.stats.cancelled }}</p>
      </div>
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Encaissé</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">
          {{ formatMoney(data.stats.totalRevenueCents) }}
        </p>
      </div>
    </div>

    <p v-if="errorMsg" class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

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
            <p class="text-xs text-slate-500">{{ q.ride.customerPhone }}</p>
          </div>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {{ q.ride.type === 'TRANSFER' ? 'Transfert' : 'Mise à dispo' }}
          </span>
        </div>

        <div class="mt-3 space-y-1 text-sm text-slate-600">
          <p>📅 {{ formatDateTime(q.ride.scheduledAt) }}</p>
          <p v-if="q.ride.type === 'TRANSFER'">
            📍 {{ q.ride.pickupAddress }} → {{ q.ride.dropoffAddress }}
            <span v-if="q.ride.roundTrip" class="text-xs text-slate-400">(A/R)</span>
          </p>
          <p v-else>⏱️ {{ q.ride.durationHours }} h</p>
          <p v-if="q.ride.notes" class="italic text-slate-400">« {{ q.ride.notes }} »</p>
        </div>

        <div class="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
          <span class="text-xs text-slate-500">Prix calculé</span>
          <span class="text-xl font-bold text-slate-900">{{ formatMoney(q.amountCents, q.currency) }}</span>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button class="btn-primary flex-1" :disabled="busyId === q.id" @click="validate(q.id)">
            {{ busyId === q.id ? '…' : 'Valider & envoyer' }}
          </button>
          <button class="btn-ghost" :disabled="busyId === q.id" @click="reject(q.id)">Refuser</button>
        </div>
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
      </div>
    </section>

    <!-- Devis expirés -->
    <section v-if="data?.expiredQuotes.length" class="mt-8">
      <h2 class="text-lg font-semibold text-slate-900">Devis expirés sans paiement</h2>
      <div v-for="q in data.expiredQuotes" :key="q.id" class="card mt-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-semibold text-slate-900">{{ q.ride.customerName }}</p>
            <p class="text-xs text-slate-500">{{ q.ride.customerEmail }}</p>
          </div>
          <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Expiré</span>
        </div>
        <div class="mt-2 space-y-1 text-sm text-slate-600">
          <p>📅 {{ formatDateTime(q.ride.scheduledAt) }}</p>
          <p v-if="q.ride.type === 'TRANSFER'">
            📍 {{ q.ride.pickupAddress }} → {{ q.ride.dropoffAddress }}
            <span v-if="q.ride.roundTrip" class="text-xs text-slate-400">(A/R)</span>
          </p>
          <p v-else>⏱️ {{ q.ride.durationHours }} h</p>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span class="font-bold text-slate-900">{{ formatMoney(q.amountCents, q.currency) }}</span>
          <button class="btn-primary text-sm" :disabled="busyId === q.id" @click="resend(q.id)">
            {{ busyId === q.id ? '…' : '↩ Renvoyer le lien' }}
          </button>
        </div>
      </div>
    </section>

    <!-- Courses à venir -->
    <section class="mt-8">
      <h2 class="text-lg font-semibold text-slate-900">Courses à venir</h2>
      <p v-if="data && !data.upcomingBookings.length" class="mt-3 text-sm text-slate-500">
        Aucune course planifiée.
      </p>
      <div v-for="b in data?.upcomingBookings" :key="b.id" class="card mt-3 flex items-center justify-between">
        <div>
          <p class="font-semibold text-slate-900">{{ b.customerName }}</p>
          <p class="text-sm text-slate-600">{{ formatDateTime(b.scheduledAt) }}</p>
          <p class="text-xs text-slate-500">
            <template v-if="b.type === 'TRANSFER'">{{ b.pickupAddress }} → {{ b.dropoffAddress }}</template>
            <template v-else>Mise à disposition — {{ b.durationHours }} h</template>
          </p>
        </div>
        <span class="font-bold text-slate-900">{{ formatMoney(b.amountCents, b.currency) }}</span>
      </div>
    </section>

    <p v-if="pending" class="mt-4 text-sm text-slate-400">Chargement…</p>
  </div>
</template>
