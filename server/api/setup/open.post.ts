import { z } from 'zod'
import { prisma } from '~/server/utils/prisma'
import { findDriverBySetupToken, openSetupSession } from '~/server/utils/setup'
import { maskEmail } from '~/lib/setup-code'

// Ouverture du parcours par le lien de configuration. Trois cas :
//  - un admin est connecté sur cet appareil (il teste le lien) : session
//    chauffeur ouverte tout de suite, identité admin conservée (`impersonator`) ;
//  - ce chauffeur est déjà connecté ici (code déjà validé, ou login classique) :
//    on ouvre directement ;
//  - sinon, il doit d'abord recevoir un code sur l'email de son compte
//    (POST send-code) et le saisir (POST verify-code). Rien n'est envoyé ici.
const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Lien invalide.') })

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Lien invalide.' })

  const driver = await findDriverBySetupToken(body.data.token)

  const current = await getUserSession(event)
  const currentUser = current.user as { id: string; email: string; role: string; driverId?: string | null } | undefined

  if (currentUser?.role === 'ADMIN') {
    await openSetupSession(event, driver, { id: currentUser.id, email: currentUser.email })
    return { opened: true, slug: driver.slug }
  }
  if (currentUser?.role === 'DRIVER' && currentUser.driverId === driver.id) {
    await openSetupSession(event, driver)
    return { opened: true, slug: driver.slug }
  }

  const firstName = driver.displayName.trim().split(/\s+/)[0] || 'Bonjour'
  const { setupCodeSentAt } = await prisma.driver.findUniqueOrThrow({
    where: { id: driver.id },
    select: { setupCodeSentAt: true },
  })
  return {
    opened: false,
    firstName,
    maskedEmail: maskEmail(driver.user.email),
    // Un code a-t-il déjà été demandé récemment (retour sur la page) ?
    codeSentAt: setupCodeSentAt,
  }
})
