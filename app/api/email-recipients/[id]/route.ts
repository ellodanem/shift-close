import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.emailRecipient.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting email recipient:', error)
    return NextResponse.json({ error: 'Failed to delete recipient' }, { status: 500 })
  }
}
