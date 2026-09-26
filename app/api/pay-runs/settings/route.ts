import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  PAYROLL_PAYSLIP_COMPANY_NAME_KEY,
  normalizePayslipCompanyName
} from '@/lib/payroll-settings'

export const dynamic = 'force-dynamic'

/** GET /api/pay-runs/settings — payslip company name. */
export async function GET() {
  try {
    const row = await prisma.appSettings.findUnique({
      where: { key: PAYROLL_PAYSLIP_COMPANY_NAME_KEY }
    })
    return NextResponse.json({ companyName: normalizePayslipCompanyName(row?.value) })
  } catch (error) {
    console.error('Payroll settings GET error:', error)
    return NextResponse.json({ error: 'Failed to load payroll settings' }, { status: 500 })
  }
}

/** POST /api/pay-runs/settings — { companyName } */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { companyName?: unknown }
    const raw = typeof body.companyName === 'string' ? body.companyName : ''
    if (!raw.trim()) {
      return NextResponse.json({ error: 'Enter a company name.' }, { status: 400 })
    }
    const companyName = normalizePayslipCompanyName(raw, '')
    if (!companyName) {
      return NextResponse.json({ error: 'Enter a company name.' }, { status: 400 })
    }
    await prisma.appSettings.upsert({
      where: { key: PAYROLL_PAYSLIP_COMPANY_NAME_KEY },
      update: { value: companyName },
      create: { key: PAYROLL_PAYSLIP_COMPANY_NAME_KEY, value: companyName }
    })
    return NextResponse.json({ companyName })
  } catch (error) {
    console.error('Payroll settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save payroll settings' }, { status: 500 })
  }
}
