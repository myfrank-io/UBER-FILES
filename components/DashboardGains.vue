<script setup lang="ts">
// Bloc « Gains » — affiché en onglet interne du tableau de bord (Accueil).
const { formatMoney } = useFormat()

const period = ref<'week' | 'month' | 'year'>('month')
const { data, refresh } = await useFetch('/api/dashboard/earnings', {
  lazy: true,
  query: computed(() => ({ period: period.value })),
})

watch(period, () => refresh())

const breakdown = computed(() => (data.value?.breakdown ?? []) as Record<string, unknown>[])
const totals = computed(() => (data.value?.totals ?? {}) as Record<string, number>)

const maxGross = computed(() =>
  Math.max(...breakdown.value.map((r) => r.grossCents as number), 1),
)

function exportCsv() {
  if (!breakdown.value.length) return
  const rows = [
    ['Période', 'Brut (€)', 'Commission (€)', 'Net (€)', 'Paiements', 'Courses'],
    ...breakdown.value.map((r) => [
      r.label as string,
      ((r.grossCents as number) / 100).toFixed(2),
      ((r.feeCents as number) / 100).toFixed(2),
      ((r.netCents as number) / 100).toFixed(2),
      String(r.payments),
      String(r.bookings),
    ]),
  ]
  const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gains-${period.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="max-w-2xl">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-900">Gains</h2>
      <div class="flex items-center gap-3">
        <p v-if="!data" class="text-sm text-slate-400">Chargement…</p>
        <button class="btn-ghost !py-2 text-sm" @click="exportCsv">Exporter CSV</button>
      </div>
    </div>

    <!-- Totaux globaux -->
    <div v-if="data" class="mt-5 grid grid-cols-3 gap-3">
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Total encaissé</p>
        <p class="mt-1 text-xl font-bold text-slate-900">{{ formatMoney(totals.grossCents) }}</p>
      </div>
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Net (après commission)</p>
        <p class="mt-1 text-xl font-bold text-green-700">{{ formatMoney(totals.netCents) }}</p>
      </div>
      <div class="card !p-4">
        <p class="text-xs text-slate-500">Courses à venir</p>
        <p class="mt-1 text-xl font-bold text-slate-900">{{ totals.upcomingBookings }}</p>
      </div>
    </div>

    <!-- Sélecteur de période -->
    <div class="mt-6 flex gap-2">
      <button
        v-for="p in [{ v: 'week', l: 'Semaine' }, { v: 'month', l: 'Mois' }, { v: 'year', l: 'Année' }]"
        :key="p.v"
        class="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
        :class="period === p.v ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
        @click="period = p.v as 'week' | 'month' | 'year'"
      >
        {{ p.l }}
      </button>
    </div>

    <!-- Graphique en barres -->
    <div v-if="breakdown.length" class="card mt-4">
      <div class="flex items-end gap-1" style="height: 120px">
        <div
          v-for="r in breakdown"
          :key="r.label as string"
          class="group relative flex flex-1 flex-col items-center justify-end"
        >
          <div
            class="w-full rounded-t bg-brand-500 transition-all"
            :style="{ height: `${Math.max(4, ((r.grossCents as number) / maxGross) * 100)}px` }"
          />
          <!-- Tooltip -->
          <div class="absolute bottom-full mb-1 hidden rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block whitespace-nowrap">
            {{ formatMoney(r.grossCents as number) }}<br />{{ r.payments }} paiement(s)
          </div>
        </div>
      </div>
      <!-- Labels -->
      <div class="mt-2 flex gap-1">
        <div v-for="r in breakdown" :key="r.label as string" class="flex-1 text-center text-[10px] text-slate-400">
          {{ r.label }}
        </div>
      </div>
    </div>

    <!-- Tableau détaillé -->
    <div class="card mt-4">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <th class="pb-2 text-left font-medium">Période</th>
            <th class="pb-2 text-right font-medium">Brut</th>
            <th class="pb-2 text-right font-medium">Commission</th>
            <th class="pb-2 text-right font-medium">Net</th>
            <th class="pb-2 text-right font-medium">Courses</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in breakdown"
            :key="r.label as string"
            class="border-b border-slate-50"
            :class="(r.grossCents as number) > 0 ? '' : 'opacity-40'"
          >
            <td class="py-2 font-medium text-slate-700">{{ r.label }}</td>
            <td class="py-2 text-right text-slate-700">{{ formatMoney(r.grossCents as number) }}</td>
            <td class="py-2 text-right text-slate-400">
              {{ (r.feeCents as number) > 0 ? `− ${formatMoney(r.feeCents as number)}` : '—' }}
            </td>
            <td class="py-2 text-right font-semibold text-slate-900">{{ formatMoney(r.netCents as number) }}</td>
            <td class="py-2 text-right text-slate-500">{{ r.bookings }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t border-slate-200 font-semibold">
            <td class="pt-3 text-slate-900">Total</td>
            <td class="pt-3 text-right text-slate-900">{{ formatMoney(totals.grossCents) }}</td>
            <td class="pt-3 text-right text-slate-400">
              {{ totals.feeCents > 0 ? `− ${formatMoney(totals.feeCents)}` : '—' }}
            </td>
            <td class="pt-3 text-right text-green-700">{{ formatMoney(totals.netCents) }}</td>
            <td class="pt-3 text-right text-slate-500">{{ totals.payments }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
