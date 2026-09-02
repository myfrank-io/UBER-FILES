import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { newSetupToken, setupLinkExpiry, setupLinkUrl } from '~/server/utils/setup'
import { setupLinkStatus } from '~/lib/setup-flow'

// Lien de configuration guidée d'un chauffeur — réservé à l'admin. Idempotent :
// tant qu'un lien valide existe, on le renvoie (l'admin peut le recopier sans
// invalider celui déjà envoyé). `regenerate` force un nouveau jeton, ce qui
// rend l'ancien inutilisable.
const schema = z.object({ regenerate: z.boolean().optional() })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, (b) => schema.safeParse(b ?? {}))
  const regenerate = body.success ? Boolean(body.data.regenerate) : false

  const driver = await prisma.driver.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      setupToken: true,
      setupTokenExpiresAt: true,
      setupStartedAt: true,
      setupCompletedAt: true,
      user: { select: { id: true } },
    },
  })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })
  if (!driver.user) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Ce chauffeur n’a pas de compte de connexion : le lien ne peut pas ouvrir de session.',
    })
  }

  const valid =
    driver.setupToken && driver.setupTokenExpiresAt && driver.setupTokenExpiresAt > new Date()

  let token = driver.setupToken!
  let expiresAt = driver.setupTokenExpiresAt!
  if (!valid || regenerate) {
    token = newSetupToken()
    expiresAt = setupLinkExpiry()
    await prisma.driver.update({
      where: { id },
      data: { setupToken: token, setupTokenExpiresAt: expiresAt },
    })
  }

  return {
    url: setupLinkUrl(token),
    expiresAt,
    status: setupLinkStatus({
      setupToken: token,
      setupTokenExpiresAt: expiresAt,
      setupStartedAt: driver.setupStartedAt,
      setupCompletedAt: driver.setupCompletedAt,
    }),
  }
})
