import type Stripe from 'stripe'
import { getStripe } from '~/server/utils/stripe'
import { prisma } from '~/server/utils/prisma'

// Webhook des comptes connectés : met à jour l'état KYC du chauffeur (account.updated).
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const signature = getHeader(event, 'stripe-signature')
  const rawBody = await readRawBody(event)
  if (!signature || !rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Signature manquante.' })
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      config.stripeConnectWebhookSecret,
    )
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Signature invalide.' })
  }

  const already = await prisma.webhookEvent.findUnique({ where: { id: stripeEvent.id } })
  if (already?.processedAt) return { received: true, duplicate: true }
  await prisma.webhookEvent.upsert({
    where: { id: stripeEvent.id },
    update: {},
    create: { id: stripeEvent.id, provider: 'stripe', type: stripeEvent.type },
  })

  if (stripeEvent.type === 'account.updated') {
    const account = stripeEvent.data.object as Stripe.Account
    await prisma.driver.updateMany({
      where: { stripeAccountId: account.id },
      data: {
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
        stripeOnboarded: (account.details_submitted ?? false) && (account.charges_enabled ?? false),
      },
    })
  }

  await prisma.webhookEvent.update({
    where: { id: stripeEvent.id },
    data: { processedAt: new Date() },
  })
  return { received: true }
})
