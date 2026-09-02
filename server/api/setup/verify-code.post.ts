import { z } from 'zod'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '~/server/utils/prisma'
import { findDriverBySetupToken, hashSetupCode, openSetupSession } from '~/server/utils/setup'
import { checkCode, isCodeShape, normalizeCode } from '~/lib/setup-code'

// Vérification du code reçu par email : ouvre la session chauffeur du parcours
// (drapeau `setupFlow`). Le code prouve l'accès à la boîte mail du compte :
// l'adresse est donc considérée vérifiée. Après 5 échecs, le code est
// verrouillé — il faut en redemander un.
const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'Lien invalide.'),
  code: z.string().min(1).max(20),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Lien invalide.' })
  const code = normalizeCode(body.data.code)
  if (!isCodeShape(code)) {
    throw createError({ statusCode: 400, statusMessage: 'Le code comporte 6 chiffres.' })
  }

  const driver = await findDriverBySetupToken(body.data.token)
  const state = await prisma.driver.findUniqueOrThrow({
    where: { id: driver.id },
    select: { setupCodeHash: true, setupCodeExpiresAt: true, setupCodeAttempts: true },
  })

  const expected = Buffer.from(state.setupCodeHash ?? '', 'hex')
  const given = Buffer.from(hashSetupCode(code, body.data.token), 'hex')
  const matches = expected.length > 0 && expected.length === given.length && timingSafeEqual(expected, given)

  const verdict = checkCode({
    hasCode: Boolean(state.setupCodeHash),
    expiresAt: state.setupCodeExpiresAt,
    attempts: state.setupCodeAttempts,
    matches,
  })

  if (verdict === 'mismatch') {
    await prisma.driver.update({
      where: { id: driver.id },
      data: { setupCodeAttempts: { increment: 1 } },
    })
  }
  if (verdict !== 'ok') {
    const messages: Record<Exclude<typeof verdict, 'ok'>, string> = {
      none: 'Demandez d’abord un code.',
      expired: 'Ce code a expiré. Demandez-en un nouveau.',
      locked: 'Trop d’essais. Demandez un nouveau code.',
      mismatch: 'Code incorrect. Vérifiez les 6 chiffres reçus par email.',
    }
    throw createError({ statusCode: 400, statusMessage: messages[verdict] })
  }

  await prisma.$transaction([
    prisma.driver.update({
      where: { id: driver.id },
      data: { setupCodeHash: null, setupCodeExpiresAt: null, setupCodeAttempts: 0 },
    }),
    // Le code a été lu dans cette boîte : l'adresse du compte est vérifiée.
    prisma.user.update({
      where: { id: driver.user.id },
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null },
    }),
  ])

  await openSetupSession(event, driver)
  return { ok: true, slug: driver.slug }
})
