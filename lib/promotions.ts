import { prisma } from '@/lib/prisma'

export const PROMOTION_STATUSES = ['active', 'completed'] as const
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number]

export function isPromotionStatus(value: unknown): value is PromotionStatus {
  return typeof value === 'string' && (PROMOTION_STATUSES as readonly string[]).includes(value)
}

const BUS_DRIVER_GAS_SEED = {
  slug: 'bus-driver-gas',
  name: 'Bus Driver Gas',
  details:
    'Every other week we give bus drivers gas. Bus drivers enter the draw; a winner is selected each cycle.',
  drawDetails: 'Draw held every other week.',
  status: 'active' as const,
  sortOrder: 0
}

/** Ensure built-in promotions exist (idempotent). */
export async function ensureDefaultPromotions() {
  await prisma.promotion.upsert({
    where: { slug: BUS_DRIVER_GAS_SEED.slug },
    create: BUS_DRIVER_GAS_SEED,
    update: {}
  })
}

export const promotionDetailInclude = {
  draws: {
    orderBy: { drawDate: 'desc' as const },
    include: {
      winners: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          staff: { select: { id: true, name: true } }
        }
      }
    }
  }
}
