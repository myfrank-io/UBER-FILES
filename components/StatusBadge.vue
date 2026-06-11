<script setup lang="ts">
defineProps<{ status: string }>()

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  CONFIRMED: { label: 'Confirmée', cls: 'bg-green-100 text-green-800' },
  COMPLETED: { label: 'Terminée', cls: 'bg-slate-100 text-slate-600' },
  CANCELLED: { label: 'Annulée', cls: 'bg-red-100 text-red-700' },
  PENDING_PAYMENT: { label: 'En attente', cls: 'bg-amber-100 text-amber-800' },
  ACTIVE: { label: 'Actif', cls: 'bg-green-100 text-green-800' },
  SUSPENDED: { label: 'Suspendu', cls: 'bg-red-100 text-red-700' },
  PENDING: { label: 'En attente', cls: 'bg-amber-100 text-amber-800' },
  SENT: { label: 'Envoyé', cls: 'bg-blue-100 text-blue-800' },
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-600' },
  EXPIRED: { label: 'Expiré', cls: 'bg-amber-100 text-amber-800' },
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
    :class="STATUS_MAP[status]?.cls ?? 'bg-slate-100 text-slate-600'"
  >
    {{ STATUS_MAP[status]?.label ?? status }}
  </span>
</template>
