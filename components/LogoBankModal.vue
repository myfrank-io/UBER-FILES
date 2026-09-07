<script setup lang="ts">
// Banque de logos : l'admin crée un logo en deux clics pour un chauffeur qui
// n'en a pas. Les textes sont préremplis depuis la fiche (initiales, nom,
// titre), chaque modèle est prévisualisé en direct sur la couleur de fond de
// la carte, et un clic sur une vignette produit le PNG final (fond
// transparent) qui devient le logo du design.
import {
  DEFAULT_LOGO_TAGLINE,
  LOGO_ACCENTS,
  LOGO_CATEGORIES,
  LOGO_CATEGORY_LABELS,
  LOGO_TEMPLATES,
  deriveInitials,
  normalizeLogoInput,
  type LogoCategory,
} from '~/lib/logo-bank'
import { ensureLogoFonts, logoSceneToDataUrl, type LogoColors } from '~/composables/useLogoRenderer'

const props = defineProps<{
  driverName: string
  companyName?: string | null
  /** Titre du verso carte de visite, réutilisé comme sous-titre par défaut. */
  title?: string
  bgColor: string
  fgColor: string
}>()

const emit = defineEmits<{ (e: 'close'): void; (e: 'pick', dataUrl: string): void }>()

const baseName = props.companyName?.trim() || props.driverName
const fields = reactive({
  initials: deriveInitials(baseName),
  name: baseName,
  tagline: props.title?.trim() || DEFAULT_LOGO_TAGLINE,
})
const accentKey = ref(LOGO_ACCENTS[0]!.key)
// Or plat par défaut : le dégradé métal reste disponible en option.
const metallic = ref(false)
const category = ref<LogoCategory | 'all'>('all')

const colors = computed<LogoColors>(() => {
  const accent = LOGO_ACCENTS.find((a) => a.key === accentKey.value)?.color
  return { primary: props.fgColor, accent: accent ?? props.fgColor, inverse: props.bgColor, metallic: metallic.value }
})

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
  [() => fields.initials, () => fields.name, () => fields.tagline, accentKey, metallic, () => props.bgColor, () => props.fgColor],
  () => {
    if (!fontsLoaded.value) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(renderThumbs, 120)
  },
)

function pick(id: string) {
  const template = LOGO_TEMPLATES.find((t) => t.id === id)
  if (!template) return
  // 1600 px de large pour 40 mm imprimés : largement au-dessus des 300 dpi.
  const dataUrl = logoSceneToDataUrl(template.build(normalizeLogoInput(fields)), colors.value, { width: 1600 })
  emit('pick', dataUrl)
}
</script>

<template>
  <AppModal @close="emit('close')">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="font-serif text-xl font-medium text-slate-900">Créer un logo</h2>
        <p class="mt-1 text-sm text-slate-500">Choisissez un modèle : il devient le logo du recto, fond transparent.</p>
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

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-xs font-semibold text-slate-500">Accent</span>
      <button
        v-for="a in LOGO_ACCENTS"
        :key="a.key"
        type="button"
        class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
        :class="accentKey === a.key ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-300'"
        @click="accentKey = a.key"
      >
        <span class="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-slate-300" :style="{ background: a.color ?? fgColor }"></span>
        {{ a.label }}
      </button>
      <label class="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
        <input v-model="metallic" type="checkbox" class="accent-brand-600" data-testid="logo-metallic" />
        Effet métal
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
        class="group overflow-hidden rounded-xl border border-slate-200 text-left transition hover:border-brand-500 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
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
