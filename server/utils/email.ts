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

// Gabarit email — charte Ridewiz « Signature » : fond crème, bandeau nuit avec
// le nom de marque en serif or, carte blanche arrondie, pied discret. Les polices
// web étant peu fiables en email, on utilise Georgia (serif) et la pile système.
const wrap = (title: string, body: string) => `
  <div style="background:#F6F1E9;padding:28px 14px;font-family:-apple-system,'Segoe UI',Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto">
      <div style="background:#0E1B2C;border-radius:18px 18px 0 0;padding:20px 28px;text-align:center">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:23px;color:#E0B579;letter-spacing:-.01em">Ridewiz</span>
      </div>
      <div style="background:#ffffff;border:1px solid #EFE7D8;border-top:none;border-radius:0 0 18px 18px;padding:30px 28px;color:#16283D;font-size:15px;line-height:1.6">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:23px;line-height:1.25;color:#0E1B2C">${title}</h1>
        ${body}
      </div>
      <p style="text-align:center;font-size:12px;color:#9A8B72;margin:16px 0 0">Ridewiz · « Votre chauffeur, votre signature. »</p>
    </div>
  </div>`

const button = (url: string, label: string) =>
  `<p style="margin:24px 0"><a href="${url}" style="background:#B5793F;color:#ffffff;padding:14px 24px;border-radius:12px;text-decoration:none;display:inline-block;font-weight:600;font-size:15px">${label}</a></p>`

// Échappe les valeurs saisies par le client (nom, note, adresse…) injectées dans le HTML.
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// Pastille de contact cliquable (tel:/sms:/mailto:), style charte.
const contactPill = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 14px;background:#ffffff;border:1.5px solid #E4DCCC;border-radius:999px;color:#16283D;text-decoration:none;font-size:13px;font-weight:600">${label}</a>`

/**
 * Bloc contact propre : nom + boutons Appeler / SMS / Email en un geste.
 * `title` : « Votre chauffeur » côté client, « Votre client » côté chauffeur.
 */
