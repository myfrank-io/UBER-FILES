<script setup lang="ts">
// Banque de logos : l'admin crée un logo en deux clics pour un chauffeur qui
// n'en a pas. Les textes sont préremplis depuis la fiche (initiales, nom,
// titre), chaque modèle est prévisualisé en direct sur la couleur de fond de
// la carte, et un clic sur une vignette produit le PNG final (fond
// transparent) qui devient le logo du design.
import {
  DEFAULT_LOGO_ACCENT,
  DEFAULT_LOGO_PRIMARY,
  DEFAULT_LOGO_TAGLINE,
  LOGO_CATEGORIES,
  LOGO_CATEGORY_LABELS,
  LOGO_COLOR_PRESETS,
  LOGO_TEMPLATES,
  LOGO_THEME_COLORS,
  deriveInitials,
  isLogoThemeColor,
  normalizeLogoInput,
  resolveLogoColor,
  type LogoCategory,
  type LogoRecipe,
  type LogoTheme,
} from '~/lib/logo-bank'
import { ensureLogoFonts, logoSceneToDataUrl, type LogoColors } from '~/composables/useLogoRenderer'

const props = defineProps<{
  driverName: string
  companyName?: string | null
  /** Titre du verso carte de visite, réutilisé comme sous-titre par défaut. */
  title?: string
  bgColor: string
  fgColor: string
  /** Recette du logo actuel, pour le rouvrir tel quel et le modifier. */
  recipe?: LogoRecipe | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  /** Un modèle cliqué : logo rendu, à appliquer et enregistrer. */
  (e: 'pick', dataUrl: string, recipe: LogoRecipe): void
  /**
   * Réglages modifiés (textes, couleurs, métal) : à enregistrer. `dataUrl`
   * est le logo re-rendu quand un modèle est déjà choisi, null sinon.
   */
  (e: 'update', recipe: LogoRecipe, dataUrl: string | null): void
}>()

const baseName = props.companyName?.trim() || props.driverName
const fields = reactive({
  initials: props.recipe?.initials ?? deriveInitials(baseName),
  name: props.recipe?.name ?? baseName,
  tagline: props.recipe?.tagline ?? (props.title?.trim() || DEFAULT_LOGO_TAGLINE),
})
// Couleurs du logo : soit une couleur figée, soit un jeton qui SUIT LE THÈME
// de la carte (le logo se recolore alors avec la palette). Par défaut, le
// texte suit les éléments du thème et l'accent est l'or, plat.
const primary = ref<string>(props.recipe?.primary ?? DEFAULT_LOGO_PRIMARY)
const accent = ref<string>(props.recipe?.accent ?? DEFAULT_LOGO_ACCENT)
const metallic = ref(props.recipe?.metallic ?? false)
const category = ref<LogoCategory | 'all'>('all')
const selectedId = ref<string | null>(props.recipe?.templateId ?? null)

const theme = computed<LogoTheme>(() => ({ elements: props.fgColor, background: props.bgColor }))

const HEX = /^#[0-9a-fA-F]{6}$/

/** Couleur affichée/rendue : jeton résolu sur le thème, ou hex saisi. */
function displayColor(value: string, key: 'primary' | 'accent'): string {
  if (isLogoThemeColor(value)) return resolveLogoColor(value, theme.value)
  if (HEX.test(value)) return value.toUpperCase()
  return key === 'primary' ? props.fgColor : DEFAULT_LOGO_ACCENT
}

/** Valeur stockée dans la recette : le jeton tel quel, ou le hex normalisé. */
function storedColor(value: string, key: 'primary' | 'accent'): string {
  return isLogoThemeColor(value) ? value : displayColor(value, key)
}

const colors = computed<LogoColors>(() => ({
  primary: displayColor(primary.value, 'primary'),
  accent: displayColor(accent.value, 'accent'),
  inverse: props.bgColor,
  metallic: metallic.value,
}))

