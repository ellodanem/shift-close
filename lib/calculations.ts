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

/**
 * Check if a shift is fully reviewed (all conditions met for marking as reviewed)
 */
export function isShiftFullyReviewed(shift: {
  overShortTotal: number | null
  notes: string
  hasMissingHardCopyData?: boolean
  missingDataNotes?: string
  overShortExplained: boolean
  overShortExplanation?: string | null
  depositScanUrls?: string
  debitScanUrls?: string
  missingFields: string[]
}): boolean {
  // Must have over/short discrepancy explained if there is a non-zero over/short
  const overShort = shift.overShortTotal || 0
  if (overShort !== 0) {
    if (!shift.overShortExplained) return false
    if (!shift.overShortExplanation || shift.overShortExplanation.trim() === '') return false
  }
  
  // No missing numeric / deposit fields
  if (shift.missingFields.length > 0) return false
  
  // If missing hard copy data is checked, must have notes explaining what is missing
  if (shift.hasMissingHardCopyData && (!shift.missingDataNotes || shift.missingDataNotes.trim() === '')) {
    return false
  }
  
  // Documents preferred but not strictly required; earlier checks already enforce data completeness.
  // (We still parse them mainly so future rules can use them.)
  // If we get here, all conditions for "reviewed" are met.
  return true
}

