export const PAYROLL_PAYSLIP_COMPANY_NAME_KEY = 'payroll_payslip_company_name'
export const PAYROLL_PAYSLIP_COMPANY_ADDRESS_KEY = 'payroll_payslip_company_address'
export const PAYROLL_PAYSLIP_COMPANY_PHONE_KEY = 'payroll_payslip_company_phone'
export const PAYROLL_OVERTIME_MULTIPLIER_KEY = 'payroll_overtime_multiplier'

/** 1.5 is time and a half. 2 is double time. */
export const DEFAULT_OVERTIME_MULTIPLIER = 1.5
export const MIN_OVERTIME_MULTIPLIER = 1
export const MAX_OVERTIME_MULTIPLIER = 3

export function normalizeOvertimeMultiplier(value: unknown, fallback = DEFAULT_OVERTIME_MULTIPLIER): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  const rounded = Math.round(n * 100) / 100
  if (rounded < MIN_OVERTIME_MULTIPLIER || rounded > MAX_OVERTIME_MULTIPLIER) return fallback
  return rounded
}

/** Null when the typed value is not a rate from 1 to 3, with at most two decimal places. */
export function parseOvertimeMultiplierInput(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const n = Math.round(Number(trimmed) * 100) / 100
  if (n < MIN_OVERTIME_MULTIPLIER || n > MAX_OVERTIME_MULTIPLIER) return null
  return n
}

export function overtimeMultiplierLabel(multiplier: number): string {
  if (multiplier === 1) return 'Straight time'
  if (multiplier === 1.5) return 'Time and a half'
  if (multiplier === 2) return 'Double time'
  return `${multiplier} × the hourly rate`
}

export async function loadOvertimeMultiplier(): Promise<number> {
  try {
    const res = await fetch('/api/pay-runs/settings')
    if (!res.ok) return DEFAULT_OVERTIME_MULTIPLIER
    const data = (await res.json()) as { overtimeMultiplier?: unknown }
    return normalizeOvertimeMultiplier(data.overtimeMultiplier)
  } catch {
    return DEFAULT_OVERTIME_MULTIPLIER
  }
}

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
