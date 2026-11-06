import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { parseCstoreImport, saveCstoreSnapshot } from '@/lib/cstore-day-report'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/import/cstore-day-report
 * Saves one day's Cstore daily report figures (read-only snapshot used by End of Day V2).
 * Sending the same date again replaces that day's snapshot. Never touches shift data.
 *
 * Body (numbers may be plain numbers or "$1,234.56" strings; fuel is litres even though Cstore says gal):
 *   date, grocery, salesTax, regularAmt, dieselAmt, custAccountPayIn, totalSales,
 *   depositsTyped, fleetBatch ("Credit card batches"), creditDebitBatch ("Credit card 2 batch"),
 *   custAccountSales, totalCollections, shortOver, regularLitres, dieselLitres,
 *   tank: { regular: {opening,purchase,closing,stick,os}, diesel: {...} }, source: "agent" | "manual"
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const parsed = parseCstoreImport(body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const saved = await saveCstoreSnapshot(parsed.value)
    return NextResponse.json({ date: saved.date, pulledAt: saved.pulledAt, source: saved.source })
  } catch (error) {
    console.error('Cstore day report import error:', error)
    return NextResponse.json({ error: 'Failed to save Cstore day report' }, { status: 500 })
  }
}
