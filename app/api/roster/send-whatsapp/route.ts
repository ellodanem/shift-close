import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { sendWhatsAppWithMedia, isWhatsAppConfigured } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Set Twilio env vars.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { to, imageBase64, weekStart } = body as {
      to?: string | string[]
      imageBase64?: string
      weekStart?: string
    }

    const recipients = Array.isArray(to)
      ? (to as string[]).map((t) => t?.trim()).filter(Boolean)
      : to?.trim()
        ? [to.trim()]
        : []
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 })
    }
    if (!imageBase64?.trim()) {
      return NextResponse.json({ error: 'Image (imageBase64) is required' }, { status: 400 })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const blob = await put(
      `roster/${Date.now()}-roster.png`,
      buffer,
      { access: 'public', contentType: 'image/png' }
    )

    const messageBody = weekStart
      ? `Roster – Week of ${weekStart}\n\n— Shift Close`
      : 'Roster – Shift Close'

    const sent: string[] = []
    const errors: string[] = []
    for (const phone of recipients) {
      try {
        await sendWhatsAppWithMedia(phone, messageBody, blob.url, { weekStart })
        sent.push(phone)
      } catch (err) {
        errors.push(`${phone}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      sent: sent.length,
      details: sent,
      errors: errors.length > 0 ? errors : undefined,
      message: sent.length === recipients.length
        ? `Roster sent to ${sent.length} recipients`
        : `Sent to ${sent.length} of ${recipients.length}. ${errors.length} failed.`
    })
  } catch (error: unknown) {
    console.error('Roster WhatsApp send error:', error)
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to send roster via WhatsApp' },
      { status: 500 }
    )
  }
}
