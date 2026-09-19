import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { canManageFuelPrices } from '@/lib/roles'
import { isYmd } from '@/lib/datetime-policy'
import {
  isFuelPriceKind,
  isFuelPriceProduct,
  parsePricePerLitre
} from '@/lib/fuel-prices'
import { loadFuelPricesPayload, saveFuelPrices } from '@/lib/fuel-prices-data'

export const dynamic = 'force-dynamic'

/** GET — current + history of pump and cost prices. Settings-capable roles (middleware). */
export async function GET() {
  try {
    const payload = await loadFuelPricesPayload()
    return NextResponse.json(payload)
  } catch (error) {
    console.error('fuel-prices GET', error)
    return NextResponse.json({ error: 'Failed to load fuel prices' }, { status: 500 })
  }
}

/**
 * POST { effectiveFrom, effectiveTo?, notes?, prices: [{ product, kind, pricePerLitre }] }
 * Empty price fields should be omitted. Leave effectiveTo empty to make these current.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canManageFuelPrices(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const effectiveFrom = String(body.effectiveFrom || '')
    if (!isYmd(effectiveFrom)) {
      return NextResponse.json({ error: 'effectiveFrom must be YYYY-MM-DD' }, { status: 400 })
    }

    const effectiveToRaw = body.effectiveTo
    const effectiveTo =
      effectiveToRaw === undefined || effectiveToRaw === null || String(effectiveToRaw).trim() === ''
        ? null
        : String(effectiveToRaw)
    if (effectiveTo != null && !isYmd(effectiveTo)) {
      return NextResponse.json({ error: 'effectiveTo must be YYYY-MM-DD' }, { status: 400 })
    }

    const rawPrices = Array.isArray(body.prices) ? body.prices : []
    const prices: Array<{ product: 'unleaded' | 'diesel'; kind: 'selling' | 'cost'; pricePerLitre: number }> =
      []
    for (const row of rawPrices) {
      const product = String(row?.product || '')
      const kind = String(row?.kind || '')
      if (!isFuelPriceProduct(product) || !isFuelPriceKind(kind)) {
        return NextResponse.json({ error: 'Each price needs product (unleaded|diesel) and kind (selling|cost)' }, { status: 400 })
      }
      const pricePerLitre = parsePricePerLitre(row?.pricePerLitre)
      if (pricePerLitre == null) {
        return NextResponse.json(
          { error: 'Each pricePerLitre must be a number greater than 0' },
          { status: 400 }
        )
      }
      prices.push({ product, kind, pricePerLitre })
    }

    if (prices.length === 0) {
      return NextResponse.json({ error: 'Enter at least one price' }, { status: 400 })
    }

    const notes = typeof body.notes === 'string' ? body.notes : ''
    const saved = await saveFuelPrices({
      effectiveFrom,
      effectiveTo,
      notes,
      createdBy: session.userId,
      prices
    })
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 400 })
    }
    return NextResponse.json(saved.payload, { status: 201 })
  } catch (error) {
    console.error('fuel-prices POST', error)
    return NextResponse.json({ error: 'Failed to save fuel prices' }, { status: 500 })
  }
}
