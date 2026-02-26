/**
 * DELETE balance override for a customer (revert to computed from items)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const decoded = decodeURIComponent(name)
    await prisma.customerAccountBalance.deleteMany({
      where: { customerName: { equals: decoded, mode: 'insensitive' } }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Account customer DELETE error:', error)
    return NextResponse.json({ error: 'Failed to remove override' }, { status: 500 })
  }
}
