import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Ouvre une session « en tant que » le chauffeur, pour que l'admin puisse visiter
// et modifier son espace. L'identité de l'admin est conservée dans la session
// (`impersonator`) afin de pouvoir revenir à l'administration ensuite.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const driver = await prisma.driver.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true } } },
  })
  if (!driver || !driver.user) {
    throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })
  }

  await setUserSession(event, {
    user: {
      id: driver.user.id,
      email: driver.user.email,
      role: 'DRIVER',
      driverId: driver.id,
    },
    impersonator: { id: admin.id, email: admin.email },
  })

  return { ok: true, slug: driver.slug }
})
