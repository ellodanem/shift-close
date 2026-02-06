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

export interface DayReport {
  date: string
  dayType: "Standard" | "Custom"
  status: "Complete" | "Incomplete" | "Invalid mix"
  shifts: ShiftCloseWithCalculations[]
  totals: {
    overShortTotal: number
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
}

