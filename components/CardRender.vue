<script setup lang="ts">
// Rendu de la carte de visite. UTILISÉ TEL QUEL par la page publique ET par
// l'aperçu de l'éditeur : c'est ce qui garantit que l'aperçu ne ment jamais.
// En mode `preview`, les liens sont inertes (on ne navigue pas depuis l'éditeur).
import {
  themeCssVars,
  blockHref,
  blockLabel,
  isExternalHref,
  type CardBlockKind,
} from '~/lib/card-blocks'
import type { CardView, CardBlockView } from '~/lib/card-view'

const props = defineProps<{ card: CardView; preview?: boolean }>()

const styleVars = computed(() => themeCssVars(props.card.theme))

const ICONS: Record<CardBlockKind, string> = {
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

type Row =
  | { type: 'socials'; key: string; blocks: CardBlockView[] }
  | { type: 'block'; key: string; block: CardBlockView }

/**
 * Les blocs se suivent dans l'ordre choisi par le chauffeur ; les réseaux
 * sociaux CONSÉCUTIFS sont regroupés en une rangée de pastilles — plus lisible
 * qu'une pile de gros boutons, sans jamais réordonner quoi que ce soit.
 */
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  for (const block of props.card.blocks) {
    const last = out[out.length - 1]
    if (block.kind === 'SOCIAL' && last?.type === 'socials') last.blocks.push(block)
    else if (block.kind === 'SOCIAL') out.push({ type: 'socials', key: block.id, blocks: [block] })
    else out.push({ type: 'block', key: block.id, block })
  }
  return out
})

function hrefOf(block: CardBlockView): string | null {
  return blockHref(block, props.card.slug)
}

/** En aperçu, tout est rendu en <div> : aucun clic ne quitte l'éditeur. */
function tagFor(block: CardBlockView): 'a' | 'div' {
  return !props.preview && hrefOf(block) ? 'a' : 'div'
}

function linkAttrs(block: CardBlockView) {
  const href = hrefOf(block)
  if (props.preview || !href) return {}
  return isExternalHref(href)
    ? { href, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }
    : { href }
}

const vcardHref = computed(() =>
  props.preview ? undefined : `/api/public/carte/${props.card.slug}/vcard`,
)

const showVehicles = computed(() => props.card.blocks.some((b) => b.kind === 'VEHICLES'))
const initial = computed(() => props.card.displayName.trim().charAt(0).toUpperCase() || '?')
</script>

