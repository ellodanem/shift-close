import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Delete a specific day-off record (soft override / clear)

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    await prisma.staffDayOff.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting staff day off record:', error)
    return NextResponse.json(
      { error: 'Failed to delete day off record' },
      { status: 500 }
    )
  }
}

