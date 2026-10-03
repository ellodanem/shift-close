import { NextRequest, NextResponse } from 'next/server'
import { roundMoney } from '@/lib/fuelPayments'
import { saveRubisRentExpenseAmount } from '@/lib/rubis-rent-report-expense'
import { rubisRentExpenseRow } from '@/lib/vendorInvoicePaymentsReport'

export const dynamic = 'force-dynamic'

const MONTH_RE = /^\d{4}-\d{2}$/

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { month, amount } = body as { month?: string; amount?: number | string }

    if (!month || !MONTH_RE.test(month)) {
      return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 })
    }

    const amt = roundMoney(typeof amount === 'string' ? parseFloat(amount) : Number(amount))
    if (!Number.isFinite(amt) || amt < 0) {
      return NextResponse.json({ error: 'Amount must be 0 or more' }, { status: 400 })
    }

    await saveRubisRentExpenseAmount(month, amt)
    return NextResponse.json(rubisRentExpenseRow(amt))
  } catch (error) {
    console.error('Error saving Rubis Rent expense:', error)
    return NextResponse.json({ error: 'Failed to save Rubis Rent' }, { status: 500 })
  }
}
