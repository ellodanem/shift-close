import { prisma } from '@/lib/prisma'
import { DEFAULT_VAT_RATE, parseVatRatePercent } from '@/lib/vendorVat'

export const VENDOR_VAT_RATE_KEY = 'vendor_vat_rate_percent'

export async function getVendorVatRate(): Promise<number> {
  const row = await prisma.appSettings.findUnique({ where: { key: VENDOR_VAT_RATE_KEY } })
  if (!row?.value?.trim()) return DEFAULT_VAT_RATE
  return parseVatRatePercent(row.value)
}

export async function setVendorVatRatePercent(percent: string): Promise<number> {
  const rate = parseVatRatePercent(percent)
  await prisma.appSettings.upsert({
    where: { key: VENDOR_VAT_RATE_KEY },
    update: { value: percent.trim() },
    create: { key: VENDOR_VAT_RATE_KEY, value: percent.trim() }
  })
  return rate
}
