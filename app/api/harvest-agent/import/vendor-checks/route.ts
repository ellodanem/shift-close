import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import {
  importHarvestVendorChecks,
  summarizeHarvestChecks,
  type HarvestCheckInput
} from '@/lib/harvest-vendor-checks'
import { isRubisWestIndiesVendor } from '@/lib/vendor-rubis-skip'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/import/vendor-checks
 * Create uncashed vendor checks from a Cstore By Check/EFT scrape.
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

    const checksIn = Array.isArray(body.checks) ? body.checks : []
    if (checksIn.length > 80) {
      return NextResponse.json({ error: 'Too many checks' }, { status: 400 })
    }

    const checks: HarvestCheckInput[] = []
    let invoiceCount = 0
    for (const row of checksIn) {
      const check = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const invoicesIn = Array.isArray(check.invoices) ? check.invoices : []
      invoiceCount += invoicesIn.length
      if (invoiceCount > 500) {
        return NextResponse.json({ error: 'Too many invoices' }, { status: 400 })
      }
      checks.push({
        checkNumber: typeof check.checkNumber === 'string' ? check.checkNumber : String(check.checkNumber ?? ''),
        paymentDate: typeof check.paymentDate === 'string' ? check.paymentDate : null,
        invoices: invoicesIn.map((invoice) => {
          const item = invoice && typeof invoice === 'object' ? (invoice as Record<string, unknown>) : {}
          return {
            invoiceNumber:
              typeof item.invoiceNumber === 'string' ? item.invoiceNumber : String(item.invoiceNumber ?? ''),
            invoiceDate: typeof item.invoiceDate === 'string' ? item.invoiceDate : String(item.invoiceDate ?? ''),
            amount: typeof item.amount === 'number' ? item.amount : Number(item.amount)
          }
        })
      })
    }

    if (isRubisWestIndiesVendor(vendor)) {
      return NextResponse.json({
        vendorName: vendor,
        cstoreName: vendor,
        created: 0,
        skipped: checks.length,
        checks: [],
        errors: [],
        message: `${vendor}: skipped on vendor checks`
      })
    }

    const result = await importHarvestVendorChecks({
      cstoreVendorName: vendor,
      checks
    })

    const message = result.errors.length
      ? result.errors.map((error) => error.message).filter(Boolean).join('; ')
      : summarizeHarvestChecks(result.vendorName, result.checks)

    return NextResponse.json({ ...result, message })
  } catch (error) {
    console.error('Harvest vendor-check import error:', error)
    return NextResponse.json({ error: 'Failed to import vendor checks' }, { status: 500 })
  }
}
