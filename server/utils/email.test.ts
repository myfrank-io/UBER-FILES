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

describe('emailTemplates client — variantes des flux', () => {
  it('orderReceived (règlement sur place) : annonce une confirmation, pas un lien de paiement', () => {
    const tpl = emailTemplates.orderReceived({
      ...base,
      driverName: 'Karim VTC',
      type: 'TRANSFER',
      pickupAddress: 'Gare de Lyon',
      dropoffAddress: 'Orly',
      roundTrip: false,
      amountCents: 8000,
      currency: 'EUR',
      paymentOnSite: true,
    })
    expect(tpl.html).toContain('confirmé votre')
    expect(tpl.html).toContain('sur place')
    expect(tpl.html).not.toContain('lien pour confirmer et régler')
  })

  it('quoteSent : libellé neutre quand en ligne ET sur place sont proposés', () => {
    const tpl = emailTemplates.quoteSent({
      driverName: 'Karim VTC',
      amountCents: 5000,
      currency: 'EUR',
      payUrl: 'https://app.test/devis/tok',
      expiresAt: new Date('2026-08-16T14:30:00Z'),
      prepayment: true,
      onSiteAvailable: true,
      type: 'TRANSFER',
      scheduledAt: base.scheduledAt,
      pickupAddress: 'A',
      dropoffAddress: 'B',
      originalAmountCents: 5000,
    })
    expect(tpl.html).toContain('Voir mon devis et confirmer')
    expect(tpl.html).not.toContain('Payer et confirmer la course')
  })

  it('quoteSent : « accepter le nouveau tarif » quand le prix est ajusté et le règlement sur place', () => {
    const tpl = emailTemplates.quoteSent({
      driverName: 'Karim VTC',
      amountCents: 9000,
      currency: 'EUR',
      payUrl: 'https://app.test/devis/tok',
      expiresAt: new Date('2026-08-16T14:30:00Z'),
      prepayment: false,
      onSiteAvailable: true,
      type: 'HOURLY',
      scheduledAt: base.scheduledAt,
      durationHours: 3,
      originalAmountCents: 6000,
    })
    expect(tpl.html).toContain('Accepter le nouveau tarif et réserver')
    expect(tpl.subject).toContain('tarif ajusté')
  })

  it('bookingConfirmedOnSite : intro « acceptée par le chauffeur » sur le flux à validation', () => {
    const tpl = emailTemplates.bookingConfirmedOnSite({
      driverName: 'Karim VTC',
      amountCents: 8000,
      currency: 'EUR',
      scheduledAt: base.scheduledAt,
      method: 'ONSITE_CASH',
      manageUrl: 'https://app.test/reservation/tok',
      acceptedByDriver: true,
    })
    expect(tpl.html).toContain('a accepté votre réservation')
    expect(tpl.html).toContain('sur place')
    expect(tpl.html).toContain('Espèces')
  })

  it('requestRejected : prévient poliment, rassure sur le débit et propose de re-réserver', () => {
    const tpl = emailTemplates.requestRejected({
      ...base,
      driverName: 'Karim VTC',
      type: 'TRANSFER',
      pickupAddress: 'Gare de Lyon <b>Paris</b>',
      dropoffAddress: 'Orly',
      roundTrip: false,
      rebookUrl: 'https://app.test/karim-paris',
    })
    expect(tpl.subject).toContain("n'a pas pu être acceptée")
    expect(tpl.html).toContain('pas disponible')
    expect(tpl.html).toContain('Aucune somme ne vous a été débitée')
    expect(tpl.html).toContain('https://app.test/karim-paris')
    expect(tpl.html).not.toContain('<script>')
    expect(tpl.html).toContain('Gare de Lyon &lt;b&gt;Paris&lt;/b&gt;')
  })

  it('reminder : rappelle le règlement sur place quand un encaissement est attendu', () => {
    const tpl = emailTemplates.reminder({
      driverName: 'Karim VTC',
      scheduledAt: base.scheduledAt,
      manageUrl: 'https://app.test/reservation/tok',
      amountCents: 8550,
      currency: 'EUR',
      onSiteMethod: 'ONSITE_CARD',
    })
    expect(tpl.html).toContain('règlement sur place')
    expect(tpl.html).toContain('85,50')
    expect(tpl.html).toContain('Carte sur place')

    const noPayment = emailTemplates.reminder({
      driverName: 'Karim VTC',
      scheduledAt: base.scheduledAt,
      manageUrl: 'https://app.test/reservation/tok',
    })
    expect(noPayment.html).not.toContain('règlement sur place')
  })
})

