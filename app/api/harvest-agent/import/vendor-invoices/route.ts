import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { importHarvestVendorInvoices } from '@/lib/harvest-vendor-invoices'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/import/vendor-invoices
 * Harvest agent Cstore purchase-invoice scrape import.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const vendor = typeof body.vendor === 'string' ? body.vendor.trim() : ''
    if (!vendor) {
      return NextResponse.json({ error: 'vendor is required' }, { status: 400 })
    }

    const invoices = Array.isArray(body.invoices) ? body.invoices : []
    if (invoices.length > 500) {
      return NextResponse.json({ error: 'Too many invoices' }, { status: 400 })
    }

    const parsed = invoices.map((row: unknown) => {
      const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        invoiceNumber: typeof r.invoiceNumber === 'string' ? r.invoiceNumber : String(r.invoiceNumber ?? ''),
        invoiceDate: typeof r.invoiceDate === 'string' ? r.invoiceDate : String(r.invoiceDate ?? ''),
        amount: typeof r.amount === 'number' ? r.amount : Number(r.amount),
        paymentType: typeof r.paymentType === 'string' ? r.paymentType : null
      }
    })

    const result = await importHarvestVendorInvoices({
      cstoreVendorName: vendor,
      invoices: parsed
    })

    const messageParts = [`${result.vendorName}: added ${result.created}, skipped ${result.skipped}`]
    if (result.suffixed.length) {
      messageParts.push(
        `${result.suffixed.length} numbered with a letter (${result.suffixed
          .map((s) => `${s.original}→${s.stored}`)
          .join(', ')})`
      )
    }
    if (result.vendorCreated) messageParts.push('new vendor')
    if (result.errors.length) messageParts.push(`${result.errors.length} error(s)`)

    return NextResponse.json({
      ...result,
      empty: result.created === 0 && result.skipped === 0 && parsed.length === 0,
      message: messageParts.join(', ')
    })
  } catch (error) {
    console.error('Harvest vendor-invoice import error:', error)
    return NextResponse.json({ error: 'Failed to import vendor invoices' }, { status: 500 })
  }
}
