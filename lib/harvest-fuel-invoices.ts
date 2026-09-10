import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import { parseInvoiceDateToUTC } from '@/lib/invoiceHelpers'

const FUEL_INVOICE_TYPES = ['Fuel', 'LPG', 'Lubricants', 'Rent', 'Uniforms', 'Loyalty', 'Balance Payment'] as const
export type HarvestFuelInvoiceType = (typeof FUEL_INVOICE_TYPES)[number]

export type HarvestFuelInvoiceRow = {
  invoiceNumber: string
  invoiceDate: string
  amount: number
  type?: HarvestFuelInvoiceType
}

export type ImportHarvestFuelInvoicesResult = {
  cstoreCount: number
  shiftCloseCount: number
  created: number
  skipped: number
  type: HarvestFuelInvoiceType
  errors: { invoiceNumber?: string; message: string }[]
  createdNumbers: string[]
}

function parseUsDateToYmd(value: string): string | null {
  const m = String(value || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  const year = Number(m[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function resolveType(value: unknown, fallback: HarvestFuelInvoiceType): HarvestFuelInvoiceType {
  const t = typeof value === 'string' ? value.trim() : ''
  if ((FUEL_INVOICE_TYPES as readonly string[]).includes(t)) return t as HarvestFuelInvoiceType
  return fallback
}

/**
 * Import Cstore rows into Fuel Payments.
 * Default type Fuel (Gas Delivery). Rubis grocery harvest uses type LPG.
 * Skips any invoice number already present (pending, simulated, or paid).
 */
export async function importHarvestFuelInvoices(params: {
  invoices: HarvestFuelInvoiceRow[]
  year?: number
  month?: number
  type?: HarvestFuelInvoiceType
  notes?: string
}): Promise<ImportHarvestFuelInvoicesResult> {
  const invoiceType = resolveType(params.type, 'Fuel')
  const notes =
    (typeof params.notes === 'string' && params.notes.trim()) ||
    (invoiceType === 'LPG'
      ? 'Imported from Cstore Rubis West Indies (harvest)'
      : 'Imported from Cstore Gas Delivery (harvest)')

  const errors: ImportHarvestFuelInvoicesResult['errors'] = []
  const createdNumbers: string[] = []
  let created = 0
  let skipped = 0

  const normalized = params.invoices
    .map((row) => {
      const invoiceNumber = String(row.invoiceNumber || '').trim()
      const amount = Number(row.amount)
      const ymd =
        parseUsDateToYmd(String(row.invoiceDate || '')) ||
        (/^\d{4}-\d{2}-\d{2}$/.test(String(row.invoiceDate || '').trim())
          ? String(row.invoiceDate).trim().slice(0, 10)
          : null)
      const type = resolveType(row.type, invoiceType)
      return { invoiceNumber, amount, ymd, rawDate: row.invoiceDate, type }
    })
    .filter((row) => {
      if (!row.invoiceNumber || !row.ymd || !Number.isFinite(row.amount) || row.amount <= 0) {
        errors.push({
          invoiceNumber: row.invoiceNumber || undefined,
          message: `Invalid row (number/date/amount): ${row.invoiceNumber || '?'} / ${row.rawDate || '?'} / ${row.amount}`
        })
        return false
      }
      return true
    })

  const numbers = [...new Set(normalized.map((r) => r.invoiceNumber))]
  const [existingInvoices, existingPaid] = await Promise.all([
    numbers.length
      ? prisma.invoice.findMany({
          where: { invoiceNumber: { in: numbers } },
          select: { invoiceNumber: true }
        })
      : Promise.resolve([]),
    numbers.length
      ? prisma.paidInvoice.findMany({
          where: { invoiceNumber: { in: numbers } },
          select: { invoiceNumber: true }
        })
      : Promise.resolve([])
  ])

  const known = new Set([
    ...existingInvoices.map((r) => r.invoiceNumber),
    ...existingPaid.map((r) => r.invoiceNumber)
  ])

  let shiftCloseCount = known.size
  if (params.year && params.month) {
    const start = new Date(Date.UTC(params.year, params.month - 1, 1, 12, 0, 0))
    const end = new Date(Date.UTC(params.year, params.month, 0, 12, 0, 0))
    shiftCloseCount = await prisma.invoice.count({
      where: {
        type: invoiceType,
        invoiceDate: { gte: start, lte: end }
      }
    })
  }

  for (const row of normalized) {
    if (known.has(row.invoiceNumber)) {
      skipped++
      continue
    }

    try {
      const invoiceDate = parseInvoiceDateToUTC(row.ymd!)
      const dueDate = new Date(invoiceDate)
      dueDate.setUTCDate(dueDate.getUTCDate() + 5)

      await prisma.invoice.create({
        data: {
          invoiceNumber: row.invoiceNumber,
          amount: roundMoney(row.amount),
          type: row.type,
          invoiceDate,
          dueDate,
          notes,
          status: 'pending'
        }
      })
      known.add(row.invoiceNumber)
      createdNumbers.push(row.invoiceNumber)
      created++
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ invoiceNumber: row.invoiceNumber, message })
    }
  }

  return {
    cstoreCount: params.invoices.length,
    shiftCloseCount,
    created,
    skipped,
    type: invoiceType,
    errors,
    createdNumbers
  }
}
