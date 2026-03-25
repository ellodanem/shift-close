import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { SESSION_COOKIE, signSessionToken } from '@/lib/session'
import { normalizeAppRole } from '@/lib/roles'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const username = String(body.username ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const rememberMe = Boolean(body.rememberMe)

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    const user = await prisma.appUser.findUnique({
      where: { username }
    })
    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const roleNorm = normalizeAppRole(user.role)
    const token = await signSessionToken(
      {
        id: user.id,
        role: roleNorm,
        isSuperAdmin: user.isSuperAdmin
      },
      { rememberMe }
    )

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: roleNorm,
        isSuperAdmin: user.isSuperAdmin
      }
    })

    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      ...(rememberMe ? { maxAge: 60 * 60 * 24 * 30 } : {})
    })

    return res
  } catch (e) {
    console.error('login error', e)
    if (e instanceof Error && e.message.includes('AUTH_SECRET')) {
      return NextResponse.json(
        {
          error:
            'Server configuration: AUTH_SECRET is missing or too short. Add it in Vercel → Environment Variables (min 16 characters), then redeploy.'
        },
        { status: 503 }
      )
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2021') {
        return NextResponse.json(
          {
            error:
              'Database is missing app user tables. Run: npx prisma migrate deploy && npx prisma db seed'
          },
          { status: 503 }
        )
      }
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
