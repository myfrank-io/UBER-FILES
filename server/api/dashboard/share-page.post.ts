import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { buildShareMessage } from '~/lib/share-message'
import { driverReviewUrl, reviewFunnelPath } from '~/lib/review-link'

// Bouton « Partager ma page » (espace chauffeur) : le chauffeur enregistre un
// client (téléphone obligatoire, email requis pour le canal email) et lui envoie
// un message de remerciement + demande d'avis + lien de réservation.
//  - EMAIL    : l'email est envoyé directement (serveur).
//  - SMS/WA   : le client (navigateur) ouvre l'app avec le message pré-rempli ;
//               on renvoie juste le message + le lien.
// Dédoublonnage MANUEL par téléphone : même numéro = même client (on met à jour).
const schema = z.object({
  name: z.string().min(1, 'Nom requis.').max(120),
  phone: z.string().min(1, 'Téléphone requis.').max(30),
  email: z.string().email('Email invalide.').optional(),
  channel: z.enum(['SMS', 'WHATSAPP', 'EMAIL']),
  // Message rendu côté client (aperçu de la modale, modèle éventuellement adapté
  // sans être enregistré) : « ce qui est prévisualisé est ce qui part ». En son
  // absence, le serveur reconstruit le message depuis le modèle enregistré.
  message: z.string().max(2500).optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const config = useRuntimeConfig()
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.errors.map((e) => e.message).join(' ') })
  }
  const name = body.data.name.trim()
  const phone = body.data.phone.trim()
  const email = body.data.email?.toLowerCase().trim() || undefined
  const channel = body.data.channel

  if (channel === 'EMAIL' && !email) {
    throw createError({ statusCode: 400, statusMessage: 'Email requis pour l’envoi par email.' })
  }

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { slug: true, displayName: true, reviewUrl: true, googlePlaceId: true, shareMessageTemplate: true },
  })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  // Enregistrement / mise à jour du client — dédoublonnage par téléphone.
  await upsertCustomerByPhone(driverId, { name, phone, email })

  const publicUrl = `${config.public.appBaseUrl}/${driver.slug}`
  // Dépôt d'avis : toujours la page de notation Ridewiz (5★ → lien public,
  // 1-4★ → retour privé), jamais le lien externe directement.
  const reviewUrl = `${config.public.appBaseUrl}${reviewFunnelPath(driver.slug)}`
  const message =
    body.data.message?.trim() ||
    buildShareMessage({
      customerName: name,
      driverName: driver.displayName,
      publicUrl,
      reviewUrl,
      hasReviewLink: Boolean(driverReviewUrl(driver)),
      template: driver.shareMessageTemplate,
    })

  if (channel === 'EMAIL') {
    const tpl = emailTemplates.shareBookingPage({
      driverName: driver.displayName,
      message,
      publicUrl,
      reviewUrl,
    })
    const { sent } = await sendEmail({ to: email!, ...tpl })
    return { ok: true, channel, sent, message, publicUrl }
  }

  // SMS / WhatsApp : l'ouverture de l'app se fait côté client.
  return { ok: true, channel, sent: false, message, publicUrl }
})

/**
 * Ajoute ou met à jour un client en dédoublonnant par téléphone (règle du bouton
 * de partage). L'email n'est renseigné que s'il ne crée pas de collision avec la
 * contrainte d'unicité (driverId, email) portée par un autre client.
 */
async function upsertCustomerByPhone(
  driverId: string,
  data: { name: string; phone: string; email?: string },
): Promise<void> {
  const existing = await prisma.customer.findFirst({ where: { driverId, phone: data.phone } })

  // L'email est-il déjà utilisé par un AUTRE client de ce chauffeur ?
  const emailOwner = data.email
    ? await prisma.customer.findUnique({ where: { driverId_email: { driverId, email: data.email } } })
    : null

  if (existing) {
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        // On ne réécrit l'email que s'il est libre (ou déjà celui de ce client).
        ...(data.email && (!emailOwner || emailOwner.id === existing.id) ? { email: data.email } : {}),
      },
    })
    return
  }

  // Pas de client pour ce téléphone : si l'email appartient déjà à quelqu'un,
  // on rattache ce téléphone à ce client existant plutôt que d'en créer un doublon.
  if (emailOwner) {
    await prisma.customer.update({
      where: { id: emailOwner.id },
      data: { name: data.name, phone: data.phone },
    })
    return
  }

  await prisma.customer.create({
    data: { driverId, name: data.name, phone: data.phone, email: data.email ?? null },
  })
}
