import { NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { listDirectory } from '@/lib/customer-ar-directory'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/harvest-agent/customers
 * Active Shift Close customer directory for harvest jobs.
 */
export async function GET(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const customers = await listDirectory(false)
    return NextResponse.json({
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        cstoreName: c.cstoreName
      })),
      first: customers[0]
        ? { id: customers[0].id, name: customers[0].name, cstoreName: customers[0].cstoreName }
        : null
    })
  } catch (error) {
    console.error('Harvest customers error:', error)
    return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 })
  }
}
