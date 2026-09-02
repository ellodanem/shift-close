import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { importCstoreCreditReport } from '@/lib/customer-ar-cstore-import'
import { listDirectory, matchDirectoryCustomer } from '@/lib/customer-ar-directory'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/import/customer-credit-report
 * Harvest agent Cstore Customer Credit Report (Details) import.
 * Unknown Cstore names are rejected (customer_missing) — they are not created.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const cstoreLabel = typeof body.account === 'string' ? body.account.trim() : ''
    if (!cstoreLabel) {
      return NextResponse.json({ error: 'account is required' }, { status: 400 })
    }

    const directory = await listDirectory(true)
    const match = matchDirectoryCustomer(directory, cstoreLabel)
    if (!match || !match.active) {
      return NextResponse.json(
        {
          error: 'customer_missing',
          code: 'customer_missing',
          account: cstoreLabel,
          message: `${cstoreLabel} is not in the Shift Close customer list`
        },
        { status: 409 }
      )
    }

    const result = await importCstoreCreditReport({
      account: match.name,
      year: Number(body.year),
      month: Number(body.month),
      html: typeof body.html === 'string' ? body.html : undefined,
      opening: body.opening,
      entries: body.entries,
      updateSnapshot: body.updateSnapshot !== false,
      allowEmpty: true
    })

    if ('error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(
      {
        imported: result.imported,
        empty: result.empty,
        opening: result.opening,
        account: result.view?.account,
        totals: result.view?.totals,
        directoryName: match.name
      },
      { status: result.status }
    )
  } catch (error) {
    console.error('Harvest customer-credit import error:', error)
    return NextResponse.json({ error: 'Failed to import customer credit report' }, { status: 500 })
  }
}
