import { NextRequest, NextResponse } from 'next/server'
import { generateCustomerStatementExcelBuffer } from '@/lib/customer-statement-excel'
import type { StatementMode } from '@/lib/customer-statement'

// GET /api/customer-accounts/statement/excel?account=&startDate=&endDate=&mode=summary|detail
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

    const { buffer, filename } = await generateCustomerStatementExcelBuffer({
      account,
      startDate,
      endDate,
      mode
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error('Customer statement Excel error:', error)
    return NextResponse.json(
      { error: 'Failed to generate Excel file' },
      { status: 500 }
    )
  }
}
