import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { hashUserPassword } from '~/server/utils/password'
import { sendEmail, emailTemplates } from '~/server/utils/email'

// Invitation d'un chauffeur (onboarding simplifié) : l'admin ne saisit que le
// prénom + l'email (téléphone optionnel). On crée le Driver (PENDING) + son
// compte User SANS mot de passe utilisable, et on envoie un email contenant un
// lien pour qu'il définisse lui-même son mot de passe et active son compte.
// Le lien réutilise le mécanisme passwordResetToken (aucune migration requise).
const schema = z.object({
  firstName: z.string().min(1, 'Prénom requis.').max(60),
  email: z.string().email('Email invalide.'),
  phone: z.string().max(30).optional(),
})

// Durée de validité du lien d'invitation.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 jours

/** Slug URL à partir du prénom : minuscules, sans accents, tirets. */
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents (diacritiques combinants)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

/** Trouve un slug libre à partir d'une base (base, base-2, base-3… puis suffixe aléatoire). */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'chauffeur'
  if (!(await prisma.driver.findUnique({ where: { slug: root } }))) return root
  for (let i = 2; i <= 9; i++) {
    const candidate = `${root}-${i}`
    if (!(await prisma.driver.findUnique({ where: { slug: candidate } }))) return candidate
  }
  return `${root}-${randomBytes(3).toString('hex')}`
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const config = useRuntimeConfig()
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.errors.map((e) => e.message).join(' ') })
  }
  const firstName = body.data.firstName.trim()
  const email = body.data.email.toLowerCase()
  const phone = body.data.phone?.trim() || undefined

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) throw createError({ statusCode: 409, statusMessage: 'Un compte existe déjà avec cet email.' })

  const slug = await uniqueSlug(slugify(firstName))
  const inviteToken = randomBytes(32).toString('hex')
  // Mot de passe aléatoire non communiqué : le compte reste inutilisable tant que
  // le chauffeur n'a pas défini le sien via le lien d'invitation.
  const unusablePassword = hashUserPassword(randomBytes(24).toString('hex'))

  const driver = await prisma.driver.create({
    data: {
      slug,
      displayName: firstName,
      status: 'PENDING',
      phone,
      contactEmail: email,
      telegramLinkCode: randomBytes(6).toString('hex'),
      // Grilles par défaut pour démarrer (le chauffeur les ajustera ensuite).
      transferBands: {
        create: [
          { name: 'Jour', pricePerKmCents: 200, daysOfWeek: [], startMinute: 360, endMinute: 1320, priority: 1, isDefault: true },
          { name: 'Nuit', pricePerKmCents: 280, daysOfWeek: [], startMinute: 1320, endMinute: 1800, priority: 2, isDefault: false },
        ],
      },
      hourlyTiers: {
        create: [
          { minHours: 1, pricePerHourCents: 6000 },
          { minHours: 4, pricePerHourCents: 5500 },
        ],
      },
      cancellationPolicy: { create: { freeUntilHours: 24, retainedPercent: 50 } },
      subscription: { create: { monthlyFeeCents: 4900, planName: 'Standard' } },
      user: {
        create: {
          email,
          passwordHash: unusablePassword,
          role: 'DRIVER',
          passwordResetToken: inviteToken,
          passwordResetExpiry: new Date(Date.now() + INVITE_TTL_MS),
        },
      },
    },
  })

  const inviteUrl = `${config.public.appBaseUrl}/auth/reset-password?token=${inviteToken}&invite=1`

  const tpl = emailTemplates.driverInvitation({ firstName, inviteUrl })
  await sendEmail({ to: email, ...tpl })

  return { id: driver.id, slug: driver.slug, firstName, inviteUrl }
})
