import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { prisma } from '~/server/utils/prisma'
import { hashUserPassword } from '~/server/utils/password'
import { verifySiren } from '~/server/utils/insee'
import { sendInitialVerificationEmail } from '~/server/utils/email-verification'

// Inscription en self-service d'un chauffeur depuis la landing publique.
// Crée Driver + User + grilles tarifaires par défaut, statut PENDING :
// le profil reste invisible publiquement (page /{slug} en 404) tant qu'un
// admin ne l'a pas approuvé (passage à ACTIVE). Aucune configuration Stripe ici.
const schema = z.object({
  // Compte de connexion
  email: z.string().email(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),

  // Identité publique
  displayName: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Adresse de page : minuscules, chiffres et tirets uniquement.'),
  tagline: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),

  // Véhicule
  vehicleMake: z.string().max(60).optional(),
  vehicleModel: z.string().max(60).optional(),
  vehicleClass: z.string().max(60).optional(),
  vehicleSeats: z.number().int().min(1).max(20).optional(),

  // Zone & prestations
  serviceArea: z.string().max(500).optional(),
  services: z.string().max(1000).optional(),

  // Identité légale
  siren: z.string().max(20).optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }
  const data = body.data
  const email = data.email.toLowerCase()

  // Unicité du slug et de l'email
  const existingDriver = await prisma.driver.findUnique({ where: { slug: data.slug } })
  if (existingDriver) {
    throw createError({ statusCode: 409, statusMessage: 'Cette adresse de page est déjà prise.' })
  }
  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    throw createError({ statusCode: 409, statusMessage: 'Un compte existe déjà avec cet email.' })
  }

  // Vérification SIREN (best-effort, n'empêche pas l'inscription)
  const sirenCheck = data.siren ? await verifySiren(data.siren, config.inseeApiKey || undefined) : null

  const driver = await prisma.driver.create({
    data: {
      slug: data.slug,
      displayName: data.displayName,
      status: 'PENDING',
      tagline: data.tagline,
      phone: data.phone,
      contactEmail: email,
      vehicleMake: data.vehicleMake,
      vehicleModel: data.vehicleModel,
      vehicleClass: data.vehicleClass,
      vehicleSeats: data.vehicleSeats,
      serviceArea: data.serviceArea,
      services: data.services,
      siren: data.siren,
      sirenVerified: sirenCheck?.verified ?? false,
      companyName: sirenCheck?.companyName,
      telegramLinkCode: randomCode(),
      // Grilles par défaut pour démarrer (le chauffeur les ajustera ensuite)
      transferBands: {
        create: [
          { name: 'Jour', pricePerKmCents: 200, daysOfWeek: [], startMinute: 360, endMinute: 1320, priority: 1, isDefault: true },
          { name: 'Nuit', pricePerKmCents: 280, daysOfWeek: [], startMinute: 1320, endMinute: 1800, priority: 2, isDefault: false },
        ],
      },
      hourlyRateCents: 6000,
      cancellationPolicy: { create: { freeUntilHours: 24, retainedPercent: 50 } },
      subscription: { create: { monthlyFeeCents: 4900, planName: 'Standard' } },
      user: {
        create: { email, passwordHash: hashUserPassword(data.password), role: 'DRIVER' },
      },
    },
    include: { user: true },
  })

  // Email de bienvenue + confirmation de l'adresse email (un seul message :
  // accueille, demande la confirmation, rappelle que le profil est en attente).
  await sendInitialVerificationEmail({ id: driver.user!.id, email }, driver.displayName)

  // Connexion automatique : le chauffeur arrive dans son espace pour le personnaliser.
  await setUserSession(event, {
    user: { id: driver.user!.id, email, role: 'DRIVER', driverId: driver.id },
  })

  return { ok: true, slug: driver.slug, status: driver.status }
})

function randomCode(): string {
  return randomBytes(6).toString('hex')
}
