import { describe, it, expect } from 'vitest'
import {
  computeSetup,
  detectSimpleRates,
  firstIncompleteStep,
  nextStepAfter,
  previousStep,
  setupLinkStatus,
  simpleRateBands,
  simulateHourly,
  simulateTransfer,
  visibleSteps,
  type SetupSnapshot,
} from './setup-flow'

const empty: SetupSnapshot = {
  hasPhoto: false,
  hasIntro: false,
  hasPhone: false,
  vehicleCount: 0,
  hasRates: true, // grilles par défaut créées à l'invitation
  paymentMethods: ['STRIPE_PREPAYMENT'],
  onlinePayoutReady: false,
  reviewLinkReady: false,
  telegramLinked: false,
  cardPublished: false,
  needsPassword: true,
  setupSession: true,
  confirmed: [],
}

const full: SetupSnapshot = {
  hasPhoto: true,
  hasIntro: true,
  hasPhone: true,
  vehicleCount: 1,
  hasRates: true,
  paymentMethods: ['ONSITE_CARD', 'ONSITE_CASH'],
  onlinePayoutReady: false,
  reviewLinkReady: true,
  telegramLinked: true,
  cardPublished: true,
  needsPassword: false,
  setupSession: false,
  confirmed: ['tarifs', 'annulation', 'paiement'],
}

describe('computeSetup', () => {
  it('démarre à 0 % pour un chauffeur fraîchement invité', () => {
    const r = computeSetup(empty)
    expect(r.percent).toBe(0)
    expect(r.complete).toBe(false)
    // identité, contact, véhicule, tarifs, annulation, paiement, encaissement, accès
    expect(r.requiredTotal).toBe(8)
  })

  it('les tarifs par défaut ne comptent pas tant qu’ils ne sont pas confirmés', () => {
    const r = computeSetup({ ...empty, hasRates: true })
    expect(r.steps.find((s) => s.key === 'tarifs')!.done).toBe(false)
    const c = computeSetup({ ...empty, confirmed: ['tarifs'] })
    expect(c.steps.find((s) => s.key === 'tarifs')!.done).toBe(true)
  })

  it('sans grille, confirmer ne suffit pas', () => {
    const r = computeSetup({ ...empty, hasRates: false, confirmed: ['tarifs'] })
    expect(r.steps.find((s) => s.key === 'tarifs')!.done).toBe(false)
  })

  it('l’encaissement n’apparaît que si le paiement en ligne est proposé', () => {
    const online = computeSetup(empty)
    expect(online.steps.find((s) => s.key === 'encaissement')!.applicable).toBe(true)
    const onsite = computeSetup({ ...empty, paymentMethods: ['ONSITE_CASH'] })
    expect(onsite.steps.find((s) => s.key === 'encaissement')!.applicable).toBe(false)
    expect(visibleSteps(onsite).map((s) => s.key)).not.toContain('encaissement')
  })

  it('le mot de passe n’est proposé qu’aux sessions ouvertes par le lien', () => {
    const viaLink = computeSetup(empty)
    expect(viaLink.steps.find((s) => s.key === 'acces')!.applicable).toBe(true)
    const viaLogin = computeSetup({ ...empty, setupSession: false })
    expect(viaLogin.steps.find((s) => s.key === 'acces')!.applicable).toBe(false)
    const hasPassword = computeSetup({ ...empty, needsPassword: false })
    expect(hasPassword.steps.find((s) => s.key === 'acces')!.applicable).toBe(false)
  })

  it('le mot de passe reste visible (fait) une fois choisi dans le parcours', () => {
    const r = computeSetup({ ...empty, needsPassword: false, confirmed: ['acces'] })
    const step = r.steps.find((s) => s.key === 'acces')!
    expect(step.applicable).toBe(true)
    expect(step.done).toBe(true)
  })

  it('atteint 100 % pour un chauffeur « sur place » entièrement configuré', () => {
    const r = computeSetup(full)
    expect(r.percent).toBe(100)
    expect(r.complete).toBe(true)
    expect(r.requiredTotal).toBe(6)
  })

  it('les étapes optionnelles ne pèsent pas dans la progression', () => {
    const r = computeSetup({ ...full, reviewLinkReady: false, telegramLinked: false, cardPublished: false })
    expect(r.percent).toBe(100)
  })
})

describe('navigation', () => {
  it('reprend à la première étape non faite', () => {
    const r = computeSetup({ ...empty, hasPhoto: true, hasIntro: true })
    expect(firstIncompleteStep(r)).toBe('contact')
  })

  it('saute les étapes déjà faites', () => {
    const r = computeSetup({ ...empty, hasPhone: true, vehicleCount: 1 })
    expect(nextStepAfter(r, 'identite')).toBe('tarifs')
  })

  it('finit toujours sur le récapitulatif', () => {
    const r = computeSetup(full)
    expect(firstIncompleteStep(r)).toBe('recap')
    expect(nextStepAfter(r, 'carte')).toBe('recap')
    expect(nextStepAfter(r, 'identite')).toBe('recap')
  })

  it('« Retour » suit l’ordre visible', () => {
    const r = computeSetup({ ...empty, paymentMethods: ['ONSITE_CASH'] })
    expect(previousStep(r, 'google')).toBe('paiement') // encaissement masqué
    expect(previousStep(r, 'identite')).toBeNull()
  })
})

