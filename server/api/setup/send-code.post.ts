import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { prisma } from '~/server/utils/prisma'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { findDriverBySetupToken, hashSetupCode } from '~/server/utils/setup'
import {
  SETUP_CODE_TTL_MS,
  codeFromRandomBytes,
  maskEmail,
  resendWaitSeconds,
} from '~/lib/setup-code'

// Envoi du code de vérification à l'email du compte — uniquement à la demande
// du chauffeur (bouton « Recevoir mon code »). Un nouvel envoi remplace le
// code précédent et remet le compteur d'essais à zéro.
const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Lien invalide.') })

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Lien invalide.' })

  const driver = await findDriverBySetupToken(body.data.token)
  const { setupCodeSentAt } = await prisma.driver.findUniqueOrThrow({
    where: { id: driver.id },
    select: { setupCodeSentAt: true },
  })
  const wait = resendWaitSeconds(setupCodeSentAt)
  if (wait > 0) {
    throw createError({
      statusCode: 429,
      statusMessage: `Un code vient d'être envoyé. Patientez ${wait} s avant d'en redemander un.`,
    })
  }

  const code = codeFromRandomBytes(randomBytes(4))
  const now = new Date()
  await prisma.driver.update({
    where: { id: driver.id },
    data: {
      setupCodeHash: hashSetupCode(code, body.data.token),
      setupCodeExpiresAt: new Date(now.getTime() + SETUP_CODE_TTL_MS),
      setupCodeSentAt: now,
      setupCodeAttempts: 0,
    },
  })

  const firstName = driver.displayName.trim().split(/\s+/)[0] || 'Bonjour'
  const config = useRuntimeConfig()
  const tpl = emailTemplates.setupCode({ firstName, code, ttlMinutes: SETUP_CODE_TTL_MS / 60000 })
  const { sent } = await sendEmail({ to: driver.user.email, ...tpl })
  // Sans service d'email configuré (dev, tests) : le code n'est visible que
  // dans les journaux du serveur.
  if (!sent && !config.resendApiKey) console.info(`[setup-code:dev] ${driver.slug} → ${code}`)

  return { ok: true, maskedEmail: maskEmail(driver.user.email), resendAfterSeconds: resendWaitSeconds(now) }
})
