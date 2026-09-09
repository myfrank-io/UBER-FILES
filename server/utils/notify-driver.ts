import { prisma } from './prisma'
import { sendEmail } from './email'
import { sendTelegramMessage, type InlineButton } from './telegram'
import { sendPushToDriver, type PushPayload } from './push'

// Canal de notification chauffeur. L'email est le canal principal (fiable, avec
// trace). Telegram s'ajoute par chauffeur : dès qu'un chauffeur a lié son compte
// (telegramChatId présent), il reçoit aussi ses notifications sur Telegram.
// Le push (app installée, PWA) s'ajoute de même, appareil par appareil, dès que
// le chauffeur a activé les notifications dans ses réglages.

interface DriverContact {
  id: string
  contactEmail: string | null
  telegramChatId: string | null
}

/** Adresse de notification : email de contact du profil, sinon email de connexion. */
export async function driverNotifyEmail(
  driver: Pick<DriverContact, 'id' | 'contactEmail'>,
): Promise<string | null> {
  if (driver.contactEmail) return driver.contactEmail
  const user = await prisma.user.findUnique({
    where: { driverId: driver.id },
    select: { email: true },
  })
  return user?.email ?? null
}

export async function notifyDriver(
  driver: DriverContact,
  message: {
    email: { subject: string; html: string }
    telegram?: { text: string; buttons?: InlineButton[][] }
    push?: PushPayload
  },
): Promise<void> {
  const to = await driverNotifyEmail(driver)
  if (to) await sendEmail({ to, ...message.email })
  // Canal Telegram : uniquement pour les chauffeurs ayant lié leur compte.
  if (message.telegram && driver.telegramChatId) {
    await sendTelegramMessage(driver.telegramChatId, message.telegram.text, message.telegram.buttons)
  }
  // Canal push : appareils où le chauffeur a activé les notifications de l'app.
  // Un échec d'envoi ne doit jamais bloquer le flux métier.
  if (message.push) {
    try {
      await sendPushToDriver(driver.id, message.push)
    } catch (err) {
      console.error('[push] échec', err)
    }
  }
}
