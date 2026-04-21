import { ShiftCloseInput, ShiftCloseWithCalculations } from './types'

export function calculateShiftClose(input: ShiftCloseInput): Omit<ShiftCloseWithCalculations, 'id' | 'createdAt'> {
  // Helper to convert NaN to 0 for calculations
  const safeNum = (val: number): number => (Number.isNaN(val) ? 0 : val)
  
  const countCash = safeNum(input.countCash)
  const systemCash = safeNum(input.systemCash)
  const countChecks = safeNum(input.countChecks)
  const systemChecks = safeNum(input.systemChecks)
  
  const overShortCash = countCash - systemCash
  const overShortChecks = countChecks - systemChecks
  const overShortTotal = overShortCash + overShortChecks
  // Handle deposits - can be array or string (from database)
  let depositsArray: number[] = []
  if (Array.isArray(input.deposits)) {
    depositsArray = input.deposits
  } else if (typeof input.deposits === 'string') {
    try {
      depositsArray = JSON.parse(input.deposits || '[]')
    } catch {
      depositsArray = []
    }
  }
  // Filter out only NaN, null, undefined - keep 0 as valid
  const totalDeposits = depositsArray
    .filter(d => d !== null && d !== undefined && !Number.isNaN(d))
    .reduce((sum, d) => sum + safeNum(d), 0)
  
  // Red flag: Over/Short not zero and not yet explained/reviewed
  const hasRedFlag = overShortTotal !== 0 && !input.overShortExplained
  
  return {
    ...input,
    overShortCash,
    overShortTotal,
    totalDeposits,
    hasRedFlag
  }
}

/**
 * Computes the net (unexplained) Over/Short after applying Account Activity items.
 * noteOnly items (e.g. debit received) do not affect the math.
 */
export function computeNetOverShort(
  rawOS: number,
  items: Array<{ type: string; amount: number; noteOnly?: boolean }>
): number {
  const explained = items
    .filter(i => !i.noteOnly)
    .reduce((sum, i) => sum + (i.type === 'overage' ? i.amount : -i.amount), 0)
  return rawOS - explained
}

/**
 * Signed dollar change in the running tally (additive model):
 * - Shortage row: +amount (explains missing cash / money out — moves balance toward zero when raw is short)
 * - Overage row: −amount (explains extra cash — moves balance toward zero when raw is over)
 * Note-only rows do not contribute.
 */
export function getOverShortSignedContribution(item: {
  type: string
  amount: number
  noteOnly?: boolean
}): number | null {
  if (item.noteOnly) return null
  return item.type === 'shortage' ? item.amount : -item.amount
}

/**
 * Running balance after each item (for display). Same math as: raw + sum(signed contributions) = net unexplained.
 */
export function computeOverShortTally<T extends { type: string; amount: number; noteOnly?: boolean }>(
  rawOS: number,
  items: T[]
): Array<{ item: T; balanceAfter: number }> {
  const result: Array<{ item: T; balanceAfter: number }> = []
  let balance = rawOS
  for (const i of items) {
    const contribution = getOverShortSignedContribution(i)
    if (contribution === null) continue
    balance += contribution
    result.push({ item: i, balanceAfter: balance })
  }
  return result
}

export function getStatusColor(overShort: number, isExplained: boolean): "green" | "amber" | "red" {
  if (overShort === 0) return "green"
  if (isExplained) return "amber"
  return "red"
}

export function getMissingFields(shift: {
  systemCash: number
  systemChecks: number
  systemCredit: number
  systemDebit: number
  otherCredit: number
  systemInhouse: number
  systemFleet: number
  systemMassyCoupons: number
  countCash: number
  countChecks: number
  countCredit: number
  countInhouse: number
  countFleet: number
  countMassyCoupons: number
  unleaded: number
  diesel: number
  deposits: string | number[]
}): string[] {
  const missing: string[] = []
  
  // Helper to check if value is missing (NaN, null, or undefined)
  const isMissing = (val: number): boolean => {
    return val === null || val === undefined || isNaN(val)
  }
  
  // Main table fields
  if (isMissing(shift.countCash)) missing.push('Count Cash')
  if (isMissing(shift.systemCash)) missing.push('System Cash')
  if (isMissing(shift.countChecks)) missing.push('Count Checks')
  if (isMissing(shift.systemChecks)) missing.push('System Checks')
  if (isMissing(shift.countCredit)) missing.push('Count Credits')
  if (isMissing(shift.systemCredit)) missing.push('System Credits')
  if (isMissing(shift.countInhouse)) missing.push('Count In-House')
  if (isMissing(shift.systemInhouse)) missing.push('System In-House')
  if (isMissing(shift.countFleet)) missing.push('Count Fleets')
  if (isMissing(shift.systemFleet)) missing.push('System Fleets')
  if (isMissing(shift.countMassyCoupons)) missing.push('Count Massy Coupons')
  if (isMissing(shift.systemMassyCoupons)) missing.push('System Massy Coupons')
  
  // Other items
  if (isMissing(shift.otherCredit)) missing.push('Credit (Other Items)')
  if (isMissing(shift.systemDebit)) missing.push('Debit')
  if (isMissing(shift.unleaded)) missing.push('Unleaded')
  if (isMissing(shift.diesel)) missing.push('Diesel')
  
  // Deposits (check if array is empty or all zeros/NaN)
  try {
    const deposits = Array.isArray(shift.deposits) ? shift.deposits : JSON.parse(shift.deposits as string)
    if (!Array.isArray(deposits) || deposits.length === 0 || deposits.every(d => d === 0 || isNaN(d) || d === null)) {
      missing.push('Deposits')
    }
  } catch {
    missing.push('Deposits')
  }
  
  return missing
}

