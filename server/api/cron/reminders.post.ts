import { sendDueReminders } from '~/server/utils/reminders'

// Déclencheur des rappels J-1. À appeler par un cron externe (ou GitHub Action) :
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/reminders
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const auth = getHeader(event, 'authorization')
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Non autorisé.' })
  }
  return sendDueReminders()
})
