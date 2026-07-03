// Envoi d'emails transactionnels via Resend. Sans clé API, on journalise et on
// renvoie un succès simulé (dev/test). Tous les emails client passent par ici.
import { formatMoney } from '~/lib/money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '~/lib/payment-methods'

interface SendArgs {
  to: string
  subject: string
  html: string
}

export async function sendEmail(args: SendArgs): Promise<{ sent: boolean }> {
  const config = useRuntimeConfig()
  if (!config.resendApiKey) {
    console.info(`[email:dev] → ${args.to} | ${args.subject}`)
    return { sent: false }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  })
  if (!res.ok) {
    console.error('[email] échec Resend', await res.text())
    return { sent: false }
  }
  return { sent: true }
}

const wrap = (title: string, body: string) => `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
    <h1 style="font-size:20px;color:#111827">${title}</h1>
    ${body}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
    <p style="font-size:12px;color:#9ca3af">Email automatique — Réservation VTC</p>
  </div>`

const button = (url: string, label: string) =>
  `<p style="margin:24px 0"><a href="${url}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${label}</a></p>`

// Échappe les valeurs saisies par le client (nom, note, adresse…) injectées dans le HTML.
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const emailTemplates = {
  quoteSent(opts: {
    driverName: string
    amountCents: number
    currency: string
    payUrl: string
    expiresAt: Date
    // True si le chauffeur propose le prépaiement en ligne ; sinon le client
    // réserve et règle sur place (le libellé du bouton s'adapte).
    prepayment?: boolean
  }) {
    const label = opts.prepayment === false ? 'Voir mon devis et réserver' : 'Payer et confirmer la course'
    return {
      subject: `Votre devis — ${opts.driverName}`,
      html: wrap(
        'Votre devis est prêt',
        `<p>${opts.driverName} a validé votre devis :</p>
         <p style="font-size:28px;font-weight:700">${formatMoney(opts.amountCents, opts.currency)}</p>
         ${button(opts.payUrl, label)}
         <p style="font-size:13px;color:#6b7280">Devis valable jusqu'au ${opts.expiresAt.toLocaleString('fr-FR')}.</p>`,
      ),
    }
  },
  paymentConfirmed(opts: {
    driverName: string
    amountCents: number
    currency: string
    scheduledAt: Date
    manageUrl: string
    driverPhone?: string | null
    driverEmail?: string | null
    siren?: string | null
    companyName?: string | null
    vehicleMake?: string | null
    vehicleModel?: string | null
  }) {
    const contact = [
      opts.driverPhone ? `📞 ${opts.driverPhone}` : '',
      opts.driverEmail ? `✉️ ${opts.driverEmail}` : '',
    ].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')

    const legalLines = [
      opts.companyName ? `Prestataire : ${opts.companyName}` : `Prestataire : ${opts.driverName}`,
      opts.siren ? `SIREN : ${opts.siren}` : '',
      opts.vehicleMake && opts.vehicleModel ? `Véhicule : ${opts.vehicleMake} ${opts.vehicleModel}` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')

    return {
      subject: `Confirmation de réservation — ${opts.driverName}`,
      html: wrap(
        'Votre réservation est confirmée ✅',
        `<p>Le paiement de <strong>${formatMoney(opts.amountCents, opts.currency)}</strong> a bien été reçu.</p>
         <p>Prise en charge le <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>
         ${contact ? `<p style="font-size:13px;color:#374151">Contact chauffeur : ${contact}</p>` : ''}
         ${button(opts.manageUrl, 'Gérer ma réservation')}
         <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
         <p style="font-size:11px;color:#9ca3af">${legalLines}</p>
         <p style="font-size:11px;color:#9ca3af">Conformément à l'art. L221-28 du Code de la consommation, le droit de rétractation de 14 jours ne s'applique pas à ce service de transport daté.</p>`,
      ),
    }
  },
  bookingConfirmedOnSite(opts: {
    driverName: string
    amountCents: number
    currency: string
    scheduledAt: Date
    method: PaymentMethod
    manageUrl: string
    driverPhone?: string | null
    driverEmail?: string | null
    siren?: string | null
    companyName?: string | null
    vehicleMake?: string | null
    vehicleModel?: string | null
  }) {
    const contact = [
      opts.driverPhone ? `📞 ${opts.driverPhone}` : '',
      opts.driverEmail ? `✉️ ${opts.driverEmail}` : '',
    ].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')

    const legalLines = [
      opts.companyName ? `Prestataire : ${opts.companyName}` : `Prestataire : ${opts.driverName}`,
      opts.siren ? `SIREN : ${opts.siren}` : '',
      opts.vehicleMake && opts.vehicleModel ? `Véhicule : ${opts.vehicleMake} ${opts.vehicleModel}` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')

    return {
      subject: `Confirmation de réservation — ${opts.driverName}`,
      html: wrap(
        'Votre réservation est confirmée ✅',
        `<p>Votre course est réservée. Le règlement de <strong>${formatMoney(opts.amountCents, opts.currency)}</strong> se fera <strong>sur place</strong>, le jour de la course.</p>
         <p style="font-size:13px;color:#374151">Moyen de paiement prévu : <strong>${PAYMENT_METHOD_LABELS[opts.method]}</strong>.</p>
         <p>Prise en charge le <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>
         ${contact ? `<p style="font-size:13px;color:#374151">Contact chauffeur : ${contact}</p>` : ''}
         ${button(opts.manageUrl, 'Gérer ma réservation')}
         <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
         <p style="font-size:11px;color:#9ca3af">${legalLines}</p>
         <p style="font-size:11px;color:#9ca3af">Conformément à l'art. L221-28 du Code de la consommation, le droit de rétractation de 14 jours ne s'applique pas à ce service de transport daté.</p>`,
      ),
    }
  },
  // ── Emails chauffeur (canal principal depuis la coupure des notifications Telegram) ──
  newRequestDriver(opts: {
    customerName: string
    customerPhone?: string | null
    type: 'TRANSFER' | 'HOURLY'
    scheduledAt: Date
    pickupAddress?: string | null
    dropoffAddress?: string | null
    roundTrip?: boolean
    durationHours?: number | null
    amountCents: number
    currency: string
    hasConflict: boolean
    notes?: string | null
    dashboardUrl: string
    // Paiement immédiat : le devis est déjà parti tout seul, pas d'action attendue.
    autoSent?: boolean
  }) {
    const trajet =
      opts.type === 'TRANSFER'
        ? `${esc(opts.pickupAddress ?? '?')} → ${esc(opts.dropoffAddress ?? '?')}${opts.roundTrip ? ' (aller-retour)' : ''}`
        : `Mise à disposition ${opts.durationHours ?? '?'} h`
    return {
      subject: `Nouvelle demande de course — ${opts.customerName}`,
      html: wrap(
        'Nouvelle demande de course 🚗',
        `<p><strong>${esc(opts.customerName)}</strong>${opts.customerPhone ? ` (${esc(opts.customerPhone)})` : ''} souhaite réserver :</p>
         <p>📅 <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong><br />
            📍 ${trajet}</p>
         <p>Prix calculé : <strong style="font-size:20px">${formatMoney(opts.amountCents, opts.currency)}</strong></p>
         ${opts.notes ? `<p style="font-size:13px;color:#6b7280">Note du client : ${esc(opts.notes)}</p>` : ''}
         ${opts.hasConflict ? '<p style="color:#b45309"><strong>⚠️ Conflit calendrier détecté</strong> — vérifiez votre planning avant de valider.</p>' : ''}
         ${
           opts.autoSent
             ? `${button(opts.dashboardUrl, 'Voir la demande')}
         <p style="font-size:13px;color:#6b7280">Paiement immédiat activé : le devis a été envoyé automatiquement au client. Vous serez prévenu dès son paiement — aucune action attendue de votre part.</p>`
             : `${button(opts.dashboardUrl, 'Valider ou refuser le devis')}
         <p style="font-size:13px;color:#6b7280">Le client recevra le lien de réservation dès que vous aurez validé le devis.</p>`
         }`,
      ),
    }
  },
  bookingConfirmedDriver(opts: {
    customerName: string
    customerPhone?: string | null
    customerEmail?: string | null
    scheduledAt: Date
    amountCents: number
    currency: string
    // true : payé en ligne ; false : à encaisser sur place (method précise le moyen)
    paidOnline: boolean
    method?: PaymentMethod
    dashboardUrl: string
  }) {
    const contact = [
      opts.customerPhone ? `📞 ${esc(opts.customerPhone)}` : '',
      opts.customerEmail ? `✉️ ${esc(opts.customerEmail)}` : '',
    ].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')
    const paiement = opts.paidOnline
      ? `<strong>${formatMoney(opts.amountCents, opts.currency)}</strong> payés en ligne.`
      : `<strong>${formatMoney(opts.amountCents, opts.currency)}</strong> à encaisser sur place${opts.method ? ` (${PAYMENT_METHOD_LABELS[opts.method]})` : ''}.`
    return {
      subject: `Course confirmée — ${opts.customerName} (${opts.scheduledAt.toLocaleString('fr-FR')})`,
      html: wrap(
        'Course confirmée ✅',
        `<p><strong>${esc(opts.customerName)}</strong> a confirmé sa course du <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>
         <p>${paiement}</p>
         ${contact ? `<p style="font-size:13px;color:#374151">Contact client : ${contact}</p>` : ''}
         <p style="font-size:13px;color:#6b7280">Le créneau est bloqué dans votre calendrier.</p>
         ${button(opts.dashboardUrl, 'Voir mes réservations')}`,
      ),
    }
  },
  bookingCancelledDriver(opts: {
    customerName: string
    scheduledAt: Date
    refundCents: number
    currency: string
  }) {
    const refundStr = opts.refundCents > 0
      ? `Remboursement client : ${formatMoney(opts.refundCents, opts.currency)}.`
      : 'Aucun remboursement (annulation hors délai).'
    return {
      subject: `Course annulée — ${opts.customerName} (${opts.scheduledAt.toLocaleString('fr-FR')})`,
      html: wrap(
        'Annulation client ❌',
        `<p><strong>${esc(opts.customerName)}</strong> a annulé sa réservation prévue le <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>
         <p>${refundStr}</p>
         <p>Le créneau est libéré dans votre calendrier.</p>`,
      ),
    }
  },
  reminder(opts: { driverName: string; scheduledAt: Date; manageUrl: string }) {
    return {
      subject: `Rappel : votre course demain — ${opts.driverName}`,
      html: wrap(
        'Rappel de course',
        `<p>Votre course avec ${opts.driverName} est prévue le <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>
         ${button(opts.manageUrl, 'Voir ma réservation')}`,
      ),
    }
  },
  cancelled(opts: { driverName: string; refundCents: number; currency: string }) {
    return {
      subject: `Course annulée — ${opts.driverName}`,
      html: wrap(
        'Course annulée',
        `<p>Votre course a été annulée.</p>
         ${opts.refundCents > 0 ? `<p>Remboursement de <strong>${formatMoney(opts.refundCents, opts.currency)}</strong> en cours.</p>` : '<p>Aucun remboursement applicable selon la politique d\'annulation.</p>'}`,
      ),
    }
  },
  driverWelcomePending(opts: { displayName: string; dashboardUrl: string }) {
    return {
      subject: 'Bienvenue — votre profil chauffeur est en cours de validation',
      html: wrap(
        `Bienvenue ${opts.displayName} 👋`,
        `<p>Merci pour votre inscription. Votre profil a bien été reçu et est
          <strong>en cours de vérification</strong> par notre équipe.</p>
         <p>En attendant la validation, vous pouvez dès maintenant accéder à votre espace
          pour compléter et personnaliser votre profil (présentation, véhicule, tarifs, zone…).</p>
         ${button(opts.dashboardUrl, 'Accéder à mon espace')}
         <p style="font-size:13px;color:#6b7280">Dès que votre profil sera approuvé, votre page
          publique de réservation sera mise en ligne et vous en serez informé par email.</p>`,
      ),
    }
  },
  driverApproved(opts: { displayName: string; publicUrl: string; dashboardUrl: string }) {
    return {
      subject: 'Votre profil chauffeur est validé ✅',
      html: wrap(
        'Votre profil est validé ✅',
        `<p>Bonne nouvelle ${opts.displayName} ! Votre profil a été approuvé.</p>
         <p>Votre page publique de réservation est désormais en ligne :</p>
         <p><a href="${opts.publicUrl}" style="color:#4f46e5;font-weight:600">${opts.publicUrl}</a></p>
         ${button(opts.publicUrl, 'Voir ma page publique')}
         <p style="font-size:13px;color:#6b7280">Partagez ce lien avec vos clients pour
          recevoir vos premières demandes de course. Gérez tout depuis
          <a href="${opts.dashboardUrl}" style="color:#4f46e5">votre espace</a>.</p>`,
      ),
    }
  },
  passwordReset(opts: { resetUrl: string }) {
    return {
      subject: 'Réinitialisation de votre mot de passe',
      html: wrap(
        'Réinitialisation de mot de passe',
        `<p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
         ${button(opts.resetUrl, 'Choisir un nouveau mot de passe')}
         <p style="font-size:13px;color:#6b7280">Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>`,
      ),
    }
  },
}
