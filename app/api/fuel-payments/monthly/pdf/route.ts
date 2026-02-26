import { NextRequest, NextResponse } from 'next/server'
import { generateMonthlyReportPdfBuffer } from '@/lib/monthlyReportPdf'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const month = searchParams.get('month')

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Month parameter required (format: YYYY-MM)' },
        { status: 400 }
      )
    }

    const pdfBuffer = await generateMonthlyReportPdfBuffer(month)
    const filename = `monthly-fuel-report-${month}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error('Monthly report PDF error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
