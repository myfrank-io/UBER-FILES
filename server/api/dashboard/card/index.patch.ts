import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { loadOrCreateCardProfile } from '~/server/utils/card'
import { CARD_THEMES } from '~/lib/card-themes'

const schema = z.object({
  theme: z
    .string()
    .refine((v) => CARD_THEMES.some((t) => t.key === v), 'Thème inconnu.')
    .optional(),
  headline: z.string().max(120).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  published: z.boolean().optional(),
  logoPlate: z.boolean().optional(),
})

/** Chaîne vide (ou blanche) = champ effacé. */
function blankToNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const profile = await loadOrCreateCardProfile(driverId)

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }
  const { theme, headline, company, published, logoPlate } = body.data

  const updated = await prisma.cardProfile.update({
    where: { id: profile.id },
    data: {
      ...(theme !== undefined ? { theme } : {}),
      ...(headline !== undefined ? { headline: blankToNull(headline) } : {}),
      ...(company !== undefined ? { company: blankToNull(company) } : {}),
      ...(logoPlate !== undefined ? { logoPlate } : {}),
      ...(published !== undefined
        ? {
            published,
            // Date de première publication conservée ; repasser en brouillon
            // puis republier ne la réécrit pas.
            ...(published && !profile.publishedAt ? { publishedAt: new Date() } : {}),
          }
        : {}),
    },
    select: {
      published: true,
      publishedAt: true,
      theme: true,
      headline: true,
      company: true,
      logoPlate: true,
    },
  })

  return { ok: true, ...updated }
})
