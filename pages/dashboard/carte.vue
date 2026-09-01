<script setup lang="ts">
// Éditeur de la carte de visite du chauffeur.
//
// Parti pris d'ergonomie : aucune page blanche (la carte arrive pré-remplie
// depuis le profil), des blocs qu'on empile plutôt qu'une toile libre, et un
// aperçu qui rend LE MÊME composant que la page publique — il ne peut donc pas
// mentir. Le réordonnancement se fait aux flèches et non en glisser-déposer :
// c'est fiable au doigt sur mobile, là où le drag&drop déçoit.
import {
  CARD_THEMES,
  SOCIAL_NETWORKS,
  SINGLETON_KINDS,
  defaultBlockLabel,
  CARD_BLOCK_KINDS,
  type CardBlockKind,
} from '~/lib/card-blocks'
import type { CardBlockEdit, CardEditorState, CardVehicle, CardView } from '~/lib/card-view'

definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Ma carte de visite' })

const { success: toastSuccess, error: toastError } = useToast()

const { data: state, refresh } = await useFetch<CardEditorState>('/api/dashboard/card')
const { data: vehiclesData } = await useFetch<{ vehicles: Record<string, unknown>[] }>(
  '/api/dashboard/vehicles',
)

const vehicles = computed<CardVehicle[]>(() =>
  (vehiclesData.value?.vehicles ?? []).map((v) => ({
    id: String(v.id),
    label: String(v.modelLabel ?? ''),
    vehicleClass: (v.vehicleClass as string | null) ?? null,
    seats: (v.seats as number | null) ?? null,
    photoSrc: (v.photoSrc as string | null) ?? null,
  })),
)

// ─── État local ──────────────────────────────────────────────────────────────
// Le serveur reste la source de vérité : chaque action renvoie l'objet à jour,
// qu'on recopie ici. Seul le réordonnancement est optimiste (avec retour arrière
// en cas d'échec) pour rester instantané au doigt.

const blocks = ref<CardBlockEdit[]>([])
const identity = reactive({ headline: '', company: '' })
const theme = ref('signature')
const busy = ref(false)
const tab = ref<'edit' | 'preview'>('edit')

watchEffect(() => {
  const s = state.value
  if (!s) return
  blocks.value = [...s.blocks]
  identity.headline = s.headline ?? ''
  identity.company = s.company ?? ''
  theme.value = s.theme
})

const previewCard = computed<CardView>(() => ({
  slug: state.value?.slug ?? '',
  displayName: state.value?.displayName ?? '',
  headline: identity.headline.trim() || null,
  company: identity.company.trim() || null,
  theme: theme.value,
  avatarUrl: state.value?.avatarUrl ?? state.value?.profilePhotoUrl ?? null,
  coverUrl: state.value?.coverUrl ?? null,
  logoUrl: state.value?.logoUrl ?? null,
  logoPlate: state.value?.logoPlate ?? false,
  hasContactCard: state.value?.hasContactCard ?? false,
  // L'aperçu montre exactement ce que verra un visiteur : les blocs masqués
  // sont absents, et « Laisser un avis » disparaît sans dépôt configuré.
  blocks: blocks.value.filter(
    (b) => b.visible && (b.kind !== 'REVIEW_CTA' || state.value?.hasReviewLink),
  ),
  vehicles: vehicles.value,
}))

const publicUrl = computed(() => (state.value ? `/carte/${state.value.slug}` : '#'))

function apiError(e: unknown): string {
  return (
    (e as { data?: { statusMessage?: string } })?.data?.statusMessage
    ?? 'Une erreur est survenue. Réessayez.'
  )
}

// ─── Publication ─────────────────────────────────────────────────────────────

async function setPublished(published: boolean) {
  if (busy.value) return
  busy.value = true
  try {
    await $fetch('/api/dashboard/card', { method: 'PATCH', body: { published } })
    await refresh()
    toastSuccess(published ? 'Votre carte est en ligne.' : 'Votre carte est repassée en brouillon.')
  } catch (e) {
    toastError(apiError(e))
  } finally {
    busy.value = false
  }
}

