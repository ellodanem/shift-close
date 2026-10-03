import { businessTodayYmd } from '@/lib/datetime-policy'

export function harvestSyncMonthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1, 12))
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function currentHarvestSyncMonth(now = new Date()): { year: number; month: number } {
  const ymd = businessTodayYmd(now)
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) }
}

export function previousHarvestSyncMonth(year: number, month: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 2, 1, 12))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}
