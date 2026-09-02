<script setup lang="ts">
// Étape « Tarifs » : prix au km jour/nuit, minimum de course, mise à
// disposition, forfaits aéroport, supplément passagers — avec un simulateur
// en direct qui utilise le vrai moteur de prix de Ridewiz. Enregistré d'un
// bloc via PUT /api/setup/rates, qui confirme l'étape.
import {
  RATE_PRESETS,
  TRANSFER_SCENARIOS,
  detectSimpleRates,
  simulateHourly,
  simulateTransfer,
  simulateTransferWithBands,
  type RatePreset,
  type SimpleRates,
} from '~/lib/setup-flow'
import { centsToEuros, eurosToCents, setupApiError } from '~/lib/setup-view'

const { state, result, next } = useSetupFlow()
const { formatMoney } = useFormat()
const step = computed(() => result.value?.steps.find((s) => s.key === 'tarifs'))
const currency = computed(() => state.value?.driver.currency ?? 'eur')

// ─── Formulaire ──────────────────────────────────────────────────────────────

const form = reactive({
  dayEuros: '',
  nightEnabled: true,
  nightEuros: '',
  nightStartHour: 22,
  nightEndHour: 6,
  minimumEuros: '',
  hourlyEnabled: false,
  hourlyEuros: '',
  airportEnabled: false,
  orlyRD: '',
  orlyRG: '',
  cdgRD: '',
  cdgRG: '',
  airportKm: '',
  third: '',
  fourth: '',
})

// Grille de transfert « avancée » (paliers, jours spécifiques…) : affichée,
// jamais réécrite par le parcours.
const bands = computed(() => state.value?.driver.transferBands ?? [])
const simple = computed(() => detectSimpleRates(bands.value))
const advanced = computed(() => bands.value.length > 0 && simple.value === null)

const preset = ref<RatePreset['key'] | 'custom'>('custom')
let seeded = false
watchEffect(() => {
  const d = state.value?.driver
  if (!d || seeded) return
  seeded = true
  const s = simple.value
  if (s) {
    form.dayEuros = centsToEuros(s.dayPerKmCents)
    form.nightEnabled = s.nightPerKmCents != null
    form.nightEuros = centsToEuros(s.nightPerKmCents)
    form.nightStartHour = Math.floor(s.nightStartMinute / 60)
    form.nightEndHour = Math.floor(s.nightEndMinute / 60)
  } else if (bands.value.length === 0) {
    // Aucune grille : on part du préréglage Standard.
    applyPreset(RATE_PRESETS[0], false)
  }
  form.minimumEuros = centsToEuros(d.minimumFareCents)
  form.hourlyEnabled = d.hourlyRateCents != null
  form.hourlyEuros = centsToEuros(d.hourlyRateCents)
  const hasAirport = [
    d.airportOrlyRiveDroiteCents, d.airportOrlyRiveGaucheCents,
    d.airportCdgRiveDroiteCents, d.airportCdgRiveGaucheCents, d.airportKmRateCents,
  ].some((v) => v != null)
  form.airportEnabled = hasAirport
  form.orlyRD = centsToEuros(d.airportOrlyRiveDroiteCents)
  form.orlyRG = centsToEuros(d.airportOrlyRiveGaucheCents)
  form.cdgRD = centsToEuros(d.airportCdgRiveDroiteCents)
  form.cdgRG = centsToEuros(d.airportCdgRiveGaucheCents)
  form.airportKm = centsToEuros(d.airportKmRateCents)
  form.third = centsToEuros(d.passengerSurcharge3Cents)
  form.fourth = centsToEuros(d.passengerSurcharge4Cents)
})

