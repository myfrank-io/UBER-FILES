import { prisma } from '~/server/utils/prisma'

// Termine l'usurpation d'identité : restaure la session de l'admin d'origine
// (mémorisée dans `impersonator`) et repasse en rôle ADMIN.
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const impersonator = (session as { impersonator?: { id: string; email: string } }).impersonator
  if (!impersonator) {
    throw createError({ statusCode: 400, statusMessage: 'Aucune session admin à restaurer.' })
  }

  const admin = await prisma.user.findUnique({ where: { id: impersonator.id } })
  if (!admin || admin.role !== 'ADMIN') {
    await clearUserSession(event)
    throw createError({ statusCode: 403, statusMessage: 'Session admin invalide.' })
  }

  // On repart d'une session vierge : `setUserSession` fusionne (defu), ce qui
  // laisserait sinon traîner le champ `impersonator`.
  await clearUserSession(event)
  await setUserSession(event, {
    user: { id: admin.id, email: admin.email, role: 'ADMIN', driverId: null },
  })

  return { ok: true }
})
