<script setup lang="ts">
// Onglet « Courses » : regroupe l'agenda (ex-Calendrier), la liste des
// réservations (ex-Réservations) et le portefeuille clients en trois vues
// commutables. Une seule destination pour tout ce qui touche aux courses.
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Mes courses' })

// Vues internes, synchronisées avec l'URL (?vue=) pour être partageables et
// résister au rafraîchissement.
const views = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'liste', label: 'Liste' },
  { key: 'clients', label: 'Clients' },
] as const
type ViewKey = (typeof views)[number]['key']

const route = useRoute()
const router = useRouter()
const view = computed<ViewKey>(() => {
  const q = route.query.vue
  return views.some((v) => v.key === q) ? (q as ViewKey) : 'agenda'
})
function selectView(key: ViewKey) {
  router.replace({ query: key === 'agenda' ? {} : { vue: key } })
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">Mes courses</h1>

    <!-- Sélecteur de vue : segments pleine largeur, grandes zones tactiles. -->
    <div class="mt-4 flex rounded-xl bg-slate-100 p-1 sm:max-w-sm">
      <button
        v-for="v in views"
        :key="v.key"
        class="min-h-[44px] flex-1 rounded-lg px-3 text-sm font-medium transition-colors"
        :class="view === v.key
          ? 'bg-white text-brand-700 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'"
        @click="selectView(v.key)"
      >
        {{ v.label }}
      </button>
    </div>

    <div class="mt-5">
      <DashboardAgenda v-if="view === 'agenda'" />
      <DashboardBookingsList v-else-if="view === 'liste'" />
      <DashboardClients v-else />
    </div>
  </div>
</template>
