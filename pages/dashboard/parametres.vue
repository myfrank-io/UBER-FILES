<script setup lang="ts">
// Réglages chauffeur : configuration paiement Stripe + aperçu des grilles tarifaires.
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Réglages' })
const { formatMoney } = useFormat()

const { data: me, refresh } = await useFetch('/api/dashboard/me')
const connecting = ref(false)

async function connectStripe() {
  connecting.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/dashboard/stripe/onboard', { method: 'POST' })
    if (res.url) window.location.href = res.url
  } catch {
    connecting.value = false
  }
}

const route = useRoute()
onMounted(() => {
  if (route.query.stripe) refresh()
})

const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
function minuteToTime(m: number) {
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}h${String(min).padStart(2, '0')}`
}
</script>

<template>
  <div v-if="me" class="max-w-2xl">
    <h1 class="text-2xl font-bold text-slate-900">Réglages</h1>

    <!-- Page publique -->
    <div class="card mt-5">
      <h2 class="font-semibold text-slate-900">Ma page publique</h2>
      <p class="mt-1 text-sm text-slate-600">
        Accessible sur
        <NuxtLink :to="`/${me.slug}`" class="font-medium text-brand-700 hover:underline">/{{ me.slug }}</NuxtLink>
      </p>
    </div>

    <!-- Stripe -->
    <div class="card mt-4">
      <h2 class="font-semibold text-slate-900">Paiement (Stripe)</h2>
      <div class="mt-3">
        <p v-if="me.stripe.chargesEnabled" class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
          ✅ Compte actif — paiements et reversements activés
        </p>
        <p v-else-if="me.stripe.connected" class="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">
          ⏳ Onboarding à finaliser
        </p>
        <p v-else class="text-sm text-slate-500">Aucun compte de paiement configuré.</p>
      </div>
      <button class="btn-primary mt-4" :disabled="connecting" @click="connectStripe">
        {{ connecting ? '…' : me.stripe.connected ? 'Reprendre l’onboarding' : 'Configurer les paiements' }}
      </button>
    </div>

    <!-- Grilles tarifaires -->
    <div class="card mt-4">
      <h2 class="font-semibold text-slate-900">Grille transfert (€/km par horaire)</h2>
      <table class="mt-3 w-full text-sm">
        <tbody>
          <tr v-for="b in me.transferBands" :key="b.id" class="border-b border-slate-100">
            <td class="py-2 font-medium text-slate-800">{{ b.name }}</td>
            <td class="py-2 text-slate-500">
              {{ b.daysOfWeek.length ? b.daysOfWeek.map((d: number) => dayNames[d]).join(', ') : 'Tous les jours' }}
            </td>
            <td class="py-2 text-slate-500">{{ minuteToTime(b.startMinute) }}–{{ minuteToTime(b.endMinute) }}</td>
            <td class="py-2 text-right font-semibold text-slate-900">{{ formatMoney(b.pricePerKmCents, me.currency) }}/km</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card mt-4">
      <h2 class="font-semibold text-slate-900">Grille mise à disposition (dégressive)</h2>
      <table class="mt-3 w-full text-sm">
        <tbody>
          <tr v-for="t in me.hourlyTiers" :key="t.id" class="border-b border-slate-100">
            <td class="py-2 font-medium text-slate-800">À partir de {{ t.minHours }}h</td>
            <td class="py-2 text-right font-semibold text-slate-900">{{ formatMoney(t.pricePerHourCents, me.currency) }}/h</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card mt-4">
      <h2 class="font-semibold text-slate-900">Paramètres</h2>
      <ul class="mt-3 space-y-1 text-sm text-slate-600">
        <li>Prix minimum : <strong>{{ formatMoney(me.minimumFareCents, me.currency) }}</strong></li>
        <li>Délai minimum de réservation : <strong>{{ Math.round(me.minLeadTimeMinutes / 60) }}h</strong></li>
        <li>Validité des devis : <strong>{{ me.quoteExpiryHours }}h</strong></li>
        <li>Trajet d'approche bloqué : <strong>{{ me.approachBufferMinutes }} min</strong></li>
        <li v-if="me.cancellationPolicy">
          Annulation gratuite jusqu'à <strong>{{ me.cancellationPolicy.freeUntilHours }}h</strong> avant
          (sinon {{ me.cancellationPolicy.retainedPercent }}% retenus)
        </li>
      </ul>
    </div>
  </div>
</template>
