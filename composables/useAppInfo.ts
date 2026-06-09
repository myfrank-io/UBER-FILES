/**
 * Expose les métadonnées de l'application.
 * Exemple de composable réutilisable à travers les pages et composants.
 */
export const useAppInfo = () => {
  const name = 'UBER FILES'
  const version = '1.0.0'
  const year = new Date().getFullYear()

  return { name, version, year }
}
