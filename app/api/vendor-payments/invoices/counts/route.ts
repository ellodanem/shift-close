import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET — tab badge counts without loading full invoice lists. */
export async function GET() {
  try {
    const [pendingCount, paidCount] = await Promise.all([
      prisma.vendorInvoice.count({ where: { status: 'pending' } }),
      prisma.vendorInvoice.count({ where: { status: 'paid' } })
    ])
    return NextResponse.json({ pendingCount, paidCount })
  } catch (error) {
    console.error('Error fetching vendor invoice counts:', error)
    return NextResponse.json({ error: 'Failed to fetch counts' }, { status: 500 })
  }
}
