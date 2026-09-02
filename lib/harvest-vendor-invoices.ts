import { prisma } from '@/lib/prisma'
import { ensureHarvestSchema } from '@/lib/harvest-agent'
import { parseInvoiceDateToUTC, invoiceDateToInputValue } from '@/lib/invoiceHelpers'
import {
  calculateAmountVatFromTotal,
  roundMoney,
  vendorInvoiceTotal
} from '@/lib/vendorVat'
import { getVendorVatRate } from '@/lib/vendorVatSettings'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export type HarvestCstoreInvoice = {
  invoiceNumber: string
  invoiceDate: string
  amount: number
  paymentType?: string | null
}

export type HarvestSuffixedInvoice = {
  original: string
  stored: string
}

export type HarvestVendorInvoiceError = {
  invoiceNumber: string
  message: string
}

export type HarvestVendorInvoiceImportResult = {
  vendorId: string
  vendorName: string
  cstoreName: string
  vendorCreated: boolean
  isVatRegistered: boolean
  created: number
  skipped: number
  suffixed: HarvestSuffixedInvoice[]
  errors: HarvestVendorInvoiceError[]
}

type ExistingInvoice = {
  invoiceNumber: string
  invoiceDate: Date
  amount: number
  vat: number | null
}

export function normalizeVendorKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
}

export function placeholderVendorEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  return `${slug || 'vendor'}@placeholder.local`
}