const colorControls = [
  { key: 'primary', label: 'Texte & éléments', model: primary },
  { key: 'accent', label: 'Accent (diamant, filets…)', model: accent },
] as const

/** Raccourcis « suit le thème », proposés avant les couleurs figées. */
const themeSwatches = [
  { value: LOGO_THEME_COLORS.elements, label: 'Thème' },
  { value: LOGO_THEME_COLORS.background, label: 'Fond' },
] as const

const templates = computed(() =>
  category.value === 'all' ? LOGO_TEMPLATES : LOGO_TEMPLATES.filter((t) => t.category === category.value),
)

// Vignettes : rendues en différé (les polices doivent être chargées) et
// regroupées quand l'admin tape, pour ne pas redessiner 24 canvas par touche.
const thumbs = ref<Record<string, string>>({})
const fontsLoaded = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function renderThumbs() {
  const input = normalizeLogoInput(fields)
  const next: Record<string, string> = {}
  for (const t of LOGO_TEMPLATES) {
    try {
      next[t.id] = logoSceneToDataUrl(t.build(input), colors.value, { width: 360, background: props.bgColor })
    } catch {
      // Un modèle qui échoue n'empêche pas les autres de s'afficher.
    }
  }
  thumbs.value = next
}

onMounted(async () => {
  await ensureLogoFonts()
  fontsLoaded.value = true
  renderThumbs()
})

watch(
  [() => fields.initials, () => fields.name, () => fields.tagline, primary, accent, metallic, () => props.bgColor, () => props.fgColor],
  () => {
    if (!fontsLoaded.value) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(renderThumbs, 120)
  },
)

function currentRecipe(templateId: string | null): LogoRecipe {
  return {
    templateId,
    ...normalizeLogoInput(fields),
    primary: storedColor(primary.value, 'primary'),
    accent: storedColor(accent.value, 'accent'),
    metallic: metallic.value,
  }
}

/** PNG final : 1600 px de large pour 40 mm imprimés, largement au-dessus des 300 dpi. */
function renderFinal(templateId: string): string | null {
  const template = LOGO_TEMPLATES.find((t) => t.id === templateId)
  if (!template) return null
  return logoSceneToDataUrl(template.build(normalizeLogoInput(fields)), colors.value, { width: 1600 })
}

function pick(id: string) {
  const dataUrl = renderFinal(id)
  if (!dataUrl) return
  selectedId.value = id
  emit('pick', dataUrl, currentRecipe(id))
}

// Tout changement de réglage est poussé au parent (qui l'enregistre) : avec
// le logo re-rendu si un modèle est déjà choisi, sinon les réglages seuls,
// pour les retrouver à la prochaine ouverture.
let updateTimer: ReturnType<typeof setTimeout> | null = null
watch([() => fields.initials, () => fields.name, () => fields.tagline, primary, accent, metallic], () => {
  if (updateTimer) clearTimeout(updateTimer)
  updateTimer = setTimeout(() => {
    const id = selectedId.value
    emit('update', currentRecipe(id), id ? renderFinal(id) : null)
  }, 600)
})
</script>

