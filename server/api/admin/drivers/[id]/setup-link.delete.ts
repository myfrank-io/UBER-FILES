import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Révoque le lien de configuration d'un chauffeur : le jeton disparaît, toute
// URL déjà envoyée renvoie « lien invalide ». La progression du parcours
// (étapes confirmées, date de fin) est conservée.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const driver = await prisma.driver.findUnique({ where: { id }, select: { id: true } })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })
  await prisma.driver.update({
    where: { id },
    data: { setupToken: null, setupTokenExpiresAt: null },
  })
  return { ok: true }
})
