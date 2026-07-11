// Ouverture de la modale « Partager ma page » (DashboardShare, rendue par le
// layout dashboard). État partagé pour que d'autres composants puissent la
// déclencher — ex. le CTA central de l'accueil quand la journée est vide.
export function useShareModal() {
  return useState('share-modal-open', () => false)
}
