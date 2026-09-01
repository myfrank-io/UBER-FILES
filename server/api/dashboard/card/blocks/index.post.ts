import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { loadOrCreateCardProfile, serializeBlock, MAX_BLOCKS } from '~/server/utils/card'
import {
  CARD_BLOCK_KINDS,
  SINGLETON_KINDS,
  normalizeBlock,
  defaultBlockLabel,
  type CardBlockKind,
} from '~/lib/card-blocks'
import type { Prisma } from '@prisma/client'

const schema = z.object({
  kind: z.enum(CARD_BLOCK_KINDS),
  label: z.string().max(80).nullish(),
  value: z.string().max(5000).nullish(),
  data: z.record(z.unknown()).nullish(),
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

  if (profile.blocks.length >= MAX_BLOCKS) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cette carte a atteint sa limite de ${MAX_BLOCKS} blocs.`,
    })
  }

  const kind = body.data.kind as CardBlockKind

  // Les blocs dérivés du profil n'ont de sens qu'en un seul exemplaire.
  if (SINGLETON_KINDS.includes(kind) && profile.blocks.some((b) => b.kind === kind)) {
    throw createError({
      statusCode: 400,
      statusMessage: `« ${defaultBlockLabel(kind)} » est déjà présent sur votre carte.`,
    })
  }

  const normalized = normalizeBlock({
    kind,
    label: body.data.label,
    value: body.data.value,
    data: body.data.data ?? null,
  })
  if (!normalized.ok) {
    throw createError({ statusCode: 400, statusMessage: normalized.error })
  }

  // Ajout en fin de liste.
  const nextPosition = profile.blocks.reduce((max, b) => Math.max(max, b.position), -1) + 1

  const created = await prisma.cardBlock.create({
    data: {
      profileId: profile.id,
      kind,
      label: normalized.block.label,
      value: normalized.block.value,
      data: (normalized.block.data ?? undefined) as Prisma.InputJsonValue | undefined,
      position: nextPosition,
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

  return { ok: true, block: serializeBlock(created) }
})
