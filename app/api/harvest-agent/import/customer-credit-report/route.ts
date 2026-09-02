import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { importCstoreCreditReport } from '@/lib/customer-ar-cstore-import'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/import/customer-credit-report
 * Harvest agent Cstore Customer Credit Report (Details) import.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const result = await importCstoreCreditReport({
      account: typeof body.account === 'string' ? body.account : '',
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
        totals: result.view?.totals
      },
      { status: result.status }
    )
  } catch (error) {
    console.error('Harvest customer-credit import error:', error)
    return NextResponse.json({ error: 'Failed to import customer credit report' }, { status: 500 })
  }
}
