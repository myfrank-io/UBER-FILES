<script setup lang="ts">
// Carte de suivi de course (client). MapLibre GL + tuiles vectorielles
// OpenFreeMap (sans clé), chargés dynamiquement côté navigateur uniquement.
// La position du chauffeur est interpolée entre deux mises à jour (Telegram
// envoie ~toutes les 10-30 s) pour un déplacement fluide, et la caméra recadre
// en douceur sur le duo véhicule ↔ point de rendez-vous.
import type maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { decodePolyline, type RidePhase } from '~/lib/tracking'

interface LatLng {
  lat: number
  lng: number
}

const props = defineProps<{
  phase: RidePhase
  driverPosition: (LatLng & { heading?: number | null }) | null
  pickup: LatLng | null
  dropoff: LatLng | null
  /** Polyline encodée Google de l'itinéraire courant (null = pas de tracé). */
  polyline: string | null
}>()

// Style « positron » : fond clair très sobre — l'itinéraire cuivre et le
// véhicule nuit de la charte ressortent, façon carte de VTC premium.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

const container = ref<HTMLDivElement | null>(null)
const failed = ref(false)

let map: MapLibreMap | null = null
let ready = false
let driverMarker: Marker | null = null
let driverRotator: HTMLElement | null = null
let pickupMarker: Marker | null = null
let dropoffMarker: Marker | null = null
let animationFrame = 0
// Position/cap actuellement AFFICHÉS (point de départ de l'interpolation).
let shown: { lat: number; lng: number; heading: number } | null = null
let reduceMotion = false

// Silhouette de véhicule vue de dessus (pointe vers le nord), liseré blanc pour
// rester lisible sur tous les fonds. La rotation suit le cap du chauffeur.
const CAR_SVG = `
<svg viewBox="0 0 24 40" width="26" height="43" aria-hidden="true">
  <path d="M12 1.5 C16.5 1.5 19 3.6 19 8.2 L19 31.8 C19 36.4 16.5 38.5 12 38.5 C7.5 38.5 5 36.4 5 31.8 L5 8.2 C5 3.6 7.5 1.5 12 1.5 Z"
        fill="#0E1B2C" stroke="#ffffff" stroke-width="2.2" />
  <path d="M7.1 12.4 C10 10.9 14 10.9 16.9 12.4 L15.7 16.8 C13.3 15.7 10.7 15.7 8.3 16.8 Z" fill="#42586E" />
  <path d="M7.7 30.8 C10.3 32.1 13.7 32.1 16.3 30.8 L15.9 27.5 C13.4 28.5 10.6 28.5 8.1 27.5 Z" fill="#42586E" />
</svg>`

const targetPoint = computed<LatLng | null>(() =>
  props.phase === 'ON_BOARD' ? (props.dropoff ?? props.pickup) : (props.pickup ?? props.dropoff),
)

function lineData(coords: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
}

function routeCoordinates(): [number, number][] {
  if (props.polyline) return decodePolyline(props.polyline)
  // Sans itinéraire calculé : trait direct véhicule → cible (mieux que rien).
  if (props.driverPosition && targetPoint.value) {
    return [
      [props.driverPosition.lng, props.driverPosition.lat],
      [targetPoint.value.lng, targetPoint.value.lat],
    ]
  }
  return []
}

function updateRoute() {
  if (!map || !ready) return
  const source = map.getSource('route') as import('maplibre-gl').GeoJSONSource | undefined
  source?.setData(lineData(routeCoordinates()))
}

/** Interpolation du cap par l'arc le plus court (349° → 3° passe par le nord). */
function mixHeading(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180
  return (from + delta * t + 360) % 360
}

function setDriverDisplayed(lat: number, lng: number, heading: number) {
  shown = { lat, lng, heading }
  driverMarker?.setLngLat([lng, lat])
  if (driverRotator) driverRotator.style.transform = `rotate(${heading}deg)`
}

function animateDriverTo(pos: LatLng & { heading?: number | null }) {
  if (!driverMarker || !shown || reduceMotion) {
    // Premier point (ou préférence « moins d'animations ») : placement direct.
    ensureDriverMarker(pos)
    setDriverDisplayed(pos.lat, pos.lng, pos.heading ?? shown?.heading ?? 0)
    return
  }
  cancelAnimationFrame(animationFrame)
  const from = { ...shown }
  const to = { lat: pos.lat, lng: pos.lng, heading: pos.heading ?? shown.heading }
  const duration = 1100
  const start = performance.now()
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
  const step = (nowTs: number) => {
    const t = Math.min(1, (nowTs - start) / duration)
    const k = ease(t)
    setDriverDisplayed(
      from.lat + (to.lat - from.lat) * k,
      from.lng + (to.lng - from.lng) * k,
      mixHeading(from.heading, to.heading, k),
    )
    if (t < 1) animationFrame = requestAnimationFrame(step)
  }
  animationFrame = requestAnimationFrame(step)
}

