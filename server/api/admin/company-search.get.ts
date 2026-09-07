import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { searchCompanies } from '~/server/utils/company-lookup'

// Pré-remplissage du bloc client d'une facture depuis l'annuaire des
// entreprises. Proxifié côté serveur : pas de CORS, et les erreurs de
// l'annuaire arrivent déjà en français.
const query = z.object({ q: z.string().trim().min(1).max(120) })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = query.safeParse(getQuery(event))
  if (!q.success) throw createError({ statusCode: 400, statusMessage: 'Recherche vide.' })
  return searchCompanies(q.data.q)
})
