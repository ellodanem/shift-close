import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { name, badgeColor, sortOrder } = body as {
      name?: string
      badgeColor?: string
      sortOrder?: number
    }

    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (badgeColor !== undefined) data.badgeColor = badgeColor.trim() || null
    if (sortOrder !== undefined) data.sortOrder = sortOrder

    const updated = await prisma.staffRole.update({
      where: { id: params.id },
      data
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating staff role:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update staff role' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Ensure no staff are using this role
    const count = await prisma.staff.count({
      where: { roleId: params.id }
    })
    if (count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete role while staff are assigned to it.' },
        { status: 400 }
      )
    }

    await prisma.staffRole.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error deleting staff role:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to delete staff role' },
      { status: 500 }
    )
  }
}

