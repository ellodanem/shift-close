/**
 * POST: rename a customer (updates override + all shift items)
 * Body: { oldName, newName }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { oldName, newName } = body

    if (!oldName || typeof oldName !== 'string' || !oldName.trim()) {
      return NextResponse.json({ error: 'Old name is required' }, { status: 400 })
    }
    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      return NextResponse.json({ error: 'New name is required' }, { status: 400 })
    }

    const old = oldName.trim()
    const neu = newName.trim()
    if (old.toLowerCase() === neu.toLowerCase()) {
      return NextResponse.json({ error: 'New name is the same as old name' }, { status: 400 })
    }

    const existingOverride = await prisma.customerAccountBalance.findFirst({
      where: { customerName: { equals: neu, mode: 'insensitive' } }
    })
    if (existingOverride) {
      return NextResponse.json({ error: `A customer named "${neu}" already exists` }, { status: 400 })
    }

    const override = await prisma.customerAccountBalance.findFirst({
      where: { customerName: { equals: old, mode: 'insensitive' } }
    })
    if (override) {
      await prisma.customerAccountBalance.update({
        where: { id: override.id },
        data: { customerName: neu }
      })
    }

    const items = await prisma.overShortItem.findMany({
      where: { customerName: { equals: old, mode: 'insensitive' } }
    })
    if (items.length > 0) {
      await prisma.$transaction(
        items.map((item) =>
          prisma.overShortItem.update({
            where: { id: item.id },
            data: { customerName: neu }
          })
        )
      )
    }

    return NextResponse.json({ success: true, updated: items.length + (override ? 1 : 0) })
  } catch (error) {
    console.error('Account customer rename error:', error)
    return NextResponse.json({ error: 'Failed to rename' }, { status: 500 })
  }
}
