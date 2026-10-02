import { prisma } from '@/lib/prisma'
import {
  PAYROLL_OVERTIME_MULTIPLIER_KEY,
  PAYROLL_VACATION_HOURS_PER_DAY_KEY,
  normalizeOvertimeMultiplier
} from '@/lib/payroll-settings'
import { normalizeVacationHoursPerDay } from '@/lib/vacation-pay'

export async function readOvertimeMultiplier(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: PAYROLL_OVERTIME_MULTIPLIER_KEY }
  })
  return normalizeOvertimeMultiplier(row?.value)
}

export async function readVacationHoursPerDay(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: PAYROLL_VACATION_HOURS_PER_DAY_KEY }
  })
  return normalizeVacationHoursPerDay(row?.value)
}
