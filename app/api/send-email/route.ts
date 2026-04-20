import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/email'

type AttachmentInput = {
  filename?: string
  contentBase64?: string
  contentType?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, subject, html, text, attachments } = body as {
      to?: string
      subject?: string
      html?: string
      text?: string
      attachments?: AttachmentInput[]
    }

    if (!to?.trim()) {
      return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 })
    }
    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    const parsedAttachments =
      Array.isArray(attachments) && attachments.length > 0
        ? attachments
            .map((a) => {
              const filename = typeof a.filename === 'string' ? a.filename.trim() : ''
              const b64 = typeof a.contentBase64 === 'string' ? a.contentBase64.trim() : ''
              if (!filename || !b64) return null
              let buf: Buffer
              try {
                buf = Buffer.from(b64, 'base64')
              } catch {
                return null
              }
              if (!buf.length) return null
              return {
                filename,
                content: buf,
                contentType: typeof a.contentType === 'string' && a.contentType.trim() ? a.contentType.trim() : undefined
              }
            })
            .filter((x): x is NonNullable<typeof x> => x != null)
        : undefined

    await sendMail({
      to: to.trim(),
      subject: subject.trim(),
      html: html || undefined,
      text: text || undefined,
      attachments: parsedAttachments?.length ? parsedAttachments : undefined
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