export function parseCstoreInvoiceDate(value: string): string | null {
  const s = String(value || '').trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return s.slice(0, 10)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!us) return null
  const month = Number(us[1])
  const day = Number(us[2])
  const year = Number(us[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isOriginalOrSuffixed(stored: string, original: string): boolean {
  if (!stored || !original) return false
  if (stored === original) return true
  if (!stored.startsWith(original)) return false
  return /^[A-Z]+$/.test(stored.slice(original.length))
}

export function nextAvailableInvoiceNumber(existingNumbers: Set<string>, original: string): string {
  if (!existingNumbers.has(original)) return original
  for (const letter of LETTERS) {
    const candidate = `${original}${letter}`
    if (!existingNumbers.has(candidate)) return candidate
  }
  for (const a of LETTERS) {
    for (const b of LETTERS) {
      const candidate = `${original}${a}${b}`
      if (!existingNumbers.has(candidate)) return candidate
    }
  }
  throw new Error(`Could not allocate a unique invoice number from ${original}`)
}

function sameHarvestedInvoice(existing: ExistingInvoice, dateYmd: string, amount: number): boolean {
  if (invoiceDateToInputValue(existing.invoiceDate) !== dateYmd) return false
  return vendorInvoiceTotal(existing.amount, existing.vat) === roundMoney(amount)
}

export function matchVendorRow<T extends { name: string; cstoreName?: string | null }>(
  vendors: T[],
  cstoreLabel: string
): T | null {
  const key = normalizeVendorKey(cstoreLabel)
  if (!key) return null
  for (const v of vendors) {
    if (normalizeVendorKey(v.cstoreName || '') === key) return v
  }
  for (const v of vendors) {
    if (normalizeVendorKey(v.name) === key) return v
  }
  return null
}

export async function importHarvestVendorInvoices(params: {
  cstoreVendorName: string
  invoices: HarvestCstoreInvoice[]
}): Promise<HarvestVendorInvoiceImportResult> {
  const cstoreName = params.cstoreVendorName.trim()
  if (!cstoreName) {
    throw new Error('cstoreVendorName is required')
  }

  await ensureHarvestSchema()

  const vendors = await prisma.vendor.findMany({
    select: { id: true, name: true, cstoreName: true, isVatRegistered: true }
  })
  let vendor = matchVendorRow(vendors, cstoreName)
  let vendorCreated = false

  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        name: cstoreName,
        cstoreName,
        notificationEmail: placeholderVendorEmail(cstoreName),
        notes: 'Created by harvest agent',
        isVatRegistered: false
      },
      select: { id: true, name: true, cstoreName: true, isVatRegistered: true }
    })
    vendorCreated = true
  } else if (!vendor.cstoreName) {
    vendor = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { cstoreName },
      select: { id: true, name: true, cstoreName: true, isVatRegistered: true }
    })
  }

  const vatRate = vendor.isVatRegistered ? await getVendorVatRate() : 0
  const existing = await prisma.vendorInvoice.findMany({
    where: { vendorId: vendor.id },
    select: { invoiceNumber: true, invoiceDate: true, amount: true, vat: true }
  })
  const existingNumbers = new Set(existing.map((row) => row.invoiceNumber))

  const suffixed: HarvestSuffixedInvoice[] = []
  const errors: HarvestVendorInvoiceError[] = []
  let created = 0
  let skipped = 0

  for (const raw of params.invoices) {
    const invoiceNumber = String(raw.invoiceNumber || '').trim()
    if (!invoiceNumber) {
      errors.push({ invoiceNumber: '', message: 'Missing invoice number' })
      continue
    }

    const dateYmd = parseCstoreInvoiceDate(String(raw.invoiceDate || ''))
    if (!dateYmd) {
      errors.push({ invoiceNumber, message: 'Invalid or missing purchase date' })
      continue
    }

    const total = roundMoney(Number(raw.amount))
    if (!Number.isFinite(total) || total <= 0) {
      errors.push({ invoiceNumber, message: 'Invalid or zero amount' })
      continue
    }

    const already = existing.find(
      (row) =>
        isOriginalOrSuffixed(row.invoiceNumber, invoiceNumber) &&
        sameHarvestedInvoice(row, dateYmd, total)
    )
    if (already) {
      skipped += 1
      continue
    }

    let storedNumber: string
    try {
      storedNumber = nextAvailableInvoiceNumber(existingNumbers, invoiceNumber)
    } catch (err) {
      errors.push({
        invoiceNumber,
        message: err instanceof Error ? err.message : 'Could not allocate invoice number'
      })
      continue
    }

    const split = vendor.isVatRegistered
      ? calculateAmountVatFromTotal(total, vatRate)
      : { amount: total, vat: 0 }
    const notes =
      storedNumber === invoiceNumber
        ? ''
        : `Cstore invoice ${invoiceNumber} (number already used)`

    try {
      await prisma.vendorInvoice.create({
        data: {
          vendorId: vendor.id,
          invoiceNumber: storedNumber,
          amount: split.amount,
          vat: split.vat,
          invoiceDate: parseInvoiceDateToUTC(dateYmd),
          dueDate: null,
          status: 'pending',
          notes
        }
      })
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'P2002') {
        existingNumbers.add(storedNumber)
        try {
          storedNumber = nextAvailableInvoiceNumber(existingNumbers, invoiceNumber)
          await prisma.vendorInvoice.create({
            data: {
              vendorId: vendor.id,
              invoiceNumber: storedNumber,
              amount: split.amount,
              vat: split.vat,
              invoiceDate: parseInvoiceDateToUTC(dateYmd),
              dueDate: null,
              status: 'pending',
              notes:
                storedNumber === invoiceNumber
                  ? ''
                  : `Cstore invoice ${invoiceNumber} (number already used)`
            }
          })
        } catch (retryErr: unknown) {
          errors.push({
            invoiceNumber,
            message:
              retryErr instanceof Error ? retryErr.message : 'Failed to create invoice after suffix'
          })
          continue
        }
      } else {
        errors.push({
          invoiceNumber,
          message: err instanceof Error ? err.message : 'Failed to create invoice'
        })
        continue
      }
    }

    existingNumbers.add(storedNumber)
    existing.push({
      invoiceNumber: storedNumber,
      invoiceDate: parseInvoiceDateToUTC(dateYmd),
      amount: split.amount,
      vat: split.vat
    })
    created += 1
    if (storedNumber !== invoiceNumber) {
      suffixed.push({ original: invoiceNumber, stored: storedNumber })
    }
  }

  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    cstoreName,
    vendorCreated,
    isVatRegistered: vendor.isVatRegistered,
    created,
    skipped,
    suffixed,
    errors
  }
}
