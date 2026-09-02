import { z } from 'zod'
import { prisma } from '~/server/utils/prisma'

// Ouverture du parcours par le lien de configuration : le jeton (généré par
// l'admin, envoyé au chauffeur) ouvre une session chauffeur marquée
// `setupFlow`. Le chauffeur n'a pas besoin de mot de passe pour commencer.
// Si un admin est connecté sur cet appareil (il teste le lien), son identité
// est conservée dans `impersonator` pour qu'il puisse revenir à l'admin.
const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Lien invalide.') })

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Lien invalide.' })

  const driver = await prisma.driver.findUnique({
    where: { setupToken: body.data.token },
    select: {
      id: true,
      slug: true,
      status: true,
      setupTokenExpiresAt: true,
      setupStartedAt: true,
      user: { select: { id: true, email: true } },
    },
  })

  if (!driver || !driver.setupTokenExpiresAt || driver.setupTokenExpiresAt < new Date()) {
    throw createError({
      statusCode: 410,
      statusMessage: 'Ce lien n’est plus valide. Demandez-en un nouveau à votre administrateur.',
    })
  }
  if (driver.status === 'SUSPENDED') {
    throw createError({ statusCode: 403, statusMessage: 'Ce compte est suspendu.' })
  }
  if (!driver.user) {
    throw createError({ statusCode: 409, statusMessage: 'Ce compte n’a pas d’accès de connexion.' })
  }

  const current = await getUserSession(event)
  const currentUser = current.user as { id: string; email: string; role: string } | undefined
  const impersonator =
    currentUser?.role === 'ADMIN' ? { id: currentUser.id, email: currentUser.email } : undefined

  if (!driver.setupStartedAt) {
    await prisma.driver.update({ where: { id: driver.id }, data: { setupStartedAt: new Date() } })
  }

  // Session vierge : `setUserSession` fusionne avec l'existante, on repart de zéro
  // pour ne rien garder d'un autre compte ouvert sur cet appareil.
  await clearUserSession(event)
  await setUserSession(event, {
    user: { id: driver.user.id, email: driver.user.email, role: 'DRIVER', driverId: driver.id },
    setupFlow: true,
    ...(impersonator ? { impersonator } : {}),
  })

  return { ok: true, slug: driver.slug }
})
