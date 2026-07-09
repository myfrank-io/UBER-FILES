<script setup lang="ts">
// Bloc « Clients » (portefeuille clientèle privée) — onglet interne du tableau de bord.
const { formatMoney, formatDateTime } = useFormat()

const { data: customers } = await useFetch('/api/dashboard/customers', { lazy: true })

function exportCsv() {
  if (!customers.value) return
  const rows = [
    ['Nom', 'Téléphone', 'Email', 'Courses', 'Total', 'Dernière course'],
    ...customers.value.map((c) => [
      c.name,
      c.phone,
      c.email ?? '',
      String(c.ridesCount),
      (c.totalSpentCents / 100).toFixed(2),
      c.lastRideAt ? new Date(c.lastRideAt).toLocaleDateString('fr-FR') : '',
    ]),
  ]
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'clients.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-900">Clients</h2>
      <div class="flex items-center gap-3">
        <p v-if="!customers" class="text-sm text-slate-400">Chargement…</p>
        <button v-if="customers?.length" class="btn-ghost !py-2 text-sm" @click="exportCsv">
          Exporter CSV
        </button>
      </div>
    </div>

    <p v-if="customers && !customers.length" class="mt-4 text-sm text-slate-500">
      Aucun client pour le moment.
    </p>

    <div class="mt-5 space-y-3">
      <div v-for="c in customers" :key="c.id" class="card">
        <div class="flex items-baseline justify-between gap-3">
          <p class="min-w-0 truncate font-semibold text-slate-900">{{ c.name }}</p>
          <p class="shrink-0 whitespace-nowrap font-bold text-slate-900">
            {{ formatMoney(c.totalSpentCents) }}
            <span class="text-xs font-normal text-slate-500">· {{ c.ridesCount }} course(s)</span>
          </p>
        </div>
        <!-- Coordonnées en clair (sélectionnables pour copier), en plus des
             boutons d'action ci-dessous. -->
        <div class="mt-1 text-sm text-slate-600">
          <p v-if="c.phone" class="select-all">{{ c.phone }}</p>
          <p v-if="c.email" class="select-all break-all">{{ c.email }}</p>
        </div>
        <ContactActions class="mt-1.5" :phone="c.phone" :email="c.email" />
        <p v-if="c.lastRideAt" class="mt-1.5 text-xs text-slate-400">
          Dernière course : {{ formatDateTime(c.lastRideAt) }}
        </p>
      </div>
    </div>
  </div>
</template>
