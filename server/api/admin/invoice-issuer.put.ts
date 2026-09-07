import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { missingIssuerFields } from '~/server/utils/invoice'
import { isValidSiret, normalizeSiret } from '~/lib/invoice'

// Identité légale imprimée sur les factures. En base et non en variables
// d'environnement : ce sont des coordonnées personnelles, et les corriger ne
// doit pas demander un redéploiement.
const schema = z.object({
  name: z.string().trim().max(160).default(''),
  legalForm: z.string().trim().max(40).default(''),
  email: z.union([z.string().trim().email('Email de l’émetteur invalide.'), z.literal('')]).default(''),
  phone: z.string().trim().max(40).default(''),
  addressLine: z.string().trim().max(200).default(''),
  postalCode: z.string().trim().max(12).default(''),
  city: z.string().trim().max(100).default(''),
  siret: z.string().trim().max(20).default(''),
  vatNumber: z.string().trim().max(30).nullable().default(null),
  numberPrefix: z.string().trim().max(40).default(''),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  const data = { ...body.data, siret: normalizeSiret(body.data.siret) }
  // Un SIRET faux sur ses propres factures se propage à tous les documents :
  // on refuse plutôt que de l'imprimer.
  if (data.siret && !isValidSiret(data.siret)) {
    throw createError({ statusCode: 400, statusMessage: 'Ce SIRET est invalide (clé de contrôle).' })
  }

  const issuer = await prisma.invoiceIssuer.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  })

  return { ok: true, issuer: { ...issuer, missing: missingIssuerFields(issuer) } }
})
