import { requireDriverId } from '~/server/utils/auth'
import { isSetupSession, loadSetupState } from '~/server/utils/setup'

// État complet du parcours de configuration du chauffeur connecté : instantané
// (pour calculer les étapes côté client avec lib/setup-flow) + valeurs
// actuelles de chaque réglage (pré-remplissage des écrans).
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const setupSession = await isSetupSession(event)
  return loadSetupState(driverId, setupSession)
})