function applyPreset(p: RatePreset, markSelected = true) {
  if (!advanced.value) {
    form.dayEuros = centsToEuros(p.dayPerKmCents)
    form.nightEnabled = true
    form.nightEuros = centsToEuros(p.nightPerKmCents)
    form.nightStartHour = 22
    form.nightEndHour = 6
  }
  form.minimumEuros = centsToEuros(p.minimumFareCents)
  form.hourlyEnabled = true
  form.hourlyEuros = centsToEuros(p.hourlyRateCents)
  form.airportEnabled = true
  form.orlyRD = centsToEuros(p.airport.orlyRiveDroiteCents)
  form.orlyRG = centsToEuros(p.airport.orlyRiveGaucheCents)
  form.cdgRD = centsToEuros(p.airport.cdgRiveDroiteCents)
  form.cdgRG = centsToEuros(p.airport.cdgRiveGaucheCents)
  form.airportKm = centsToEuros(p.airport.kmRateCents)
  if (markSelected) preset.value = p.key
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}h`

// ─── Valeurs dérivées (centimes) ─────────────────────────────────────────────

const rates = computed<SimpleRates | null>(() => {
  const day = eurosToCents(form.dayEuros)
  if (!day) return null
  const night = form.nightEnabled ? eurosToCents(form.nightEuros) : null
  return {
    dayPerKmCents: day,
    nightPerKmCents: night && night > 0 ? night : null,
    nightStartMinute: form.nightStartHour * 60,
    nightEndMinute: form.nightEndHour * 60,
  }
})
const minimumCents = computed(() => eurosToCents(form.minimumEuros) ?? 0)
const hourlyCents = computed(() => (form.hourlyEnabled ? eurosToCents(form.hourlyEuros) : null))

// ─── Simulateur ──────────────────────────────────────────────────────────────

const customKm = ref(20)
const customNight = ref(false)

function simulate(scenario: { distanceKm: number; localDateTime: string }) {
  if (advanced.value) {
    return simulateTransferWithBands(
      bands.value.map((b) => ({ ...b, tiers: b.tiers })),
      scenario,
      minimumCents.value,
      currency.value,
      state.value?.driver.timezone,
    )
  }
  if (!rates.value) return null
  return simulateTransfer(rates.value, scenario, minimumCents.value, currency.value, state.value?.driver.timezone)
}

const scenarioResults = computed(() =>
  TRANSFER_SCENARIOS.map((s) => ({ ...s, outcome: simulate(s) })),
)
const customResult = computed(() =>
  simulate({
    distanceKm: customKm.value,
    localDateTime: customNight.value ? '2026-09-12 23:30' : '2026-09-08 10:00',
  }),
)
const hourlyResults = computed(() =>
  hourlyCents.value
    ? [3, 8].map((h) => ({ hours: h, outcome: simulateHourly(hourlyCents.value!, h, minimumCents.value, currency.value) }))
    : [],
)

// ─── Enregistrement ──────────────────────────────────────────────────────────

const busy = ref(false)
const errorMsg = ref('')

const valid = computed(() => {
  if (!advanced.value && !rates.value) return false
  if (!advanced.value && form.nightEnabled && !rates.value?.nightPerKmCents) return false
  if (form.hourlyEnabled && !hourlyCents.value) return false
  return true
})

async function save() {
  if (!valid.value) {
    errorMsg.value = 'Renseignez au moins un prix au kilomètre (et le tarif de nuit si vous l’activez).'
    return
  }
  busy.value = true
  errorMsg.value = ''
  const nullable = (v: string) => (form.airportEnabled ? eurosToCents(v) || null : null)
  try {
    await $fetch('/api/setup/rates', {
      method: 'PUT',
      body: {
        transfer: advanced.value ? null : rates.value,
        minimumFareCents: minimumCents.value,
        hourly: { enabled: form.hourlyEnabled, pricePerHourCents: hourlyCents.value },
        airport: {
          orlyRiveDroiteCents: nullable(form.orlyRD),
          orlyRiveGaucheCents: nullable(form.orlyRG),
          cdgRiveDroiteCents: nullable(form.cdgRD),
          cdgRiveGaucheCents: nullable(form.cdgRG),
          kmRateCents: nullable(form.airportKm),
        },
        passengers: {
          thirdPassengerCents: eurosToCents(form.third) || null,
          fourthPassengerCents: eurosToCents(form.fourth) || null,
        },
      },
    })
    await next()
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SetupStepShell
    icon="💶"
    title="Vos tarifs"
    subtitle="Le simulateur à droite vous montre en direct ce que paiera un client. Ajustez jusqu'à ce que ça vous ressemble."
    :done="step?.done"
  >
    <!-- Préréglages -->
    <div v-if="!advanced">
      <p class="label">Partir d'une base</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="p in RATE_PRESETS"
          :key="p.key"
          type="button"
          class="rounded-2xl border-2 p-3 text-left transition"
          :class="preset === p.key ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 bg-white hover:border-brand-300'"
          :data-testid="`preset-${p.key}`"
          @click="applyPreset(p)"
        >
          <span class="block font-semibold text-slate-900">{{ p.label }} · {{ formatMoney(p.dayPerKmCents, currency) }}/km</span>
          <span class="block text-xs text-slate-600">{{ p.description }}</span>
        </button>
      </div>
      <p class="mt-1.5 text-xs text-slate-500">Ce sont des points de départ : chaque valeur reste modifiable ci-dessous.</p>
    </div>

    <div class="grid gap-5 lg:grid-cols-[1fr_250px]">
      <div class="space-y-5">
        <!-- Transfert -->
        <div class="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h2 class="font-semibold text-slate-900">Trajets (prix au kilomètre)</h2>

          <div v-if="advanced" class="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <p><strong>Votre grille est personnalisée</strong> (paliers ou jours spécifiques) : elle est conservée telle quelle.</p>
            <ul class="mt-2 space-y-1 text-xs">
              <li v-for="b in bands" :key="b.id">• {{ b.name }} — {{ b.tiers.length ? b.tiers.map((t) => formatMoney(t.pricePerKmCents, currency)).join(' → ') : formatMoney(b.pricePerKmCents, currency) }}/km</li>
            </ul>
            <a href="/dashboard/parametres" target="_blank" rel="noopener" class="mt-2 inline-block text-xs font-semibold underline">Modifier dans les réglages ↗</a>
          </div>

          <template v-else>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="label" for="rate-day">Prix de jour</label>
                <div class="relative">
                  <input id="rate-day" v-model="form.dayEuros" class="field pr-14" type="number" step="0.10" min="0.10" inputmode="decimal" placeholder="2,00" data-testid="rate-day" @input="preset = 'custom'" />
                  <span class="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-slate-400">€/km</span>
                </div>
              </div>
              <div>
                <label class="label" for="rate-night">
                  <input v-model="form.nightEnabled" type="checkbox" class="mr-1.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  Prix de nuit
                </label>
                <div class="relative">
                  <input id="rate-night" v-model="form.nightEuros" class="field pr-14" type="number" step="0.10" min="0.10" inputmode="decimal" placeholder="2,50" :disabled="!form.nightEnabled" @input="preset = 'custom'" />
                  <span class="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-slate-400">€/km</span>
                </div>
              </div>
            </div>
            <div v-if="form.nightEnabled" class="flex flex-nowrap items-center gap-2 whitespace-nowrap text-sm text-slate-700">
              La nuit va de
              <select v-model.number="form.nightStartHour" class="field !w-auto !px-2.5 !py-2" aria-label="Début de la nuit">
                <option v-for="h in HOURS" :key="h" :value="h">{{ hourLabel(h) }}</option>
              </select>
              à
              <select v-model.number="form.nightEndHour" class="field !w-auto !px-2.5 !py-2" aria-label="Fin de la nuit">
                <option v-for="h in HOURS" :key="h" :value="h">{{ hourLabel(h) }}</option>
              </select>
            </div>
          </template>

          <div>
            <label class="label" for="rate-min">Course minimum</label>
            <div class="relative max-w-[200px]">
              <input id="rate-min" v-model="form.minimumEuros" class="field pr-9" type="number" step="1" min="0" inputmode="decimal" placeholder="25" />
              <span class="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-slate-400">€</span>
            </div>
            <p class="mt-1 text-xs text-slate-500">Aucune course ne sera facturée en dessous de ce montant.</p>
          </div>
        </div>

        <!-- Mise à disposition -->
        <div class="rounded-2xl border border-slate-200 p-4">
          <label class="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span class="block font-semibold text-slate-900">Mise à disposition</span>
              <span class="block text-xs text-slate-500">Le client vous réserve à l'heure (mariages, soirées, tournées).</span>
            </span>
            <input v-model="form.hourlyEnabled" type="checkbox" class="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          </label>
          <div v-if="form.hourlyEnabled" class="relative mt-3 max-w-[200px]">
            <input v-model="form.hourlyEuros" class="field pr-12" type="number" step="1" min="1" inputmode="decimal" placeholder="55" aria-label="Tarif horaire" />
            <span class="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-slate-400">€/h</span>
          </div>
        </div>

        <!-- Aéroports -->
        <div class="rounded-2xl border border-slate-200 p-4">
          <label class="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span class="block font-semibold text-slate-900">Forfaits aéroport</span>
              <span class="block text-xs text-slate-500">Prix fixes Paris ↔ Orly / Roissy, dans les deux sens.</span>
            </span>
            <input v-model="form.airportEnabled" type="checkbox" class="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          </label>
          <div v-if="form.airportEnabled" class="mt-3 grid grid-cols-2 gap-3">
            <div v-for="f in ([['orlyRD', 'Orly ↔ Rive droite'], ['orlyRG', 'Orly ↔ Rive gauche'], ['cdgRD', 'Roissy ↔ Rive droite'], ['cdgRG', 'Roissy ↔ Rive gauche']] as const)" :key="f[0]">
              <label class="label !text-xs" :for="`airport-${f[0]}`">{{ f[1] }}</label>
              <div class="relative">
                <input :id="`airport-${f[0]}`" v-model="form[f[0]]" class="field pr-8" type="number" step="1" min="1" inputmode="decimal" placeholder="—" />
                <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">€</span>
              </div>
            </div>
            <div class="col-span-2">
              <label class="label !text-xs" for="airport-km">Hors Paris (prix au km)</label>
              <div class="relative max-w-[200px]">
                <input id="airport-km" v-model="form.airportKm" class="field pr-14" type="number" step="0.10" min="0.10" inputmode="decimal" placeholder="2,00" />
                <span class="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-slate-400">€/km</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Passagers -->
        <details class="rounded-2xl border border-slate-200 p-4">
          <summary class="cursor-pointer select-none font-semibold text-slate-900">Supplément passagers <span class="text-xs font-normal text-slate-500">(optionnel)</span></summary>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label class="label !text-xs" for="pax-3">Dès 3 personnes</label>
              <div class="relative"><input id="pax-3" v-model="form.third" class="field pr-8" type="number" step="1" min="1" inputmode="decimal" placeholder="—" /><span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">€</span></div>
            </div>
            <div>
              <label class="label !text-xs" for="pax-4">Dès 4 personnes (en plus)</label>
              <div class="relative"><input id="pax-4" v-model="form.fourth" class="field pr-8" type="number" step="1" min="1" inputmode="decimal" placeholder="—" /><span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">€</span></div>
            </div>
          </div>
        </details>
      </div>

      <!-- Simulateur -->
      <aside class="h-fit rounded-2xl border border-slate-900/10 bg-slate-950 p-4 text-white lg:sticky lg:top-32" data-testid="simulator">
        <p class="text-xs font-semibold uppercase tracking-wide text-brand-300">Simulateur</p>
        <p class="mt-0.5 text-xs text-slate-300">Ce que paierait un client avec ces tarifs.</p>

        <ul class="mt-3 space-y-2.5">
          <li v-for="s in scenarioResults" :key="s.key" class="flex items-start justify-between gap-2">
            <span class="min-w-0">
              <span class="block text-sm leading-tight">{{ s.label }}</span>
              <span class="block text-xs text-slate-400">{{ s.distanceKm }} km · {{ s.when }}<template v-if="s.outcome?.bandName"> · {{ s.outcome.bandName }}</template></span>
            </span>
            <span class="shrink-0 font-serif text-lg text-gold" :data-testid="`sim-${s.key}`">{{ s.outcome && !s.outcome.error ? formatMoney(s.outcome.amountCents, currency) : '—' }}</span>
          </li>
          <li v-for="h in hourlyResults" :key="h.hours" class="flex items-start justify-between gap-2 border-t border-white/10 pt-2.5">
            <span class="min-w-0">
              <span class="block text-sm">Mise à disposition {{ h.hours }} h</span>
            </span>
            <span class="shrink-0 font-serif text-lg text-gold">{{ h.outcome.error ? '—' : formatMoney(h.outcome.amountCents, currency) }}</span>
          </li>
        </ul>

        <div class="mt-4 border-t border-white/10 pt-3">
          <div class="flex items-center justify-between text-sm">
            <span>Mon trajet : <strong>{{ customKm }} km</strong></span>
            <span class="font-serif text-lg text-gold">{{ customResult && !customResult.error ? formatMoney(customResult.amountCents, currency) : '—' }}</span>
          </div>
          <input v-model.number="customKm" type="range" min="3" max="120" step="1" class="mt-2 w-full accent-brand-500" aria-label="Distance" />
          <label class="mt-1 flex items-center gap-2 text-xs text-slate-300">
            <input v-model="customNight" type="checkbox" class="h-4 w-4 rounded border-slate-500 bg-transparent text-brand-500" /> De nuit
          </label>
        </div>
      </aside>
    </div>

    <template #help>
      <p><strong>Prix au km :</strong> Ridewiz calcule la distance réelle du trajet et applique votre prix de jour ou de nuit selon l'heure de prise en charge. Le minimum de course s'applique aux petits trajets.</p>
      <p><strong>Forfaits aéroport :</strong> un prix fixe, que le client parte de Paris ou y arrive. Hors Paris, c'est le prix au km aéroport qui s'applique.</p>
      <p>Besoin de tarifs dégressifs, d'heures de pointe ou de majorations ? Tout se règle ensuite dans <em>Réglages → Mes tarifs</em>.</p>
    </template>

    <template #actions>
      <SetupActions :busy="busy" :disabled="!valid" :error="errorMsg" next-label="Enregistrer mes tarifs" @next="save" />
    </template>
  </SetupStepShell>
</template>
