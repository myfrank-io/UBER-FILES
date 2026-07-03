import { describe, expect, it } from 'vitest'
import {
  bookingMode,
  onlinePaymentPolicy,
  onSitePaymentMethods,
  resolveRequestPayment,
} from './booking-policy'
import type { PaymentMethod } from './payment-methods'

const ONLINE: PaymentMethod = 'STRIPE_PREPAYMENT'

describe('onlinePaymentPolicy', () => {
  it('REQUIRED quand seul le prépaiement en ligne est accepté', () => {
    expect(onlinePaymentPolicy([ONLINE])).toBe('REQUIRED')
  })

  it('OPTIONAL quand en ligne + au moins un moyen sur place', () => {
    expect(onlinePaymentPolicy([ONLINE, 'ONSITE_CASH'])).toBe('OPTIONAL')
    expect(onlinePaymentPolicy(['ONSITE_CARD', ONLINE, 'ONSITE_CHECK'])).toBe('OPTIONAL')
  })

  it('NONE quand uniquement des moyens sur place', () => {
    expect(onlinePaymentPolicy(['ONSITE_CASH'])).toBe('NONE')
    expect(onlinePaymentPolicy(['ONSITE_CARD', 'ONSITE_CASH', 'ONSITE_CHECK'])).toBe('NONE')
  })
})

describe('onSitePaymentMethods', () => {
  it('filtre le prépaiement et conserve l’ordre d’affichage canonique', () => {
    expect(onSitePaymentMethods(['ONSITE_CHECK', ONLINE, 'ONSITE_CARD'])).toEqual([
      'ONSITE_CARD',
      'ONSITE_CHECK',
    ])
  })
})

describe('bookingMode', () => {
  it('flux 1 : en ligne exigé + confirmation auto + compte opérationnel', () => {
    const mode = bookingMode({ paymentMethods: [ONLINE], autoAcceptQuotes: true }, true)
    expect(mode).toMatchObject({
      policy: 'REQUIRED',
      onlineAvailable: true,
      onSiteMethods: [],
      instantOnline: true,
      instantOnSite: false,
    })
  })

  it('flux 2 : en ligne exigé + validation manuelle', () => {
    const mode = bookingMode({ paymentMethods: [ONLINE], autoAcceptQuotes: false }, true)
    expect(mode.instantOnline).toBe(false)
    expect(mode.instantOnSite).toBe(false)
  })

  it('flux 3 : sur place + confirmation auto (sans paiement en ligne)', () => {
    const mode = bookingMode(
      { paymentMethods: ['ONSITE_CASH', 'ONSITE_CARD'], autoAcceptQuotes: true },
      false,
    )
    expect(mode).toMatchObject({
      policy: 'NONE',
      onlineAvailable: false,
      instantOnline: false,
      instantOnSite: true,
    })
    expect(mode.onSiteMethods).toEqual(['ONSITE_CARD', 'ONSITE_CASH'])
  })

  it('flux 4 : sur place + validation manuelle', () => {
    const mode = bookingMode({ paymentMethods: ['ONSITE_CHECK'], autoAcceptQuotes: false }, false)
    expect(mode.instantOnSite).toBe(false)
    expect(mode.onSiteMethods).toEqual(['ONSITE_CHECK'])
  })

  it('repli : en ligne exigé mais compte non opérationnel → rien d’instantané', () => {
    const mode = bookingMode({ paymentMethods: [ONLINE], autoAcceptQuotes: true }, false)
    expect(mode.onlineAvailable).toBe(false)
    expect(mode.instantOnline).toBe(false)
    expect(mode.instantOnSite).toBe(false)
  })

  it('au choix + compte HS : le sur-place reste instantané', () => {
    const mode = bookingMode(
      { paymentMethods: [ONLINE, 'ONSITE_CASH'], autoAcceptQuotes: true },
      false,
    )
    expect(mode.policy).toBe('OPTIONAL')
    expect(mode.onlineAvailable).toBe(false)
    expect(mode.instantOnSite).toBe(true)
  })
})

describe('resolveRequestPayment', () => {
  const optional = bookingMode(
    { paymentMethods: [ONLINE, 'ONSITE_CARD', 'ONSITE_CASH'], autoAcceptQuotes: true },
    true,
  )

  it('respecte le choix explicite du client (en ligne)', () => {
    expect(resolveRequestPayment(optional, ONLINE)).toEqual({ kind: 'ONLINE' })
  })

  it('respecte le choix explicite du client (sur place)', () => {
    expect(resolveRequestPayment(optional, 'ONSITE_CASH')).toEqual({
      kind: 'ONSITE',
      method: 'ONSITE_CASH',
    })
  })

  it('ignore un choix sur place que le chauffeur ne propose pas/plus', () => {
    expect(resolveRequestPayment(optional, 'ONSITE_CHECK')).toEqual({ kind: 'ONLINE' })
  })

  it('sans choix : en ligne dès que possible (comportement historique)', () => {
    expect(resolveRequestPayment(optional, null)).toEqual({ kind: 'ONLINE' })
    expect(resolveRequestPayment(optional, undefined)).toEqual({ kind: 'ONLINE' })
  })

  it('choix en ligne mais compte HS : bascule sur le premier moyen sur place', () => {
    const mode = bookingMode(
      { paymentMethods: [ONLINE, 'ONSITE_CARD'], autoAcceptQuotes: false },
      false,
    )
    expect(resolveRequestPayment(mode, ONLINE)).toEqual({ kind: 'ONSITE', method: 'ONSITE_CARD' })
  })

  it('sur place uniquement, sans choix : premier moyen accepté', () => {
    const mode = bookingMode(
      { paymentMethods: ['ONSITE_CASH', 'ONSITE_CHECK'], autoAcceptQuotes: true },
      false,
    )
    expect(resolveRequestPayment(mode, null)).toEqual({ kind: 'ONSITE', method: 'ONSITE_CASH' })
  })

  it('UNDECIDED quand aucun moyen n’est opérationnel (en ligne exigé mais compte HS)', () => {
    const mode = bookingMode({ paymentMethods: [ONLINE], autoAcceptQuotes: true }, false)
    expect(resolveRequestPayment(mode, ONLINE)).toEqual({ kind: 'UNDECIDED' })
    expect(resolveRequestPayment(mode, null)).toEqual({ kind: 'UNDECIDED' })
  })
})