const contactBlock = (
  title: string,
  contact: { name?: string | null; phone?: string | null; email?: string | null },
): string => {
  if (!contact.phone && !contact.email) return ''
  const tel = (contact.phone ?? '').replace(/[^+\d]/g, '')
  const pills = [
    contact.phone ? contactPill(`tel:${tel}`, `📞 ${esc(contact.phone)}`) : '',
    contact.phone ? contactPill(`sms:${tel}`, '💬 SMS') : '',
    contact.email ? contactPill(`mailto:${contact.email}`, '✉️ Email') : '',
  ].filter(Boolean).join('')
  return `
  <div style="margin:18px 0;padding:14px 16px 8px;background:#FBF7F0;border:1px solid #EFE7D8;border-radius:12px">
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9A8B72">${title}${contact.name ? ` &nbsp;·&nbsp; <span style="color:#16283D;text-transform:none;letter-spacing:0;font-size:13px">${esc(contact.name)}</span>` : ''}</p>
    ${pills}
  </div>`
}

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
         <div style="background:#FBF7F0;border:1px solid #EFE7D8;border-radius:8px;padding:16px;margin:16px 0">
           📅 <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong><br />
           📍 ${trajet}<br />
           💶 Montant estimé : <strong>${formatMoney(opts.amountCents, opts.currency)}</strong>
         </div>
         ${nextStep}
         <p style="font-size:13px;color:#6C7889">Le montant ci-dessus est une estimation, susceptible
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
      ? `<p style="margin:0"><span style="text-decoration:line-through;color:#9A8B72;font-size:16px">${formatMoney(opts.originalAmountCents!, opts.currency)}</span></p>
         <p style="font-size:28px;font-weight:700;margin:4px 0">${formatMoney(opts.amountCents, opts.currency)}</p>
         <p style="font-size:13px;color:#6C7889">Tarif ajusté par le chauffeur (estimation initiale : ${formatMoney(opts.originalAmountCents!, opts.currency)}).</p>`
      : `<p style="font-size:28px;font-weight:700">${formatMoney(opts.amountCents, opts.currency)}</p>`
    return {
      subject: adjusted
        ? `Votre devis (tarif ajusté) — ${opts.driverName}`
        : `Votre devis — ${opts.driverName}`,
      html: wrap(
        'Votre devis est prêt',
        `${intro}
         <div style="background:#FBF7F0;border:1px solid #EFE7D8;border-radius:8px;padding:16px;margin:16px 0">
           📅 <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong><br />
           📍 ${trajet}
         </div>
         ${priceBlock}
         ${button(opts.payUrl, label)}
         <p style="font-size:13px;color:#6C7889">Devis valable jusqu'au ${opts.expiresAt.toLocaleString('fr-FR')}.</p>`,
      ),
    }
  },
  // Relance client : un devis a été envoyé mais la course n'est pas encore
  // confirmée. Ton direct : « vous avez une demande de course pour tel jour,
  // tel itinéraire — pour la confirmer, procédez au paiement ».
  quoteReminder(opts: {
    customerName?: string | null
    driverName: string
    amountCents: number
    currency: string
    payUrl: string
    expiresAt: Date
    // Règlement proposé : en ligne seul, au choix, ou sur place uniquement
    // (l'invitation et le bouton s'adaptent).
    prepayment?: boolean
    onSiteAvailable?: boolean
    type: 'TRANSFER' | 'HOURLY'
    scheduledAt: Date
    pickupAddress?: string | null
    dropoffAddress?: string | null
    roundTrip?: boolean
    durationHours?: number | null
  }) {
    const trajet =
      opts.type === 'TRANSFER'
        ? `${esc(opts.pickupAddress ?? '?')} → ${esc(opts.dropoffAddress ?? '?')}${opts.roundTrip ? ' (aller-retour)' : ''}`
        : `Mise à disposition ${opts.durationHours ?? '?'} h${opts.pickupAddress ? ` — départ : ${esc(opts.pickupAddress)}` : ''}`
    const dateStr = opts.scheduledAt.toLocaleString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })
    const onsiteOnly = opts.prepayment === false
    const invite = onsiteOnly
      ? `il ne vous reste qu'à <strong>confirmer votre réservation</strong> — le règlement se fera sur place, le jour de la course`
      : opts.onSiteAvailable
        ? `il ne vous reste qu'à <strong>procéder au paiement</strong> (ou à choisir le règlement sur place)`
        : `il ne vous reste qu'à <strong>procéder au paiement</strong>`
    const label = onsiteOnly ? 'Confirmer ma réservation' : 'Payer et confirmer ma course'
    return {
      subject: `Rappel — confirmez votre course du ${opts.scheduledAt.toLocaleDateString('fr-FR')} · ${opts.driverName}`,
      html: wrap(
        'Votre course attend votre confirmation ⏳',
        `<p>Bonjour${opts.customerName ? ` ${esc(opts.customerName)}` : ''},</p>
         <p>Vous avez une demande de course auprès de <strong>${esc(opts.driverName)}</strong> :</p>
         <div style="background:#FBF7F0;border:1px solid #EFE7D8;border-radius:12px;padding:16px;margin:16px 0">
           📅 <strong>${dateStr}</strong><br />
           📍 ${trajet}
         </div>
         <p style="margin:8px 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;color:#0E1B2C">${formatMoney(opts.amountCents, opts.currency)}</p>
         <p>Le créneau n'est pas encore bloqué : ${invite}.</p>
         ${button(opts.payUrl, label)}
         <p style="font-size:13px;color:#6C7889">Offre valable jusqu'au ${opts.expiresAt.toLocaleString('fr-FR')} — passé ce délai, le créneau est libéré.</p>`,
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
         ${contactBlock('Votre chauffeur', { name: opts.driverName, phone: opts.driverPhone, email: opts.driverEmail })}
         ${button(opts.manageUrl, 'Gérer ma réservation')}
         <hr style="border:none;border-top:1px solid #EFE7D8;margin:16px 0" />
         <p style="font-size:11px;color:#9A8B72">${legalLines}</p>
         <p style="font-size:11px;color:#9A8B72">Conformément à l'art. L221-28 du Code de la consommation, le droit de rétractation de 14 jours ne s'applique pas à ce service de transport daté.</p>`,
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
         <p style="font-size:13px;color:#3C4A5A">Moyen de paiement prévu : <strong>${PAYMENT_METHOD_LABELS[opts.method]}</strong>.</p>
         <p>Prise en charge le <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>
         ${contactBlock('Votre chauffeur', { name: opts.driverName, phone: opts.driverPhone, email: opts.driverEmail })}
         ${button(opts.manageUrl, 'Gérer ma réservation')}
         <hr style="border:none;border-top:1px solid #EFE7D8;margin:16px 0" />
         <p style="font-size:11px;color:#9A8B72">${legalLines}</p>
         <p style="font-size:11px;color:#9A8B72">Conformément à l'art. L221-28 du Code de la consommation, le droit de rétractation de 14 jours ne s'applique pas à ce service de transport daté.</p>`,
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
         <p style="font-size:13px;color:#6C7889">Paiement immédiat activé : le devis a été envoyé automatiquement au client. Vous serez prévenu dès son paiement — aucune action attendue de votre part.</p>`
      : opts.directAccept
        ? `${button(opts.dashboardUrl, 'Accepter ou refuser la réservation')}
         <p style="font-size:13px;color:#6C7889">En acceptant, la course est <strong>confirmée immédiatement</strong> — règlement sur place. Le client est prévenu par email. Vous pouvez aussi ajuster le prix : le client devra alors accepter le nouveau tarif.</p>`
        : `${button(opts.dashboardUrl, 'Valider ou refuser le devis')}
         <p style="font-size:13px;color:#6C7889">Le client recevra le lien de réservation dès que vous aurez validé le devis.</p>`
    return {
      subject: `Nouvelle demande de course — ${opts.customerName}`,
      html: wrap(
        'Nouvelle demande de course 🚗',
        `<p><strong>${esc(opts.customerName)}</strong>${opts.customerPhone ? ` (${esc(opts.customerPhone)})` : ''} souhaite réserver :</p>
         <p>📅 <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong><br />
            📍 ${trajet}</p>
         <p>Prix calculé : <strong style="font-size:20px">${formatMoney(opts.amountCents, opts.currency)}</strong></p>
         ${opts.paymentLabel ? `<p style="font-size:13px;color:#3C4A5A">💶 Règlement prévu : <strong>${esc(opts.paymentLabel)}</strong></p>` : ''}
         ${opts.notes ? `<p style="font-size:13px;color:#6C7889">Note du client : ${esc(opts.notes)}</p>` : ''}
         ${opts.hasConflict ? '<p style="color:#96691E"><strong>⚠️ Conflit calendrier détecté</strong> — vérifiez votre planning avant de valider.</p>' : ''}
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
    // True quand c'est le chauffeur lui-même qui vient d'accepter la demande
    // (l'email sert de trace : « vous avez accepté », pas « le client a confirmé »).
    acceptedByDriver?: boolean
    // True si la course confirmée chevauche un autre événement du calendrier
    // (paiement déjà encaissé : on confirme mais on alerte le chauffeur).
    conflictWarning?: boolean
  }) {
    const paiement = opts.paidOnline
      ? `<strong>${formatMoney(opts.amountCents, opts.currency)}</strong> payés en ligne.`
      : `<strong>${formatMoney(opts.amountCents, opts.currency)}</strong> à encaisser sur place${opts.method ? ` (${PAYMENT_METHOD_LABELS[opts.method]})` : ''}.`
    const intro = opts.autoConfirmed
      ? `<p><strong>${esc(opts.customerName)}</strong> vient de réserver : la course du
         <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong> a été <strong>confirmée
         automatiquement</strong> (créneau libre).</p>`
      : opts.acceptedByDriver
        ? `<p>Vous avez accepté la réservation de <strong>${esc(opts.customerName)}</strong> :
           la course du <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong> est confirmée.</p>`
        : `<p><strong>${esc(opts.customerName)}</strong> a confirmé sa course du <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>`
    return {
      subject: `Course confirmée — ${opts.customerName} (${opts.scheduledAt.toLocaleString('fr-FR')})`,
      html: wrap(
        'Course confirmée ✅',
        `${intro}
         <p>${paiement}</p>
         ${opts.conflictWarning ? '<p style="color:#96691E"><strong>⚠️ Attention :</strong> cette course chevauche un autre événement de votre calendrier. Vérifiez votre planning et contactez le client si besoin.</p>' : ''}
         ${contactBlock('Votre client', { name: opts.customerName, phone: opts.customerPhone, email: opts.customerEmail })}
         <p style="font-size:13px;color:#6C7889">Le créneau est bloqué dans votre calendrier.</p>
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
    // Coordonnées du chauffeur : le client peut l'appeler ou lui écrire en un geste.
    driverPhone?: string | null
    driverEmail?: string | null
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
         ${contactBlock('Votre chauffeur', { name: opts.driverName, phone: opts.driverPhone, email: opts.driverEmail })}
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
         <div style="background:#FBF7F0;border:1px solid #EFE7D8;border-radius:8px;padding:16px;margin:16px 0">
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
         <p style="font-size:13px;color:#6C7889">Dès que votre profil sera approuvé, votre page
          publique de réservation sera mise en ligne et vous en serez informé par email.</p>`,
      ),
    }
  },
  // Envoyé à l'inscription : accueille le chauffeur ET lui demande de confirmer
  // son adresse email (le lien porte un jeton de vérification). Rappelle aussi que
  // le profil est en attente de validation — un seul email à l'inscription.
  verifyEmail(opts: { displayName: string; verifyUrl: string; dashboardUrl: string }) {
    return {
      subject: 'Confirmez votre adresse email — Ridewiz',
      html: wrap(
        `Bienvenue ${esc(opts.displayName)} 👋`,
        `<p>Merci pour votre inscription. Avant tout, <strong>confirmez votre adresse
          email</strong> pour sécuriser votre compte et recevoir vos notifications de
          course :</p>
         ${button(opts.verifyUrl, 'Confirmer mon adresse email')}
         <p style="font-size:13px;color:#6C7889">Ce lien est valable 7 jours. Si le bouton
          ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
          <a href="${opts.verifyUrl}" style="color:#B5793F;word-break:break-all">${opts.verifyUrl}</a></p>
         <hr style="border:none;border-top:1px solid #EFE7D8;margin:20px 0" />
         <p style="font-size:13px;color:#6C7889">En parallèle, votre profil est
          <strong>en cours de vérification</strong> par notre équipe. Vous pouvez dès
          maintenant <a href="${opts.dashboardUrl}" style="color:#B5793F">accéder à votre
          espace</a> pour le compléter (présentation, véhicule, tarifs, zone…). Dès qu'il
          sera approuvé, votre page publique sera mise en ligne.</p>`,
      ),
    }
  },
  // Renvoi du lien de confirmation (depuis la bannière de l'espace chauffeur).
  verifyEmailResend(opts: { verifyUrl: string }) {
    return {
      subject: 'Confirmez votre adresse email — Ridewiz',
      html: wrap(
        'Confirmez votre adresse email',
        `<p>Voici votre nouveau lien pour confirmer votre adresse email :</p>
         ${button(opts.verifyUrl, 'Confirmer mon adresse email')}
         <p style="font-size:13px;color:#6C7889">Ce lien est valable 7 jours. Si le bouton
          ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
          <a href="${opts.verifyUrl}" style="color:#B5793F;word-break:break-all">${opts.verifyUrl}</a></p>`,
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
         <p><a href="${opts.publicUrl}" style="color:#B5793F;font-weight:600">${opts.publicUrl}</a></p>
         ${button(opts.publicUrl, 'Voir ma page publique')}
         <p style="font-size:13px;color:#6C7889">Partagez ce lien avec vos clients pour
          recevoir vos premières demandes de course. Gérez tout depuis
          <a href="${opts.dashboardUrl}" style="color:#B5793F">votre espace</a>.</p>`,
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
         <p style="font-size:13px;color:#6C7889">Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>`,
      ),
    }
  },
  // Confirmation envoyée après un changement de mot de passe réussi (sécurité :
  // alerte l'utilisateur si ce n'était pas lui).
  passwordChanged(opts: { loginUrl: string; supportEmail?: string | null }) {
    const support = opts.supportEmail
      ? `<a href="mailto:${opts.supportEmail}" style="color:#B5793F">${opts.supportEmail}</a>`
      : 'notre équipe'
    return {
      subject: 'Votre mot de passe a été modifié',
      html: wrap(
        'Mot de passe modifié ✅',
        `<p>Votre mot de passe vient d'être modifié avec succès. Vous pouvez désormais
          vous connecter avec votre nouveau mot de passe.</p>
         ${button(opts.loginUrl, 'Se connecter')}
         <p style="font-size:13px;color:#96691E"><strong>Ce n'était pas vous ?</strong>
          Réinitialisez immédiatement votre mot de passe et contactez ${support}.</p>`,
      ),
    }
  },
}
