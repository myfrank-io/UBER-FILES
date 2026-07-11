import { describe, it, expect } from 'vitest'
import { computeOnboarding, type OnboardingInput } from './onboarding'

const empty: OnboardingInput = {
  hasPhoto: false,
  hasIntro: false,
  vehicleCount: 0,
  hasPhone: false,
  hasRates: false,
  paymentMethods: [],
  onlinePayoutReady: false,
  telegramLinked: false,
}

const fullOnSite: OnboardingInput = {
  hasPhoto: true,
  hasIntro: true,
  vehicleCount: 1,
  hasPhone: true,
  hasRates: true,
  paymentMethods: ['CASH'],
  onlinePayoutReady: false,
  telegramLinked: false,
}

describe('computeOnboarding', () => {
  it('renvoie 0 % quand rien n’est configuré', () => {
    const r = computeOnboarding(empty)
    expect(r.percent).toBe(0)
    expect(r.complete).toBe(false)
    expect(r.requiredTotal).toBe(6)
  })

  it('atteint 100 % pour un chauffeur « sur place » sans encaissement en ligne', () => {
    // paymentMethods = CASH → l’étape encaissement est sans objet (faite).
    const r = computeOnboarding(fullOnSite)
    expect(r.percent).toBe(100)
    expect(r.complete).toBe(true)
  })

  it('exige un encaisseur connecté quand le prépaiement en ligne est activé', () => {
    const base = { ...fullOnSite, paymentMethods: ['STRIPE_PREPAYMENT'] as OnboardingInput['paymentMethods'] }
    const notReady = computeOnboarding({ ...base, onlinePayoutReady: false })
    expect(notReady.complete).toBe(false)
    expect(notReady.steps.find((s) => s.key === 'encaissement')?.done).toBe(false)

    const ready = computeOnboarding({ ...base, onlinePayoutReady: true })
    expect(ready.complete).toBe(true)
  })

  it('Telegram est facultatif et n’entre pas dans le 100 %', () => {
    const r = computeOnboarding(fullOnSite)
    const telegram = r.steps.find((s) => s.key === 'telegram')
    expect(telegram?.optional).toBe(true)
    expect(telegram?.done).toBe(false)
    // Malgré Telegram non lié, on est bien à 100 %.
    expect(r.percent).toBe(100)
  })

  it('le profil exige photo ET présentation', () => {
    const photoOnly = computeOnboarding({ ...empty, hasPhoto: true })
    expect(photoOnly.steps.find((s) => s.key === 'profil')?.done).toBe(false)
    const both = computeOnboarding({ ...empty, hasPhoto: true, hasIntro: true })
    expect(both.steps.find((s) => s.key === 'profil')?.done).toBe(true)
  })
})
