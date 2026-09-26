import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  PAYROLL_PAYSLIP_COMPANY_ADDRESS_KEY,
  PAYROLL_PAYSLIP_COMPANY_NAME_KEY,
  PAYROLL_PAYSLIP_COMPANY_PHONE_KEY,
  normalizePayslipCompany
} from '@/lib/payroll-settings'

export const dynamic = 'force-dynamic'

const KEYS = [
  PAYROLL_PAYSLIP_COMPANY_NAME_KEY,
  PAYROLL_PAYSLIP_COMPANY_ADDRESS_KEY,
  PAYROLL_PAYSLIP_COMPANY_PHONE_KEY
] as const

async function readCompany() {
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: [...KEYS] } }
  })
  const value = (key: string) => rows.find((row) => row.key === key)?.value
  return normalizePayslipCompany({
    companyName: value(PAYROLL_PAYSLIP_COMPANY_NAME_KEY),
    address: value(PAYROLL_PAYSLIP_COMPANY_ADDRESS_KEY),
    phone: value(PAYROLL_PAYSLIP_COMPANY_PHONE_KEY)
  })
}

/** GET /api/pay-runs/settings — name, address, and contact number on payslips. */
export async function GET() {
  try {
    return NextResponse.json(await readCompany())
  } catch (error) {
    console.error('Payroll settings GET error:', error)
    return NextResponse.json({ error: 'Failed to load payroll settings' }, { status: 500 })
  }
}

/** POST /api/pay-runs/settings — { companyName, address, phone } */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyName?: unknown
      address?: unknown
      phone?: unknown
    }
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : ''
    const address = typeof body.address === 'string' ? body.address.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!companyName) {
      return NextResponse.json({ error: 'Enter a company name.' }, { status: 400 })
    }
    if (!address) {
      return NextResponse.json({ error: 'Enter an address.' }, { status: 400 })
    }
    if (!phone) {
      return NextResponse.json({ error: 'Enter a contact number.' }, { status: 400 })
    }
    const company = normalizePayslipCompany({ companyName, address, phone })
    const saved = [
      { key: PAYROLL_PAYSLIP_COMPANY_NAME_KEY, value: company.companyName },
      { key: PAYROLL_PAYSLIP_COMPANY_ADDRESS_KEY, value: company.address },
      { key: PAYROLL_PAYSLIP_COMPANY_PHONE_KEY, value: company.phone }
    ]
    await prisma.$transaction(
      saved.map((row) =>
        prisma.appSettings.upsert({
          where: { key: row.key },
          update: { value: row.value },
          create: row
        })
      )
    )
    return NextResponse.json(company)
  } catch (error) {
    console.error('Payroll settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save payroll settings' }, { status: 500 })
  }
}
