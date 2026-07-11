// Message pré-rempli envoyé au client quand le chauffeur partage sa page publique
// de réservation (bouton « Partager ma page », canaux WhatsApp / SMS / email).
//
// Source UNIQUE du texte : importée à la fois côté serveur (share-page.post.ts,
// pour l'email et le repli) et côté client (DashboardShare.vue, pour l'aperçu et
// l'ouverture de l'app dans le geste de clic sans attendre le réseau). Garder
// les deux synchronisés.
//
// Le chauffeur peut personnaliser le modèle (Driver.shareMessageTemplate) depuis
// la modale de partage ; les variables {client}, {chauffeur}, {lien_avis} et
// {lien_reservation} sont remplacées à l'envoi.

/**
 * Modèle par défaut : remerciement, demande d'avis (seulement si un dépôt
 * d'avis est configuré — même règle que le reçu de fin de course), puis
 * invitation à réserver la prochaine course sur la page publique.
 */
export function defaultShareTemplate(hasReviewLink: boolean): string {
  const review = hasReviewLink
    ? 'Votre avis compte beaucoup : partagez votre expérience en laissant un avis ici :\n{lien_avis}\n\n'
    : ''
  return (
    'Bonjour {client},\n\n' +
    'Merci d’avoir voyagé avec {chauffeur} 🙏\n\n' +
    review +
    'Réservez dès maintenant votre prochaine course avec Ridewiz :\n{lien_reservation}\n\n' +
    'À bientôt !'
  )
}

/**
 * Remplace les variables du modèle. Une valeur vide (ex : pas de nom de client)
 * avale l'espace qui la précède pour ne pas laisser « Bonjour , ».
 */
export function renderShareTemplate(
  template: string,
  vars: { customerName: string; driverName: string; reviewUrl: string; publicUrl: string },
): string {
  const values: Record<string, string> = {
    client: vars.customerName.trim(),
    chauffeur: vars.driverName.trim(),
    lien_avis: vars.reviewUrl,
    lien_reservation: vars.publicUrl,
  }
  return template.replace(
    / ?\{(client|chauffeur|lien_avis|lien_reservation)\}/g,
    (match, key: string) => {
      const value = values[key]
      if (!value) return ''
      return match.startsWith(' ') ? ` ${value}` : value
    },
  )
}

export function buildShareMessage(opts: {
  customerName: string
  driverName: string
  publicUrl: string
  // Page de notation Ridewiz du chauffeur (/avis/{slug}) — jamais le lien externe.
  reviewUrl: string
  // Un dépôt d'avis externe (fiche Google, lien manuel) est configuré : le modèle
  // par défaut inclut alors le paragraphe « laissez un avis ».
  hasReviewLink?: boolean
  // Modèle personnalisé du chauffeur ; vide/absent = modèle par défaut.
  template?: string | null
}): string {
  const template = opts.template?.trim() || defaultShareTemplate(opts.hasReviewLink ?? false)
  return renderShareTemplate(template, {
    customerName: opts.customerName,
    driverName: opts.driverName,
    reviewUrl: opts.reviewUrl,
    publicUrl: opts.publicUrl,
  })
}