<template>
  <AppModal @close="emit('close')">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="font-serif text-xl font-medium text-slate-900">Créer un logo</h2>
        <p class="mt-1 text-sm text-slate-500">
          Choisissez un modèle : il devient le logo du recto, fond transparent. Vos réglages sont enregistrés automatiquement.
        </p>
      </div>
      <button type="button" class="text-slate-400 hover:text-slate-700" aria-label="Fermer" @click="emit('close')">✕</button>
    </div>

    <div class="mt-4 grid grid-cols-3 gap-2">
      <div>
        <label class="label">Initiales</label>
        <input v-model="fields.initials" class="field !py-2 uppercase" maxlength="3" data-testid="logo-initials" />
      </div>
      <div class="col-span-2">
        <label class="label">Nom</label>
        <input v-model="fields.name" class="field !py-2" maxlength="40" data-testid="logo-name" />
      </div>
      <div class="col-span-3">
        <label class="label">Sous-titre</label>
        <input v-model="fields.tagline" class="field !py-2" maxlength="40" placeholder="Chauffeur Privé" />
      </div>
    </div>

    <div class="mt-3 space-y-2">
      <div v-for="c in colorControls" :key="c.key" class="flex flex-wrap items-center gap-1.5" :data-testid="`logo-color-${c.key}`">
        <span class="w-full text-xs font-semibold text-slate-500 sm:w-auto sm:min-w-[150px]">{{ c.label }}</span>
        <!-- Suit la palette de la carte : le logo se recolore avec le thème. -->
        <button
          v-for="t in themeSwatches"
          :key="t.value"
          type="button"
          class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition"
          :class="c.model.value === t.value ? 'border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-200' : 'border-slate-300 text-slate-600 hover:border-slate-400'"
          :title="`Suit le thème de la carte (${t.label.toLowerCase()})`"
          @click="c.model.value = t.value"
        >
          <span class="inline-block h-3 w-3 rounded-full ring-1 ring-slate-300" :style="{ background: resolveLogoColor(t.value, theme) }"></span>
          {{ t.label }}
        </button>
        <button
          v-for="p in LOGO_COLOR_PRESETS"
          :key="p.color"
          type="button"
          class="h-6 w-6 rounded-full ring-1 ring-slate-300 transition hover:scale-110"
          :class="c.model.value.toUpperCase() === p.color ? 'ring-2 ring-brand-500 ring-offset-1' : ''"
          :style="{ background: p.color }"
          :title="p.label"
          :aria-label="p.label"
          @click="c.model.value = p.color"
        ></button>
        <input
          type="color"
          class="h-6 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0"
          :value="displayColor(c.model.value, c.key)"
          :title="`${c.label} : couleur libre`"
          @input="c.model.value = ($event.target as HTMLInputElement).value.toUpperCase()"
        />
        <input
          v-if="!isLogoThemeColor(c.model.value)"
          v-model="c.model.value"
          class="field !w-24 !px-2 !py-1 font-mono !text-xs uppercase"
          maxlength="7"
        />
        <span v-else class="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-500">
          auto {{ displayColor(c.model.value, c.key) }}
        </span>
      </div>
      <label class="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
        <input v-model="metallic" type="checkbox" class="accent-brand-600" data-testid="logo-metallic" />
        Effet métal (dégradé brossé sur l'accent)
      </label>
    </div>

    <div class="mt-3 flex gap-1 border-b border-slate-200">
      <button
        v-for="c in ['all', ...LOGO_CATEGORIES]"
        :key="c"
        type="button"
        class="border-b-2 px-3 py-2 text-sm"
        :class="category === c ? 'border-brand-600 font-semibold text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'"
        @click="category = c as LogoCategory | 'all'"
      >
        {{ c === 'all' ? 'Tous' : LOGO_CATEGORY_LABELS[c as LogoCategory] }}
      </button>
    </div>

    <p v-if="!fontsLoaded" class="mt-4 text-sm text-slate-500">Chargement des polices…</p>
    <div v-else class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="logo-grid">
      <button
        v-for="t in templates"
        :key="t.id"
        type="button"
        class="group overflow-hidden rounded-xl border text-left transition hover:border-brand-500 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        :class="selectedId === t.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'"
        :data-testid="`logo-template-${t.id}`"
        @click="pick(t.id)"
      >
        <img v-if="thumbs[t.id]" :src="thumbs[t.id]" :alt="t.label" class="block w-full" />
        <div v-else class="aspect-[1000/650] w-full bg-slate-100"></div>
        <span class="block px-2 py-1.5 text-xs font-medium text-slate-600 group-hover:text-slate-900">{{ t.label }}</span>
      </button>
    </div>
  </AppModal>
</template>
