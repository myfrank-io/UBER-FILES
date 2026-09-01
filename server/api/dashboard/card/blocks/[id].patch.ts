import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { serializeBlock } from '~/server/utils/card'
import { normalizeBlock, type CardBlockKind } from '~/lib/card-blocks'

const schema = z.object({
  label: z.string().max(80).nullish(),
  value: z.string().max(5000).nullish(),
  data: z.record(z.unknown()).nullish(),
  visible: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  // Isolation : le bloc n'est trouvé que s'il appartient à la carte du chauffeur
  // connecté — jamais de lecture par id seul.
  const existing = await prisma.cardBlock.findFirst({
    where: { id, profile: { driverId } },
    select: { id: true, kind: true, label: true, value: true, data: true },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Bloc introuvable.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }
  const patch = body.data

  // Le type d'un bloc ne change jamais : on revalide la fusion « existant +
  // modifications » avec les règles de son type d'origine.
  const merged = normalizeBlock({
    kind: existing.kind as CardBlockKind,
    label: patch.label !== undefined ? patch.label : existing.label,
    value: patch.value !== undefined ? patch.value : existing.value,
    data:
      patch.data !== undefined
        ? (patch.data ?? null)
        : ((existing.data ?? null) as Record<string, unknown> | null),
  })
  if (!merged.ok) {
    throw createError({ statusCode: 400, statusMessage: merged.error })
  }

  const updated = await prisma.cardBlock.update({
    where: { id },
    data: {
      label: merged.block.label,
      value: merged.block.value,
      data: (merged.block.data ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
      ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
    },
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

  return { ok: true, block: serializeBlock(updated) }
})
