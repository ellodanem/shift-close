import { NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { listDirectory, addMissingDirectoryNames } from '@/lib/customer-ar-directory'
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

/**
 * POST /api/harvest-agent/customers
 * Add Cstore account names that are not yet in the Shift Close directory.
 * Existing names (including Cstore aliases) are skipped.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const names = Array.isArray(body.names)
      ? body.names.filter((n: unknown) => typeof n === 'string').map((n: string) => n.trim())
      : []
    if (names.length === 0) {
      return NextResponse.json({ error: 'names[] is required' }, { status: 400 })
    }
    if (names.length > 100) {
      return NextResponse.json({ error: 'Too many names' }, { status: 400 })
    }

    const { created, skipped } = await addMissingDirectoryNames(names)
    return NextResponse.json({
      created: created.map((c) => ({
        id: c.id,
        name: c.name,
        cstoreName: c.cstoreName
      })),
      skipped
    })
  } catch (error) {
    console.error('Harvest customers create error:', error)
    return NextResponse.json({ error: 'Failed to add customers' }, { status: 500 })
  }
}
