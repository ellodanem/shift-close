import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { generateMonthlyReportPdfBuffer } from '@/lib/monthlyReportPdf'

export async function POST(request: NextRequest) {
  try {
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.EMAIL_FROM || user

    if (!user || !pass) {
      return NextResponse.json(
        { error: 'Email not configured. Set SMTP_USER and SMTP_PASS in Settings.' },
        { status: 500 }
      )
    }

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

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass }
    })

    await transporter.sendMail({
      from: from || user,
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
  } catch (error: any) {
    console.error('Monthly report email error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
