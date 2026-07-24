import { describe, expect, it } from 'vitest'
import { passengerSurcharges, PASSENGER_SURCHARGE_LABELS } from './passengers'

const config = { thirdPassengerCents: 500, fourthPassengerCents: 800 }

describe('passengerSurcharges', () => {
  it('n\'ajoute aucun supplément pour 1 ou 2 personnes', () => {
    expect(passengerSurcharges(1, config)).toEqual([])
    expect(passengerSurcharges(2, config)).toEqual([])
  })

  it('ajoute le supplément de la 3e personne dès 3 passagers', () => {
    const lines = passengerSurcharges(3, config)
    expect(lines).toEqual([
      { name: PASSENGER_SURCHARGE_LABELS.third, kind: 'FIXED', amount: 500 },
    ])
  })

  it('cumule les suppléments 3e et 4e personne dès 4 passagers', () => {
    const lines = passengerSurcharges(4, config)
    expect(lines).toEqual([
      { name: PASSENGER_SURCHARGE_LABELS.third, kind: 'FIXED', amount: 500 },
      { name: PASSENGER_SURCHARGE_LABELS.fourth, kind: 'FIXED', amount: 800 },
    ])
  })

  it('n\'ajoute pas de supplément supplémentaire au-delà de 4 personnes', () => {
    expect(passengerSurcharges(6, config)).toEqual(passengerSurcharges(4, config))
  })

  it('ignore un montant non défini (seulement la 4e personne configurée)', () => {
    const only4 = { thirdPassengerCents: null, fourthPassengerCents: 800 }
    expect(passengerSurcharges(3, only4)).toEqual([])
    expect(passengerSurcharges(4, only4)).toEqual([
      { name: PASSENGER_SURCHARGE_LABELS.fourth, kind: 'FIXED', amount: 800 },
    ])
  })

  it('ignore les montants nuls ou négatifs (aucune ligne à 0 €)', () => {
    expect(passengerSurcharges(4, { thirdPassengerCents: 0, fourthPassengerCents: -1 })).toEqual([])
  })

  it('tronque un nombre de personnes non entier', () => {
    expect(passengerSurcharges(3.9, config)).toEqual(passengerSurcharges(3, config))
  })
})
