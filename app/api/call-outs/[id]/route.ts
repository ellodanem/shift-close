import { NextRequest, NextResponse } from 'next/server'
import { requireCallOutWrite } from '@/lib/call-outs'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCallOutWrite(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    await prisma.staffCallOut.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting call out:', error)
    return NextResponse.json({ error: 'Failed to delete call out' }, { status: 500 })
  }
}
