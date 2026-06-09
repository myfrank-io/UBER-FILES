import type { H3Event } from 'h3'

// Helpers d'autorisation côté serveur. S'appuient sur la session scellée de nuxt-auth-utils.

export interface SessionUser {
  id: string
  email: string
  role: 'ADMIN' | 'DRIVER'
  driverId: string | null
}

/** Exige une session valide ; renvoie l'utilisateur. */
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const session = await requireUserSession(event)
  return session.user as SessionUser
}

/** Exige un chauffeur connecté ; renvoie son driverId (garantit l'isolation tenant). */
export async function requireDriverId(event: H3Event): Promise<string> {
  const user = await requireUser(event)
  if (user.role !== 'DRIVER' || !user.driverId) {
    throw createError({ statusCode: 403, statusMessage: 'Accès réservé aux chauffeurs.' })
  }
  return user.driverId
}

/** Exige un admin connecté. */
export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event)
  if (user.role !== 'ADMIN') {
    throw createError({ statusCode: 403, statusMessage: 'Accès réservé à l’administration.' })
  }
  return user
}
