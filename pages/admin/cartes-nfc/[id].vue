<script setup lang="ts">
// Éditeur des cartes NFC physiques d'un chauffeur (admin uniquement).
//
// Deux produits, chacun recto/verso, prévisualisés en direct : le logo se
// glisse à la souris sur le recto, les couleurs et textes se règlent à gauche.
// « Enregistrer » persiste le design ; « Valider et envoyer » fait générer les
// PDF côté serveur et les expédie à la production. L'envoi rend TOUJOURS l'état
// enregistré : un brouillon non sauvegardé est enregistré d'abord.
import {
  DEFAULT_BG_COLOR,
  DEFAULT_FG_COLOR,
  DEFAULT_QUANTITY,
  DEFAULT_TITLE,
  LOGO_OFFSET_MAX,
  LOGO_SCALE_MAX,
  LOGO_SCALE_MIN,
  NFC_CARD_PRESETS,
  NFC_CARD_PRODUCT_LABELS,
  defaultCardName,
  formatCardPhone,
  qrContrastWarning,
  qrMatrix,
  type GoogleLogoStyle,
  type NfcCardProduct,
} from '~/lib/nfc-card'
import { MAX_PHOTO_SOURCE_BYTES, resizeImageToDataUrl } from '~/composables/useImageResize'
import type { LogoRecipe } from '~/lib/logo-bank'

