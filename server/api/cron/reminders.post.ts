import {
  sendDueReminders,
  sendPreRideAlerts,
  sendQuoteExpiryReminders,
  sendExpiredQuoteNotices,
  sendWeeklyDriverRecap,
} from '~/server/utils/reminders'

// Déclencheur des tâches planifiées, à appeler toutes les heures par un cron
// externe (GitHub Action) :
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/reminders
// Lance les passes (chacune idempotente) :
//  - rappel J-1 client (email)
//  - alerte pré-course chauffeur ~H-2 (email + Telegram, liens de navigation)
//  - relance des devis non payés expirant sous 6 h (email client + lien de paiement)
//  - notice « devis expiré » (email client + lien pour refaire une demande)
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const auth = getHeader(event, 'authorization')
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Non autorisé.' })
  }
  const reminders = await sendDueReminders()
  const preRide = await sendPreRideAlerts()
  const quoteReminders = await sendQuoteExpiryReminders()
  const expiredNotices = await sendExpiredQuoteNotices()
  const weeklyRecaps = await sendWeeklyDriverRecap()
  return {
    remindersSent: reminders.sent,
    preRideAlertsSent: preRide.sent,
    quoteRemindersSent: quoteReminders.sent,
    expiredNoticesSent: expiredNotices.sent,
    weeklyRecapsSent: weeklyRecaps.sent,
  }
})
