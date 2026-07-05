import { NextRequest, NextResponse } from 'next/server'
import { generateCustomerStatementPdfBuffer } from '@/lib/customer-statement-pdf'
import type { StatementMode } from '@/lib/customer-statement'

// GET /api/customer-accounts/statement/pdf?account=&startDate=&endDate=&mode=summary|detail
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const account = searchParams.get('account')?.trim()
    const startDate = searchParams.get('startDate')?.trim()
    const endDate = searchParams.get('endDate')?.trim()
    const mode: StatementMode =
      searchParams.get('mode') === 'detail' ? 'detail' : 'summary'

    if (!account || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'account, startDate, and endDate are required' },
        { status: 400 }
      )
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json(
        { error: 'Dates must be YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const { buffer, filename } = await generateCustomerStatementPdfBuffer({
      account,
      startDate,
      endDate,
      mode
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error('Customer statement PDF error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
