import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { APP_ROLES, canAssignAppRole, canManageAppUsers, normalizeAppRole } from '@/lib/roles'

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
      firstName: true,
      lastName: true,
      role: true,
      isSuperAdmin: true,
      createdAt: true,
      updatedAt: true
    }
  })
  return NextResponse.json(
    users.map((u) => ({
      ...u,
      role: normalizeAppRole(u.role)
    }))
  )
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
    const role = normalizeAppRole(String(body.role ?? ''))
    const firstName = body.firstName !== undefined ? String(body.firstName).trim() || null : null
    const lastName = body.lastName !== undefined ? String(body.lastName).trim() || null : null

    if (!username || !email || !password || !APP_ROLES.includes(role as (typeof APP_ROLES)[number])) {
      return NextResponse.json({ error: 'Invalid username, email, password, or role' }, { status: 400 })
    }

    if (!canAssignAppRole(session.role, role)) {
      return NextResponse.json({ error: 'You cannot assign this role' }, { status: 403 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.appUser.create({
      data: {
        username,
        email,
        firstName,
        lastName,
        passwordHash,
        role,
        isSuperAdmin: false
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isSuperAdmin: true,
        createdAt: true,
        updatedAt: true
      }
    })
    return NextResponse.json({ ...user, role: normalizeAppRole(user.role) })
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002'
      ? 'Username or email already exists'
      : 'Failed to create user'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
