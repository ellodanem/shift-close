import { NextRequest, NextResponse } from 'next/server'
import { generateCustomerStatementExcelBuffer } from '@/lib/customer-statement-excel'
import { generateCustomerStatementPdfBuffer } from '@/lib/customer-statement-pdf'
import { formatStatementDateRange } from '@/lib/customer-statement'
import { sendMail } from '@/lib/email'
import type { StatementMode } from '@/lib/customer-statement'

type ExportFormat = 'pdf' | 'excel' | 'summary'

// POST /api/customer-accounts/statement/email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      account,
      startDate,
      endDate,
      mode: modeRaw,
      format: formatRaw,
      to,
      subject,
      body: bodyText,
      cc,
      bcc
    } = body as {
      account?: string
      startDate?: string
      endDate?: string
      mode?: StatementMode
      format?: ExportFormat
      to?: string
      subject?: string
      body?: string
      cc?: string
      bcc?: string
    }

    const acc = account?.trim()
    const start = startDate?.trim()
    const end = endDate?.trim()
    const toEmail = (to && String(to).trim()) || ''
    const mode: StatementMode = modeRaw === 'detail' ? 'detail' : 'summary'
    const format: ExportFormat =
      formatRaw === 'excel' || formatRaw === 'summary' ? formatRaw : 'pdf'
    const effectiveMode: StatementMode =
      format === 'summary' ? 'summary' : mode

    if (!acc || !start || !end) {
      return NextResponse.json(
        { error: 'account, startDate, and endDate are required' },
        { status: 400 }
      )
    }

    if (!toEmail) {
      return NextResponse.json(
        { error: 'Recipient email (to) is required' },
        { status: 400 }
      )
    }

    const rangeLabel = formatStatementDateRange(start, end)
    const defaultSubject = `Account Statement — ${acc} (${rangeLabel})`
    const defaultText = `Please find the customer account statement for ${acc} (${rangeLabel}) attached.`
    const finalSubject = (subject && String(subject).trim()) || defaultSubject
    const finalText = (bodyText && String(bodyText).trim()) || defaultText

    let attachment: { filename: string; content: Buffer; contentType: string }

    if (format === 'excel') {
      const { buffer, filename } = await generateCustomerStatementExcelBuffer({
        account: acc,
        startDate: start,
        endDate: end,
        mode: effectiveMode
      })
      attachment = {
        filename,
        content: buffer,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    } else {
      const { buffer, filename } = await generateCustomerStatementPdfBuffer({
        account: acc,
        startDate: start,
        endDate: end,
        mode: effectiveMode
      })
      attachment = {
        filename,
        content: buffer,
        contentType: 'application/pdf'
      }
    }

    await sendMail({
      to: toEmail,
      cc: cc?.trim() || undefined,
      bcc: bcc?.trim() || undefined,
      subject: finalSubject,
      text: finalText,
      html: `<p>${finalText.replace(/\n/g, '</p><p>')}</p>`,
      attachments: [attachment]
    })

    return NextResponse.json({
      success: true,
      to: toEmail,
      message: `Statement emailed to ${toEmail}`
    })
  } catch (error: unknown) {
    console.error('Customer statement email error:', error)
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
