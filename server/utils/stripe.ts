import Stripe from 'stripe'

// Client Stripe (singleton). Encaissement centralisé plateforme via Connect Express +
// destination charges + application_fee_amount (paramétré à 0 au lancement mais codé).

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  const config = useRuntimeConfig()
  if (!config.stripeSecretKey) {
    throw createError({ statusCode: 503, statusMessage: 'Stripe non configuré.' })
  }
  if (!_stripe) {
    _stripe = new Stripe(config.stripeSecretKey, { apiVersion: '2024-11-20.acacia' })
  }
  return _stripe
}

/** Crée un compte connecté Express pour un chauffeur. */
export async function createConnectAccount(email: string): Promise<string> {
  const stripe = getStripe()
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'FR',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
  })
  return account.id
}

/** Lien d'onboarding Stripe (KYC) pour un compte connecté. */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<string> {
  const stripe = getStripe()
  const link = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  })
  return link.url
}

/**
 * Crée une session Checkout en "destination charge" : le client paie la plateforme,
 * la part chauffeur est reversée sur son compte connecté, la commission éventuelle
 * (application_fee_amount) reste à la plateforme.
 */
export async function createCheckoutSession(opts: {
  quoteId: string
  amountCents: number
  applicationFeeCents: number
  currency: string
  connectedAccountId: string
  customerEmail: string
  description: string
  successUrl: string
  cancelUrl: string
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()
  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: opts.customerEmail,
    line_items: [
      {
        price_data: {
          currency: opts.currency,
          unit_amount: opts.amountCents,
          product_data: { name: opts.description },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: opts.applicationFeeCents, // 0 au lancement
      transfer_data: { destination: opts.connectedAccountId },
    },
    metadata: { quoteId: opts.quoteId },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  })
}

/** Rembourse (total ou partiel) un PaymentIntent. */
export async function createRefund(
  paymentIntentId: string,
  amountCents: number,
): Promise<Stripe.Refund> {
  const stripe = getStripe()
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amountCents,
    // En destination charge, on inverse aussi le transfert au chauffeur au prorata.
    reverse_transfer: true,
    refund_application_fee: true,
  })
}
