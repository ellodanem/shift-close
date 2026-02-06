export interface MonthlyReportData {
  year: number
  month: number
  monthName: string
  period: {
    startDate: string
    endDate: string
    totalDays: number
    workingDays: number
    completeDays: number
    incompleteDays: number
  }
  summary: {
    totalDeposits: number
    debitAndCredit: number
    debit: number
    credit: number
    fleet: number
    vouchers: number
    unleaded: number
    diesel: number
    grandTotal: number
    totalShifts: number
    draftShifts: number
  }
  overShortAnalysis: {
    totalOverShort: number
    averageOverShort: number
    shiftsWithOverShort: number
    shiftsWithZeroOverShort: number
    largestOver: number
    largestShort: number
    significantDiscrepancies: Array<{
      date: string
      shift: string
      supervisor: string
      overShortTotal: number
      overShortExplained: boolean
      overShortExplanation: string
    }>
  }
  dailyBreakdown: Array<{
    date: string
    deposits: number[]
    totalDeposits: number
    creditTotal: number
    debitTotal: number
    unleaded: number
    diesel: number
    totalRevenue: number
    fleetCardRevenue: number
    massyCoupons: number
    voucherRevenue: number
    overShortTotal: number
  }>
  supervisorPerformance: Array<{
    name: string
    shifts: number
    totalRevenue: number
    averageRevenue: number
    averageOverShort: number
    shiftsWithDiscrepancy: number
    completionRate: number
  }>
  financial: {
    expenses: null
    payables: null
    receivables: null
    netProfit: null
    cashFlow: null
  }
}

