import { requireDriverId } from '~/server/utils/auth'
import { pushConfigured, sendPushToDriver } from '~/server/utils/push'

// « Envoyer un test » depuis les Réglages : vérifie de bout en bout que les
// notifications arrivent sur les appareils du chauffeur.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  if (!pushConfigured()) return { configured: false, sent: 0 }
  const { sent } = await sendPushToDriver(driverId, {
    title: 'Ridewiz',
    body: 'Les notifications fonctionnent sur cet appareil 👍',
    url: '/dashboard/parametres?tab=general',
    tag: 'test',
  })
  return { configured: true, sent }
})
