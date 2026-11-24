import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { importHarvestVendorInvoices } from '@/lib/harvest-vendor-invoices'
import {
  groupCstoreInvoicePayments,
  importHarvestVendorChecks,
  summarizeHarvestChecks
} from '@/lib/harvest-vendor-checks'
import { isRubisWestIndiesVendor, RUBIS_VENDOR_SKIP_REASON } from '@/lib/vendor-rubis-skip'

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

    if (isRubisWestIndiesVendor(vendor)) {
      const invoices = Array.isArray(body.invoices) ? body.invoices : []
      return NextResponse.json({
        vendorName: vendor,
        cstoreName: vendor,
        vendorCreated: false,
        cstoreCount: invoices.length,
        shiftCloseCount: 0,
        created: 0,
        skipped: invoices.length,
        leftOut: 0,
        wrongVendor: 0,
        moved: 0,
        suffixed: [],
        errors: [],
        message: `${vendor}: skipped (${RUBIS_VENDOR_SKIP_REASON})`
      })
    }

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
        amount: typeof r.amount === 'number' ? r.amount : Number(r.amount),
        paymentType: typeof r.paymentType === 'string' ? r.paymentType : null,
        vendor: typeof r.vendor === 'string' ? r.vendor : null
      }
    })

    const result = await importHarvestVendorInvoices({
      cstoreVendorName: vendor,
      invoices: parsed,
      year: Number.isFinite(year) && year > 0 ? year : undefined,
      month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : undefined
    })

    const payments = groupCstoreInvoicePayments(result.payableInvoices)
    let checkNote = ''
    let checks = undefined
    if (payments.length) {
      try {
        const paid = await importHarvestVendorChecks({
          cstoreVendorName: vendor,
          checks: payments
        })
        checks = paid.checks
        checkNote = summarizeHarvestChecks(paid.vendorName || result.vendorName, paid.checks)
      } catch (err) {
        console.error('Harvest vendor-invoice payment apply error:', err)
        checkNote = `payments failed: ${err instanceof Error ? err.message : 'unknown error'}`
      }
    }

    let message: string
    if (result.errors.length) {
      message =
        result.errors.map((e) => e.message).filter(Boolean).join('; ') ||
        `Import failed for ${vendor}`
      if (checkNote) message = `${message}; ${checkNote}`
    } else {
      const parts = [
        `${result.vendorName}: Cstore ${result.cstoreCount}, Shift Close ${result.shiftCloseCount}, added ${result.created}, skipped ${result.skipped}`
      ]
      if (result.moved > 0) parts.push(`moved ${result.moved} from another vendor`)
      if (result.leftOut > 0) {
        const label =
          Number.isFinite(year) && Number.isFinite(month)
            ? `${year}-${String(month).padStart(2, '0')}`
            : 'the selected month'
        parts.push(`left out ${result.leftOut} outside ${label}`)
      }
      if (result.wrongVendor > 0) {
        parts.push(`left out ${result.wrongVendor} that belong to another vendor`)
      }
      if (result.suffixed.length) {
        parts.push(
          `${result.suffixed.length} numbered with a letter (${result.suffixed
            .map((s) => `${s.original}→${s.stored}`)
            .join(', ')})`
        )
      }
      if (result.vendorCreated) parts.push('new vendor')
      if (checkNote) parts.push(checkNote)
      message = parts.join(', ')
    }

    const { payableInvoices: _payable, ...rest } = result
    return NextResponse.json({
      ...rest,
      checks,
      empty: result.created === 0 && result.skipped === 0 && parsed.length === 0,
      message
    })
  } catch (error) {
    console.error('Harvest vendor-invoice import error:', error)
    return NextResponse.json({ error: 'Failed to import vendor invoices' }, { status: 500 })
  }
}
