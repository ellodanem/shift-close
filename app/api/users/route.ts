import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { canManageAppUsers } from '@/lib/roles'
import { APP_ROLES } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canManageAppUsers(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await prisma.appUser.findMany({
    orderBy: { username: 'asc' },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isSuperAdmin: true,
      createdAt: true,
      updatedAt: true
    }
  })
  return NextResponse.json(users)
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canManageAppUsers(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const username = String(body.username ?? '').trim().toLowerCase()
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    const role = String(body.role ?? '').trim()

    if (!username || !email || !password || !APP_ROLES.includes(role as (typeof APP_ROLES)[number])) {
      return NextResponse.json({ error: 'Invalid username, email, password, or role' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.appUser.create({
      data: {
        username,
        email,
        passwordHash,
        role,
        isSuperAdmin: false
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isSuperAdmin: true,
        createdAt: true,
        updatedAt: true
      }
    })
    return NextResponse.json(user)
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002'
      ? 'Username or email already exists'
      : 'Failed to create user'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
