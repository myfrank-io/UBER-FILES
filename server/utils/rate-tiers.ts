import { z } from 'zod'

/**
 * Paliers dégressifs d'une bande de transfert, envoyés du premier au dernier.
 * Règles : 2 à 5 paliers ; chaque palier est borné (`uptoKm`, en km, seuils
 * strictement croissants) sauf le dernier, illimité (`uptoKm: null`).
 * Une liste vide = prix unique (pas de grille).
 */
export const tiersSchema = z
  .array(
    z.object({
      uptoKm: z.number().int().min(1).max(10_000).nullable(),
      pricePerKmCents: z.number().int().min(1),
    }),
  )
  .max(5, '5 paliers maximum.')
  .superRefine((tiers, ctx) => {
    if (tiers.length === 0) return
    if (tiers.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une grille dégressive doit avoir au moins 2 paliers.',
      })
      return
    }
    tiers.forEach((t, i) => {
      const isLast = i === tiers.length - 1
      if (isLast && t.uptoKm != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Le dernier palier doit être sans limite de distance.',
        })
      }
      if (!isLast && t.uptoKm == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seul le dernier palier peut être sans limite de distance.',
        })
      }
      const prev = tiers[i - 1]
      if (i > 0 && t.uptoKm != null && prev.uptoKm != null && t.uptoKm <= prev.uptoKm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Les seuils de distance doivent être strictement croissants.',
        })
      }
    })
  })

export type TiersInput = z.infer<typeof tiersSchema>

/** Lignes de création Prisma pour une grille validée (position = ordre d'envoi). */
export function tierCreateData(tiers: TiersInput) {
  return tiers.map((t, position) => ({
    uptoKm: t.uptoKm,
    pricePerKmCents: t.pricePerKmCents,
    position,
  }))
}
