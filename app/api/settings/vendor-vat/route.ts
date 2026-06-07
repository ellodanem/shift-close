import { NextRequest, NextResponse } from 'next/server'
import { formatVatRatePercent } from '@/lib/vendorVat'
import { getVendorVatRate, setVendorVatRatePercent } from '@/lib/vendorVatSettings'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const vatRate = await getVendorVatRate()
    return NextResponse.json({
      vatRate,
      vatRatePercent: formatVatRatePercent(vatRate)
    })
  } catch (error) {
    console.error('vendor-vat settings GET error:', error)
    return NextResponse.json({ error: 'Failed to load VAT settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { vatRatePercent } = body
    if (vatRatePercent === undefined || vatRatePercent === null || String(vatRatePercent).trim() === '') {
      return NextResponse.json({ error: 'vatRatePercent is required' }, { status: 400 })
    }
    const n = parseFloat(String(vatRatePercent))
    if (Number.isNaN(n) || n < 0) {
      return NextResponse.json({ error: 'Invalid VAT rate' }, { status: 400 })
    }
    const vatRate = await setVendorVatRatePercent(String(vatRatePercent))
    return NextResponse.json({
      vatRate,
      vatRatePercent: formatVatRatePercent(vatRate)
    })
  } catch (error) {
    console.error('vendor-vat settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save VAT settings' }, { status: 500 })
  }
}
