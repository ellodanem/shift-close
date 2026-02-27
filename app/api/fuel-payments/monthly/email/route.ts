import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateMonthlyReportPdfBuffer } from '@/lib/monthlyReportPdf'
import { sendMail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { month } = body as { month?: string }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Month required (format: YYYY-MM)' },
        { status: 400 }
      )
    }

    const recipients = await prisma.emailRecipient.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    })
    const primary = recipients[0]
    if (!primary?.email) {
      return NextResponse.json(
        { error: 'No email recipients configured. Add one in Settings → Email recipients.' },
        { status: 400 }
      )
    }

    const [year, monthNum] = month.split('-').map(Number)
    const monthName = new Date(year, monthNum - 1, 1).toLocaleString('default', {
      month: 'long',
      year: 'numeric'
    })

    const pdfBuffer = await generateMonthlyReportPdfBuffer(month)
    const filename = `monthly-fuel-report-${month}.pdf`

    await sendMail({
      to: primary.email,
      subject: `Monthly Fuel Payment Report – ${monthName}`,
      text: `Please find the Monthly Fuel Payment Report for ${monthName} attached.`,
      html: `<p>Please find the Monthly Fuel Payment Report for <strong>${monthName}</strong> attached.</p>`,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    })

    return NextResponse.json({
      success: true,
      to: primary.email,
      message: `Report emailed to ${primary.email}`
    })
  } catch (error: unknown) {
    console.error('Monthly report email error:', error)
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
