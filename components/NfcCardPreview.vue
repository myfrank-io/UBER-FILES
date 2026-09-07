<script setup lang="ts">
// Aperçu SVG d'une face d'une carte NFC (format CR80, coordonnées en mm).
// Lit les MÊMES tables de placement que le PDF d'impression (lib/nfc-card.ts) :
// ce qui est affiché ici est ce qui sera imprimé, au QR près qui est le vrai.
import {
  BUSINESS_NAME_LINE,
  BUSINESS_PHONE_LINE,
  BUSINESS_TITLE_LINE,
  CARD_H,
  CARD_RADIUS,
  CARD_W,
  FRONT_TEXT,
  FRONT_TEXT_VALUES,
  GOOGLE_G_PATHS,
  GOOGLE_G_VIEWBOX,
  GOOGLE_LOGO_BOX,
  NFC_ICON_BOX,
  NFC_ICON_PATHS,
  NFC_ICON_SOURCE,
  QR_BOX,
  REVIEW_BACK_TEXT,
  REVIEW_BACK_TEXT_VALUES,
  lineText,
  logoBox,
  qrModuleRects,
  squareInBox,
  fitSourceInBox,
  type GoogleLogoStyle,
  type NfcCardProduct,
  type NfcCardSide,
  type QrMatrix,
  type TextLine,
} from '~/lib/nfc-card'

const props = withDefaults(
  defineProps<{
    product: NfcCardProduct
    side: NfcCardSide
    bgColor: string
    fgColor: string
    logoSrc?: string | null
    logoScale?: number
    logoOffsetX?: number
    logoOffsetY?: number
    googleLogoStyle?: GoogleLogoStyle
    name?: string
    title?: string
    phone?: string
    qr?: QrMatrix | null
    /** Le logo peut être déplacé à la souris (recto uniquement). */
    interactive?: boolean
    label?: string
  }>(),
  {
    logoSrc: null,
    logoScale: 1,
    logoOffsetX: 0,
    logoOffsetY: 0,
    googleLogoStyle: 'mono',
    name: '',
    title: '',
    phone: '',
    qr: null,
    interactive: false,
    label: '',
  },
)

const emit = defineEmits<{ (e: 'logo-move', offset: { x: number; y: number }): void }>()

const svgRef = ref<SVGSVGElement | null>(null)

const logo = computed(() =>
  logoBox({ logoScale: props.logoScale, logoOffsetX: props.logoOffsetX, logoOffsetY: props.logoOffsetY }),
)

const nfcIcon = fitSourceInBox(NFC_ICON_BOX, NFC_ICON_SOURCE)
const googleIcon = squareInBox(GOOGLE_LOGO_BOX, GOOGLE_G_VIEWBOX)

const qrRects = computed(() => (props.qr ? qrModuleRects(props.qr, QR_BOX) : []))

interface RenderedLine {
  key: string
  text: string
  line: TextLine
}

const backLines = computed<RenderedLine[]>(() => {
  if (props.product === 'review') {
    return REVIEW_BACK_TEXT.map((line, i) => ({ key: line.key, line, text: lineText(line, REVIEW_BACK_TEXT_VALUES[i]!) }))
  }
  return [
    { key: 'name', line: BUSINESS_NAME_LINE, text: props.name },
    { key: 'title', line: BUSINESS_TITLE_LINE, text: props.title },
    { key: 'phone', line: BUSINESS_PHONE_LINE, text: props.phone },
  ].filter((l) => l.text)
})

const frontLines: RenderedLine[] = FRONT_TEXT.map((line, i) => ({
  key: line.key,
  line,
  text: lineText(line, FRONT_TEXT_VALUES[i]!),
}))

const FONT = "Georgia, 'Times New Roman', Times, serif"

