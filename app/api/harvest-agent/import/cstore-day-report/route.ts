import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { parseCstoreHtmlImport, parseCstoreImport, saveCstoreSnapshot } from '@/lib/cstore-day-report'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/import/cstore-day-report
 * Saves one day's Cstore daily report figures (read-only snapshot used by End of Day V2).
 * Sending the same date again replaces that day's snapshot. Never touches shift data.
 *
 * Two ways in:
 *  1. { date: "YYYY-MM-DD", html } — the printable Daily Report page captured by the harvest agent.
 *     A page with nothing saved for that day answers 200 { saved: false, reason: "not_ready" } so the
 *     agent can move on without treating it as a failure.
 *  2. Structured figures (numbers may be plain numbers or "$1,234.56" strings; fuel is litres even
 *     though Cstore says gal): date, grocery, salesTax, regularAmt, dieselAmt, custAccountPayIn,
 *     totalSales, depositsTyped, fleetBatch ("Credit card batches"), creditDebitBatch
 *     ("Credit card 2 batch"), custAccountSales, totalCollections, shortOver, regularLitres,
 *     dieselLitres, tank, source.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))

    if (typeof body.html === 'string') {
      const date = typeof body.date === 'string' ? body.date.trim() : ''
      const result = parseCstoreHtmlImport(date, body.html)
      if (!result.ok) {
        if (result.code === 'not_ready') {
          return NextResponse.json({ saved: false, reason: 'not_ready', message: result.message })
        }
        const status = result.code === 'bad_request' ? 400 : 422
        return NextResponse.json({ error: result.code, message: result.message }, { status })
      }
      const saved = await saveCstoreSnapshot(result.value)
      return NextResponse.json({
        saved: true,
        date: saved.date,
        pulledAt: saved.pulledAt,
        source: saved.source,
        complete: result.complete
      })
    }

    const parsed = parseCstoreImport(body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const saved = await saveCstoreSnapshot(parsed.value)
    return NextResponse.json({
      saved: true,
      date: saved.date,
      pulledAt: saved.pulledAt,
      source: saved.source,
      complete: parsed.value.depositsTyped > 0
    })
  } catch (error) {
    console.error('Cstore day report import error:', error)
    return NextResponse.json({ error: 'Failed to save Cstore day report' }, { status: 500 })
  }
}
