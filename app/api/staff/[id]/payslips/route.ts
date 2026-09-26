import { NextRequest, NextResponse } from 'next/server'
import { payPeriodCycleNumber } from '@/lib/pay-cycle'
import { presentPayRunLine } from '@/lib/pay-run'
import { attachBankingToLines, ytdAsOfLine, type PayRunYtd } from '@/lib/pay-run-build'
import { prisma } from '@/lib/prisma'
import { canViewStaffSensitiveFields } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

function shownCycleNumber(cycleNumber: number, endDate: string): number {
  if (cycleNumber > 0) return cycleNumber
  const derived = Number(payPeriodCycleNumber(endDate))
  return derived > 0 ? derived : 0
}

function ytdOf(line: {
  basicPay: number
  otPay: number
  extraPay: number
  grossPay: number
  nisEmployee: number
  staffLoan: number
  medical: number
  shortageReady: number
  extraDeductionPay: number
  totalDeductions: number
  netPay: number
}): PayRunYtd {
  return {
    basicPay: line.basicPay,
    otPay: line.otPay,
    extraPay: line.extraPay,
    grossPay: line.grossPay,
    nisEmployee: line.nisEmployee,
    staffLoan: line.staffLoan,
    medical: line.medical,
    shortageReady: line.shortageReady,
    extraDeductionPay: line.extraDeductionPay,
    totalDeductions: line.totalDeductions,
    netPay: line.netPay
  }
}

/** GET /api/staff/:id/payslips — approved slips, newest pay date first. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canViewStaffSensitiveFields(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const staff = await prisma.staff.findUnique({
      where: { id },
      select: { id: true, bankName: true, accountNumber: true }
    })
    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

    const rows = await prisma.payRunLine.findMany({
      where: { staffId: id, payRun: { status: 'processed' } },
      include: {
        payRun: {
          select: {
            id: true,
            payDate: true,
            startDate: true,
            endDate: true,
            cycleNumber: true,
            createdAt: true
          }
        }
      },
      orderBy: [{ payRun: { payDate: 'desc' } }, { payRun: { createdAt: 'desc' } }]
    })

    const history = rows.map((row) => ({
      payRunId: row.payRun.id,
      payDate: row.payRun.payDate,
      ...ytdOf(row)
    }))
    const lines = attachBankingToLines(
      rows.map((row) => presentPayRunLine(row)),
      new Map([[staff.id, staff]])
    )

    return NextResponse.json({
      slips: lines.map((line) => {
        const run = line.payRun
        const amounts = ytdOf(line)
        return {
          id: line.id,
          payRunId: run.id,
          payDate: run.payDate,
          startDate: run.startDate,
          endDate: run.endDate,
          cycleNumber: shownCycleNumber(run.cycleNumber, run.endDate),
          netPay: line.netPay,
          line: {
            staffName: line.staffName,
            staffNo: line.staffNo,
            taxCode: line.taxCode,
            payType: line.payType,
            payCycle: line.payCycle,
            hourlyRate: line.hourlyRate,
            basicHours: line.basicHours,
            otHours: line.otHours,
            basicPay: line.basicPay,
            otPay: line.otPay,
            extraLines: line.extraLines,
            extraDeductions: line.extraDeductions,
            nisEmployee: line.nisEmployee,
            medical: line.medical,
            staffLoan: line.staffLoan,
            shortageReady: line.shortageReady,
            grossPay: line.grossPay,
            totalDeductions: line.totalDeductions,
            netPay: line.netPay,
            ytd: ytdAsOfLine(history, { payRunId: run.id, payDate: run.payDate, ...amounts }),
            bankCode: line.bankCode,
            accountNo: line.accountNo
          }
        }
      })
    })
  } catch (error) {
    console.error('Staff payslips error:', error)
    return NextResponse.json({ error: 'Failed to load salary slips' }, { status: 500 })
  }
}
