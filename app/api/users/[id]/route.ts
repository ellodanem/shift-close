import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { APP_ROLES, canManageAppUsers, normalizeAppRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request)
  if (!session || !canManageAppUsers(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.appUser.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.isSuperAdmin) {
    return NextResponse.json({ error: 'Super admin account cannot be modified' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const data: Record<string, unknown> = {}

    if (body.username !== undefined) data.username = String(body.username).trim().toLowerCase()
    if (body.email !== undefined) data.email = String(body.email).trim()
    if (body.firstName !== undefined) data.firstName = String(body.firstName).trim() || null
    if (body.lastName !== undefined) data.lastName = String(body.lastName).trim() || null
    if (body.role !== undefined) {
      const r = normalizeAppRole(String(body.role))
      if (!APP_ROLES.includes(r as (typeof APP_ROLES)[number])) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      data.role = r
    }
    if (body.password !== undefined && String(body.password).length > 0) {
      data.passwordHash = await bcrypt.hash(String(body.password), 12)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes' }, { status: 400 })
    }

    const user = await prisma.appUser.update({
      where: { id },
      data,
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
    const msg =
      e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002'
        ? 'Username or email already exists'
        : 'Failed to update user'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request)
  if (!session || !canManageAppUsers(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.appUser.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.isSuperAdmin) {
    return NextResponse.json({ error: 'Super admin account cannot be deleted' }, { status: 403 })
  }

  await prisma.appUser.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
