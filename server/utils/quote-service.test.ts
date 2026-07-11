import { describe, it, expect } from 'vitest'
import type { Surcharge } from '@prisma/client'
import { applicableSurcharges } from './quote-service'

function surcharge(over: Partial<Surcharge>): Surcharge {
  return {
    id: 's1',
    driverId: 'd1',
    name: 'Majoration',
    kind: 'FIXED',
    amount: 2000,
    autoApply: true,
    maxLeadTimeMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Surcharge
}

describe('applicableSurcharges', () => {
  it('ignore les majorations non automatiques', () => {
    const list = [surcharge({ autoApply: false })]
    expect(applicableSurcharges(list, 30)).toEqual([])
  })

  it("applique toujours une majoration sans fenêtre de délai", () => {
    const list = [surcharge({ name: 'Aéroport' })]
    expect(applicableSurcharges(list, 99999)).toHaveLength(1)
  })

  it("applique la majoration dernière minute sous le seuil (ex : +20 € à moins de 2 h)", () => {
    const list = [surcharge({ name: 'Dernière minute', maxLeadTimeMinutes: 120 })]
    expect(applicableSurcharges(list, 90)).toEqual([
      { name: 'Dernière minute', kind: 'FIXED', amount: 2000 },
    ])
  })

  it("ne l'applique pas au seuil exact ni au-delà", () => {
    const list = [surcharge({ maxLeadTimeMinutes: 120 })]
    expect(applicableSurcharges(list, 120)).toEqual([])
    expect(applicableSurcharges(list, 300)).toEqual([])
  })

  it('gère plusieurs paliers indépendants', () => {
    const list = [
      surcharge({ id: 'a', name: '+10 € < 6 h', amount: 1000, maxLeadTimeMinutes: 360 }),
      surcharge({ id: 'b', name: '+20 € < 2 h', amount: 2000, maxLeadTimeMinutes: 120 }),
    ]
    // À 90 min du départ : les deux paliers s'appliquent.
    expect(applicableSurcharges(list, 90)).toHaveLength(2)
    // À 3 h : seul le palier < 6 h s'applique.
    expect(applicableSurcharges(list, 180).map((s) => s.name)).toEqual(['+10 € < 6 h'])
  })
})
