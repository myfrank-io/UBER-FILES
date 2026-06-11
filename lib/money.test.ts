import { describe, expect, it } from 'vitest'
import { roundCents, applyBps, formatMoney, metersToKm } from './money'

describe('roundCents', () => {
  it('arrondit vers le haut', () => expect(roundCents(10.5)).toBe(11))
  it('arrondit vers le bas', () => expect(roundCents(10.4)).toBe(10))
  it('laisse un entier intact', () => expect(roundCents(100)).toBe(100))
  it('gère zéro', () => expect(roundCents(0)).toBe(0))
})

describe('applyBps', () => {
  it('calcule 15 % (1500 bps) sur 10 000 ct', () => {
    expect(applyBps(10_000, 1500)).toBe(1500)
  })
  it('calcule 0 % (0 bps)', () => {
    expect(applyBps(10_000, 0)).toBe(0)
  })
  it('calcule 100 % (10 000 bps)', () => {
    expect(applyBps(10_000, 10_000)).toBe(10_000)
  })
  it('arrondit correctement pour éviter les centimes flottants', () => {
    // 3 % de 1 € = 3 ct exact
    expect(applyBps(100, 300)).toBe(3)
    // 10 % de 3 € = 30 ct exact
    expect(applyBps(300, 1000)).toBe(30)
  })
})

describe('formatMoney', () => {
  it('formate en euros français', () => {
    const s = formatMoney(6000, 'eur')
    expect(s).toContain('60')
    expect(s).toContain('€')
  })
  it('utilise eur par défaut', () => {
    expect(formatMoney(1000)).toContain('€')
  })
  it('formate zéro', () => {
    expect(formatMoney(0)).toContain('0')
  })
  it('gère les centimes non ronds', () => {
    const s = formatMoney(150, 'eur')
    expect(s).toContain('1')
    expect(s).toContain('50')
  })
})

describe('metersToKm', () => {
  it('convertit 1000 m en 1 km', () => expect(metersToKm(1000)).toBe(1))
  it('convertit 1500 m en 1.5 km', () => expect(metersToKm(1500)).toBe(1.5))
  it('gère zéro', () => expect(metersToKm(0)).toBe(0))
})
