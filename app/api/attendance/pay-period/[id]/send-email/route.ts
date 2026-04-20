import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sendMail } from '@/lib/email'
import {
  payPeriodExcelFilename,
  payPeriodExcelWorkbook,
  type PayPeriodExcelData,
  type PayPeriodExcelRow
} from '@/lib/pay-period-excel'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/attendance/pay-period/[id]/send-email
 * Sends HTML body and attaches the Excel report built on the server (same sheet as the Excel button).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { to, subject, html } = body as { to?: string; subject?: string; html?: string }

    if (!to?.trim()) {
      return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 })
    }
    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    const period = await prisma.payPeriod.findUnique({ where: { id } })
    if (!period) {
      return NextResponse.json({ error: 'Pay period not found' }, { status: 404 })
    }

    let rows: PayPeriodExcelRow[]
    try {
      rows = JSON.parse(period.rows) as PayPeriodExcelRow[]
      if (!Array.isArray(rows)) throw new Error('not array')
    } catch {
      return NextResponse.json({ error: 'Invalid stored pay period rows' }, { status: 500 })
    }

    const excelInput: PayPeriodExcelData = {
      startDate: period.startDate,
      endDate: period.endDate,
      reportDate: period.reportDate,
      entityName: period.entityName,
      notes: period.notes ?? '',
      rows
    }

    const wb = payPeriodExcelWorkbook(excelInput)
    const rawOut = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
    const xlsxBuffer = Buffer.isBuffer(rawOut)
      ? rawOut
      : Buffer.from(rawOut instanceof ArrayBuffer ? new Uint8Array(rawOut) : (rawOut as Uint8Array))
    const filename = payPeriodExcelFilename(excelInput)

    await sendMail({
      to: to.trim(),
      subject: subject.trim(),
      html: html?.trim() || undefined,
      attachments: [
        {
          filename,
          content: xlsxBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    })

    await prisma.payPeriod.update({
      where: { id },
      data: { emailSentAt: new Date() }
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Pay period send-email error:', error)
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
