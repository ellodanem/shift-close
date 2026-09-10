import { NextRequest, NextResponse } from 'next/server'
import {
  applyVendorInvoicesToBatch,
  ApplyVendorInvoicesError
} from '@/lib/applyVendorInvoicesToBatch'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const selectedInvoiceIds = Array.isArray(body.selectedInvoiceIds)
      ? body.selectedInvoiceIds
      : []

    const batch = await applyVendorInvoicesToBatch({
      batchId: id,
      selectedInvoiceIds,
      transferDescription:
        body.transferDescription === undefined ? undefined : body.transferDescription
    })

    return NextResponse.json({ batch })
  } catch (error) {
    if (error instanceof ApplyVendorInvoicesError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Error applying invoices to vendor payment:', error)
    return NextResponse.json(
      { error: 'Failed to apply invoices to payment' },
      { status: 500 }
    )
  }
}