// Glisser le logo directement sur la carte : les pixels sont convertis en mm
// d'après la taille rendue ; le parent borne et enregistre le décalage.
function onLogoPointerDown(e: PointerEvent) {
  if (!props.interactive || !svgRef.value) return
  e.preventDefault()
  const rect = svgRef.value.getBoundingClientRect()
  const mmPerPx = CARD_W / rect.width
  const base = { x: props.logoOffsetX, y: props.logoOffsetY }
  const start = { x: e.clientX, y: e.clientY }
  const move = (ev: PointerEvent) => {
    emit('logo-move', {
      x: base.x + (ev.clientX - start.x) * mmPerPx,
      y: base.y + (ev.clientY - start.y) * mmPerPx,
    })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <figure class="m-0 flex flex-col items-center gap-2">
    <svg
      ref="svgRef"
      :viewBox="`0 0 ${CARD_W} ${CARD_H}`"
      class="w-full max-w-[220px] drop-shadow-lg"
      xmlns="http://www.w3.org/2000/svg"
      :data-testid="`nfc-card-${product}-${side}`"
    >
      <rect x="0" y="0" :width="CARD_W" :height="CARD_H" :rx="CARD_RADIUS" :fill="bgColor" />

      <!-- ═══ Recto (commun aux deux produits) ═══ -->
      <template v-if="side === 'front'">
        <image
          v-if="logoSrc"
          :href="logoSrc"
          :x="logo.x"
          :y="logo.y"
          :width="logo.w"
          :height="logo.h"
          preserveAspectRatio="xMidYMid meet"
          :style="interactive ? 'cursor: move' : ''"
          @pointerdown="onLogoPointerDown"
        />
        <g v-else :stroke="fgColor" stroke-width="0.3" stroke-dasharray="1 1" fill="none" opacity="0.35">
          <rect :x="logo.x" :y="logo.y" :width="logo.w" :height="logo.h" rx="1" />
          <text
            :x="logo.x + logo.w / 2"
            :y="logo.y + logo.h / 2 + 1"
            text-anchor="middle"
            font-size="2.4"
            :fill="fgColor"
            stroke="none"
            :font-family="FONT"
          >
            Logo
          </text>
        </g>

        <text
          v-for="l in frontLines"
          :key="l.key"
          :x="CARD_W / 2"
          :y="l.line.y"
          text-anchor="middle"
          :font-size="l.line.size"
          :font-weight="l.line.bold ? 700 : 400"
          :letter-spacing="(l.line.tracking ?? 0) * l.line.size"
          :font-family="FONT"
          :fill="fgColor"
        >
          {{ l.text }}
        </text>

        <g
          :transform="`translate(${nfcIcon.x} ${nfcIcon.y}) scale(${nfcIcon.scale}) translate(${-NFC_ICON_SOURCE.x} ${-NFC_ICON_SOURCE.y})`"
          :fill="fgColor"
        >
          <path v-for="(d, i) in NFC_ICON_PATHS" :key="i" :d="d" />
        </g>
      </template>

      <!-- ═══ Verso ═══ -->
      <template v-else>
        <text
          v-for="l in backLines"
          :key="l.key"
          :x="CARD_W / 2"
          :y="l.line.y"
          text-anchor="middle"
          :font-size="l.line.size"
          :font-weight="l.line.bold ? 700 : 400"
          :letter-spacing="(l.line.tracking ?? 0) * l.line.size"
          :font-family="FONT"
          :fill="fgColor"
        >
          {{ l.text }}
        </text>

        <g v-if="qrRects.length" :fill="fgColor">
          <rect v-for="(r, i) in qrRects" :key="i" :x="r.x" :y="r.y" :width="r.w + 0.02" :height="r.h + 0.02" />
        </g>
        <rect
          v-else
          :x="QR_BOX.x"
          :y="QR_BOX.y"
          :width="QR_BOX.w"
          :height="QR_BOX.h"
          fill="none"
          :stroke="fgColor"
          stroke-width="0.3"
          stroke-dasharray="1 1"
          opacity="0.35"
        />

        <g
          v-if="product === 'review'"
          :transform="`translate(${googleIcon.x} ${googleIcon.y}) scale(${googleIcon.scale})`"
        >
          <path
            v-for="(p, i) in GOOGLE_G_PATHS"
            :key="i"
            :d="p.d"
            :fill="googleLogoStyle === 'color' ? p.color : fgColor"
          />
        </g>
      </template>
    </svg>
    <figcaption v-if="label" class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ label }}</figcaption>
  </figure>
</template>
