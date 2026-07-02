<script setup lang="ts">
// Base clients (« portefeuille clientèle privée ») avec export CSV.
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Clients' })
const { formatMoney, formatDateTime } = useFormat()

const { data: customers } = await useFetch('/api/dashboard/customers', { lazy: true })

function exportCsv() {
  if (!customers.value) return
  const rows = [
    ['Nom', 'Téléphone', 'Email', 'Courses', 'Total', 'Dernière course'],
    ...customers.value.map((c) => [
      c.name,
      c.phone,
      c.email,
      String(c.ridesCount),
      (c.totalSpentCents / 100).toFixed(2),
      c.lastRideAt ? new Date(c.lastRideAt).toLocaleDateString('fr-FR') : '',
    ]),
  ]
  const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
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
      <h1 class="text-2xl font-bold text-slate-900">Clients</h1>
      <p v-if="!customers" class="mt-1 text-sm text-slate-400">Chargement…</p>
      <button v-if="customers?.length" class="btn-ghost !py-2 text-sm" @click="exportCsv">
        Exporter CSV
      </button>
    </div>

    <p v-if="customers && !customers.length" class="mt-4 text-sm text-slate-500">
      Aucun client pour le moment.
    </p>

    <div class="mt-5 space-y-3">
      <div v-for="c in customers" :key="c.id" class="card flex items-center justify-between">
        <div>
          <p class="font-semibold text-slate-900">{{ c.name }}</p>
          <p class="text-sm text-slate-500">{{ c.phone }} · {{ c.email }}</p>
          <p v-if="c.lastRideAt" class="mt-1 text-xs text-slate-400">
            Dernière course : {{ formatDateTime(c.lastRideAt) }}
          </p>
        </div>
        <div class="text-right">
          <p class="font-bold text-slate-900">{{ formatMoney(c.totalSpentCents) }}</p>
          <p class="text-xs text-slate-500">{{ c.ridesCount }} course(s)</p>
        </div>
      </div>
    </div>
  </div>
</template>
