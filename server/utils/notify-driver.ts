import { prisma } from './prisma'
import { sendEmail } from './email'
import { sendTelegramMessage, type InlineButton } from './telegram'

// Canal de notification chauffeur. L'email est le canal principal : Telegram est
// coupé par défaut et ne repart que si TELEGRAM_NOTIFICATIONS_ENABLED=1.
// Le webhook Telegram et la liaison de compte restent actifs pour permettre une
// réactivation sans reconfiguration.

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
  },
): Promise<void> {
  const config = useRuntimeConfig()
  const to = await driverNotifyEmail(driver)
  if (to) await sendEmail({ to, ...message.email })
  if (config.telegramNotificationsEnabled && message.telegram && driver.telegramChatId) {
    await sendTelegramMessage(driver.telegramChatId, message.telegram.text, message.telegram.buttons)
  }
}
