import type { Prisma, PrismaClient } from '@prisma/client'
import {
  departmentRowsForPersist,
  departmentSalesSnapshot,
  mergeDepartmentSales,
  type FuelQty,
  type ShiftSaleRow
} from '@/lib/shift-sales'

type DbClient = PrismaClient | Prisma.TransactionClient

export const shiftSalesInclude = {
  orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }]
}

/** Replace department-total rows (posKey '') for a shift. POS SKU lines are left alone. */
export async function replaceDepartmentSales(
  db: DbClient,
  shiftId: string,
  input: unknown,
  fuel: FuelQty
): Promise<{ snapshotBefore: string; snapshotAfter: string; changed: boolean }> {
  const existing = await db.shiftSale.findMany({
    where: { shiftId, posKey: '' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  })
  const existingRows: ShiftSaleRow[] = existing.map((row) => ({
    category: row.category,
    label: row.label,
    quantity: row.quantity,
    unit: row.unit,
    amount: row.amount,
    source: row.source === 'pos' ? 'pos' : 'manual',
    posKey: row.posKey,
    sortOrder: row.sortOrder
  }))
  const snapshotBefore = departmentSalesSnapshot(mergeDepartmentSales(existingRows, fuel))
  const nextRows = departmentRowsForPersist(input, fuel)
  if (nextRows.length === 0) {
    return { snapshotBefore, snapshotAfter: snapshotBefore, changed: false }
  }
  const snapshotAfter = departmentSalesSnapshot(mergeDepartmentSales(nextRows, fuel))
  if (existing.length > 0 && snapshotBefore === snapshotAfter) {
    return { snapshotBefore, snapshotAfter, changed: false }
  }

  await db.shiftSale.deleteMany({ where: { shiftId, posKey: '' } })
  for (const row of nextRows) {
    await db.shiftSale.create({
      data: {
        shiftId,
        category: row.category,
        label: row.label,
        quantity: row.quantity,
        unit: row.unit,
        amount: row.amount,
        source: row.source,
        posKey: '',
        sortOrder: row.sortOrder
      }
    })
  }
  return { snapshotBefore, snapshotAfter, changed: snapshotBefore !== snapshotAfter }
}
