// Message pré-rempli envoyé au client quand le chauffeur partage sa page publique
// de réservation (bouton « Partager ma page », canaux WhatsApp / SMS).
//
// Source UNIQUE du texte : importée à la fois côté serveur (share-page.post.ts,
// pour le repli) et côté client (DashboardShare.vue, pour ouvrir l'app dans le
// geste de clic sans attendre le réseau). Garder les deux synchronisés.
export function buildShareMessage(opts: {
  customerName: string
  driverName: string
  publicUrl: string
}): string {
  const name = opts.customerName.trim()
  const greeting = name ? `Bonjour ${name}, ` : 'Bonjour, '
  return `${greeting}réservez votre prochaine course dès maintenant avec ${opts.driverName} 🚗\n${opts.publicUrl}`
}
