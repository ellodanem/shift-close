import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canViewStaffSensitiveFields } from '@/lib/roles'
import type { StaffPayrollSnapshot } from '@/lib/pay-period-staff-notes'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** POST /api/attendance/pay-period/staff-payroll — payroll fields for pay-period notes copy */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const staffIds = Array.isArray(body?.staffIds)
      ? (body.staffIds as unknown[]).filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      : []

    if (staffIds.length === 0) {
      return NextResponse.json({} as Record<string, StaffPayrollSnapshot>)
    }

    const uniqueIds = [...new Set(staffIds)]
    const staff = await prisma.staff.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        name: true,
        address: true,
        dateOfBirth: true,
        startDate: true,
        nicNumber: true,
        bankName: true,
        accountNumber: true
      }
    })

    const sensitive = canViewStaffSensitiveFields(session.role)
    const out: Record<string, StaffPayrollSnapshot> = {}
    for (const s of staff) {
      out[s.id] = {
        fullName: s.name.trim(),
        address: s.address?.trim() || null,
        dateOfBirth: s.dateOfBirth,
        nicNumber: sensitive ? s.nicNumber : null,
        startDate: s.startDate,
        bankName: sensitive ? s.bankName : null,
        accountNumber: sensitive ? s.accountNumber : null
      }
    }

    return NextResponse.json(out)
  } catch (error) {
    console.error('Pay period staff-payroll error:', error)
    return NextResponse.json({ error: 'Failed to load staff payroll details' }, { status: 500 })
  }
}
