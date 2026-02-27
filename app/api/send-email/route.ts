import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, subject, html, text } = body as { to?: string; subject?: string; html?: string; text?: string }

    if (!to?.trim()) {
      return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 })
    }
    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    await sendMail({
      to: to.trim(),
      subject: subject.trim(),
      html: html || undefined,
      text: text || undefined
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Send email error:', error)
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
