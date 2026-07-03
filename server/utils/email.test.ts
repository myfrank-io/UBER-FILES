import { describe, expect, it } from 'vitest'
import { emailTemplates } from './email'

const base = {
  customerName: 'Ali & Fils <script>alert(1)</script>',
  scheduledAt: new Date('2026-08-15T14:30:00Z'),
}

describe('emailTemplates client', () => {
  it('orderReceived : accuse réception, annonce la validation à venir et échappe les saisies', () => {
    const tpl = emailTemplates.orderReceived({
      ...base,
      driverName: 'Karim VTC',
      type: 'TRANSFER',
      pickupAddress: 'Gare de Lyon <b>Paris</b>',
      dropoffAddress: 'Orly',
      roundTrip: false,
      amountCents: 48766,
      currency: 'EUR',
    })
    expect(tpl.subject).toContain('bien reçue')
    expect(tpl.html).toContain('transmise à Karim VTC')
    expect(tpl.html).toContain('nouvel email')
    expect(tpl.html).toContain('487,66')
    expect(tpl.html).toContain('estimation')
    expect(tpl.html).not.toContain('<script>')
    expect(tpl.html).toContain('&lt;script&gt;')
    expect(tpl.html).toContain('Gare de Lyon &lt;b&gt;Paris&lt;/b&gt; → Orly')
  })

  it('quoteSent : rappelle la course et n\'affiche pas d\'ajustement quand le prix est inchangé', () => {
    const tpl = emailTemplates.quoteSent({
      driverName: 'Karim VTC',
      amountCents: 5000,
      currency: 'EUR',
      payUrl: 'https://app.test/devis/tok',
      expiresAt: new Date('2026-08-16T14:30:00Z'),
      type: 'TRANSFER',
      scheduledAt: base.scheduledAt,
      pickupAddress: '11 rue du Muguet',
      dropoffAddress: 'Place de Brest',
      originalAmountCents: 5000,
    })
    expect(tpl.subject).toBe('Votre devis — Karim VTC')
    expect(tpl.html).toContain('11 rue du Muguet → Place de Brest')
    expect(tpl.html).toContain('50,00')
    expect(tpl.html).not.toContain('ajust')
    expect(tpl.html).not.toContain('line-through')
  })

  it('quoteSent : signale l\'ajustement et montre l\'estimation initiale barrée', () => {
    const tpl = emailTemplates.quoteSent({
      driverName: 'Karim VTC',
      amountCents: 9000,
      currency: 'EUR',
      payUrl: 'https://app.test/devis/tok',
      expiresAt: new Date('2026-08-16T14:30:00Z'),
      type: 'HOURLY',
      scheduledAt: base.scheduledAt,
      durationHours: 3,
      originalAmountCents: 6000,
    })
    expect(tpl.subject).toContain('tarif ajusté')
    expect(tpl.html).toContain('ajustant le tarif')
    expect(tpl.html).toContain('line-through')
    expect(tpl.html).toContain('60,00') // estimation initiale
    expect(tpl.html).toContain('90,00') // nouveau tarif
    expect(tpl.html).toContain('Mise à disposition 3 h')
  })
})

describe('emailTemplates chauffeur', () => {
  it('newRequestDriver : rend les détails et échappe les saisies client', () => {
    const tpl = emailTemplates.newRequestDriver({
      ...base,
      customerPhone: '+33612345678',
      type: 'TRANSFER',
      pickupAddress: 'Gare de Lyon <b>Paris</b>',
      dropoffAddress: 'Orly',
      roundTrip: true,
      amountCents: 12550,
      currency: 'EUR',
      hasConflict: true,
      notes: 'Bagages <volumineux>',
      dashboardUrl: 'https://app.test/dashboard',
    })
    expect(tpl.subject).toContain('Nouvelle demande')
    expect(tpl.html).not.toContain('<script>')
    expect(tpl.html).toContain('&lt;script&gt;')
    expect(tpl.html).toContain('Gare de Lyon &lt;b&gt;Paris&lt;/b&gt; → Orly (aller-retour)')
    expect(tpl.html).toContain('125,50')
    expect(tpl.html).toContain('Conflit calendrier')
    expect(tpl.html).toContain('Bagages &lt;volumineux&gt;')
    expect(tpl.html).toContain('https://app.test/dashboard')
  })

  it('newRequestDriver : mise à disposition sans conflit', () => {
    const tpl = emailTemplates.newRequestDriver({
      ...base,
      type: 'HOURLY',
      durationHours: 3,
      amountCents: 30000,
      currency: 'EUR',
      hasConflict: false,
      dashboardUrl: 'https://app.test/dashboard',
    })
    expect(tpl.html).toContain('Mise à disposition 3 h')
    expect(tpl.html).not.toContain('Conflit calendrier')
  })

  it('bookingConfirmedDriver : paiement en ligne vs sur place', () => {
    const common = {
      ...base,
      customerPhone: '+33612345678',
      customerEmail: 'client@test.fr',
      amountCents: 8000,
      currency: 'EUR',
      dashboardUrl: 'https://app.test/dashboard/reservations',
    }
    const online = emailTemplates.bookingConfirmedDriver({ ...common, paidOnline: true })
    expect(online.html).toContain('payés en ligne')

    const onsite = emailTemplates.bookingConfirmedDriver({
      ...common,
      paidOnline: false,
      method: 'CASH',
    })
    expect(onsite.html).toContain('à encaisser sur place')
    expect(onsite.html).toContain('client@test.fr')
  })

  it('bookingCancelledDriver : avec et sans remboursement', () => {
    const withRefund = emailTemplates.bookingCancelledDriver({
      ...base,
      refundCents: 4000,
      currency: 'EUR',
    })
    expect(withRefund.subject).toContain('Course annulée')
    expect(withRefund.html).toContain('40,00')

    const noRefund = emailTemplates.bookingCancelledDriver({
      ...base,
      refundCents: 0,
      currency: 'EUR',
    })
    expect(noRefund.html).toContain('Aucun remboursement')
  })
})
