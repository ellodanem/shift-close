import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const RUBIS_VENDOR = /rubis\s*west\s*indies/i

function getCol(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row)
  for (const name of names) {
    const exact = keys.find(k => k.trim().toLowerCase() === name.toLowerCase())
    if (exact != null && row[exact] !== undefined && row[exact] !== '') return row[exact]
  }
  return null
}

function parseCurrency(val: unknown): number {
  if (typeof val === 'number' && !isNaN(val)) return Math.round(val * 100) / 100
  const s = String(val ?? '').replace(/[$,]/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

function parseDate(val: unknown): Date | null {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val
  const s = String(val ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function isHeaderOrTotalRow(row: Record<string, unknown>, vendorName: string): boolean {
  const invNum = getCol(row, 'Invoice#', 'Invoice', 'invoice')
  const invStr = String(invNum ?? '').trim()
  if (invStr.toLowerCase() === 'total') return true
  if (invStr.toLowerCase() === 'invoice#' || invStr.toLowerCase() === 'invoice') return true
  if (['vendor', 'date', 'day'].includes(vendorName.toLowerCase())) return true
  return false
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const createMissingVendors = formData.get('createMissingVendors') === 'true'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    const created: number[] = []
    const errors: { row: number; vendor: string; invoiceNumber: string; message: string }[] = []
    const vendorsCreated: string[] = []
    let skippedRubis = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2

      const vendorRaw = getCol(row, 'Vendor', 'vendor')
      const vendorName = String(vendorRaw ?? '').trim()
      if (!vendorName) continue

      if (RUBIS_VENDOR.test(vendorName)) {
        skippedRubis++
        continue
      }

      if (isHeaderOrTotalRow(row, vendorName)) continue

      const invNumRaw = getCol(row, 'Invoice#', 'Invoice #', 'Invoice', 'invoice')
      const invoiceNumber = String(invNumRaw ?? '').trim()
      if (!invoiceNumber) continue

      const dateVal = getCol(row, 'Date', 'date')
      const invoiceDate = parseDate(dateVal)
      if (!invoiceDate) {
        errors.push({ row: rowNum, vendor: vendorName, invoiceNumber, message: 'Invalid or missing date' })
        continue
      }

      const invoiceAmount = parseCurrency(getCol(row, 'Invoice Amount', 'invoice amount', 'Invoice Amount (Invoice info)', 'Invoice Amount (Payment info)'))
      const purchaseAmount = parseCurrency(getCol(row, 'Purchase Amount', 'purchase amount'))
      const prepaidTax = parseCurrency(getCol(row, 'Prepaid Tax', 'prepaid tax'))
      const amount = invoiceAmount > 0 ? invoiceAmount : purchaseAmount + prepaidTax
      if (amount <= 0) {
        errors.push({ row: rowNum, vendor: vendorName, invoiceNumber, message: 'Invalid or zero amount' })
        continue
      }

      let vendor = await prisma.vendor.findFirst({
        where: { name: { equals: vendorName, mode: 'insensitive' } }
      })

      if (!vendor) {
        if (createMissingVendors) {
          vendor = await prisma.vendor.create({
            data: {
              name: vendorName,
              notificationEmail: `${vendorName.toLowerCase().replace(/\s+/g, '.')}@placeholder.local`,
              notes: 'Created from Excel import'
            }
          })
          if (!vendorsCreated.includes(vendorName)) vendorsCreated.push(vendorName)
        } else {
          errors.push({ row: rowNum, vendor: vendorName, invoiceNumber, message: `Vendor "${vendorName}" not found. Enable "Create missing vendors" to add them.` })
          continue
        }
      }

      const dueDate = new Date(invoiceDate)
      dueDate.setDate(dueDate.getDate() + 5)

      try {
        await prisma.vendorInvoice.create({
          data: {
            vendorId: vendor.id,
            invoiceNumber,
            amount,
            invoiceDate,
            dueDate,
            vat: prepaidTax,
            status: 'pending',
            notes: ''
          }
        })
        created.push(rowNum)
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string }
        if (e?.code === 'P2002') {
          errors.push({ row: rowNum, vendor: vendorName, invoiceNumber, message: 'Duplicate invoice (already exists for this vendor)' })
        } else {
          errors.push({ row: rowNum, vendor: vendorName, invoiceNumber, message: String(e?.message ?? 'Failed to create') })
        }
      }
    }

    return NextResponse.json({
      created: created.length,
      skipped: skippedRubis,
      errors,
      vendorsCreated
    })
  } catch (error) {
    console.error('Vendor invoice import error:', error)
    return NextResponse.json(
      { error: 'Failed to import invoices' },
      { status: 500 }
    )
  }
}
