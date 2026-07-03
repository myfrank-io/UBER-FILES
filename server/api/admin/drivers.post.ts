import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { hashUserPassword } from '~/server/utils/password'

// Création d'un compte chauffeur (onboarding) : Driver + User + grilles par défaut +
// code d'appairage Telegram.
const schema = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug : minuscules, chiffres et tirets uniquement.'),
  displayName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().max(30).optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.errors.map((e) => e.message).join(' ') })
  }
  const data = body.data

  const existing = await prisma.driver.findUnique({ where: { slug: data.slug } })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'Ce slug est déjà utilisé.' })
  const existingUser = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })
  if (existingUser) throw createError({ statusCode: 409, statusMessage: 'Cet email est déjà utilisé.' })

  const driver = await prisma.driver.create({
    data: {
      slug: data.slug,
      displayName: data.displayName,
      status: 'PENDING',
      phone: data.phone,
      contactEmail: data.email.toLowerCase(),
      telegramLinkCode: randomCode(),
      // Grilles par défaut pour démarrer
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
      user: {
        create: { email: data.email.toLowerCase(), passwordHash: hashUserPassword(data.password), role: 'DRIVER' },
      },
    },
  })

  return {
    id: driver.id,
    slug: driver.slug,
    telegramLinkCode: driver.telegramLinkCode,
  }
})

function randomCode(): string {
  return Math.random().toString(36).slice(2, 10)
}
