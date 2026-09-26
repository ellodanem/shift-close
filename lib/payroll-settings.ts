export const PAYROLL_PAYSLIP_COMPANY_NAME_KEY = 'payroll_payslip_company_name'
export const PAYROLL_PAYSLIP_COMPANY_ADDRESS_KEY = 'payroll_payslip_company_address'
export const PAYROLL_PAYSLIP_COMPANY_PHONE_KEY = 'payroll_payslip_company_phone'

export const PAYSLIP_COMPANY_NAME_MAX = 80
export const PAYSLIP_COMPANY_ADDRESS_MAX = 120
export const PAYSLIP_COMPANY_PHONE_MAX = 40

export type PayslipCompany = {
  companyName: string
  address: string
  phone: string
}

export const DEFAULT_PAYSLIP_COMPANY: PayslipCompany = {
  companyName: 'Total Auto',
  address: 'John Compton Highway Castries, Saint Lucia',
  phone: '758 4515400'
}

function payslipLine(value: unknown, fallback: string, max: number): string {
  const raw = typeof value === 'string' ? value : ''
  const text = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return fallback
  return text.slice(0, max)
}

/** Name, address, and contact number printed at the bottom of each payslip. */
export function normalizePayslipCompany(input?: {
  companyName?: unknown
  address?: unknown
  phone?: unknown
} | null): PayslipCompany {
  return {
    companyName: payslipLine(input?.companyName, DEFAULT_PAYSLIP_COMPANY.companyName, PAYSLIP_COMPANY_NAME_MAX),
    address: payslipLine(input?.address, DEFAULT_PAYSLIP_COMPANY.address, PAYSLIP_COMPANY_ADDRESS_MAX),
    phone: payslipLine(input?.phone, DEFAULT_PAYSLIP_COMPANY.phone, PAYSLIP_COMPANY_PHONE_MAX)
  }
}

export async function loadPayslipCompany(): Promise<PayslipCompany> {
  try {
    const res = await fetch('/api/pay-runs/settings')
    if (!res.ok) return { ...DEFAULT_PAYSLIP_COMPANY }
    const data = (await res.json()) as Partial<PayslipCompany>
    return normalizePayslipCompany(data)
  } catch {
    return { ...DEFAULT_PAYSLIP_COMPANY }
  }
}
