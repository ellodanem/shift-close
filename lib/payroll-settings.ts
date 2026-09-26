export const PAYROLL_PAYSLIP_COMPANY_NAME_KEY = 'payroll_payslip_company_name'
export const DEFAULT_PAYSLIP_COMPANY_NAME = 'Total Auto'
export const PAYSLIP_COMPANY_NAME_MAX = 80

/** Name printed at the bottom of each payslip. Blank input keeps the fallback. */
export function normalizePayslipCompanyName(
  value: unknown,
  fallback = DEFAULT_PAYSLIP_COMPANY_NAME
): string {
  const raw = typeof value === 'string' ? value : ''
  const name = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) return fallback
  return name.slice(0, PAYSLIP_COMPANY_NAME_MAX)
}

export async function loadPayslipCompanyName(): Promise<string> {
  try {
    const res = await fetch('/api/pay-runs/settings')
    if (!res.ok) return DEFAULT_PAYSLIP_COMPANY_NAME
    const data = (await res.json()) as { companyName?: unknown }
    return normalizePayslipCompanyName(data.companyName)
  } catch {
    return DEFAULT_PAYSLIP_COMPANY_NAME
  }
}
