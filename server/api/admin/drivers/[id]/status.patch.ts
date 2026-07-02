import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { sendEmail, emailTemplates } from '~/server/utils/email'

// Activation (approbation) / suspension d'un compte chauffeur.
const schema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']) })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const config = useRuntimeConfig()
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Statut invalide.' })

  const previous = await prisma.driver.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  })

  const driver = await prisma.driver.update({
    where: { id },
    data: { status: body.data.status },
  })

  // Première approbation : on prévient le chauffeur que sa page est en ligne.
  if (body.data.status === 'ACTIVE' && previous.status !== 'ACTIVE') {
    const to = driver.contactEmail
    if (to) {
      const tpl = emailTemplates.driverApproved({
        displayName: driver.displayName,
        publicUrl: `${config.public.appBaseUrl}/${driver.slug}`,
        dashboardUrl: `${config.public.appBaseUrl}/dashboard`,
      })
      await sendEmail({ to, ...tpl })
    }
  }

  return { ok: true, status: body.data.status }
})
