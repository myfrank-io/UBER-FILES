// Carte de visite digitale — logique PURE (aucune I/O, aucun accès Prisma).
//
// Tout ce qui décide « ce lien est-il acceptable », « quel href pour ce bloc »,
// « à quoi ressemble une carte par défaut » vit ici, et est testé. Les handlers
// serveur et l'éditeur du dashboard importent ce module : une seule définition
// des règles, jamais deux implémentations qui divergent.

export const CARD_BLOCK_KINDS = [
  'LINK',
  'SOCIAL',
  'PHONE',
  'EMAIL',
  'WHATSAPP',
  'ADDRESS',
  'TEXT',
  'BOOKING_CTA',
  'REVIEW_CTA',
  'VEHICLES',
] as const

export type CardBlockKind = (typeof CARD_BLOCK_KINDS)[number]

/** Blocs dont le contenu est dérivé du profil : ni valeur ni doublon possibles. */
export const SINGLETON_KINDS: CardBlockKind[] = ['BOOKING_CTA', 'REVIEW_CTA', 'VEHICLES']

export interface SocialNetwork {
  key: string
  label: string
  /** Exemple affiché en aide de saisie. */
  placeholder: string
}

export const SOCIAL_NETWORKS: SocialNetwork[] = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/votre-compte' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/votre-page' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/votre-profil' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@votre-compte' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@votre-chaine' },
  { key: 'x', label: 'X', placeholder: 'https://x.com/votre-compte' },
  { key: 'snapchat', label: 'Snapchat', placeholder: 'https://snapchat.com/add/votre-compte' },
  { key: 'website', label: 'Site web', placeholder: 'https://votre-site.fr' },
]

export function isSocialNetwork(key: unknown): key is string {
  return typeof key === 'string' && SOCIAL_NETWORKS.some((n) => n.key === key)
}

// ─── Normalisation des saisies ───────────────────────────────────────────────

/**
 * URL externe sûre, ou null. N'accepte QUE http(s) : `javascript:`, `data:` et
 * consorts sont rejetés (la carte est une page publique alimentée par de la
 * saisie utilisateur). Un domaine nu se voit préfixer https://.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s)
  if (hasScheme) {
    if (!/^https?:\/\//i.test(s)) return null
  } else {
    // « //exemple.fr » (protocol-relative) devient une URL https classique.
    s = `https://${s.replace(/^\/+/, '')}`
  }

  try {
    const url = new URL(s)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Un hôte sans point n'est jamais un domaine public valide.
    if (!url.hostname || !url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Numéro utilisable dans un lien `tel:` (chiffres + éventuel `+` de tête). */
export function telDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const plus = s.startsWith('+') ? '+' : ''
  const digits = s.replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 15) return null
  return plus + digits
}

/**
 * Numéro au format attendu par wa.me : chiffres uniquement, indicatif pays
 * inclus. Un numéro national (« 06 12 34 56 78 ») est complété avec l'indicatif
 * par défaut — sinon le lien WhatsApp mènerait à un compte inexistant.
 */
export function toWhatsAppDigits(
  raw: string | null | undefined,
  defaultCallingCode = '33',
): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null

  const hasPlus = s.startsWith('+')
  let digits = s.replace(/\D/g, '')
  if (!digits) return null

  if (!hasPlus) {
    if (digits.startsWith('00')) digits = digits.slice(2)
    else if (digits.startsWith('0')) digits = defaultCallingCode + digits.replace(/^0+/, '')
  }

  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

/** Email trivialement valide, en minuscules, ou null. */
export function safeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  if (!s || s.length > 200) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null
}

// ─── Blocs ───────────────────────────────────────────────────────────────────

export interface CardBlockInput {
  kind: CardBlockKind
  label?: string | null
  value?: string | null
  data?: Record<string, unknown> | null
  visible?: boolean
}

export interface NormalizedBlock {
  label: string | null
  value: string | null
  data: Record<string, unknown> | null
}

export type NormalizeResult =
  | { ok: true; block: NormalizedBlock }
  | { ok: false; error: string }

const MAX_LABEL = 80
const MAX_TEXT = 1200

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s || null
}

/**
 * Valide et normalise la saisie d'un bloc selon son type. Renvoie un message
 * d'erreur lisible plutôt que de lever : l'appelant décide (400 côté API,
 * message inline côté éditeur).
 */
