import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CUTOFF = new Date('2026-10-01T00:00:00.000Z')
const CONFIRM = 'delete-pending-before-2026-10-01'

/**
 * POST /api/harvest-agent/maintenance/pending-vendor-invoices
 * One-time: delete pending vendor invoices dated before 1 October 2026.
 * Paid invoices are left in place.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    if (body?.confirm !== CONFIRM) {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
    }

    const pending = await prisma.vendorInvoice.findMany({
      where: { status: 'pending', paidInvoice: { is: null }, invoiceDate: { lt: CUTOFF } },
      select: { id: true, invoiceDate: true }
    })
    const byMonth: Record<string, number> = {}
    for (const row of pending) {
      const key = row.invoiceDate.toISOString().slice(0, 7)
      byMonth[key] = (byMonth[key] || 0) + 1
    }

    const result = await prisma.vendorInvoice.deleteMany({
      where: {
        id: { in: pending.map((row) => row.id) },
        status: 'pending',
        paidInvoice: { is: null },
        invoiceDate: { lt: CUTOFF }
      }
    })

    return NextResponse.json({ deleted: result.count, byMonth })
  } catch (error) {
    console.error('Pending vendor invoice cleanup error:', error)
    return NextResponse.json({ error: 'Failed to delete pending vendor invoices' }, { status: 500 })
  }
}