// ─── Apparence & identité ────────────────────────────────────────────────────

async function saveSettings(patch: Record<string, unknown>, message?: string) {
  try {
    await $fetch('/api/dashboard/card', { method: 'PATCH', body: patch })
    if (message) toastSuccess(message)
  } catch (e) {
    toastError(apiError(e))
    await refresh()
  }
}

async function setLogoPlate(value: boolean) {
  await saveSettings({ logoPlate: value })
  await refresh()
}

async function pickTheme(key: string) {
  theme.value = key
  await saveSettings({ theme: key })
}

let identityTimer: ReturnType<typeof setTimeout> | undefined
function onIdentityInput() {
  // Enregistrement différé : le chauffeur tape, on n'écrit qu'à la pause.
  clearTimeout(identityTimer)
  identityTimer = setTimeout(() => {
    void saveSettings({ headline: identity.headline, company: identity.company })
  }, 700)
}
onBeforeUnmount(() => clearTimeout(identityTimer))

// ─── Images ──────────────────────────────────────────────────────────────────

type ImageRole = 'cover' | 'avatar' | 'logo'

const imageBusy = ref<ImageRole | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)
const avatarInput = ref<HTMLInputElement | null>(null)
const logoInput = ref<HTMLInputElement | null>(null)

const IMAGE_DONE: Record<ImageRole, string> = {
  cover: 'Couverture mise à jour.',
  avatar: 'Photo mise à jour.',
  logo: 'Logo mis à jour.',
}

async function onImageSelected(e: Event, role: ImageRole) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // permet de re-sélectionner le même fichier
  if (!file) return

  if (!file.type.startsWith('image/')) {
    toastError('Veuillez choisir une image (JPG, PNG, WEBP…).')
    return
  }
  if (file.size > MAX_PHOTO_SOURCE_BYTES) {
    toastError('Image trop volumineuse (15 Mo maximum).')
    return
  }

  imageBusy.value = role
  try {
    // Couverture plus large que l'avatar ; le logo sort en PNG pour conserver
    // son fond transparent — en JPEG il reviendrait cerné de noir.
    const dataUrl = await resizeImageToDataUrl(
      file,
      role === 'cover' ? 1200 : 512,
      role === 'logo' ? { mimeType: 'image/png' } : {},
    )
    await $fetch(`/api/dashboard/card/image/${role}`, { method: 'PUT', body: { dataUrl } })
    await refresh()
    toastSuccess(IMAGE_DONE[role])
  } catch (err) {
    toastError(apiError(err))
  } finally {
    imageBusy.value = null
  }
}

