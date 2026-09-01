// Types de la carte telle qu'elle est AFFICHÉE. Volontairement hors du
// composant : `<script setup>` n'autorise pas les exports, et la page publique
// comme l'éditeur ont besoin de ces formes.
import type { CardBlockKind } from './card-blocks'

export interface CardVehicle {
  id: string
  label: string
  vehicleClass: string | null
  seats: number | null
  photoSrc: string | null
}

export interface CardBlockView {
  id: string
  kind: CardBlockKind
  label: string | null
  value: string | null
  data: Record<string, unknown> | null
}

/** Bloc tel que renvoyé au dashboard (avec position et visibilité). */
export interface CardBlockEdit extends CardBlockView {
  position: number
  visible: boolean
}

export interface CardView {
  slug: string
  displayName: string
  headline: string | null
  company: string | null
  theme: string
  avatarUrl: string | null
  coverUrl: string | null
  /** Logo de l'entreprise. Affiché tel quel (jamais recadré) sous l'identité. */
  logoUrl: string | null
  /** Pose le logo sur une pastille claire (lisibilité sur thème sombre). */
  logoPlate: boolean
  hasContactCard: boolean
  blocks: CardBlockView[]
  vehicles: CardVehicle[]
}

/** Réponse de /api/dashboard/card. */
export interface CardEditorState {
  slug: string
  displayName: string
  published: boolean
  publishedAt: string | null
  theme: string
  headline: string | null
  company: string | null
  profilePhotoUrl: string | null
  coverUrl: string | null
  avatarUrl: string | null
  logoUrl: string | null
  logoPlate: boolean
  hasContactCard: boolean
  hasReviewLink: boolean
  blocks: CardBlockEdit[]
}
