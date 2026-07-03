import { describe, expect, it } from 'vitest'
import { isQuotePaymentExpired } from './quote-status'

const now = new Date('2026-07-03T12:00:00Z')
const future = new Date('2026-07-10T12:00:00Z')
const past = new Date('2026-07-01T12:00:00Z')

function quote(status: string, expiresAt: Date, scheduledAt: Date) {
  return { status, expiresAt, rideRequest: { scheduledAt } } as Parameters<typeof isQuotePaymentExpired>[0]
}

describe('isQuotePaymentExpired', () => {
  it('non expiré : SENT, délai et course à venir', () => {
    expect(isQuotePaymentExpired(quote('SENT', future, future), now)).toBe(false)
  })

  it('expiré : délai de validité dépassé', () => {
    expect(isQuotePaymentExpired(quote('SENT', past, future), now)).toBe(true)
  })

  it('expiré : la date de la course est passée (même si le délai court encore)', () => {
    expect(isQuotePaymentExpired(quote('SENT', future, past), now)).toBe(true)
  })

  it('ne concerne pas un DRAFT (en attente de validation chauffeur)', () => {
    expect(isQuotePaymentExpired(quote('DRAFT', past, past), now)).toBe(false)
  })

  it('ne concerne pas un devis déjà ACCEPTED', () => {
    expect(isQuotePaymentExpired(quote('ACCEPTED', past, past), now)).toBe(false)
  })
})