<template>
  <div :style="styleVars" class="rw-card min-h-full w-full pb-10">
    <!-- Couverture : image importée, ou dégradé dérivé du thème -->
    <div class="rw-cover relative h-32 w-full sm:h-40">
      <img
        v-if="card.coverUrl"
        :src="card.coverUrl"
        alt=""
        class="h-full w-full object-cover"
        loading="eager"
      />
    </div>

    <div class="mx-auto w-full max-w-md px-5">
      <!-- Avatar, à cheval sur la couverture -->
      <div class="-mt-12 flex justify-center">
        <img
          v-if="card.avatarUrl"
          :src="card.avatarUrl"
          :alt="card.displayName"
          class="rw-avatar h-24 w-24 rounded-full object-cover"
        />
        <div
          v-else
          class="rw-avatar rw-avatar-fallback flex h-24 w-24 items-center justify-center rounded-full text-3xl font-semibold"
        >
          {{ initial }}
        </div>
      </div>

      <!-- Identité -->
      <div class="mt-4 text-center">
        <h1 class="rw-name font-serif text-[26px] font-medium leading-tight tracking-tight">
          {{ card.displayName }}
        </h1>
        <p v-if="card.headline" class="rw-muted mt-1 text-[15px]">{{ card.headline }}</p>
        <p v-if="card.company" class="rw-muted mt-0.5 text-[13px] opacity-80">{{ card.company }}</p>
      </div>

      <!-- Ajouter à mes contacts : le geste le plus utile de la page -->
      <a
        v-if="card.hasContactCard"
        :href="vcardHref"
        class="rw-vcard mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold"
        :class="preview ? 'pointer-events-none' : ''"
        :download="preview ? undefined : ''"
      >
        <CardIcon name="download" :size="18" />
        {{ $t('card.saveContact') }}
      </a>

      <!-- Blocs, dans l'ordre choisi par le chauffeur -->
      <div class="mt-4 space-y-2.5">
        <template v-for="row in rows" :key="row.key">
          <!-- Rangée de réseaux sociaux -->
          <div v-if="row.type === 'socials'" class="flex flex-wrap justify-center gap-3 py-1">
            <component
              :is="tagFor(b)"
              v-for="b in row.blocks"
              :key="b.id"
              v-bind="linkAttrs(b)"
              class="transition-transform hover:scale-105"
              :aria-label="blockLabel(b)"
              :title="blockLabel(b)"
            >
              <CardSocialBadge :network="String(b.data?.network ?? 'website')" :size="44" />
            </component>
          </div>

          <!-- Texte libre -->
          <div
            v-else-if="row.block.kind === 'TEXT'"
            class="rw-surface rounded-2xl px-4 py-4 text-[15px] leading-relaxed"
          >
            <p v-if="row.block.label" class="rw-muted mb-1.5 text-[12px] font-semibold uppercase tracking-wide">
              {{ row.block.label }}
            </p>
            <p class="whitespace-pre-line">{{ row.block.value }}</p>
          </div>

          <!-- Vitrine véhicules -->
          <div v-else-if="row.block.kind === 'VEHICLES'">
            <p class="rw-muted mb-2 mt-2 text-[12px] font-semibold uppercase tracking-wide">
              {{ blockLabel(row.block) }}
            </p>
            <div v-if="card.vehicles.length" class="grid grid-cols-2 gap-2.5">
              <div
                v-for="v in card.vehicles"
                :key="v.id"
                class="rw-surface overflow-hidden rounded-2xl"
              >
                <img
                  v-if="v.photoSrc"
                  :src="v.photoSrc"
                  :alt="v.label"
                  class="h-24 w-full object-cover"
                  loading="lazy"
                />
                <div v-else class="rw-placeholder flex h-24 w-full items-center justify-center">
                  <CardIcon name="car" :size="28" />
                </div>
                <div class="px-3 py-2">
                  <p class="truncate text-[13px] font-semibold">{{ v.label }}</p>
                  <p class="rw-muted truncate text-[12px]">
                    {{ [v.vehicleClass, v.seats ? `${v.seats} places` : null].filter(Boolean).join(' · ') }}
                  </p>
                </div>
              </div>
            </div>
            <p v-else class="rw-muted text-[13px]">{{ $t('card.noVehicle') }}</p>
          </div>

          <!-- Bouton principal : réserver -->
          <component
            :is="tagFor(row.block)"
            v-else-if="row.block.kind === 'BOOKING_CTA'"
            v-bind="linkAttrs(row.block)"
            class="rw-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[15px] font-semibold"
          >
            <CardIcon name="calendar" :size="18" />
            {{ blockLabel(row.block) }}
          </component>

          <!-- Tous les autres blocs : une ligne cliquable -->
          <component
            :is="tagFor(row.block)"
            v-else
            v-bind="linkAttrs(row.block)"
            class="rw-surface flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors"
          >
            <span class="rw-accent shrink-0"><CardIcon :name="ICONS[row.block.kind]" :size="20" /></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-semibold">{{ blockLabel(row.block) }}</span>
              <span v-if="row.block.kind === 'ADDRESS'" class="rw-muted block truncate text-[13px]">
                {{ row.block.value }}
              </span>
            </span>
            <span class="rw-muted shrink-0 opacity-60">
              <CardIcon :name="isExternalHref(hrefOf(row.block)) ? 'external' : 'link'" :size="16" />
            </span>
          </component>
        </template>
      </div>

      <!-- Carte encore vide (visible surtout dans l'éditeur) -->
      <p v-if="!card.blocks.length" class="rw-muted mt-6 text-center text-[14px]">
        {{ $t('card.empty') }}
      </p>

      <p class="rw-muted mt-8 text-center text-[12px] opacity-70">{{ $t('card.poweredBy') }}</p>
    </div>
  </div>
</template>

<style scoped>
/* Le thème est appliqué par variables CSS : une classe Tailwind calculée à
   l'exécution serait purgée au build (elle n'apparaît nulle part en dur). */
.rw-card {
  background: var(--card-bg);
  color: var(--card-text);
}
.rw-cover {
  background: linear-gradient(135deg, var(--card-accent) 0%, var(--card-surface) 140%);
}
.rw-avatar {
  border: 4px solid var(--card-bg);
  box-shadow: 0 8px 24px -12px rgb(0 0 0 / 45%);
  background: var(--card-surface);
}
.rw-avatar-fallback {
  color: var(--card-accent);
}
.rw-name {
  color: var(--card-text);
}
.rw-muted {
  color: var(--card-muted);
}
.rw-accent {
  color: var(--card-accent);
}
.rw-surface {
  background: var(--card-surface);
  border: 1px solid var(--card-border);
  color: var(--card-text);
}
a.rw-surface:hover {
  border-color: var(--card-accent);
}
.rw-placeholder {
  background: var(--card-bg);
  color: var(--card-muted);
}
.rw-primary {
  background: var(--card-accent);
  color: var(--card-accent-text);
}
a.rw-primary:hover {
  filter: brightness(0.94);
}
.rw-vcard {
  border: 1.5px solid var(--card-accent);
  color: var(--card-accent);
  background: transparent;
}
a.rw-vcard:hover {
  background: var(--card-surface);
}
</style>
