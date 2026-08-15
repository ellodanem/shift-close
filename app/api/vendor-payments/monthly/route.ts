import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { vendorInvoiceTotal } from '@/lib/vendorVat'
import {
  aggregateVendorInvoiceRows,
  buildReportTotals,
  monthUtcBounds,
  type VendorInvoicePaymentsInclude,
  type VendorInvoicePaymentsReport
} from '@/lib/vendorInvoicePaymentsReport'

export const dynamic = 'force-dynamic'

function parseInclude(raw: string | null): VendorInvoicePaymentsInclude {
  if (raw === 'paid') return 'paid'
  return 'all'
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const month = searchParams.get('month') // YYYY-MM
    const include = parseInclude(searchParams.get('include'))

    if (!month) {
      return NextResponse.json(
        { error: 'Month parameter is required (format: YYYY-MM)' },
        { status: 400 }
      )
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 })
    }

    const { start, endExclusive, monthName } = monthUtcBounds(month)

    let report: VendorInvoicePaymentsReport

    if (include === 'paid') {
      // Payment month: batches paid in this calendar month
      const batches = await prisma.vendorPaymentBatch.findMany({
        where: {
          paymentDate: {
            gte: start,
            lt: endExclusive
          }
        },
        include: {
          vendor: { select: { id: true, name: true } },
          invoices: true
        }
      })

      const inputs = batches.flatMap((batch) =>
        batch.invoices.map((paid) => {
          // Paid snapshot stores total (amount + VAT), matching paper All Invoices.
          return {
            vendorId: batch.vendor.id,
            vendorName: batch.vendor.name,
            amount: paid.amount,
            status: 'paid' as const
          }
        })
      )

      const rows = aggregateVendorInvoiceRows(inputs)
      const totals = buildReportTotals(rows)
      report = {
        month,
        monthName,
        include,
        monthMeaning: 'payment',
        rows,
        ...totals
      }
    } else {
      // Invoice month: pending + paid invoices dated in this calendar month
      const invoices = await prisma.vendorInvoice.findMany({
        where: {
          status: { in: ['pending', 'paid'] },
          invoiceDate: {
            gte: start,
            lt: endExclusive
          }
        },
        include: {
          vendor: { select: { id: true, name: true } }
        }
      })

      const rows = aggregateVendorInvoiceRows(
        invoices.map((inv) => ({
          vendorId: inv.vendor.id,
          vendorName: inv.vendor.name,
          amount: vendorInvoiceTotal(inv.amount, inv.vat),
          status: inv.status === 'paid' ? ('paid' as const) : ('pending' as const)
        }))
      )
      const totals = buildReportTotals(rows)
      report = {
        month,
        monthName,
        include,
        monthMeaning: 'invoice',
        rows,
        ...totals
      }
    }

    return NextResponse.json({
      ...report,
      generatedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error fetching vendor invoice payments report:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendor invoice payments report' },
      { status: 500 }
    )
  }
}
