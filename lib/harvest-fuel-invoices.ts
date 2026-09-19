import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import { parseInvoiceDateToUTC } from '@/lib/invoiceHelpers'
import { harvestFuelVolumePatch, tryParseOptionalLitres } from '@/lib/fuel-inventory'

const FUEL_INVOICE_TYPES = ['Fuel', 'LPG', 'Lubricants', 'Rent', 'Uniforms', 'Loyalty', 'Balance Payment'] as const
export type HarvestFuelInvoiceType = (typeof FUEL_INVOICE_TYPES)[number]

export type HarvestFuelInvoiceRow = {
  invoiceNumber: string
  invoiceDate: string
  amount: number
  type?: HarvestFuelInvoiceType
  unleadedLitres?: number | null
  dieselLitres?: number | null
}

export type ImportHarvestFuelInvoicesResult = {
  cstoreCount: number
  shiftCloseCount: number
  created: number
  skipped: number
  volumesUpdated: number
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

function litresFromHarvestField(value: unknown): number | null {
  const parsed = tryParseOptionalLitres(value)
  if (!parsed.ok) return null
  return parsed.value
}

export { harvestFuelVolumePatch }

/**
 * Import Cstore rows into Fuel Payments.
 * Default type Fuel (Gas Delivery). Rubis grocery harvest uses type LPG.
 * Existing invoice numbers are not created again. Fuel invoices with blank litres
 * are backfilled from Cstore; litres already stored are left alone.
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
  let volumesUpdated = 0

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
      const unleadedLitres = type === 'Fuel' ? litresFromHarvestField(row.unleadedLitres) : null
      const dieselLitres = type === 'Fuel' ? litresFromHarvestField(row.dieselLitres) : null
      return { invoiceNumber, amount, ymd, rawDate: row.invoiceDate, type, unleadedLitres, dieselLitres }
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
          select: {
            id: true,
            invoiceNumber: true,
            type: true,
            unleadedLitres: true,
            dieselLitres: true
          }
        })
      : Promise.resolve([]),
    numbers.length
      ? prisma.paidInvoice.findMany({
          where: { invoiceNumber: { in: numbers } },
          select: { invoiceNumber: true }
        })
      : Promise.resolve([])
  ])

  const existingByNumber = new Map(existingInvoices.map((r) => [r.invoiceNumber, r]))
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
      const existing = existingByNumber.get(row.invoiceNumber)
      if (existing && existing.type === 'Fuel') {
        const patch = harvestFuelVolumePatch(existing, {
          unleadedLitres: row.unleadedLitres,
          dieselLitres: row.dieselLitres
        })
        if (patch) {
          try {
            await prisma.invoice.update({
              where: { id: existing.id },
              data: patch
            })
            existing.unleadedLitres = patch.unleadedLitres ?? existing.unleadedLitres
            existing.dieselLitres = patch.dieselLitres ?? existing.dieselLitres
            volumesUpdated++
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            errors.push({ invoiceNumber: row.invoiceNumber, message })
          }
        }
      }
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
          status: 'pending',
          unleadedLitres: row.type === 'Fuel' ? row.unleadedLitres : null,
          dieselLitres: row.type === 'Fuel' ? row.dieselLitres : null
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
    volumesUpdated,
    type: invoiceType,
    errors,
    createdNumbers
  }
}
