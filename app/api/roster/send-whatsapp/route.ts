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
      to?: string
      imageBase64?: string
      weekStart?: string
    }

    if (!to?.trim()) {
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

    await sendWhatsAppWithMedia(to.trim(), messageBody, blob.url)

    return NextResponse.json({
      success: true,
      message: `Roster sent to ${to}`
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