function ensureDriverMarker(pos: LatLng & { heading?: number | null }) {
  if (!map) return
  if (!driverMarker) {
    const el = document.createElement('div')
    el.className = 'track-car'
    el.innerHTML = `<div class="track-car-rotator">${CAR_SVG}</div>`
    driverRotator = el.querySelector<HTMLElement>('.track-car-rotator')
    driverMarker = new maplibreModule!.Marker({ element: el, anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map)
    setDriverDisplayed(pos.lat, pos.lng, pos.heading ?? 0)
  }
}

function removeDriverMarker() {
  cancelAnimationFrame(animationFrame)
  driverMarker?.remove()
  driverMarker = null
  driverRotator = null
  shown = null
}

function dotMarker(kind: 'pickup' | 'dropoff'): HTMLElement {
  const el = document.createElement('div')
  el.className = kind === 'pickup' ? 'track-pin' : 'track-pin track-pin--dest'
  el.innerHTML = '<span class="track-pin-pulse"></span><span class="track-pin-dot"></span>'
  return el
}

function syncStaticMarkers() {
  if (!map) return
  if (props.pickup && !pickupMarker) {
    pickupMarker = new maplibreModule!.Marker({ element: dotMarker('pickup'), anchor: 'center' })
      .setLngLat([props.pickup.lng, props.pickup.lat])
      .addTo(map)
  }
  if (props.dropoff && !dropoffMarker) {
    dropoffMarker = new maplibreModule!.Marker({ element: dotMarker('dropoff'), anchor: 'center' })
      .setLngLat([props.dropoff.lng, props.dropoff.lat])
      .addTo(map)
  }
}

/** Recadre en douceur sur véhicule + cible (ou centre la cible seule). */
function fitCamera(animate: boolean) {
  if (!map) return
  const pts: LatLng[] = []
  if (props.driverPosition) pts.push(props.driverPosition)
  if (targetPoint.value) pts.push(targetPoint.value)
  if (pts.length === 0) return
  const duration = animate && !reduceMotion ? 1200 : 0
  if (pts.length === 1) {
    map.easeTo({ center: [pts[0].lng, pts[0].lat], zoom: 14.5, duration })
    return
  }
  const bounds = pts.reduce(
    (b, p) => b.extend([p.lng, p.lat]),
    new maplibreModule!.LngLatBounds([pts[0].lng, pts[0].lat], [pts[0].lng, pts[0].lat]),
  )
  map.fitBounds(bounds, {
    padding: { top: 76, bottom: 108, left: 52, right: 52 },
    maxZoom: 15.5,
    duration,
  })
}

let maplibreModule: typeof maplibregl | null = null
let resizeObserver: ResizeObserver | null = null

const { t } = useI18n()

onMounted(async () => {
  if (!container.value) return
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    const [mod] = await Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ])
    maplibreModule = mod.default
    const center = props.driverPosition ?? targetPoint.value ?? { lat: 48.8566, lng: 2.3522 }
    map = new maplibreModule.Map({
      container: container.value,
      style: STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 13,
      attributionControl: { compact: true },
      // La page reste scrollable au doigt : le déplacement de la carte demande
      // deux doigts (la caméra suit de toute façon le véhicule toute seule).
      cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.MobileHelpText': t('tracking.mapTwoFingers'),
        'CooperativeGesturesHandler.WindowsHelpText': t('tracking.mapCtrlZoom'),
        'CooperativeGesturesHandler.MacHelpText': t('tracking.mapCmdZoom'),
      },
    })
    map.on('error', () => {
      // Tuiles indisponibles : on garde la page fonctionnelle (l'ETA et la
      // timeline vivent en dehors de la carte).
    })
    map.on('load', () => {
      if (!map) return
      map.addSource('route', { type: 'geojson', data: lineData([]) })
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7.5, 'line-opacity': 0.92 },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#B5793F', 'line-width': 4.2 },
      })
      ready = true
      syncStaticMarkers()
      if (props.driverPosition) ensureDriverMarker(props.driverPosition)
      updateRoute()
      fitCamera(false)
    })
    resizeObserver = new ResizeObserver(() => map?.resize())
    resizeObserver.observe(container.value)
  } catch (err) {
    console.error('[tracking-map] initialisation impossible', err)
    failed.value = true
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  map?.remove()
  map = null
})

watch(
  () => props.driverPosition,
  (pos) => {
    if (!map || !ready) return
    if (!pos) {
      removeDriverMarker()
      updateRoute()
      return
    }
    ensureDriverMarker(pos)
    animateDriverTo(pos)
    updateRoute()
    fitCamera(true)
  },
)

watch(
  () => props.polyline,
  () => updateRoute(),
)

watch(
  () => props.phase,
  () => {
    // Changement de cible (à bord → destination) : nouveau cadrage + tracé.
    updateRoute()
    fitCamera(true)
  },
)
</script>

<template>
  <div class="relative h-full w-full">
    <div ref="container" class="h-full w-full" />
    <!-- Repli si la carte ne peut pas se charger (réseau, adblock…) -->
    <div v-if="failed" class="absolute inset-0 flex items-center justify-center bg-slate-50 text-sm text-slate-500">
      {{ $t('tracking.mapUnavailable') }}
    </div>
  </div>
</template>

<style>
/* Marqueurs de la carte de suivi (éléments DOM hors portée du scoping Vue). */
.track-car {
  filter: drop-shadow(0 3px 6px rgb(14 27 44 / 0.35));
}
.track-car-rotator {
  transform-origin: center;
  line-height: 0;
}
.track-pin {
  position: relative;
  width: 18px;
  height: 18px;
}
.track-pin-dot {
  position: absolute;
  inset: 2px;
  border-radius: 9999px;
  background: #b5793f;
  border: 2.5px solid #fff;
  box-shadow: 0 1px 4px rgb(14 27 44 / 0.35);
}
.track-pin--dest .track-pin-dot {
  background: #0e1b2c;
}
.track-pin-pulse {
  position: absolute;
  inset: -7px;
  border-radius: 9999px;
  background: rgb(181 121 63 / 0.35);
  animation: track-pulse 2s ease-out infinite;
}
.track-pin--dest .track-pin-pulse {
  display: none;
}
@keyframes track-pulse {
  0% {
    transform: scale(0.55);
    opacity: 0.9;
  }
  70% {
    transform: scale(1.6);
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .track-pin-pulse {
    animation: none;
    opacity: 0;
  }
}
</style>
