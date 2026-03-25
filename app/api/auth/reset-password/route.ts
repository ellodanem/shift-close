import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

/** POST { token, password } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = String(body.token ?? '')
    const password = String(body.password ?? '')
    if (!token || password.length < 8) {
      return NextResponse.json({ error: 'Invalid token or password too short (min 8)' }, { status: 400 })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const row = await prisma.passwordResetToken.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } }
    })
    if (!row) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.$transaction([
      prisma.appUser.update({
        where: { id: row.userId },
        data: { passwordHash }
      }),
      prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } })
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('reset-password', e)
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
  }
}