definePageMeta({ layout: 'default', middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const toast = useToast()
const { formatDateTime } = useFormat()

const { data, refresh } = await useFetch(`/api/admin/drivers/${id}/nfc-cards`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

useHead({ title: () => `Cartes NFC — ${data.value?.driver.displayName ?? '…'} — Admin` })

// ─── Formulaire (copie locale du design, enregistrée explicitement) ─────────
const form = reactive({
  bgColor: DEFAULT_BG_COLOR,
  fgColor: DEFAULT_FG_COLOR,
  logoScale: 1,
  logoOffsetX: 0,
  logoOffsetY: 0,
  googleLogoStyle: 'mono' as GoogleLogoStyle,
  name: '',
  title: DEFAULT_TITLE,
  phone: '',
  qtyReview: DEFAULT_QUANTITY,
  qtyBusiness: DEFAULT_QUANTITY,
})

// Logo : soit l'URL enregistrée, soit une data URL fraîchement importée (pas
// encore sauvegardée), soit rien. `pendingLogo` voyage avec la sauvegarde.
const savedLogoUrl = ref<string | null>(null)
const pendingLogo = ref<string | null | undefined>(undefined) // undefined = inchangé, null = supprimé
// Recette du logo en attente : fournie par la banque (avec ou sans modèle),
// nulle pour un import ou un retrait, undefined si inchangée.
const pendingRecipe = ref<LogoRecipe | null | undefined>(undefined)
const useCardLogo = ref(false)
const logoSrc = computed(() => (pendingLogo.value === undefined ? savedLogoUrl.value : pendingLogo.value))

function loadFromServer() {
  const d = data.value!.design
  form.bgColor = d.bgColor
  form.fgColor = d.fgColor
  form.logoScale = d.logoScale
  form.logoOffsetX = d.logoOffsetX
  form.logoOffsetY = d.logoOffsetY
  form.googleLogoStyle = d.googleLogoStyle as GoogleLogoStyle
  form.name = d.name
  form.title = d.title
  form.phone = d.phone
  form.qtyReview = d.qtyReview
  form.qtyBusiness = d.qtyBusiness
  savedLogoUrl.value = d.logoUrl
  pendingLogo.value = undefined
  pendingRecipe.value = undefined
  useCardLogo.value = false
}

// Recette à rouvrir dans la banque : celle en attente, sinon celle enregistrée.
const currentRecipe = computed<LogoRecipe | null>(() =>
  pendingRecipe.value !== undefined ? pendingRecipe.value : ((data.value?.design.logoRecipe as LogoRecipe | null) ?? null),
)
loadFromServer()

const dirty = ref(false)
watch(form, () => (dirty.value = true), { deep: true })
watch([pendingLogo, pendingRecipe, useCardLogo], () => (dirty.value = true))

// ─── QR codes (les vrais : même matrice que le PDF) ──────────────────────────
const qr = computed(() => {
  const links = data.value!.links
  return {
    review: qrMatrix(links.review),
    business: qrMatrix(links.business),
  }
})

const contrastWarning = computed(() => qrContrastWarning(form.bgColor, form.fgColor))

// ─── Logo ────────────────────────────────────────────────────────────────────
const logoInput = ref<HTMLInputElement | null>(null)
const logoBusy = ref(false)

async function onLogoFile(file: File | undefined) {
  if (!file) return
  if (!file.type.startsWith('image/')) return toast.error('Choisissez une image (PNG ou JPG).')
  if (file.size > MAX_PHOTO_SOURCE_BYTES) return toast.error('Image trop volumineuse (15 Mo maximum).')
  logoBusy.value = true
  try {
    // 1400 px de côté : ~40 mm imprimés à 300 dpi demandent 470 px, on garde
    // de la marge pour un logo agrandi. PNG pour préserver la transparence.
    pendingLogo.value = await resizeImageToDataUrl(file, 1400, { mimeType: 'image/png' })
    pendingRecipe.value = null
    useCardLogo.value = false
  } catch (e) {
    toast.error((e as Error).message || 'Image illisible.')
  } finally {
    logoBusy.value = false
  }
}

function onLogoInput(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  void onLogoFile(file)
}

function onLogoDrop(e: DragEvent) {
  void onLogoFile(e.dataTransfer?.files?.[0])
}

function removeLogo() {
  pendingLogo.value = null
  pendingRecipe.value = null
  useCardLogo.value = false
}

// Banque de logos : un modèle choisi devient le logo (PNG transparent) et le
// design est enregistré aussitôt. Les réglages modifiés dans la modale
// (textes, couleurs) sont eux aussi enregistrés au fil de l'eau, avec le logo
// re-rendu quand un modèle est déjà choisi.
const logoBank = ref(false)
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => void save({ silent: true }), 400)
}
function onLogoPicked(dataUrl: string, recipe: LogoRecipe) {
  pendingLogo.value = dataUrl
  pendingRecipe.value = recipe
  useCardLogo.value = false
  logoBank.value = false
  resetLogoPlacement()
  scheduleAutosave()
}
function onLogoUpdated(recipe: LogoRecipe, dataUrl: string | null) {
  pendingRecipe.value = recipe
  if (dataUrl) {
    pendingLogo.value = dataUrl
    useCardLogo.value = false
  }
  scheduleAutosave()
}

function takeCardLogo() {
  // Aperçu impossible avant sauvegarde (le blob est côté serveur) : on
  // enregistre tout de suite, le logo apparaît au retour.
  useCardLogo.value = true
  pendingLogo.value = undefined
  void save()
}

function onLogoMove(o: { x: number; y: number }) {
  const clamp = (v: number) => Math.max(-LOGO_OFFSET_MAX, Math.min(LOGO_OFFSET_MAX, Math.round(v * 10) / 10))
  form.logoOffsetX = clamp(o.x)
  form.logoOffsetY = clamp(o.y)
}

function resetLogoPlacement() {
  form.logoScale = 1
  form.logoOffsetX = 0
  form.logoOffsetY = 0
}

function applyPreset(p: { bg: string; fg: string }) {
  form.bgColor = p.bg
  form.fgColor = p.fg
}

function prefillFromDriver() {
  const d = data.value!.driver
  form.name = defaultCardName(d.displayName)
  form.title = DEFAULT_TITLE
  form.phone = formatCardPhone(d.phone)
}

// ─── Sauvegarde / envoi ──────────────────────────────────────────────────────
const saving = ref(false)
const sending = ref(false)
const confirmSend = ref(false)

function apiError(e: unknown): string {
  return (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Une erreur est survenue.'
}

async function save(opts: { silent?: boolean } = {}): Promise<boolean> {
  saving.value = true
  try {
    await $fetch(`/api/admin/drivers/${id}/nfc-cards`, {
      method: 'PUT',
      body: {
        ...form,
        ...(useCardLogo.value ? { useCardLogo: true } : {}),
        ...(pendingLogo.value !== undefined ? { logo: pendingLogo.value } : {}),
        ...(pendingRecipe.value !== undefined ? { logoRecipe: pendingRecipe.value } : {}),
      },
    })
    await refresh()
    loadFromServer()
    // Le watcher profond de `form` se déclenche après la recharge : on
    // retombe à « propre » une fois qu'il est passé.
    await nextTick()
    dirty.value = false
    if (!opts.silent) toast.success('Design enregistré.')
    return true
  } catch (e) {
    toast.error(apiError(e))
    return false
  } finally {
    saving.value = false
  }
}

async function send() {
  confirmSend.value = false
  if (dirty.value && !(await save())) return
  sending.value = true
  try {
    const res = await $fetch<{ sent: boolean; to: string }>(`/api/admin/drivers/${id}/nfc-cards/send`, { method: 'POST' })
    await refresh()
    loadFromServer()
    toast.success(res.sent ? `Design envoyé à ${res.to}.` : `Envoi simulé (pas de clé email configurée) — destinataire ${res.to}.`, 6000)
  } catch (e) {
    toast.error(apiError(e))
  } finally {
    sending.value = false
  }
}

// Le PDF rend l'état ENREGISTRÉ. Les liens sont désactivés tant qu'il reste
// des modifications non sauvegardées (ouvrir un onglet après un appel réseau
// serait bloqué par les navigateurs comme popup non sollicitée).
function pdfUrl(kind: 'preview' | NfcCardProduct) {
  return `/api/admin/drivers/${id}/nfc-cards/pdf?kind=${kind}`
}

const products: NfcCardProduct[] = ['review', 'business']
const productLabels = NFC_CARD_PRODUCT_LABELS
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-8">
    <NuxtLink :to="`/admin/drivers/${id}`" class="text-sm text-slate-400 hover:text-slate-700">← {{ data?.driver.displayName }}</NuxtLink>

    <div v-if="data" class="mt-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">Cartes NFC — {{ data.driver.displayName }}</h1>
          <p class="mt-1 text-sm text-slate-500">
            Design des cartes physiques. Le chauffeur n'y a pas accès.
            <span v-if="data.design.sentAt">Dernier envoi le {{ formatDateTime(data.design.sentAt) }} ({{ data.design.sentCount }} envoi{{ data.design.sentCount > 1 ? 's' : '' }}).</span>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <a
            v-if="!dirty"
            :href="pdfUrl('preview')"
            target="_blank"
            rel="noopener"
            class="btn-ghost whitespace-nowrap text-sm"
          >Aperçu PDF ↗</a>
          <span v-else class="btn-ghost whitespace-nowrap text-sm opacity-50" title="Enregistrez d'abord">Aperçu PDF ↗</span>
          <button class="btn-ghost whitespace-nowrap text-sm" :disabled="saving || sending || !dirty" @click="save">
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
          <button class="btn-primary whitespace-nowrap text-sm" :disabled="saving || sending" data-testid="nfc-send" @click="confirmSend = true">
            {{ sending ? 'Envoi…' : `Valider et envoyer` }}
          </button>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <!-- ═══ Réglages ═══ -->
        <div class="space-y-5">
          <!-- Logo -->
          <section class="card">
            <h2 class="font-semibold text-slate-900">Logo du chauffeur</h2>
            <p class="mt-1 text-xs text-slate-500">PNG à fond transparent de préférence. Glissez-le ensuite directement sur la carte.</p>
            <div
              class="mt-3 flex min-h-[110px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-center transition hover:border-brand-400"
              :class="{ 'opacity-60': logoBusy }"
              @dragover.prevent
              @drop.prevent="onLogoDrop"
            >
              <div v-if="logoSrc" class="flex w-full items-center gap-3">
                <img :src="logoSrc" alt="" class="h-16 w-24 rounded-lg bg-white object-contain p-1 ring-1 ring-slate-200" />
                <div class="flex flex-col gap-1 text-left text-sm">
                  <button class="text-brand-700 hover:underline" type="button" @click="logoInput?.click()">Remplacer</button>
                  <button class="text-red-600 hover:underline" type="button" @click="removeLogo">Retirer</button>
                </div>
              </div>
              <div v-else class="flex flex-col items-center gap-2">
                <button type="button" class="text-sm text-slate-600" @click="logoInput?.click()">
                  <span class="font-semibold text-brand-700">Importer un logo</span> ou le déposer ici
                </button>
                <span class="text-xs text-slate-400">ou</span>
                <button type="button" class="btn-primary !min-h-0 !px-4 !py-2 text-sm" data-testid="logo-bank-open" @click="logoBank = true">
                  ✨ Créer un logo
                </button>
              </div>
            </div>
            <input ref="logoInput" type="file" accept="image/png,image/jpeg" class="hidden" @change="onLogoInput" />
            <button v-if="logoSrc" type="button" class="mt-2 mr-3 text-xs text-brand-700 hover:underline" @click="logoBank = true">
              {{ currentRecipe?.templateId ? '✨ Modifier le logo (couleurs, textes, modèle)' : '✨ Créer un autre logo' }}
            </button>
            <button
              v-if="data.driver.cardLogoAvailable"
              type="button"
              class="mt-2 text-xs text-brand-700 hover:underline"
              :disabled="saving"
              @click="takeCardLogo"
            >
              Reprendre le logo de sa carte de visite digitale
            </button>

            <div class="mt-4">
              <label class="label">Taille du logo ({{ Math.round(form.logoScale * 100) }} %)</label>
              <input v-model.number="form.logoScale" type="range" :min="LOGO_SCALE_MIN" :max="LOGO_SCALE_MAX" step="0.02" class="w-full accent-brand-600" />
              <button type="button" class="mt-1 text-xs text-slate-500 hover:text-slate-800" @click="resetLogoPlacement">Recentrer et taille par défaut</button>
            </div>
          </section>

          <!-- Couleurs -->
          <section class="card">
            <h2 class="font-semibold text-slate-900">Couleurs</h2>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="p in NFC_CARD_PRESETS"
                :key="p.label"
                type="button"
                class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                :class="form.bgColor === p.bg && form.fgColor === p.fg ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-300'"
                @click="applyPreset(p)"
              >
                <span class="inline-block h-4 w-4 rounded-full ring-1 ring-slate-300" :style="{ background: p.bg }"></span>
                <span class="inline-block h-4 w-4 rounded-full ring-1 ring-slate-300" :style="{ background: p.fg }"></span>
                {{ p.label }}
              </button>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label class="label">Fond</label>
                <div class="flex items-center gap-2">
                  <input v-model="form.bgColor" type="color" class="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5" />
                  <input v-model="form.bgColor" class="field !py-2 font-mono text-sm uppercase" maxlength="7" />
                </div>
              </div>
              <div>
                <label class="label">Éléments</label>
                <div class="flex items-center gap-2">
                  <input v-model="form.fgColor" type="color" class="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5" />
                  <input v-model="form.fgColor" class="field !py-2 font-mono text-sm uppercase" maxlength="7" />
                </div>
              </div>
            </div>
            <p v-if="contrastWarning" class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ {{ contrastWarning }}</p>
            <div class="mt-3">
              <label class="label">Logo Google (verso avis)</label>
              <div class="flex gap-2">
                <label class="flex cursor-pointer items-center gap-1.5 text-sm"><input v-model="form.googleLogoStyle" type="radio" value="mono" class="accent-brand-600" /> Monochrome</label>
                <label class="flex cursor-pointer items-center gap-1.5 text-sm"><input v-model="form.googleLogoStyle" type="radio" value="color" class="accent-brand-600" /> Couleurs officielles</label>
              </div>
            </div>
          </section>

          <!-- Carte de visite -->
          <section class="card">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-slate-900">Verso carte de visite</h2>
              <button type="button" class="text-xs text-brand-700 hover:underline" @click="prefillFromDriver">Reprendre la fiche</button>
            </div>
            <div class="mt-3 space-y-3">
              <div>
                <label class="label">Prénom / nom affiché</label>
                <input v-model="form.name" class="field !py-2" maxlength="40" placeholder="Guy" />
              </div>
              <div>
                <label class="label">Titre</label>
                <input v-model="form.title" class="field !py-2" maxlength="40" placeholder="Chauffeur Privé" />
              </div>
              <div>
                <label class="label">Téléphone</label>
                <input v-model="form.phone" class="field !py-2" maxlength="30" placeholder="07.45.20.55.65" />
              </div>
            </div>
          </section>

          <!-- Quantités -->
          <section class="card">
            <h2 class="font-semibold text-slate-900">Quantités</h2>
            <div class="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label class="label">Avis Google</label>
                <input v-model.number="form.qtyReview" type="number" min="0" max="500" class="field !py-2" />
              </div>
              <div>
                <label class="label">Cartes de visite</label>
                <input v-model.number="form.qtyBusiness" type="number" min="0" max="500" class="field !py-2" />
              </div>
            </div>
            <p class="mt-2 text-xs text-slate-500">Un produit à 0 n'est pas généré ni envoyé.</p>
          </section>

          <!-- Liens -->
          <section class="card text-sm">
            <h2 class="font-semibold text-slate-900">Liens encodés (QR = puce NFC)</h2>
            <dl class="mt-2 space-y-2 break-all">
              <div><dt class="text-xs text-slate-500">Carte avis Google</dt><dd><a :href="data.links.review" target="_blank" class="text-brand-700 hover:underline">{{ data.links.review }}</a></dd></div>
              <div>
                <dt class="text-xs text-slate-500">Lien Google direct</dt>
                <dd v-if="data.links.googleReviewUrl"><a :href="data.links.googleReviewUrl" target="_blank" class="text-brand-700 hover:underline">{{ data.driver.googlePlaceName || data.links.googleReviewUrl }}</a></dd>
                <dd v-else class="text-amber-700">Aucune fiche Google connectée : le tunnel d'avis ne redirigera nulle part.</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">Carte de visite</dt>
                <dd>
                  <a :href="data.links.business" target="_blank" class="text-brand-700 hover:underline">{{ data.links.business }}</a>
                  <span v-if="!data.driver.cardPublished" class="ml-1 text-xs text-amber-700">(non publiée)</span>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <!-- ═══ Aperçus ═══ -->
        <div class="space-y-6">
          <section v-for="product in products" :key="product" class="card" :data-testid="`nfc-product-${product}`">
            <div class="flex items-center justify-between">
              <h2 class="font-serif text-lg font-medium text-slate-900">{{ productLabels[product] }}</h2>
              <div class="flex items-center gap-3">
                <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  × {{ product === 'review' ? form.qtyReview : form.qtyBusiness }}
                </span>
                <a v-if="!dirty" :href="pdfUrl(product)" target="_blank" rel="noopener" class="text-xs text-brand-700 hover:underline">Fichier d'impression ↗</a>
                <span v-else class="text-xs text-slate-400" title="Enregistrez d'abord">Fichier d'impression ↗</span>
              </div>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-6 sm:px-6">
              <NfcCardPreview
                :product="product"
                side="front"
                :bg-color="form.bgColor"
                :fg-color="form.fgColor"
                :logo-src="logoSrc"
                :logo-scale="form.logoScale"
                :logo-offset-x="form.logoOffsetX"
                :logo-offset-y="form.logoOffsetY"
                :interactive="Boolean(logoSrc)"
                label="Recto"
                @logo-move="onLogoMove"
              />
              <NfcCardPreview
                :product="product"
                side="back"
                :bg-color="form.bgColor"
                :fg-color="form.fgColor"
                :google-logo-style="form.googleLogoStyle"
                :name="form.name"
                :title="form.title"
                :phone="form.phone"
                :qr="qr[product]"
                label="Verso"
              />
            </div>
          </section>
        </div>
      </div>
    </div>

    <LogoBankModal
      v-if="logoBank && data"
      :driver-name="data.driver.displayName"
      :company-name="data.driver.companyName"
      :title="form.title"
      :bg-color="form.bgColor"
      :fg-color="form.fgColor"
      :recipe="currentRecipe"
      @close="logoBank = false"
      @pick="onLogoPicked"
      @update="onLogoUpdated"
    />

    <!-- Confirmation d'envoi -->
    <AppModal v-if="confirmSend" @close="confirmSend = false">
      <h2 class="font-serif text-xl font-medium text-slate-900">Envoyer le design à la production ?</h2>
      <p class="mt-3 text-sm text-slate-600">
        Les fichiers d'impression ({{ [form.qtyReview > 0 ? `${form.qtyReview} avis Google` : '', form.qtyBusiness > 0 ? `${form.qtyBusiness} cartes de visite` : ''].filter(Boolean).join(' + ') || 'aucune carte' }})
        et la prévisualisation seront envoyés à <strong>{{ data?.orderEmail }}</strong>.
        <span v-if="dirty">Les modifications en cours seront enregistrées avant l'envoi.</span>
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="btn-ghost text-sm" @click="confirmSend = false">Annuler</button>
        <button class="btn-primary text-sm" data-testid="nfc-send-confirm" @click="send">Envoyer</button>
      </div>
    </AppModal>
  </div>
</template>
