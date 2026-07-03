<script setup lang="ts">
// Trajet d'une course : départ et arrivée sur DEUX lignes distinctes et bien
// différenciées (pastille verte « Départ » / épingle rouge « Arrivée »), au lieu
// de « départ → arrivée » sur une seule ligne.
// `nav`  : rend les adresses cliquables vers le GPS (Waze) — côté chauffeur.
// `wrap` : affiche l'adresse en entier (retour à la ligne) au lieu de la tronquer,
//          pour les contextes spacieux (modale, pages client).
withDefaults(
  defineProps<{
    pickup?: string | null
    dropoff?: string | null
    nav?: boolean
    wrap?: boolean
  }>(),
  { pickup: null, dropoff: null, nav: false, wrap: false },
)
</script>

<template>
  <span class="flex min-w-0 flex-col gap-1">
    <!-- Départ -->
    <span class="flex min-w-0 items-start gap-2">
      <span class="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border-2 border-emerald-500 bg-white"></span>
      <span class="mt-px shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Départ</span>
      <NavAddress v-if="nav && pickup" :address="pickup" class="min-w-0 flex-1" :class="wrap ? 'break-words' : 'truncate'" />
      <span v-else class="min-w-0 flex-1" :class="wrap ? 'break-words' : 'truncate'">{{ pickup }}</span>
    </span>
    <!-- Arrivée -->
    <span v-if="dropoff" class="flex min-w-0 items-start gap-2">
      <span class="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500 ring-2 ring-rose-100"></span>
      <span class="mt-px shrink-0 text-[10px] font-semibold uppercase tracking-wide text-rose-600">Arrivée</span>
      <NavAddress v-if="nav" :address="dropoff" class="min-w-0 flex-1" :class="wrap ? 'break-words' : 'truncate'" />
      <span v-else class="min-w-0 flex-1" :class="wrap ? 'break-words' : 'truncate'">{{ dropoff }}</span>
    </span>
  </span>
</template>