/**
 * Check if a shift can be closed (all required fields filled, notes if Over/Short ≠ 0)
 */
export function canCloseShift(shift: {
  supervisor?: string
  systemCash: number
  systemChecks: number
  systemCredit: number
  systemDebit: number
  otherCredit: number
  systemInhouse: number
  systemFleet: number
  systemMassyCoupons: number
  countCash: number
  countChecks: number
  countCredit: number
  countInhouse: number
  countFleet: number
  countMassyCoupons: number
  unleaded: number
  diesel: number
  deposits: string | number[]
  notes: string
  overShortTotal?: number | null
}): {
  canClose: boolean
  missingFields: string[]
  requiresNotes: boolean
} {
  const missingFields: string[] = []
  
  // Supervisor must be selected
  if (!shift.supervisor || !shift.supervisor.trim()) {
    missingFields.push('Supervisor')
  }
  
  // Helper to check if value is missing (NaN, null, or undefined)
  const isMissing = (val: number): boolean => {
    return val === null || val === undefined || isNaN(val)
  }
  
  // Check all numeric fields
  const numericFields = [
    { key: 'systemCash', label: 'System Cash' },
    { key: 'countCash', label: 'Count Cash' },
    { key: 'systemChecks', label: 'System Checks' },
    { key: 'countChecks', label: 'Count Checks' },
    { key: 'systemCredit', label: 'System Credit' },
    { key: 'countCredit', label: 'Count Credit' },
    { key: 'systemInhouse', label: 'System In-House' },
    { key: 'countInhouse', label: 'Count In-House' },
    { key: 'systemFleet', label: 'System Fleet' },
    { key: 'countFleet', label: 'Count Fleet' },
    { key: 'systemMassyCoupons', label: 'System Massy Coupons' },
    { key: 'countMassyCoupons', label: 'Count Massy Coupons' },
    { key: 'systemDebit', label: 'System Debit' },
    { key: 'otherCredit', label: 'Other Credit' },
    { key: 'unleaded', label: 'Unleaded' },
    { key: 'diesel', label: 'Diesel' }
  ]
  
  numericFields.forEach(({ key, label }) => {
    const value = shift[key as keyof typeof shift] as number
    if (isMissing(value)) {
      missingFields.push(label)
    }
  })
  
  // Check deposits (at least one must be entered, even if 0)
  try {
    const deposits = Array.isArray(shift.deposits) ? shift.deposits : JSON.parse(shift.deposits as string)
    if (!Array.isArray(deposits) || deposits.length === 0) {
      missingFields.push('Deposits (at least one required)')
    }
  } catch {
    missingFields.push('Deposits (at least one required)')
  }
  
  return {
    canClose: missingFields.length === 0,
    missingFields,
    requiresNotes: false
  }
}

/** Dollar band for “small” over/short coloring on lists and summaries (±this amount). */
export const OS_REVIEW_THRESHOLD = 30

export function isOsReviewedSet(osReviewed: number | null | undefined): boolean {
  return osReviewed !== null && osReviewed !== undefined
}

/**
 * Amount shown on shift list / aggregates: manual reviewed figure when set, otherwise raw count-vs-system total.
 */
export function getListDisplayOverShort(shift: {
  overShortTotal: number | null | undefined
  osReviewed?: number | null
}): number {
  if (isOsReviewedSet(shift.osReviewed)) return shift.osReviewed as number
  return shift.overShortTotal ?? 0
}

export type ShiftListOkKind = 'needs_review' | 'ok_green' | 'ok_blue'

/** Closed-shift OK / needs-review for shift list (draft / reopened / reviewed are handled by caller). */
export function getShiftListOkKind(shift: {
  status?: string
  notes: string
  osReviewed?: number | null
  osLegitAsIs?: boolean
}): ShiftListOkKind {
  if (shift.osLegitAsIs) return 'ok_green'
  if (isOsReviewedSet(shift.osReviewed)) {
    const hasNotes = (shift.notes || '').trim().length > 0
    return hasNotes ? 'ok_green' : 'ok_blue'
  }
  return 'needs_review'
}

/**
 * Manager “Reviewed” status: structural fields complete plus an O/S resolution path
 * (manual reviewed amount + notes, or “legit as-is” checkbox).
 */
export function isShiftFullyReviewed(shift: {
  notes: string
  hasMissingHardCopyData?: boolean
  missingDataNotes?: string
  missingFields: string[]
  osReviewed?: number | null
  osLegitAsIs?: boolean
}): boolean {
  if (shift.missingFields.length > 0) return false

  if (shift.hasMissingHardCopyData && (!shift.missingDataNotes || shift.missingDataNotes.trim() === '')) {
    return false
  }

  if (shift.osLegitAsIs) return true
  if (isOsReviewedSet(shift.osReviewed) && (shift.notes || '').trim() !== '') return true
  return false
}

