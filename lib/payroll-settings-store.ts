import { prisma } from '@/lib/prisma'
import {
  PAYROLL_OVERTIME_MULTIPLIER_KEY,
  normalizeOvertimeMultiplier
} from '@/lib/payroll-settings'

export async function readOvertimeMultiplier(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: PAYROLL_OVERTIME_MULTIPLIER_KEY }
  })
  return normalizeOvertimeMultiplier(row?.value)
}
