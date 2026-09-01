import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { loadOrCreateCardProfile, serializeBlock, MAX_BLOCKS } from '~/server/utils/card'

const schema = z.object({
  // Liste complète des identifiants, dans le nouvel ordre.
  ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_BLOCKS),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const profile = await loadOrCreateCardProfile(driverId)

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }
  const ids = body.data.ids

  // L'ordre reçu doit être exactement une permutation des blocs de la carte :
  // ni doublon, ni bloc étranger, ni bloc oublié. Sinon on refuse tout — on ne
  // réordonne jamais partiellement.
  const own = profile.blocks.map((b) => b.id)
  const unique = new Set(ids)
  if (unique.size !== ids.length || ids.length !== own.length || !own.every((id) => unique.has(id))) {
    throw createError({ statusCode: 400, statusMessage: 'Ordre invalide.' })
  }

  await prisma.$transaction(
    ids.map((id, position) =>
      prisma.cardBlock.update({ where: { id }, data: { position } }),
    ),
  )

  const blocks = await prisma.cardBlock.findMany({
    where: { profileId: profile.id },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      kind: true,
      label: true,
      value: true,
      data: true,
      position: true,
      visible: true,
    },
  })

  return { ok: true, blocks: blocks.map(serializeBlock) }
})
