import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(request: NextRequest) {
  try {
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.EMAIL_FROM || user

    if (!user || !pass) {
      return NextResponse.json(
        { error: 'Email not configured. Set SMTP_USER and SMTP_PASS (Gmail App Password).' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { to, subject, html, text } = body as { to?: string; subject?: string; html?: string; text?: string }

    if (!to?.trim()) {
      return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 })
    }
    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass }
    })

    await transporter.sendMail({
      from: from || user,
      to: to.trim(),
      subject: subject.trim(),
      text: text || (html ? html.replace(/<[^>]*>/g, '') : ''),
      html: html || undefined
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Send email error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
