export const DEFAULT_VAT_RATE = 0.125

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function vendorInvoiceTotal(amount: number, vat: number | null | undefined): number {
  return roundMoney(amount + (vat ?? 0))
}

/** Split a VAT-inclusive total into purchase amount and VAT. */
export function calculateAmountVatFromTotal(
  total: number,
  vatRate: number = DEFAULT_VAT_RATE
): { amount: number; vat: number } {
  const rate = vatRate > 0 ? vatRate : DEFAULT_VAT_RATE
  const t = roundMoney(total)
  const amount = roundMoney(t / (1 + rate))
  const vat = roundMoney(t - amount)
  return { amount, vat }
}

export function formatVatRatePercent(rate: number): string {
  const pct = roundMoney(rate * 100)
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, '')
}

export function parseVatRatePercent(percent: string): number {
  const n = parseFloat(percent)
  if (Number.isNaN(n) || n < 0) return DEFAULT_VAT_RATE
  return roundMoney(n) / 100
}

export function sumAmountVatStrings(amount: string, vat: string): string {
  const a = parseFloat(amount)
  const v = parseFloat(vat)
  if (Number.isNaN(a)) return ''
  const total = vendorInvoiceTotal(a, Number.isNaN(v) ? 0 : v)
  return total.toFixed(2)
}
