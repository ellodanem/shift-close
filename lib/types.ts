export type ShiftType = "6-1" | "1-9" | "7:30 - 2"
// Status lifecycle:
// - draft: work in progress, fully editable
// - closed: data considered final (only notes / checkboxes editable)
// - reopened: previously closed shift that has been reopened for audited changes
// - reviewed: manager-level confirmation that the close is acceptable
export type ShiftStatus = "draft" | "closed" | "reopened" | "reviewed"

export interface ShiftCloseInput {
  date: string
  shift: ShiftType
  supervisor: string
  status?: ShiftStatus
  systemCash: number
  systemChecks: number
  systemCredit: number
  systemDebit: number
  otherCredit: number  // Credit in Other Items section (separate from Credits row)
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
  deposits: number[]
  notes: string
  depositScanUrls?: string[]
  debitScanUrls?: string[]
  hasMissingHardCopyData?: boolean
  missingDataNotes?: string
  overShortExplained?: boolean
  overShortExplanation?: string
}

export interface ShiftCloseWithCalculations extends ShiftCloseInput {
  id: string
  overShortCash: number
  overShortTotal: number
  totalDeposits: number
  createdAt: Date
  hasRedFlag: boolean
  status?: ShiftStatus
}

/** Shift row on End of Day: raw O/S plus optional manual review fields. */
export type DayReportShiftRow = ShiftCloseWithCalculations & {
  osReviewed?: number | null
  osLegitAsIs?: boolean
}

export interface DayReport {
  date: string
  dayType: "Standard" | "Custom"
  status: "Complete" | "Incomplete" | "Invalid mix"
  shifts: DayReportShiftRow[]
  totals: {
    /** Sum of count-vs-system over/short (raw) for the calendar day. */
    overShortTotal: number
    /**
     * Sum of disclosed reviewed amounts when every shift is resolved (reviewed figure or “legit as-is”).
     * Null when any shift is still undisclosed — collapsed End of Day should show “--” for O/S.
     */
    overShortDisclosedTotal: number | null
    totalDeposits: number
    totalCredit: number
    totalDebit: number
    systemCashTotal: number
    countCashTotal: number
    totalUnleaded: number
    totalDiesel: number
  }
  depositScans: string[]
  debitScans: string[]
  securityScans: string[]
  /** True when staff marked “no security pickup” for this calendar day (no scan file). */
  securityScanWaived?: boolean
  /** Optional note stored with the security scan waiver. */
  securityScanWaiverNote?: string
  /** True when a Missing deposit slip alert exists and is open for this calendar day */
  missingDepositSlipAlertOpen?: boolean
}

