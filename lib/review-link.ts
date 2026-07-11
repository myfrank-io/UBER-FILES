// Lien « laisser un avis » d'un chauffeur — source UNIQUE de la logique,
// importée côté serveur (reçu de fin de course, page publique) et côté client
// (bouton « Tester le lien » des réglages). Le lien Google n'est jamais stocké :
// il est dérivé du placeId de la fiche connectée à chaque usage.

export interface ReviewLinkSource {
  reviewUrl?: string | null // lien manuel (échappatoire : Trustpilot, fiche introuvable…)
  googlePlaceId?: string | null // fiche Google connectée via la recherche Places
}

/** URL Google qui ouvre directement la popup de dépôt d'avis d'une fiche. */
export function googleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}

/**
 * Lien d'avis effectif d'un chauffeur, ou null si rien n'est configuré.
 * Les deux modes sont exclusifs dans l'UI (renseigner l'un efface l'autre) ;
 * si les deux étaient présents, le lien manuel — saisi explicitement — prime.
 */
export function driverReviewUrl(driver: ReviewLinkSource): string | null {
  if (driver.reviewUrl) return driver.reviewUrl
  if (driver.googlePlaceId) return googleReviewUrl(driver.googlePlaceId)
  return null
}

/**
 * Chemin (relatif) de la page de notation Ridewiz d'un chauffeur — l'étape
 * intermédiaire montrée au client avant le dépôt public : 5★ → redirection
 * vers le lien d'avis public (fiche Google…), 1-4★ → retour privé envoyé au
 * chauffeur uniquement. C'est ce chemin que pointent le reçu de fin de course
 * et le bouton de la page publique, jamais le lien externe directement.
 */
export function reviewFunnelPath(slug: string): string {
  return `/avis/${encodeURIComponent(slug)}`
}