describe('emailTemplates chauffeur', () => {
  it('preRideDriver : alerte H-2 avec trajet, contact client et liens de navigation', () => {
    const tpl = emailTemplates.preRideDriver({
      driverFirstName: 'Karim',
      customerName: 'Paul <b>!</b>',
      customerPhone: '+33788764719',
      scheduledAt: new Date('2026-08-15T14:30:00Z'),
      type: 'TRANSFER',
      pickupAddress: '11 rue du Muguet, Brest',
      dropoffAddress: 'Place de Brest, Le Mans',
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=48.39,-4.486',
      wazeUrl: 'https://waze.com/ul?ll=48.39,-4.486&navigate=yes',
      paymentNote: 'Course déjà réglée en ligne — rien à encaisser.',
    })
    expect(tpl.subject).toContain('Course dans ~2 h')
    expect(tpl.html).toContain('Hello Karim 👋')
    expect(tpl.html).toContain('11 rue du Muguet, Brest')
    expect(tpl.html).toContain('Place de Brest, Le Mans')
    expect(tpl.html).toContain('Paul &lt;b&gt;!&lt;/b&gt;')
    expect(tpl.html).toContain('tel:+33788764719')
    expect(tpl.html).toContain('https://www.google.com/maps/dir/?api=1&destination=48.39,-4.486')
    expect(tpl.html).toContain('https://waze.com/ul?ll=48.39,-4.486&navigate=yes')
    expect(tpl.html).toContain('rien à encaisser')
  })

  it('newRequestDriver : rend les détails et échappe les saisies client', () => {
    const tpl = emailTemplates.newRequestDriver({
      ...base,
      driverFirstName: 'Karim',
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
    expect(tpl.html).toContain('Hello Karim 👋')
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

  it('newRequestDriver : acceptation directe (règlement sur place) avec moyen affiché', () => {
    const tpl = emailTemplates.newRequestDriver({
      ...base,
      type: 'TRANSFER',
      pickupAddress: 'A',
      dropoffAddress: 'B',
      amountCents: 8000,
      currency: 'EUR',
      hasConflict: false,
      dashboardUrl: 'https://app.test/dashboard',
      directAccept: true,
      paymentLabel: 'Sur place — Espèces',
    })
    expect(tpl.html).toContain('Accepter ou refuser la réservation')
    expect(tpl.html).toContain('confirmée immédiatement')
    expect(tpl.html).toContain('Sur place — Espèces')
    expect(tpl.html).not.toContain('Valider ou refuser le devis')
  })

  it('bookingConfirmedDriver : mention explicite de la confirmation automatique', () => {
    const tpl = emailTemplates.bookingConfirmedDriver({
      ...base,
      amountCents: 8000,
      currency: 'EUR',
      paidOnline: false,
      method: 'ONSITE_CASH',
      autoConfirmed: true,
      dashboardUrl: 'https://app.test/dashboard/reservations',
    })
    expect(tpl.html).toContain('confirmée')
    expect(tpl.html).toContain('automatiquement')
    expect(tpl.html).toContain('à encaisser sur place')
  })

  it('bookingConfirmedDriver : « vous avez accepté » quand le chauffeur est à l\'origine', () => {
    const tpl = emailTemplates.bookingConfirmedDriver({
      ...base,
      amountCents: 8000,
      currency: 'EUR',
      paidOnline: false,
      method: 'ONSITE_CASH',
      acceptedByDriver: true,
      dashboardUrl: 'https://app.test/dashboard/reservations',
    })
    expect(tpl.html).toContain('Vous avez accepté')
    expect(tpl.html).not.toContain('a confirmé sa course')
  })

  it('bookingConfirmedDriver : alerte de chevauchement quand le paiement a confirmé malgré un conflit', () => {
    const tpl = emailTemplates.bookingConfirmedDriver({
      ...base,
      amountCents: 8000,
      currency: 'EUR',
      paidOnline: true,
      conflictWarning: true,
      dashboardUrl: 'https://app.test/dashboard/reservations',
    })
    expect(tpl.html).toContain('chevauche')

    const noWarn = emailTemplates.bookingConfirmedDriver({
      ...base,
      amountCents: 8000,
      currency: 'EUR',
      paidOnline: true,
      dashboardUrl: 'https://app.test/dashboard/reservations',
    })
    expect(noWarn.html).not.toContain('chevauche')
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

describe('emailTemplates compte & sécurité', () => {
  it('verifyEmail : accueille, contient le lien de confirmation et échappe le nom', () => {
    const tpl = emailTemplates.verifyEmail({
      displayName: 'Karim <b>VTC</b>',
      verifyUrl: 'https://app.test/auth/verify-email?token=abc',
      dashboardUrl: 'https://app.test/dashboard',
    })
    expect(tpl.subject).toContain('Confirmez votre adresse email')
    expect(tpl.html).toContain('Confirmer mon adresse email')
    expect(tpl.html).toContain('https://app.test/auth/verify-email?token=abc')
    expect(tpl.html).toContain('7 jours')
    expect(tpl.html).toContain('en cours de vérification')
    expect(tpl.html).not.toContain('<b>VTC</b>')
    expect(tpl.html).toContain('Karim &lt;b&gt;VTC&lt;/b&gt;')
  })

  it('verifyEmailResend : renvoie un lien de confirmation', () => {
    const tpl = emailTemplates.verifyEmailResend({
      verifyUrl: 'https://app.test/auth/verify-email?token=xyz',
    })
    expect(tpl.subject).toContain('Confirmez votre adresse email')
    expect(tpl.html).toContain('https://app.test/auth/verify-email?token=xyz')
    expect(tpl.html).toContain('Confirmer mon adresse email')
  })

  it('passwordChanged : confirme et alerte « ce n\'était pas vous »', () => {
    const tpl = emailTemplates.passwordChanged({
      loginUrl: 'https://app.test/dashboard/login',
      supportEmail: 'support@ridewiz.fr',
    })
    expect(tpl.subject).toContain('mot de passe a été modifié')
    expect(tpl.html).toContain('modifié avec succès')
    expect(tpl.html).toContain('Ce n\'était pas vous')
    expect(tpl.html).toContain('support@ridewiz.fr')
    expect(tpl.html).toContain('https://app.test/dashboard/login')
  })

  it('passwordChanged : repli sans email de support', () => {
    const tpl = emailTemplates.passwordChanged({ loginUrl: 'https://app.test/dashboard/login' })
    expect(tpl.html).toContain('notre équipe')
  })
})
