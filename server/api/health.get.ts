import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  let db: 'ok' | 'error' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = 'error'
  }

  setResponseStatus(event, db === 'ok' ? 200 : 503)

  return {
    status: db === 'ok' ? 'ok' : 'degraded',
    db,
    ts: new Date().toISOString(),
  }
})