describe('detectSimpleRates', () => {
  const day = { pricePerKmCents: 200, daysOfWeek: [], startMinute: 360, endMinute: 1320, priority: 1, isDefault: true, tiers: [] }
  const night = { pricePerKmCents: 280, daysOfWeek: [], startMinute: 1320, endMinute: 1800, priority: 2, isDefault: false, tiers: [] }

  it('reconnaît la grille par défaut de l’invitation (jour + nuit)', () => {
    expect(detectSimpleRates([day, night])).toEqual({
      dayPerKmCents: 200,
      nightPerKmCents: 280,
      nightStartMinute: 1320,
      nightEndMinute: 360,
    })
  })

  it('reconnaît un tarif unique', () => {
    expect(detectSimpleRates([day])).toMatchObject({ dayPerKmCents: 200, nightPerKmCents: null })
  })

  it('refuse les grilles avancées (paliers, jours, plus de deux bandes)', () => {
    expect(detectSimpleRates([{ ...day, tiers: [{ uptoKm: 20, pricePerKmCents: 200 }, { uptoKm: null, pricePerKmCents: 150 }] }])).toBeNull()
    expect(detectSimpleRates([day, { ...night, daysOfWeek: [5, 6] }])).toBeNull()
    expect(detectSimpleRates([day, night, { ...night, priority: 3 }])).toBeNull()
    expect(detectSimpleRates([])).toBeNull()
  })

  it('refuse deux bandes sans repli ou une nuit moins prioritaire', () => {
    expect(detectSimpleRates([{ ...day, isDefault: false }, night])).toBeNull()
    expect(detectSimpleRates([day, { ...night, priority: 0 }])).toBeNull()
  })
})

describe('simpleRateBands', () => {
  it('produit une nuit qui chevauche minuit et un jour de repli', () => {
    const bands = simpleRateBands({ dayPerKmCents: 200, nightPerKmCents: 250, nightStartMinute: 1320, nightEndMinute: 360 })
    expect(bands).toHaveLength(2)
    expect(bands[0]).toMatchObject({ name: 'Jour', isDefault: true, startMinute: 0, endMinute: 1440 })
    expect(bands[1]).toMatchObject({ name: 'Nuit', startMinute: 1320, endMinute: 1800, priority: 2 })
  })

  it('une seule bande sans tarif de nuit', () => {
    const bands = simpleRateBands({ dayPerKmCents: 200, nightPerKmCents: null, nightStartMinute: 1320, nightEndMinute: 360 })
    expect(bands).toHaveLength(1)
    expect(bands[0].isDefault).toBe(true)
  })

  it('aller-retour : detect(simpleRateBands(x)) = x', () => {
    const x = { dayPerKmCents: 210, nightPerKmCents: 260, nightStartMinute: 1260, nightEndMinute: 420 }
    expect(detectSimpleRates(simpleRateBands(x))).toEqual(x)
  })
})

describe('simulateur', () => {
  const rates = { dayPerKmCents: 200, nightPerKmCents: 250, nightStartMinute: 1320, nightEndMinute: 360 }

  it('applique le tarif de jour à 10h', () => {
    const r = simulateTransfer(rates, { distanceKm: 15, localDateTime: '2026-09-08 10:00' }, 2500)
    expect(r.error).toBeNull()
    expect(r.bandName).toBe('Jour')
    expect(r.amountCents).toBe(3000)
  })

  it('applique le tarif de nuit à 23h30', () => {
    const r = simulateTransfer(rates, { distanceKm: 12, localDateTime: '2026-09-12 23:30' }, 2500)
    expect(r.bandName).toBe('Nuit')
    expect(r.amountCents).toBe(3000) // 12 × 2,50 €
  })

  it('remonte au minimum de course', () => {
    const r = simulateTransfer(rates, { distanceKm: 3, localDateTime: '2026-09-08 10:00' }, 2500)
    expect(r.amountCents).toBe(2500)
  })

  it('mise à disposition : 3 h à 55 €', () => {
    expect(simulateHourly(5500, 3, 2500).amountCents).toBe(16500)
  })
})

describe('setupLinkStatus', () => {
  const now = new Date('2026-09-02T10:00:00Z')
  it('none / ready / started / completed / expired', () => {
    expect(setupLinkStatus({ setupToken: null, setupTokenExpiresAt: null, setupStartedAt: null, setupCompletedAt: null }, now)).toBe('none')
    expect(setupLinkStatus({ setupToken: 'x', setupTokenExpiresAt: new Date('2026-10-01'), setupStartedAt: null, setupCompletedAt: null }, now)).toBe('ready')
    expect(setupLinkStatus({ setupToken: 'x', setupTokenExpiresAt: new Date('2026-10-01'), setupStartedAt: now, setupCompletedAt: null }, now)).toBe('started')
    expect(setupLinkStatus({ setupToken: 'x', setupTokenExpiresAt: new Date('2026-10-01'), setupStartedAt: now, setupCompletedAt: now }, now)).toBe('completed')
    expect(setupLinkStatus({ setupToken: 'x', setupTokenExpiresAt: new Date('2026-08-01'), setupStartedAt: null, setupCompletedAt: null }, now)).toBe('expired')
  })
})
