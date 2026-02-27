import { NextRequest, NextResponse } from 'next/server'
import { generateMonthlyReportPdfBuffer } from '@/lib/monthlyReportPdf'
import { sendMail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const req = await request.json()
    const { month, to, subject, body: bodyText } = req as {
      month?: string
      to?: string
      subject?: string
      body?: string
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Month required (format: YYYY-MM)' },
        { status: 400 }
      )
    }

    const toEmail = (to && String(to).trim()) || ''
    if (!toEmail) {
      return NextResponse.json(
        { error: 'Recipient email (to) is required' },
        { status: 400 }
      )
    }

    const [year, monthNum] = month.split('-').map(Number)
    const monthName = new Date(year, monthNum - 1, 1).toLocaleString('default', {
      month: 'long',
      year: 'numeric'
    })

    const defaultSubject = `Monthly Fuel Payment Report – ${monthName}`
    const defaultText = `Please find the Monthly Fuel Payment Report for ${monthName} attached.`
    const finalSubject = (subject && String(subject).trim()) || defaultSubject
    const finalText = (bodyText && String(bodyText).trim()) || defaultText

    const pdfBuffer = await generateMonthlyReportPdfBuffer(month)
    const filename = `monthly-fuel-report-${month}.pdf`

    await sendMail({
      to: toEmail,
      subject: finalSubject,
      text: finalText,
      html: `<p>${finalText.replace(/\n/g, '</p><p>')}</p>`,
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
      to: toEmail,
      message: `Report emailed to ${toEmail}`
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
