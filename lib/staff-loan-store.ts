import { parseMoney } from '@/lib/pay-run'
import { parsePayCycle } from '@/lib/pay-cycle'
import { prisma } from '@/lib/prisma'
import {
  effectiveStaffLoanDeduction,
  expectedLastPayDate,
  loanRemaining,
  parseLoanStatus,
  type ActiveLoanDeduction
} from '@/lib/staff-loan'

export type StaffLoanRepayment = {
  payRunId: string
  payDate: string
  amount: number
}

export type StaffLoanSnapshot = {
  id: string
  staffId: string
  principal: number
  termPays: number
  installment: number
  startDate: string
  status: 'active' | 'paid' | 'cancelled'
  paid: number
  remaining: number
  lastPayDate: string
  repayments: StaffLoanRepayment[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

type LoanRow = {
  id: string
  staffId: string
  principal: number
  termPays: number
  installment: number
  startDate: string
  status: string
  staff?: { payCycle: string }
}

type PaidLine = {
  staffId: string | null
  staffLoan: number
  payDate: string
  payRunId: string
}

function snapshotFrom(loan: LoanRow, lines: PaidLine[]): StaffLoanSnapshot {
  const repayments = lines
    .filter((line) => line.staffId === loan.staffId && line.payDate >= loan.startDate && line.staffLoan > 0)
    .map((line) => ({
      payRunId: line.payRunId,
      payDate: line.payDate,
      amount: parseMoney(line.staffLoan)
    }))
    .sort((a, b) => (a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : 0))
  const paid = round2(repayments.reduce((sum, row) => sum + row.amount, 0))
  const remaining = loanRemaining(loan.principal, paid)
  const stored = parseLoanStatus(loan.status)
  const status = stored === 'cancelled' ? 'cancelled' : remaining <= 0 ? 'paid' : 'active'
  const cycle = parsePayCycle(loan.staff?.payCycle)
  return {
    id: loan.id,
    staffId: loan.staffId,
    principal: parseMoney(loan.principal),
    termPays: loan.termPays,
    installment: parseMoney(loan.installment),
    startDate: loan.startDate,
    status,
    paid,
    remaining,
    lastPayDate: expectedLastPayDate(loan.startDate, cycle, loan.termPays),
    repayments
  }
}

async function loadProcessedLoanLines(staffIds: string[], minStartDate: string): Promise<PaidLine[]> {
  if (staffIds.length === 0) return []
  const rows = await prisma.payRunLine.findMany({
    where: {
      staffId: { in: staffIds },
      staffLoan: { gt: 0 },
      payRun: { status: 'processed', payDate: { gte: minStartDate } }
    },
    select: {
      staffId: true,
      staffLoan: true,
      payRun: { select: { id: true, payDate: true } }
    }
  })
  return rows.map((row) => ({
    staffId: row.staffId,
    staffLoan: row.staffLoan,
    payDate: row.payRun.payDate,
    payRunId: row.payRun.id
  }))
}

export async function loadStaffLoanSnapshots(staffIds: string[]): Promise<Record<string, StaffLoanSnapshot>> {
  if (staffIds.length === 0) return {}
  const loans = await prisma.staffLoan.findMany({
    where: { staffId: { in: staffIds }, status: { not: 'cancelled' } },
    include: { staff: { select: { payCycle: true } } },
    orderBy: { createdAt: 'desc' }
  })
  if (loans.length === 0) return {}
  const latestByStaff = new Map<string, (typeof loans)[number]>()
  for (const loan of loans) {
    if (!latestByStaff.has(loan.staffId)) latestByStaff.set(loan.staffId, loan)
  }
  const chosen = [...latestByStaff.values()]
  const minStart = chosen.reduce((min, loan) => (loan.startDate < min ? loan.startDate : min), chosen[0]!.startDate)
  const lines = await loadProcessedLoanLines(chosen.map((loan) => loan.staffId), minStart)
  const out: Record<string, StaffLoanSnapshot> = {}
  for (const loan of chosen) {
    out[loan.staffId] = snapshotFrom(loan, lines)
  }
  return out
}

export async function loadStaffLoanSnapshot(staffId: string): Promise<StaffLoanSnapshot | null> {
  const all = await loadStaffLoanSnapshots([staffId])
  return all[staffId] ?? null
}

export function activeLoanDeduction(snapshot?: StaffLoanSnapshot | null): ActiveLoanDeduction | null {
  if (!snapshot || snapshot.status !== 'active' || snapshot.remaining <= 0) return null
  return { installment: snapshot.installment, remaining: snapshot.remaining }
}

export function loanDeductionForProfile(
  legacyAmount: number | null | undefined,
  snapshot?: StaffLoanSnapshot | null
): { staffLoan: number; loanRemaining: number | null } {
  const active = activeLoanDeduction(snapshot)
  if (active) {
    return {
      staffLoan: effectiveStaffLoanDeduction(legacyAmount, active),
      loanRemaining: active.remaining
    }
  }
  if (snapshot?.status === 'paid') {
    return { staffLoan: 0, loanRemaining: 0 }
  }
  return { staffLoan: parseMoney(legacyAmount), loanRemaining: null }
}

export async function syncStaffLoanStatuses(staffIds?: string[]): Promise<void> {
  const where = staffIds && staffIds.length > 0 ? { staffId: { in: staffIds } } : { status: { not: 'cancelled' } }
  const loans = await prisma.staffLoan.findMany({
    where,
    select: { id: true, staffId: true, status: true }
  })
  if (loans.length === 0) return
  const snapshots = await loadStaffLoanSnapshots([...new Set(loans.map((loan) => loan.staffId))])
  for (const loan of loans) {
    if (loan.status === 'cancelled') continue
    const next = snapshots[loan.staffId]
    if (!next || next.id !== loan.id) continue
    if (next.status !== loan.status) {
      await prisma.staffLoan.update({
        where: { id: loan.id },
        data: { status: next.status }
      })
    }
  }
}

export async function applyLoanToDraftLines(staffId: string, staffLoan: number): Promise<void> {
  const amount = parseMoney(staffLoan)
  const lines = await prisma.payRunLine.findMany({
    where: { staffId, payRun: { status: 'draft' } }
  })
  for (const line of lines) {
    const totalDeductions = round2(
      line.nisEmployee + amount + line.medical + line.shortageReady + line.extraDeductionPay
    )
    await prisma.payRunLine.update({
      where: { id: line.id },
      data: {
        staffLoan: amount,
        totalDeductions,
        netPay: round2(line.grossPay - totalDeductions)
      }
    })
  }
}
