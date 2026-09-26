import { NextRequest, NextResponse } from 'next/server'
import { isYmd } from '@/lib/datetime-policy'
import { parsePayCycle } from '@/lib/pay-cycle'
import { parseMoney, parseOptionalMoney } from '@/lib/pay-run'
import { prisma } from '@/lib/prisma'
import { canViewStaffSensitiveFields } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'
import {
  loanInstallment,
  loanThisPay,
  parseLoanTermUnit,
  paysForLoanTerm,
  previewStaffLoan
} from '@/lib/staff-loan'
import {
  applyLoanToDraftLines,
  loadStaffLoanSnapshot,
  syncStaffLoanStatuses
} from '@/lib/staff-loan-store'

export const dynamic = 'force-dynamic'

async function requireSensitive(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!canViewStaffSensitiveFields(session.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

async function loadStaff(id: string) {
  return prisma.staff.findUnique({
    where: { id },
    select: { id: true, payCycle: true, staffLoan: true }
  })
}

async function present(staffId: string, legacyLoan: number | null) {
  await syncStaffLoanStatuses([staffId])
  const loan = await loadStaffLoanSnapshot(staffId)
  return {
    loan,
    legacyLoan: loan ? 0 : parseMoney(legacyLoan)
  }
}

/** GET /api/staff/:id/loan */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSensitive(request)
    if ('error' in auth && auth.error) return auth.error
    const { id } = await params
    const staff = await loadStaff(id)
    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    return NextResponse.json(await present(id, staff.staffLoan))
  } catch (error) {
    console.error('Staff loan get error:', error)
    return NextResponse.json({ error: 'Failed to load staff loan' }, { status: 500 })
  }
}

/** POST /api/staff/:id/loan — create a balanced loan and clear the open-ended amount. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSensitive(request)
    if ('error' in auth && auth.error) return auth.error
    const { id } = await params
    const staff = await loadStaff(id)
    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

    const existing = await loadStaffLoanSnapshot(id)
    if (existing?.status === 'active') {
      return NextResponse.json({ error: 'This person already has an active loan.' }, { status: 409 })
    }

    const body = await request.json().catch(() => ({}))
    const principal = parseOptionalMoney(body.principal)
    if (principal == null || principal <= 0) {
      return NextResponse.json({ error: 'Enter the total loan amount.' }, { status: 400 })
    }
    const termUnit = parseLoanTermUnit(body.termUnit)
    const termCount = Number(body.termCount)
    if (!Number.isFinite(termCount) || termCount < 1) {
      return NextResponse.json({ error: 'Enter how long the loan should take to repay.' }, { status: 400 })
    }
    const startDate = typeof body.startDate === 'string' && isYmd(body.startDate) ? body.startDate : ''
    if (!startDate) {
      return NextResponse.json({ error: 'Start date must be YYYY-MM-DD.' }, { status: 400 })
    }

    const cycle = parsePayCycle(staff.payCycle)
    const preview = previewStaffLoan({
      principal,
      termCount,
      termUnit,
      cycle,
      startDate
    })

    await prisma.$transaction([
      prisma.staffLoan.create({
        data: {
          staffId: id,
          principal,
          termPays: preview.termPays,
          installment: preview.installment,
          startDate,
          status: 'active'
        }
      }),
      prisma.staff.update({
        where: { id },
        data: { staffLoan: null }
      })
    ])

    await applyLoanToDraftLines(id, preview.installment)
    return NextResponse.json(await present(id, null), { status: 201 })
  } catch (error) {
    console.error('Staff loan create error:', error)
    return NextResponse.json({ error: 'Failed to add staff loan' }, { status: 500 })
  }
}

/** PATCH /api/staff/:id/loan — cancel, or change remaining term. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSensitive(request)
    if ('error' in auth && auth.error) return auth.error
    const { id } = await params
    const staff = await loadStaff(id)
    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

    const loan = await loadStaffLoanSnapshot(id)
    if (!loan || loan.status !== 'active') {
      return NextResponse.json({ error: 'No active loan to change.' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'cancel') {
      await prisma.staffLoan.update({
        where: { id: loan.id },
        data: { status: 'cancelled' }
      })
      await applyLoanToDraftLines(id, 0)
      return NextResponse.json(await present(id, null))
    }

    if (action === 'adjust') {
      const termUnit = parseLoanTermUnit(body.termUnit)
      const termCount = Number(body.termCount)
      if (!Number.isFinite(termCount) || termCount < 1) {
        return NextResponse.json({ error: 'Enter how many pays are left.' }, { status: 400 })
      }
      const cycle = parsePayCycle(staff.payCycle)
      const remainingPays = paysForLoanTerm(cycle, termCount, termUnit)
      const installment = loanInstallment(loan.remaining, remainingPays)
      const paidPays = loan.repayments.length
      await prisma.staffLoan.update({
        where: { id: loan.id },
        data: {
          installment,
          termPays: paidPays + remainingPays
        }
      })
      await applyLoanToDraftLines(id, loanThisPay(installment, loan.remaining))
      return NextResponse.json(await present(id, null))
    }

    return NextResponse.json({ error: 'Unknown loan action.' }, { status: 400 })
  } catch (error) {
    console.error('Staff loan patch error:', error)
    return NextResponse.json({ error: 'Failed to update staff loan' }, { status: 500 })
  }
}
