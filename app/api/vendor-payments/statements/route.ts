import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { businessTodayYmd, toYmdInBusinessTz } from '@/lib/datetime-policy'
import { vendorInvoiceTotal } from '@/lib/vendorVat'

export const dynamic = 'force-dynamic'

type StatementRow = {
  date: string
  description: string
  reference: string
  charge: number
  payment: number
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    if (params.get('list') === 'vendors') {
      const vendors = await prisma.vendor.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, notes: true }
      })
      return NextResponse.json(vendors.filter((vendor) => !vendor.notes.includes('[overhead-payee]')).map(({ id, name }) => ({ id, name })))
    }

    const vendorId = params.get('vendorId')?.trim()
    const endDate = params.get('endDate') || businessTodayYmd()
    const startDate = params.get('startDate') || `${endDate.slice(0, 7)}-01`
    if (!vendorId) return NextResponse.json({ error: 'vendorId is required' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
      return NextResponse.json({ error: 'Choose a valid statement date range' }, { status: 400 })
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        invoices: { select: { invoiceNumber: true, amount: true, vat: true, invoiceDate: true } },
        batches: { select: { paymentDate: true, bankRef: true, paymentMethod: true, totalAmount: true } }
      }
    })
    if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

    const allRows: StatementRow[] = [
      ...vendor.invoices.map((invoice) => ({
        date: toYmdInBusinessTz(invoice.invoiceDate),
        description: `Invoice ${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
        charge: vendorInvoiceTotal(invoice.amount, invoice.vat),
        payment: 0
      })),
      ...vendor.batches.map((batch) => ({
        date: toYmdInBusinessTz(batch.paymentDate),
        description: `${batch.paymentMethod === 'check' ? 'Check' : 'EFT'} payment`,
        reference: batch.bankRef,
        charge: 0,
        payment: batch.totalAmount
      }))
    ].sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))

    const opening = allRows.filter((row) => row.date < startDate).reduce((total, row) => total + row.charge - row.payment, 0)
    const rows = allRows.filter((row) => row.date >= startDate && row.date <= endDate)
    const charges = rows.reduce((total, row) => total + row.charge, 0)
    const payments = rows.reduce((total, row) => total + row.payment, 0)
    return NextResponse.json({ vendor: { id: vendor.id, name: vendor.name, notificationEmail: vendor.notificationEmail }, startDate, endDate, opening, rows, totals: { charges, payments, closing: opening + charges - payments } })
  } catch (error) {
    console.error('Vendor statement error:', error)
    return NextResponse.json({ error: 'Failed to build vendor statement' }, { status: 500 })
  }
}
