import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { importHarvestFuelInvoices } from '@/lib/harvest-fuel-invoices'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/import/fuel-invoices
 * Harvest agent Cstore Gas Delivery scrape → Fuel invoices.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const year = typeof body.year === 'number' ? body.year : Number(body.year)
    const month = typeof body.month === 'number' ? body.month : Number(body.month)

    const invoices = Array.isArray(body.invoices) ? body.invoices : []
    if (invoices.length > 500) {
      return NextResponse.json({ error: 'Too many invoices' }, { status: 400 })
    }

    const parsed = invoices.map((row: unknown) => {
      const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        invoiceNumber: typeof r.invoiceNumber === 'string' ? r.invoiceNumber : String(r.invoiceNumber ?? ''),
        invoiceDate: typeof r.invoiceDate === 'string' ? r.invoiceDate : String(r.invoiceDate ?? ''),
        amount: typeof r.amount === 'number' ? r.amount : Number(r.amount)
      }
    })

    const result = await importHarvestFuelInvoices({
      invoices: parsed,
      year: Number.isFinite(year) && year > 0 ? year : undefined,
      month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : undefined
    })

    let message: string
    if (result.errors.length) {
      message =
        result.errors.map((e) => e.message).filter(Boolean).join('; ') ||
        'Fuel invoice import failed'
    } else {
      message = `Fuel: Cstore unpaid ${result.cstoreCount}, added ${result.created}, skipped ${result.skipped}`
    }

    return NextResponse.json({
      ...result,
      empty: result.created === 0 && result.skipped === 0 && parsed.length === 0,
      message
    })
  } catch (error) {
    console.error('Harvest fuel-invoice import error:', error)
    return NextResponse.json({ error: 'Failed to import fuel invoices' }, { status: 500 })
  }
}
