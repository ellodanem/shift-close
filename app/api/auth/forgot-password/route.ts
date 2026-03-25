import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'

/** POST { email } — sends reset link if user exists (always 200 to avoid enumeration). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ ok: true })
    }

    const user = await prisma.appUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    })
    if (!user) {
      return NextResponse.json({ ok: true })
    }

    const raw = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt }
    })

    const forwarded = request.headers.get('x-forwarded-host')
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    const origin = forwarded
      ? `${proto}://${forwarded}`
      : process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    const link = `${origin}/reset-password?token=${encodeURIComponent(raw)}`

    try {
      await sendMail({
        to: user.email,
        subject: 'Reset your Shift Close password',
        text: `You requested a password reset.\n\nOpen this link (valid 1 hour):\n${link}\n\nIf you did not request this, ignore this email.`,
        html: `<p>You requested a password reset.</p><p><a href="${link}">Reset password</a> (valid 1 hour)</p><p>If you did not request this, ignore this email.</p>`
      })
    } catch (e) {
      console.error('forgot-password sendMail', e)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('forgot-password', e)
    return NextResponse.json({ ok: true })
  }
}
