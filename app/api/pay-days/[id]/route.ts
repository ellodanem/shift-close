/**
 * DELETE a pay day
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.payDay.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Pay day DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete pay day' }, { status: 500 })
  }
}