async function removeImage(role: ImageRole) {
  imageBusy.value = role
  try {
    await $fetch(`/api/dashboard/card/image/${role}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    toastError(apiError(e))
  } finally {
    imageBusy.value = null
  }
}

// ─── Blocs ───────────────────────────────────────────────────────────────────

interface FieldSpec {
  type: 'url' | 'tel' | 'email' | 'text' | 'textarea' | 'none'
  label: string
  placeholder: string
  hint?: string
}

const FIELDS: Record<CardBlockKind, FieldSpec> = {
  LINK: { type: 'url', label: 'Adresse du lien', placeholder: 'https://mon-site.fr' },
  SOCIAL: { type: 'url', label: 'Adresse du profil', placeholder: 'https://instagram.com/mon-compte' },
  PHONE: { type: 'tel', label: 'Numéro de téléphone', placeholder: '06 12 34 56 78' },
  WHATSAPP: {
    type: 'tel',
    label: 'Numéro WhatsApp',
    placeholder: '+33 6 12 34 56 78',
    hint: 'Au format international de préférence. Un numéro commençant par 0 est complété en +33.',
  },
  EMAIL: { type: 'email', label: 'Adresse email', placeholder: 'contact@mon-domaine.fr' },
  ADDRESS: { type: 'text', label: 'Adresse', placeholder: '10 rue de Rivoli, 75004 Paris' },
  TEXT: { type: 'textarea', label: 'Texte', placeholder: 'Quelques mots sur vous, votre service…' },
  BOOKING_CTA: { type: 'none', label: '', placeholder: '' },
  REVIEW_CTA: { type: 'none', label: '', placeholder: '' },
  VEHICLES: { type: 'none', label: '', placeholder: '' },
}

const PALETTE: { kind: CardBlockKind; icon: string; help: string }[] = [
  { kind: 'BOOKING_CTA', icon: 'calendar', help: 'Bouton vers votre page de réservation' },
  { kind: 'PHONE', icon: 'phone', help: 'Appel en un geste' },
  { kind: 'WHATSAPP', icon: 'whatsapp', help: 'Conversation WhatsApp' },
  { kind: 'EMAIL', icon: 'mail', help: 'Ouvre la messagerie' },
  { kind: 'SOCIAL', icon: 'link', help: 'Instagram, LinkedIn, site web…' },
  { kind: 'LINK', icon: 'link', help: 'N’importe quelle adresse web' },
  { kind: 'ADDRESS', icon: 'pin', help: 'Ouvre l’itinéraire' },
  { kind: 'TEXT', icon: 'text', help: 'Quelques mots de présentation' },
  { kind: 'VEHICLES', icon: 'car', help: 'Vos véhicules déjà enregistrés' },
  { kind: 'REVIEW_CTA', icon: 'star', help: 'Invite à laisser un avis' },
]

const BLOCK_ICONS: Record<CardBlockKind, string> = {
  LINK: 'link',
  SOCIAL: 'link',
  PHONE: 'phone',
  EMAIL: 'mail',
  WHATSAPP: 'whatsapp',
  ADDRESS: 'pin',
  TEXT: 'text',
  BOOKING_CTA: 'calendar',
  REVIEW_CTA: 'star',
  VEHICLES: 'car',
}

function isUsed(kind: CardBlockKind): boolean {
  return SINGLETON_KINDS.includes(kind) && blocks.value.some((b) => b.kind === kind)
}

// Formulaire d'ajout
const adding = ref<{ kind: CardBlockKind; label: string; value: string; network: string } | null>(null)
const paletteOpen = ref(false)

function startAdd(kind: CardBlockKind) {
  if (isUsed(kind)) return
  paletteOpen.value = false
  if (FIELDS[kind].type === 'none') {
    void createBlock(kind, '', '', '')
    return
  }
  adding.value = { kind, label: '', value: '', network: 'instagram' }
}

async function createBlock(kind: CardBlockKind, label: string, value: string, network: string) {
  if (busy.value) return
  busy.value = true
  try {
    const res = await $fetch<{ block: CardBlockEdit }>('/api/dashboard/card/blocks', {
      method: 'POST',
      body: {
        kind,
        label: label.trim() || null,
        value: value.trim() || null,
        ...(kind === 'SOCIAL' ? { data: { network } } : {}),
      },
    })
    blocks.value = [...blocks.value, res.block]
    adding.value = null
    toastSuccess('Bloc ajouté.')
  } catch (e) {
    toastError(apiError(e))
  } finally {
    busy.value = false
  }
}

function submitAdd() {
  const a = adding.value
  if (!a) return
  void createBlock(a.kind, a.label, a.value, a.network)
}

// Édition d'un bloc existant
const editingId = ref<string | null>(null)
const draft = reactive({ label: '', value: '', network: 'instagram' })

function startEdit(block: CardBlockEdit) {
  editingId.value = block.id
  draft.label = block.label ?? ''
  draft.value = block.value ?? ''
  draft.network = String(block.data?.network ?? 'instagram')
}

async function saveEdit(block: CardBlockEdit) {
  if (busy.value) return
  busy.value = true
  try {
    const res = await $fetch<{ block: CardBlockEdit }>(
      `/api/dashboard/card/blocks/${block.id}`,
      {
        method: 'PATCH',
        body: {
          label: draft.label.trim() || null,
          ...(FIELDS[block.kind].type === 'none' ? {} : { value: draft.value.trim() }),
          ...(block.kind === 'SOCIAL' ? { data: { network: draft.network } } : {}),
        },
      },
    )
    blocks.value = blocks.value.map((b) => (b.id === block.id ? res.block : b))
    editingId.value = null
    toastSuccess('Bloc enregistré.')
  } catch (e) {
    toastError(apiError(e))
  } finally {
    busy.value = false
  }
}

async function toggleVisible(block: CardBlockEdit) {
  if (busy.value) return
  busy.value = true
  try {
    const res = await $fetch<{ block: CardBlockEdit }>(
      `/api/dashboard/card/blocks/${block.id}`,
      { method: 'PATCH', body: { visible: !block.visible } },
    )
    blocks.value = blocks.value.map((b) => (b.id === block.id ? res.block : b))
  } catch (e) {
    toastError(apiError(e))
  } finally {
    busy.value = false
  }
}

async function removeBlock(block: CardBlockEdit) {
  if (busy.value) return
  if (!confirm(`Supprimer « ${block.label || defaultBlockLabel(block.kind, block.data)} » ?`)) return
  busy.value = true
  const snapshot = [...blocks.value]
  blocks.value = blocks.value.filter((b) => b.id !== block.id)
  try {
    await $fetch(`/api/dashboard/card/blocks/${block.id}`, { method: 'DELETE' })
    if (editingId.value === block.id) editingId.value = null
  } catch (e) {
    blocks.value = snapshot
    toastError(apiError(e))
  } finally {
    busy.value = false
  }
}

async function move(index: number, delta: number) {
  const target = index + delta
  if (busy.value || target < 0 || target >= blocks.value.length) return

  // Déplacement optimiste : l'ordre bouge tout de suite, on annule si le
  // serveur refuse.
  const snapshot = [...blocks.value]
  const next = [...blocks.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  blocks.value = next

  busy.value = true
  try {
    await $fetch('/api/dashboard/card/blocks/reorder', {
      method: 'POST',
      body: { ids: next.map((b) => b.id) },
    })
  } catch (e) {
    blocks.value = snapshot
    toastError(apiError(e))
  } finally {
    busy.value = false
  }
}

function blockSummary(block: CardBlockEdit): string {
  if (FIELDS[block.kind].type === 'none') return 'Contenu automatique'
  return block.value ?? ''
}

// Un bloc « avis » sans dépôt configuré ne s'affichera pas publiquement.
const reviewWarning = computed(
  () => blocks.value.some((b) => b.kind === 'REVIEW_CTA') && state.value?.hasReviewLink === false,
)
</script>

<template>
  <div v-if="state">
    <h1 class="title-serif text-2xl text-slate-900">Ma carte de visite</h1>
    <p class="mt-1 text-sm text-slate-600">
      Une page à partager en un lien ou un QR code : vos coordonnées, vos liens, et un bouton
      pour réserver une course.
    </p>

    <!-- État de publication -->
    <div class="card mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            :class="state.published ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="state.published ? 'bg-green-600' : 'bg-slate-400'" />
            {{ state.published ? 'En ligne' : 'Brouillon' }}
          </span>
        </div>
        <p v-if="state.published" class="mt-2 truncate text-sm text-slate-600">
          <a :href="publicUrl" target="_blank" rel="noopener" class="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800">
            ridewiz.fr/carte/{{ state.slug }} ↗
          </a>
        </p>
        <p v-else class="mt-2 text-sm text-slate-600">
          Votre carte n’est visible que par vous. Publiez-la quand elle vous convient.
        </p>
      </div>
      <button
        type="button"
        class="shrink-0"
        :class="state.published ? 'btn-ghost' : 'btn-primary'"
        :disabled="busy"
        @click="setPublished(!state.published)"
      >
        {{ state.published ? 'Repasser en brouillon' : 'Publier ma carte' }}
      </button>
    </div>

    <!-- Onglets mobile : l'aperçu passe en pleine largeur -->
    <div class="mt-5 flex gap-2 lg:hidden">
      <button
        type="button"
        class="flex-1 rounded-xl py-2.5 text-sm font-semibold transition"
        :class="tab === 'edit' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'"
        @click="tab = 'edit'"
      >Éditer</button>
      <button
        type="button"
        class="flex-1 rounded-xl py-2.5 text-sm font-semibold transition"
        :class="tab === 'preview' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'"
        @click="tab = 'preview'"
      >Aperçu</button>
    </div>

    <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <!-- ═══════ Colonne édition ═══════ -->
      <div :class="tab === 'edit' ? '' : 'hidden lg:block'" class="space-y-5">
        <!-- Apparence -->
        <section class="card space-y-5">
          <h2 class="font-semibold text-slate-900">Apparence</h2>

          <div>
            <span class="label">Thème</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="t in CARD_THEMES"
                :key="t.key"
                type="button"
                class="flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-sm font-medium transition"
                :class="theme === t.key ? 'border-brand-600 bg-brand-50 text-slate-900' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'"
                @click="pickTheme(t.key)"
              >
                <span class="flex h-5 w-5 overflow-hidden rounded-full ring-1 ring-black/10">
                  <span class="h-full w-1/2" :style="{ background: t.tokens.bg }" />
                  <span class="h-full w-1/2" :style="{ background: t.tokens.accent }" />
                </span>
                {{ t.label }}
              </button>
            </div>
          </div>

          <!-- Couverture -->
          <div>
              <span class="label">Image de couverture</span>
              <div
                class="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                <img v-if="state.coverUrl" :src="state.coverUrl" alt="" class="h-full w-full object-cover" />
                <CardIcon v-else name="image" :size="24" class="text-slate-400" />
              </div>
              <input ref="coverInput" type="file" accept="image/*" class="sr-only" @change="onImageSelected($event, 'cover')" />
              <div class="mt-2 flex items-center gap-3">
                <button type="button" class="btn-ghost !min-h-0 px-3 py-1.5 text-sm" :disabled="imageBusy === 'cover'" @click="coverInput?.click()">
                  {{ imageBusy === 'cover' ? 'Chargement…' : state.coverUrl ? 'Changer' : 'Importer' }}
                </button>
                <button v-if="state.coverUrl && imageBusy !== 'cover'" type="button" class="text-sm font-medium text-red-600 hover:underline" @click="removeImage('cover')">
                  Retirer
                </button>
              </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <!-- Photo -->
            <div>
              <span class="label">Photo</span>
              <div class="flex h-24 items-center gap-3">
                <img
                  v-if="state.avatarUrl || state.profilePhotoUrl"
                  :src="state.avatarUrl ?? state.profilePhotoUrl ?? ''"
                  alt=""
                  class="h-20 w-20 rounded-full object-cover ring-1 ring-slate-200"
                />
                <div v-else class="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <CardIcon name="image" :size="22" />
                </div>
              </div>
              <input ref="avatarInput" type="file" accept="image/*" class="sr-only" @change="onImageSelected($event, 'avatar')" />
              <div class="mt-2 flex items-center gap-3">
                <button type="button" class="btn-ghost !min-h-0 px-3 py-1.5 text-sm" :disabled="imageBusy === 'avatar'" @click="avatarInput?.click()">
                  {{ imageBusy === 'avatar' ? 'Chargement…' : state.avatarUrl ? 'Changer' : 'Importer' }}
                </button>
                <button v-if="state.avatarUrl && imageBusy !== 'avatar'" type="button" class="text-sm font-medium text-red-600 hover:underline" @click="removeImage('avatar')">
                  Retirer
                </button>
              </div>
              <p v-if="!state.avatarUrl && state.profilePhotoUrl" class="mt-1 text-xs text-slate-500">
                Votre photo de profil est utilisée par défaut.
              </p>
            </div>

            <!-- Logo -->
            <div>
              <span class="label">Logo (optionnel)</span>
              <!-- Damier discret : rend visible la transparence d'un logo PNG,
                   et évite qu'un logo blanc paraisse absent sur fond blanc. -->
              <div class="rw-checker flex h-24 items-center justify-center overflow-hidden rounded-xl border border-slate-200 p-2">
                <img
                  v-if="state.logoUrl"
                  :src="state.logoUrl"
                  alt="Votre logo"
                  class="max-h-full max-w-full object-contain"
                />
                <CardIcon v-else name="image" :size="24" class="text-slate-400" />
              </div>
              <input ref="logoInput" type="file" accept="image/*" class="sr-only" @change="onImageSelected($event, 'logo')" />
              <div class="mt-2 flex items-center gap-3">
                <button type="button" class="btn-ghost !min-h-0 px-3 py-1.5 text-sm" :disabled="imageBusy === 'logo'" @click="logoInput?.click()">
                  {{ imageBusy === 'logo' ? 'Chargement…' : state.logoUrl ? 'Changer' : 'Importer' }}
                </button>
                <button v-if="state.logoUrl && imageBusy !== 'logo'" type="button" class="text-sm font-medium text-red-600 hover:underline" @click="removeImage('logo')">
                  Retirer
                </button>
              </div>
              <p class="mt-1 text-xs text-slate-500">
                Affiché sous votre nom, sans recadrage, transparence conservée.
              </p>
              <!-- Sans ce réglage, un logo sombre à fond transparent devient
                   invisible sur les thèmes Nuit et Ardoise. L'aperçu à droite
                   montre l'effet immédiatement. -->
              <label v-if="state.logoUrl" class="mt-2 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  :checked="state.logoPlate"
                  @change="setLogoPlate(($event.target as HTMLInputElement).checked)"
                />
                <span class="text-xs text-slate-600">
                  Poser le logo sur une pastille claire
                  <span class="block text-slate-400">
                    Utile si votre logo est sombre et que vous choisissez un thème sombre.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </section>

        <!-- Identité -->
        <section class="card space-y-4">
          <h2 class="font-semibold text-slate-900">Identité</h2>
          <p class="-mt-2 text-sm text-slate-500">
            Le nom affiché ({{ state.displayName }}) se modifie dans
            <NuxtLink to="/dashboard/profil" class="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2">votre profil</NuxtLink>.
          </p>
          <div>
            <label class="label" for="card-headline">Sous-titre</label>
            <input
              id="card-headline"
              v-model="identity.headline"
              type="text"
              class="field"
              maxlength="120"
              placeholder="Ex : Chauffeur VTC · Paris"
              @input="onIdentityInput"
            />
          </div>
          <div>
            <label class="label" for="card-company">Société (optionnel)</label>
            <input
              id="card-company"
              v-model="identity.company"
              type="text"
              class="field"
              maxlength="120"
              placeholder="Ex : Karim Transports"
              @input="onIdentityInput"
            />
          </div>
        </section>

        <!-- Blocs -->
        <section class="card space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-slate-900">Contenu</h2>
            <span class="text-xs text-slate-400">{{ blocks.length }} bloc{{ blocks.length > 1 ? 's' : '' }}</span>
          </div>

          <p v-if="reviewWarning" class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Le bloc « Laisser un avis » reste masqué tant qu’aucun lien d’avis n’est configuré dans
            <NuxtLink to="/dashboard/parametres" class="font-semibold underline">vos réglages</NuxtLink>.
          </p>

          <ul v-if="blocks.length" class="space-y-2">
            <li
              v-for="(block, i) in blocks"
              :key="block.id"
              class="rounded-2xl border border-slate-200 bg-white"
              :class="block.visible ? '' : 'opacity-60'"
            >
              <div class="flex items-center gap-2 p-3">
                <!-- Réordonnancement -->
                <div class="flex shrink-0 flex-col">
                  <button
                    type="button"
                    class="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    :disabled="i === 0 || busy"
                    aria-label="Monter"
                    @click="move(i, -1)"
                  ><CardIcon name="up" :size="16" /></button>
                  <button
                    type="button"
                    class="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    :disabled="i === blocks.length - 1 || busy"
                    aria-label="Descendre"
                    @click="move(i, 1)"
                  ><CardIcon name="down" :size="16" /></button>
                </div>

                <span class="shrink-0 text-brand-600"><CardIcon :name="BLOCK_ICONS[block.kind]" :size="20" /></span>

                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-slate-900">
                    {{ block.label || defaultBlockLabel(block.kind, block.data) }}
                  </p>
                  <p class="truncate text-xs text-slate-500">{{ blockSummary(block) }}</p>
                </div>

                <div class="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    class="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    :disabled="busy"
                    :aria-label="block.visible ? 'Masquer' : 'Afficher'"
                    :title="block.visible ? 'Masquer' : 'Afficher'"
                    @click="toggleVisible(block)"
                  ><CardIcon :name="block.visible ? 'eye' : 'eye-off'" :size="18" /></button>
                  <button
                    type="button"
                    class="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Modifier"
                    title="Modifier"
                    @click="editingId === block.id ? (editingId = null) : startEdit(block)"
                  ><CardIcon name="pencil" :size="18" /></button>
                  <button
                    type="button"
                    class="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    :disabled="busy"
                    aria-label="Supprimer"
                    title="Supprimer"
                    @click="removeBlock(block)"
                  ><CardIcon name="trash" :size="18" /></button>
                </div>
              </div>

              <!-- Édition inline -->
              <div v-if="editingId === block.id" class="space-y-3 border-t border-slate-100 p-3">
                <div v-if="block.kind === 'SOCIAL'">
                  <label class="label" :for="`net-${block.id}`">Réseau</label>
                  <select :id="`net-${block.id}`" v-model="draft.network" class="field">
                    <option v-for="n in SOCIAL_NETWORKS" :key="n.key" :value="n.key">{{ n.label }}</option>
                  </select>
                </div>
                <div v-if="FIELDS[block.kind].type !== 'none'">
                  <label class="label" :for="`val-${block.id}`">{{ FIELDS[block.kind].label }}</label>
                  <textarea
                    v-if="FIELDS[block.kind].type === 'textarea'"
                    :id="`val-${block.id}`"
                    v-model="draft.value"
                    class="field min-h-24"
                    maxlength="1200"
                    :placeholder="FIELDS[block.kind].placeholder"
                  />
                  <input
                    v-else
                    :id="`val-${block.id}`"
                    v-model="draft.value"
                    :type="FIELDS[block.kind].type === 'tel' ? 'tel' : FIELDS[block.kind].type === 'email' ? 'email' : 'text'"
                    class="field"
                    :placeholder="FIELDS[block.kind].placeholder"
                  />
                  <p v-if="FIELDS[block.kind].hint" class="mt-1 text-xs text-slate-500">{{ FIELDS[block.kind].hint }}</p>
                </div>
                <div>
                  <label class="label" :for="`lab-${block.id}`">Libellé affiché (optionnel)</label>
                  <input
                    :id="`lab-${block.id}`"
                    v-model="draft.label"
                    type="text"
                    class="field"
                    maxlength="80"
                    :placeholder="defaultBlockLabel(block.kind, block.data)"
                  />
                </div>
                <div class="flex gap-2">
                  <button type="button" class="btn-primary !min-h-0 px-4 py-2 text-sm" :disabled="busy" @click="saveEdit(block)">
                    Enregistrer
                  </button>
                  <button type="button" class="btn-ghost !min-h-0 px-4 py-2 text-sm" @click="editingId = null">
                    Annuler
                  </button>
                </div>
              </div>
            </li>
          </ul>

          <p v-else class="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            Votre carte ne contient aucun bloc. Ajoutez-en un ci-dessous.
          </p>

          <!-- Formulaire d'ajout -->
          <div v-if="adding" class="space-y-3 rounded-2xl border-[1.5px] border-brand-200 bg-brand-50/50 p-3">
            <p class="text-sm font-semibold text-slate-900">
              Ajouter : {{ defaultBlockLabel(adding.kind, { network: adding.network }) }}
            </p>
            <div v-if="adding.kind === 'SOCIAL'">
              <label class="label" for="add-network">Réseau</label>
              <select id="add-network" v-model="adding.network" class="field">
                <option v-for="n in SOCIAL_NETWORKS" :key="n.key" :value="n.key">{{ n.label }}</option>
              </select>
            </div>
            <div>
              <label class="label" for="add-value">{{ FIELDS[adding.kind].label }}</label>
              <textarea
                v-if="FIELDS[adding.kind].type === 'textarea'"
                id="add-value"
                v-model="adding.value"
                class="field min-h-24"
                maxlength="1200"
                :placeholder="FIELDS[adding.kind].placeholder"
              />
              <input
                v-else
                id="add-value"
                v-model="adding.value"
                :type="FIELDS[adding.kind].type === 'tel' ? 'tel' : FIELDS[adding.kind].type === 'email' ? 'email' : 'text'"
                class="field"
                :placeholder="adding.kind === 'SOCIAL' ? (SOCIAL_NETWORKS.find((n) => n.key === adding!.network)?.placeholder ?? '') : FIELDS[adding.kind].placeholder"
              />
              <p v-if="FIELDS[adding.kind].hint" class="mt-1 text-xs text-slate-500">{{ FIELDS[adding.kind].hint }}</p>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-primary !min-h-0 px-4 py-2 text-sm" :disabled="busy || !adding.value.trim()" @click="submitAdd">
                Ajouter
              </button>
              <button type="button" class="btn-ghost !min-h-0 px-4 py-2 text-sm" @click="adding = null">Annuler</button>
            </div>
          </div>

          <!-- Palette -->
          <div v-else>
            <button
              v-if="!paletteOpen"
              type="button"
              class="btn-ghost w-full border-dashed"
              @click="paletteOpen = true"
            >
              <CardIcon name="plus" :size="18" /> Ajouter un bloc
            </button>
            <div v-else class="grid gap-2 sm:grid-cols-2">
              <button
                v-for="item in PALETTE"
                :key="item.kind"
                type="button"
                class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white"
                :disabled="isUsed(item.kind)"
                @click="startAdd(item.kind)"
              >
                <span class="mt-0.5 shrink-0 text-brand-600"><CardIcon :name="item.icon" :size="18" /></span>
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-slate-900">{{ defaultBlockLabel(item.kind) }}</span>
                  <span class="block text-xs text-slate-500">
                    {{ isUsed(item.kind) ? 'Déjà sur votre carte' : item.help }}
                  </span>
                </span>
              </button>
              <button type="button" class="btn-ghost sm:col-span-2" @click="paletteOpen = false">Fermer</button>
            </div>
          </div>
        </section>
      </div>

      <!-- ═══════ Colonne aperçu ═══════ -->
      <div :class="tab === 'preview' ? '' : 'hidden lg:block'">
        <div class="lg:sticky lg:top-6">
          <p class="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-slate-400 lg:block">
            Aperçu
          </p>
          <!-- Cadre téléphone : le rendu est celui de la vraie page publique. -->
          <div class="overflow-hidden rounded-[28px] border-[6px] border-slate-900 bg-white shadow-xl">
            <div class="max-h-[70vh] overflow-y-auto">
              <CardRender :card="previewCard" preview />
            </div>
          </div>
          <p class="mt-3 text-center text-xs text-slate-500">
            Aperçu réel : c’est exactement ce que verront vos clients.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Damier de transparence : sans lui, un logo blanc à fond transparent
   paraîtrait vide dans l'aperçu du champ. */
.rw-checker {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #EFE7D8 25%, transparent 25%),
    linear-gradient(-45deg, #EFE7D8 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #EFE7D8 75%),
    linear-gradient(-45deg, transparent 75%, #EFE7D8 75%);
  background-size: 14px 14px;
  background-position: 0 0, 0 7px, 7px -7px, -7px 0;
}
</style>
