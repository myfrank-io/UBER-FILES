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
  // Accusé de réception envoyé au client juste après sa demande, tant que le
  // chauffeur n'a pas encore validé (flux à validation manuelle). La « prochaine
  // étape » s'adapte au règlement prévu : lien de paiement en ligne, ou simple
  // confirmation quand le règlement se fera sur place.
  orderReceived(opts: {
    customerName: string
    driverName: string
    type: 'TRANSFER' | 'HOURLY'
    scheduledAt: Date
    pickupAddress?: string | null
    dropoffAddress?: string | null
    roundTrip?: boolean
    durationHours?: number | null
    amountCents: number
    currency: string
    // True si le règlement de cette demande se fera sur place le jour de la course.
    paymentOnSite?: boolean
  }) {
    const trajet =
      opts.type === 'TRANSFER'
        ? `${esc(opts.pickupAddress ?? '?')} → ${esc(opts.dropoffAddress ?? '?')}${opts.roundTrip ? ' (aller-retour)' : ''}`
        : `Mise à disposition ${opts.durationHours ?? '?'} h${opts.pickupAddress ? ` — départ : ${esc(opts.pickupAddress)}` : ''}`
    const nextStep = opts.paymentOnSite
      ? `<p><strong>Prochaine étape :</strong> dès que le chauffeur aura confirmé votre
            réservation, vous recevrez un <strong>email de confirmation</strong>. Le règlement
            se fera <strong>sur place</strong>, le jour de la course.</p>`
      : `<p><strong>Prochaine étape :</strong> dès que le chauffeur aura validé votre course,
            vous recevrez un <strong>nouvel email</strong> avec le lien pour confirmer et régler
            votre réservation.</p>`
    return {
      subject: `Demande de réservation bien reçue — ${opts.driverName}`,
      html: wrap(
        'Votre demande est bien reçue ✅',
        `<p>Bonjour ${esc(opts.customerName)},</p>
         <p>Nous avons bien reçu votre demande de réservation : elle vient d'être
            <strong>transmise à ${esc(opts.driverName)}</strong>.</p>
         <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
           📅 <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong><br />
           📍 ${trajet}<br />
           💶 Montant estimé : <strong>${formatMoney(opts.amountCents, opts.currency)}</strong>
         </div>
         ${nextStep}
         <p style="font-size:13px;color:#6b7280">Le montant ci-dessus est une estimation, susceptible
            d'être ajustée par le chauffeur lors de la validation. Aucune somme ne vous est débitée à ce stade.</p>`,
      ),
    }
  },
  quoteSent(opts: {
    driverName: string
    amountCents: number
    currency: string
    payUrl: string
    expiresAt: Date
    // True si le chauffeur propose le prépaiement en ligne ; sinon le client
    // réserve et règle sur place (le libellé du bouton s'adapte).
    prepayment?: boolean
    // True si l'encaissement sur place est aussi proposé (le bouton devient neutre :
    // le client choisit son règlement sur la page devis).
    onSiteAvailable?: boolean
    // Récap de la course (rappelé dans l'email).
    type: 'TRANSFER' | 'HOURLY'
    scheduledAt: Date
    pickupAddress?: string | null
    dropoffAddress?: string | null
    roundTrip?: boolean
    durationHours?: number | null
    // Estimation initiale : si différente du montant final, le chauffeur a ajusté le tarif.
    originalAmountCents?: number
  }) {
    const trajet =
      opts.type === 'TRANSFER'
        ? `${esc(opts.pickupAddress ?? '?')} → ${esc(opts.dropoffAddress ?? '?')}${opts.roundTrip ? ' (aller-retour)' : ''}`
        : `Mise à disposition ${opts.durationHours ?? '?'} h${opts.pickupAddress ? ` — départ : ${esc(opts.pickupAddress)}` : ''}`
    // Le chauffeur a-t-il ajusté le tarif par rapport à l'estimation initiale ?
    const adjusted =
      opts.originalAmountCents != null && opts.originalAmountCents !== opts.amountCents
    // Libellé du bouton selon le règlement proposé : paiement en ligne seul, choix
    // en ligne/sur place, ou sur place uniquement (avec cas « nouveau tarif à accepter »).
    const label =
      opts.prepayment === false
        ? adjusted
          ? 'Accepter le nouveau tarif et réserver'
          : 'Voir mon devis et réserver'
        : opts.onSiteAvailable
          ? 'Voir mon devis et confirmer'
          : 'Payer et confirmer la course'
    const intro = adjusted
      ? `<p>${esc(opts.driverName)} a validé votre devis en <strong>ajustant le tarif</strong> :</p>`
      : `<p>${esc(opts.driverName)} a validé votre devis :</p>`
    const priceBlock = adjusted
      ? `<p style="margin:0"><span style="text-decoration:line-through;color:#9ca3af;font-size:16px">${formatMoney(opts.originalAmountCents!, opts.currency)}</span></p>
         <p style="font-size:28px;font-weight:700;margin:4px 0">${formatMoney(opts.amountCents, opts.currency)}</p>
         <p style="font-size:13px;color:#6b7280">Tarif ajusté par le chauffeur (estimation initiale : ${formatMoney(opts.originalAmountCents!, opts.currency)}).</p>`
      : `<p style="font-size:28px;font-weight:700">${formatMoney(opts.amountCents, opts.currency)}</p>`
    return {
      subject: adjusted
        ? `Votre devis (tarif ajusté) — ${opts.driverName}`
        : `Votre devis — ${opts.driverName}`,
      html: wrap(
        'Votre devis est prêt',
        `${intro}
         <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
           📅 <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong><br />
           📍 ${trajet}
         </div>
         ${priceBlock}
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
    // True quand la confirmation résulte de l'acceptation manuelle du chauffeur
    // (flux à validation) — l'intro le dit explicitement au client.
    acceptedByDriver?: boolean
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

    const intro = opts.acceptedByDriver
      ? `<p><strong>${esc(opts.driverName)}</strong> a accepté votre réservation : votre course est
         confirmée. Le règlement de <strong>${formatMoney(opts.amountCents, opts.currency)}</strong>
         se fera <strong>sur place</strong>, le jour de la course.</p>`
      : `<p>Votre course est réservée. Le règlement de <strong>${formatMoney(opts.amountCents, opts.currency)}</strong> se fera <strong>sur place</strong>, le jour de la course.</p>`

    return {
      subject: `Confirmation de réservation — ${opts.driverName}`,
      html: wrap(
        'Votre réservation est confirmée ✅',
        `${intro}
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
    // Règlement sur place : en acceptant, le chauffeur confirme directement la course.
    directAccept?: boolean
    // Règlement prévu pour cette demande (ex : « Sur place — Espèces », « En ligne (carte) »).
    paymentLabel?: string
  }) {
    const trajet =
      opts.type === 'TRANSFER'
        ? `${esc(opts.pickupAddress ?? '?')} → ${esc(opts.dropoffAddress ?? '?')}${opts.roundTrip ? ' (aller-retour)' : ''}`
        : `Mise à disposition ${opts.durationHours ?? '?'} h${opts.pickupAddress ? ` — départ : ${esc(opts.pickupAddress)}` : ''}`
    const action = opts.autoSent
      ? `${button(opts.dashboardUrl, 'Voir la demande')}
         <p style="font-size:13px;color:#6b7280">Paiement immédiat activé : le devis a été envoyé automatiquement au client. Vous serez prévenu dès son paiement — aucune action attendue de votre part.</p>`
      : opts.directAccept
        ? `${button(opts.dashboardUrl, 'Accepter ou refuser la réservation')}
         <p style="font-size:13px;color:#6b7280">En acceptant, la course est <strong>confirmée immédiatement</strong> — règlement sur place. Le client est prévenu par email. Vous pouvez aussi ajuster le prix : le client devra alors accepter le nouveau tarif.</p>`
        : `${button(opts.dashboardUrl, 'Valider ou refuser le devis')}
         <p style="font-size:13px;color:#6b7280">Le client recevra le lien de réservation dès que vous aurez validé le devis.</p>`
    return {
      subject: `Nouvelle demande de course — ${opts.customerName}`,
      html: wrap(
        'Nouvelle demande de course 🚗',
        `<p><strong>${esc(opts.customerName)}</strong>${opts.customerPhone ? ` (${esc(opts.customerPhone)})` : ''} souhaite réserver :</p>
         <p>📅 <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong><br />
            📍 ${trajet}</p>
         <p>Prix calculé : <strong style="font-size:20px">${formatMoney(opts.amountCents, opts.currency)}</strong></p>
         ${opts.paymentLabel ? `<p style="font-size:13px;color:#374151">💶 Règlement prévu : <strong>${esc(opts.paymentLabel)}</strong></p>` : ''}
         ${opts.notes ? `<p style="font-size:13px;color:#6b7280">Note du client : ${esc(opts.notes)}</p>` : ''}
         ${opts.hasConflict ? '<p style="color:#b45309"><strong>⚠️ Conflit calendrier détecté</strong> — vérifiez votre planning avant de valider.</p>' : ''}
         ${action}`,
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
    // True quand la course a été confirmée automatiquement (créneau libre, sans
    // action du chauffeur) — l'email est alors sa seule notification.
    autoConfirmed?: boolean
  }) {
    const contact = [
      opts.customerPhone ? `📞 ${esc(opts.customerPhone)}` : '',
      opts.customerEmail ? `✉️ ${esc(opts.customerEmail)}` : '',
    ].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')
    const paiement = opts.paidOnline
      ? `<strong>${formatMoney(opts.amountCents, opts.currency)}</strong> payés en ligne.`
      : `<strong>${formatMoney(opts.amountCents, opts.currency)}</strong> à encaisser sur place${opts.method ? ` (${PAYMENT_METHOD_LABELS[opts.method]})` : ''}.`
    const intro = opts.autoConfirmed
      ? `<p><strong>${esc(opts.customerName)}</strong> vient de réserver : la course du
         <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong> a été <strong>confirmée
         automatiquement</strong> (créneau libre).</p>`
      : `<p><strong>${esc(opts.customerName)}</strong> a confirmé sa course du <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>`
    return {
      subject: `Course confirmée — ${opts.customerName} (${opts.scheduledAt.toLocaleString('fr-FR')})`,
      html: wrap(
        'Course confirmée ✅',
        `${intro}
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
      : 'Aucun remboursement automatique effectué.'
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
  reminder(opts: {
    driverName: string
    scheduledAt: Date
    manageUrl: string
    // Renseignés quand un encaissement sur place est encore attendu : le rappel
    // précise le montant et le moyen prévus pour le jour J.
    amountCents?: number
    currency?: string
    onSiteMethod?: PaymentMethod | null
  }) {
    const paymentLine =
      opts.onSiteMethod && opts.amountCents != null
        ? `<p>💶 Pensez à votre règlement sur place : <strong>${formatMoney(opts.amountCents, opts.currency ?? 'eur')}
           (${PAYMENT_METHOD_LABELS[opts.onSiteMethod]})</strong>.</p>`
        : ''
    return {
      subject: `Rappel : votre course demain — ${opts.driverName}`,
      html: wrap(
        'Rappel de course',
        `<p>Votre course avec ${opts.driverName} est prévue le <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>
         ${paymentLine}
         ${button(opts.manageUrl, 'Voir ma réservation')}`,
      ),
    }
  },
  // Refus d'une demande par le chauffeur : le client est prévenu et peut refaire
  // une demande sur un autre créneau (aujourd'hui rien n'a été débité).
  requestRejected(opts: {
    customerName: string
    driverName: string
    type: 'TRANSFER' | 'HOURLY'
    scheduledAt: Date
    pickupAddress?: string | null
    dropoffAddress?: string | null
    roundTrip?: boolean
    durationHours?: number | null
    rebookUrl: string
  }) {
    const trajet =
      opts.type === 'TRANSFER'
        ? `${esc(opts.pickupAddress ?? '?')} → ${esc(opts.dropoffAddress ?? '?')}${opts.roundTrip ? ' (aller-retour)' : ''}`
        : `Mise à disposition ${opts.durationHours ?? '?'} h${opts.pickupAddress ? ` — départ : ${esc(opts.pickupAddress)}` : ''}`
    return {
      subject: `Votre demande n'a pas pu être acceptée — ${opts.driverName}`,
      html: wrap(
        'Demande non retenue',
        `<p>Bonjour ${esc(opts.customerName)},</p>
         <p>${esc(opts.driverName)} n'est malheureusement <strong>pas disponible</strong> pour
            cette course :</p>
         <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
           📅 <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong><br />
           📍 ${trajet}
         </div>
         <p>Aucune somme ne vous a été débitée.</p>
         <p>Vous pouvez refaire une demande sur un autre créneau :</p>
         ${button(opts.rebookUrl, 'Réserver un autre créneau')}`,
      ),
    }
  },
  cancelled(opts: {
    driverName: string
    refundCents: number
    currency: string
    // Situation de paiement au moment de l'annulation, pour un message honnête :
    // REFUNDED (remboursement en ligne parti), NO_REFUND (payé en ligne, retenue
    // intégrale), PAID_ON_SITE (réglé sur place), NOTHING_PAID (rien d'encaissé).
    situation?: 'REFUNDED' | 'NO_REFUND' | 'PAID_ON_SITE' | 'NOTHING_PAID'
  }) {
    const situation = opts.situation ?? (opts.refundCents > 0 ? 'REFUNDED' : 'NO_REFUND')
    const detail =
      situation === 'REFUNDED'
        ? `<p>Remboursement de <strong>${formatMoney(opts.refundCents, opts.currency)}</strong> en cours.</p>`
        : situation === 'NO_REFUND'
          ? '<p>Aucun remboursement applicable selon la politique d\'annulation.</p>'
          : situation === 'PAID_ON_SITE'
            ? '<p>Votre règlement ayant été effectué sur place, rapprochez-vous directement du chauffeur pour un éventuel remboursement.</p>'
            : '<p>Aucun paiement n\'avait été effectué : rien ne vous sera prélevé.</p>'
    return {
      subject: `Course annulée — ${opts.driverName}`,
      html: wrap(
        'Course annulée',
        `<p>Votre course a été annulée.</p>
         ${detail}`,
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
