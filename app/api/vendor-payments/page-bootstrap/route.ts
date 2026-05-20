import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET — vendors list + invoice tab counts in one request (vendor payments landing). */
export async function GET() {
  try {
    const [vendors, pendingCount, paidCount] = await Promise.all([
      prisma.vendor.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { invoices: true }
          }
        }
      }),
      prisma.vendorInvoice.count({ where: { status: 'pending' } }),
      prisma.vendorInvoice.count({ where: { status: 'paid' } })
    ])
    return NextResponse.json({ vendors, pendingCount, paidCount })
  } catch (error) {
    console.error('vendor-payments page-bootstrap error:', error)
    return NextResponse.json({ error: 'Failed to load vendor payments data' }, { status: 500 })
  }
}
