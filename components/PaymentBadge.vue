<script setup lang="ts">
// Pastille « comment la course est (ou sera) réglée » — visible en un coup d'œil
// sur chaque réservation (liste, détail, tableau de bord).
import { isOnSiteMethod, PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'

const props = defineProps<{
  // Moyen du paiement (PaymentMethod) et son statut (PaymentStatus).
  method?: string | null
  status?: string | null
  // Statut de la réservation : on masque « à encaisser » sur une course annulée.
  bookingStatus?: string | null
}>()

const info = computed(() => {
  const method = (props.method ?? null) as PaymentMethod | null
  const onSite = method ? isOnSiteMethod(method) : false
  const label = method ? PAYMENT_METHOD_SHORT_LABELS[method] : ''
  switch (props.status) {
    case 'PAID':
      return onSite
        ? { text: `✅ Payé sur place — ${label}`, cls: 'bg-green-100 text-green-800' }
        : { text: '💳 Payé en ligne', cls: 'bg-green-100 text-green-800' }
    case 'PENDING':
      if (props.bookingStatus === 'CANCELLED') return null
      return onSite
        ? { text: `📍 À encaisser sur place — ${label}`, cls: 'bg-amber-100 text-amber-800' }
        : { text: '⏳ Paiement en ligne en attente', cls: 'bg-amber-100 text-amber-800' }
    case 'REFUNDED':
      return { text: '↩ Remboursé', cls: 'bg-slate-100 text-slate-600' }
    case 'PARTIALLY_REFUNDED':
      return { text: '↩ Partiellement remboursé', cls: 'bg-slate-100 text-slate-600' }
    default:
      return null
  }
})
</script>

<template>
  <span
    v-if="info"
    class="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
    :class="info.cls"
  >
    {{ info.text }}
  </span>
</template>
