import { describe, it, expect } from 'vitest'
import { leadTimeHours, requiresDriverApproval } from './reschedule'

const now = new Date('2026-07-24T10:00:00Z')
const h = (n: number) => new Date(now.getTime() + n * 3_600_000)

describe('requiresDriverApproval', () => {
  it('report libre (self-service) quand actuel ET nouveau sont au-delà de la fenêtre', () => {
    // course dans 48h, déplacée à 72h — largement au-delà de 24h.
    expect(requiresDriverApproval(h(48), h(72), now, 24)).toBe(false)
  })

  it("exige l'accord si la course actuelle est imminente (< 24h)", () => {
    // course dans 10h : toute modification doit être validée.
    expect(requiresDriverApproval(h(10), h(50), now, 24)).toBe(true)
  })

  it("exige l'accord si le NOUVEL horaire tombe dans la fenêtre", () => {
    // course lointaine (48h) déplacée à 12h : imminent → validation.
    expect(requiresDriverApproval(h(48), h(12), now, 24)).toBe(true)
  })

  it('respecte un seuil paramétrable (freeUntilHours)', () => {
    expect(requiresDriverApproval(h(5), h(6), now, 4)).toBe(false)
    expect(requiresDriverApproval(h(3), h(6), now, 4)).toBe(true)
  })

  it('leadTimeHours calcule le délai en heures', () => {
    expect(leadTimeHours(h(2), now)).toBe(2)
    expect(leadTimeHours(h(-1), now)).toBe(-1)
  })
})
