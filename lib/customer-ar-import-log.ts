import { prisma } from '@/lib/prisma'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { weekKeyMonday } from '@/lib/operations-checklist-due-dates'

export async function recordCustomerArCsvImport(params: {
  year: number
  month: number
  accountCount: number
  accountsWithCharges: number
  userId?: string | null
  importedAt?: Date
}) {
  const asOf = businessTodayYmd(params.importedAt ?? new Date())
  const weekKey = weekKeyMonday(asOf)

  return prisma.customerArImportLog.upsert({
    where: {
      customer_ar_import_week_month: {
        weekKey,
        year: params.year,
        month: params.month
      }
    },
    create: {
      weekKey,
      year: params.year,
      month: params.month,
      accountCount: params.accountCount,
      accountsWithCharges: params.accountsWithCharges,
      userId: params.userId ?? null,
      importedAt: params.importedAt ?? new Date()
    },
    update: {
      accountCount: params.accountCount,
      accountsWithCharges: params.accountsWithCharges,
      userId: params.userId ?? null,
      importedAt: params.importedAt ?? new Date()
    }
  })
}

export function countAccountsWithCharges(
  rows: { charges: number }[]
): number {
  return rows.filter((r) => r.charges > 0).length
}
