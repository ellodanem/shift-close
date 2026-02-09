import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderedIds } = body as { orderedIds?: string[] }
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds array is required' }, { status: 400 })
    }

    const staff = await prisma.staff.findMany({
      where: { id: { in: orderedIds } },
      select: { id: true, sortOrder: true }
    })
    const idSet = new Set(staff.map((s) => s.id))
    const validOrder = orderedIds.filter((id) => idSet.has(id))
    if (validOrder.length === 0) {
      return NextResponse.json({ error: 'No valid staff ids' }, { status: 400 })
    }

    const minOrder = Math.min(...staff.map((s) => s.sortOrder))
    await prisma.$transaction(
      validOrder.map((id, index) =>
        prisma.staff.update({
          where: { id },
          data: { sortOrder: minOrder + index }
        })
      )
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error reordering staff:', error)
    return NextResponse.json({ error: 'Failed to reorder staff' }, { status: 500 })
  }
}
