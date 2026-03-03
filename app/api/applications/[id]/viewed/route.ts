import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Mark as viewed (Option B: only when PDF is actually opened)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const app = await prisma.applicantApplication.findUnique({
      where: { id }
    })
    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }
    if (app.viewedAt) {
      return NextResponse.json({ viewedAt: app.viewedAt })
    }

    const updated = await prisma.applicantApplication.update({
      where: { id },
      data: {
        viewedAt: new Date(),
        status: app.status === 'new' ? 'viewed' : app.status
      }
    })
    return NextResponse.json({ viewedAt: updated.viewedAt })
  } catch (error) {
    console.error('Error marking application viewed:', error)
    return NextResponse.json({ error: 'Failed to mark viewed' }, { status: 500 })
  }
}
