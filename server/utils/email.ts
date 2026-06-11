// Envoi d'emails transactionnels via Resend. Sans clé API, on journalise et on
// renvoie un succès simulé (dev/test). Tous les emails client passent par ici.
import { formatMoney } from '~/lib/money'

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

export const emailTemplates = {
  quoteSent(opts: { driverName: string; amountCents: number; currency: string; payUrl: string; expiresAt: Date }) {
    return {
      subject: `Votre devis — ${opts.driverName}`,
      html: wrap(
        'Votre devis est prêt',
        `<p>${opts.driverName} a validé votre devis :</p>
         <p style="font-size:28px;font-weight:700">${formatMoney(opts.amountCents, opts.currency)}</p>
         ${button(opts.payUrl, 'Payer et confirmer la course')}
         <p style="font-size:13px;color:#6b7280">Devis valable jusqu'au ${opts.expiresAt.toLocaleString('fr-FR')}.</p>`,
      ),
    }
  },
  paymentConfirmed(opts: { driverName: string; amountCents: number; currency: string; scheduledAt: Date; manageUrl: string; driverPhone?: string | null; driverEmail?: string | null }) {
    const contact = [
      opts.driverPhone ? `📞 ${opts.driverPhone}` : '',
      opts.driverEmail ? `✉️ ${opts.driverEmail}` : '',
    ].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')

    return {
      subject: `Course confirmée — ${opts.driverName}`,
      html: wrap(
        'Votre course est confirmée ✅',
        `<p>Le paiement de <strong>${formatMoney(opts.amountCents, opts.currency)}</strong> a bien été reçu.</p>
         <p>Prise en charge le <strong>${opts.scheduledAt.toLocaleString('fr-FR')}</strong>.</p>
         ${contact ? `<p style="font-size:13px;color:#374151">Contact : ${contact}</p>` : ''}
         ${button(opts.manageUrl, 'Gérer ma réservation')}`,
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
