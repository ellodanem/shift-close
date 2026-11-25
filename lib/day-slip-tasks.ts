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

/** Night-drop paper is asked for whenever cash or cards left the station — same days as security. */
export function needsDepositSlip(day: Pick<DayReport, 'totals'>): boolean {
  return needsSecuritySlip(day)
}

/**
 * The papers still required on an End of Day card.
 * Matches the shift-close checklist: one pile per kind, not one photo per deposit line.
 * Deposit is listed even when the entered amount is still $0, so the slip can be filed
 * before deposit totals are typed in. An open missing-deposit alert keeps the row unfinished.
 */
export function slipTasksForDay(day: DayReport): SlipTask[] {
  const tasks: SlipTask[] = []

  if (needsDepositSlip(day)) {
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

export type SlipIconTone = 'uploaded' | 'noted' | 'missing'

/** The written exception, when staff marked the slip done without a photo. */
export function slipWaiverNote(day: DayReport, id: SlipTaskId): string {
  if (id === 'debit') return (day.debitScanWaiverNote ?? '').trim()
  if (id === 'security') return (day.securityScanWaiverNote ?? '').trim()
  return ''
}

/** Green when a photo is in. Yellow when there is no photo but a note. Grey when it is missing. */
export function slipIconTone(day: DayReport, task: SlipTask): SlipIconTone {
  if (task.photoCount > 0) return 'uploaded'
  if (task.waived && slipWaiverNote(day, task.id)) return 'noted'
  return 'missing'
}
