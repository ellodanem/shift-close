import { prisma } from '@/lib/prisma'
import { pickMeterCarry, type MeterCarry } from '@/lib/shift-meter'

export async function findMeterCarry(current: {
  date: string
  shift: string
  excludeId?: string
}): Promise<MeterCarry> {
  const rows = await prisma.shiftClose.findMany({
    where: {
      date: { lte: current.date },
      ...(current.excludeId ? { NOT: { id: current.excludeId } } : {}),
      OR: [{ unleadedMeterClose: { not: null } }, { dieselMeterClose: { not: null } }]
    },
    select: {
      date: true,
      shift: true,
      unleadedMeterClose: true,
      dieselMeterClose: true
    },
    orderBy: { date: 'desc' },
    take: 60
  })

  return pickMeterCarry(rows, current)
}
