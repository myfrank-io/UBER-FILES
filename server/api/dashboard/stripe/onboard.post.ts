import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { createConnectAccount, createOnboardingLink } from '~/server/utils/stripe'

// Démarre (ou reprend) l'onboarding Stripe Connect Express du chauffeur.
// Renvoie une URL vers laquelle rediriger le chauffeur pour son KYC.
// `returnTo: 'setup'` ramène au parcours de configuration plutôt qu'aux réglages.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const config = useRuntimeConfig()
  const body = (await readBody<{ returnTo?: string } | null>(event).catch(() => null)) ?? {}
  const returnPath = body.returnTo === 'setup' ? '/configuration' : '/dashboard/parametres'
  const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } })

  let accountId = driver.stripeAccountId
  if (!accountId) {
    accountId = await createConnectAccount(driver.contactEmail ?? `${driver.slug}@example.com`)
    await prisma.driver.update({ where: { id: driverId }, data: { stripeAccountId: accountId } })
  }

  const base = config.public.appBaseUrl
  const url = await createOnboardingLink(
    accountId,
    `${base}${returnPath}?stripe=done`,
    `${base}${returnPath}?stripe=refresh`,
  )
  return { url }
})