export function normalizeBlock(input: CardBlockInput): NormalizeResult {
  const kind = input.kind
  if (!CARD_BLOCK_KINDS.includes(kind)) {
    return { ok: false, error: 'Type de bloc inconnu.' }
  }

  const label = trimOrNull(input.label, MAX_LABEL)
  const rawValue = typeof input.value === 'string' ? input.value.trim() : ''

  switch (kind) {
    case 'BOOKING_CTA':
    case 'REVIEW_CTA':
    case 'VEHICLES':
      // Contenu dérivé du profil : on ne conserve qu'un libellé personnalisé.
      return { ok: true, block: { label, value: null, data: null } }

    case 'TEXT': {
      const text = trimOrNull(input.value, MAX_TEXT)
      if (!text) return { ok: false, error: 'Le texte ne peut pas être vide.' }
      return { ok: true, block: { label, value: text, data: null } }
    }

    case 'PHONE': {
      const tel = telDigits(rawValue)
      if (!tel) return { ok: false, error: 'Numéro de téléphone invalide.' }
      return { ok: true, block: { label, value: rawValue.slice(0, 30), data: null } }
    }

    case 'WHATSAPP': {
      if (!toWhatsAppDigits(rawValue)) {
        return {
          ok: false,
          error: 'Numéro WhatsApp invalide (indiquez-le au format international, ex : +33 6 12 34 56 78).',
        }
      }
      return { ok: true, block: { label, value: rawValue.slice(0, 30), data: null } }
    }

    case 'EMAIL': {
      const email = safeEmail(rawValue)
      if (!email) return { ok: false, error: 'Adresse email invalide.' }
      return { ok: true, block: { label, value: email, data: null } }
    }

    case 'ADDRESS': {
      const address = trimOrNull(input.value, 200)
      if (!address) return { ok: false, error: 'L’adresse ne peut pas être vide.' }
      return { ok: true, block: { label, value: address, data: null } }
    }

    case 'LINK': {
      const url = safeExternalUrl(rawValue)
      if (!url) return { ok: false, error: 'Lien invalide (adresse http ou https attendue).' }
      return { ok: true, block: { label, value: url, data: null } }
    }

    case 'SOCIAL': {
      const network = input.data?.network
      if (!isSocialNetwork(network)) {
        return { ok: false, error: 'Réseau social inconnu.' }
      }
      const url = safeExternalUrl(rawValue)
      if (!url) return { ok: false, error: 'Lien invalide (adresse http ou https attendue).' }
      return { ok: true, block: { label, value: url, data: { network } } }
    }
  }
}

export interface PublicBlock {
  id: string
  kind: CardBlockKind
  label: string | null
  value: string | null
  data: Record<string, unknown> | null
}

/**
 * Destination d'un bloc. Les CTA pointent vers des routes internes du produit
 * (page de réservation, tunnel d'avis) ; les autres vers l'extérieur.
 * Renvoie null pour les blocs sans lien (texte, vitrine véhicules).
 */
export function blockHref(block: PublicBlock, slug: string): string | null {
  switch (block.kind) {
    case 'BOOKING_CTA':
      return `/${slug}`
    case 'REVIEW_CTA':
      return `/avis/${slug}`
    case 'PHONE': {
      const tel = telDigits(block.value)
      return tel ? `tel:${tel}` : null
    }
    case 'WHATSAPP': {
      const digits = toWhatsAppDigits(block.value)
      return digits ? `https://wa.me/${digits}` : null
    }
    case 'EMAIL': {
      const email = safeEmail(block.value)
      return email ? `mailto:${email}` : null
    }
    case 'ADDRESS':
      return block.value
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(block.value)}`
        : null
    case 'LINK':
    case 'SOCIAL':
      return safeExternalUrl(block.value)
    case 'TEXT':
    case 'VEHICLES':
      return null
  }
}

/** Le lien sort-il du site ? (détermine target/rel) */
export function isExternalHref(href: string | null): boolean {
  return Boolean(href && /^https?:\/\//i.test(href))
}

const DEFAULT_LABELS: Record<CardBlockKind, string> = {
  LINK: 'Lien',
  SOCIAL: 'Réseau social',
  PHONE: 'Appeler',
  EMAIL: 'Envoyer un email',
  WHATSAPP: 'WhatsApp',
  ADDRESS: 'Adresse',
  TEXT: 'À propos',
  BOOKING_CTA: 'Réserver une course',
  REVIEW_CTA: 'Laisser un avis',
  VEHICLES: 'Mes véhicules',
}

export function defaultBlockLabel(kind: CardBlockKind, data?: Record<string, unknown> | null): string {
  if (kind === 'SOCIAL' && isSocialNetwork(data?.network)) {
    return SOCIAL_NETWORKS.find((n) => n.key === data!.network)!.label
  }
  return DEFAULT_LABELS[kind]
}

/** Libellé effectivement affiché : celui du chauffeur, sinon celui par défaut. */
export function blockLabel(block: PublicBlock): string {
  return block.label?.trim() || defaultBlockLabel(block.kind, block.data)
}

// ─── Carte par défaut ────────────────────────────────────────────────────────

export interface DefaultCardInput {
  phone: string | null
  contactEmail: string | null
  hasVehicles: boolean
  hasReviewLink: boolean
  bio: string | null
}

export interface DraftBlock {
  kind: CardBlockKind
  label: string | null
  value: string | null
  data: Record<string, unknown> | null
  position: number
}

/**
 * Blocs de la carte créée automatiquement, dérivés de ce que Ridewiz sait déjà
 * du chauffeur. Objectif : à sa première visite, le chauffeur trouve une carte
 * déjà remplie — il ajuste, il ne part pas d'une page blanche.
 */
export function buildDefaultBlocks(input: DefaultCardInput): DraftBlock[] {
  const drafts: Omit<DraftBlock, 'position'>[] = []

  drafts.push({ kind: 'BOOKING_CTA', label: null, value: null, data: null })

  if (telDigits(input.phone)) {
    drafts.push({ kind: 'PHONE', label: null, value: input.phone!.trim(), data: null })
    if (toWhatsAppDigits(input.phone)) {
      drafts.push({ kind: 'WHATSAPP', label: null, value: input.phone!.trim(), data: null })
    }
  }

  const email = safeEmail(input.contactEmail)
  if (email) drafts.push({ kind: 'EMAIL', label: null, value: email, data: null })

  const bio = trimOrNull(input.bio, MAX_TEXT)
  if (bio) drafts.push({ kind: 'TEXT', label: null, value: bio, data: null })

  if (input.hasVehicles) drafts.push({ kind: 'VEHICLES', label: null, value: null, data: null })
  if (input.hasReviewLink) drafts.push({ kind: 'REVIEW_CTA', label: null, value: null, data: null })

  return drafts.map((d, i) => ({ ...d, position: i }))
}
