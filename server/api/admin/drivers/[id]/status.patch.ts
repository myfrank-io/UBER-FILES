import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { driverNotifyEmail } from '~/server/utils/notify-driver'

// Activation (approbation) / suspension / réactivation d'un compte chauffeur.
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

  // Notification du chauffeur selon la transition de statut. L'échec d'email ne
  // doit pas faire échouer l'action admin.
  const next = body.data.status
  if (next !== previous.status) {
    const to = await driverNotifyEmail(driver)
    const publicUrl = `${config.public.appBaseUrl}/${driver.slug}`
    const dashboardUrl = `${config.public.appBaseUrl}/dashboard`
    try {
      if (next === 'ACTIVE' && previous.status === 'SUSPENDED') {
        // Réactivation après suspension.
        if (to) await sendEmail({ to, ...emailTemplates.accountReactivated({ displayName: driver.displayName, publicUrl, dashboardUrl }) })
      } else if (next === 'ACTIVE') {
        // Première approbation (PENDING → ACTIVE) : page en ligne.
        if (to) await sendEmail({ to, ...emailTemplates.driverApproved({ displayName: driver.displayName, publicUrl, dashboardUrl }) })
      } else if (next === 'SUSPENDED') {
        // Suspension du compte.
        if (to) await sendEmail({ to, ...emailTemplates.accountSuspended({ displayName: driver.displayName, supportEmail: config.public.supportEmail || undefined }) })
      }
    } catch (err) {
      console.error('[admin:status] échec email de notification chauffeur', err)
    }
  }

  return { ok: true, status: body.data.status }
})
