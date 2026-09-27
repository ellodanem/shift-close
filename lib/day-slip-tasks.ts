import type { DayReport } from '@/lib/types'
import { isDebitScanComplete } from '@/lib/day-scan-status'

export type SlipTaskId = 'deposit' | 'debit' | 'security'

export type SlipTask = {
  id: SlipTaskId
  done: boolean
  photoCount: number
  /** Exception recorded and there is no photo in this pile. */
  waived: boolean
}

function needsCardSlip(day: Pick<DayReport, 'totals'>): boolean {
  return day.totals.totalDebit > 0 || day.totals.totalCredit > 0
}

function needsSecuritySlip(day: Pick<DayReport, 'totals'>): boolean {
  return day.totals.totalDeposits > 0 || needsCardSlip(day)
}

/**
 * The papers still required on an End of Day card.
 * Matches the shift-close checklist: one pile per kind, not one photo per deposit line.
 * An open missing-deposit alert keeps the deposit row unfinished even when other photos exist.
 */
export function slipTasksForDay(day: DayReport): SlipTask[] {
  const tasks: SlipTask[] = []

  if (day.totals.totalDeposits > 0) {
    const alertOpen = day.missingDepositSlipAlertOpen === true
    const waived = day.depositSlipUnavailableReason != null && !alertOpen
    const photoCount = day.depositScans.length
    tasks.push({
      id: 'deposit',
      done: !alertOpen && (photoCount > 0 || waived),
      photoCount,
      waived
    })
  }

  if (needsCardSlip(day)) {
    const photoCount = day.debitScans.length
    tasks.push({
      id: 'debit',
      done: isDebitScanComplete(day),
      photoCount,
      waived: day.debitScanWaived === true && photoCount === 0
    })
  }

  if (needsSecuritySlip(day)) {
    const photoCount = day.securityScans?.length ?? 0
    const waived = day.securityScanWaived === true && photoCount === 0
    tasks.push({
      id: 'security',
      done: photoCount > 0 || day.securityScanWaived === true,
      photoCount,
      waived
    })
  }

  return tasks
}

export function slipsStillNeeded(day: DayReport): number {
  return slipTasksForDay(day).filter((task) => !task.done).length
}
