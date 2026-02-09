import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { name, startTime, endTime, color, sortOrder } = body as {
      name?: string
      startTime?: string
      endTime?: string
      color?: string
      sortOrder?: number
    }

    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (startTime !== undefined) data.startTime = startTime.trim()
    if (endTime !== undefined) data.endTime = endTime.trim()
    if (color !== undefined) data.color = color.trim() || null
    if (sortOrder !== undefined) data.sortOrder = sortOrder

    const updated = await prisma.shiftTemplate.update({
      where: { id },
      data
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating shift template:', error)
    return NextResponse.json({ error: 'Failed to update shift template' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    await prisma.shiftTemplate.delete({
      where: { id }
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting shift template:', error)
    return NextResponse.json({ error: 'Failed to delete shift template' }, { status: 500 })
  }
}

