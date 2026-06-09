import { describe, expect, it } from 'vitest'
import { computeRefund } from './cancellation'

const policy = { freeUntilHours: 24, retainedPercent: 50 }
const amount = 10000 // 100 €

describe('computeRefund', () => {
  it('rembourse intégralement au-delà du délai gratuit', () => {
    const scheduledAt = new Date('2026-06-15T12:00:00Z')
    const now = new Date('2026-06-13T12:00:00Z') // 48h avant
    const r = computeRefund(amount, scheduledAt, policy, now)
    expect(r.isFree).toBe(true)
    expect(r.refundCents).toBe(10000)
    expect(r.retainedCents).toBe(0)
  })

  it('retient le pourcentage en cas d’annulation tardive', () => {
    const scheduledAt = new Date('2026-06-15T12:00:00Z')
    const now = new Date('2026-06-15T06:00:00Z') // 6h avant
    const r = computeRefund(amount, scheduledAt, policy, now)
    expect(r.isFree).toBe(false)
    expect(r.retainedCents).toBe(5000)
    expect(r.refundCents).toBe(5000)
  })

  it('traite la limite exacte comme gratuite', () => {
    const scheduledAt = new Date('2026-06-15T12:00:00Z')
    const now = new Date('2026-06-14T12:00:00Z') // pile 24h
    const r = computeRefund(amount, scheduledAt, policy, now)
    expect(r.isFree).toBe(true)
  })

  it('gère une rétention de 100 %', () => {
    const r = computeRefund(
      amount,
      new Date('2026-06-15T12:00:00Z'),
      { freeUntilHours: 24, retainedPercent: 100 },
      new Date('2026-06-15T11:00:00Z'),
    )
    expect(r.refundCents).toBe(0)
    expect(r.retainedCents).toBe(10000)
  })
})
