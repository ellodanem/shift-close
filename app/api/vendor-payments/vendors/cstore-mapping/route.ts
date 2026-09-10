import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeVendorKey } from '@/lib/harvest-vendor-invoices'

/**
 * GET /api/vendor-payments/vendors/cstore-mapping
 * Vendors plus simple mismatch hints for the mapping UI.
 */
export async function GET() {
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        cstoreName: true,
        _count: { select: { invoices: true } }
      }
    })

    const byCstoreKey = new Map<string, typeof vendors>()
    for (const v of vendors) {
      const key = normalizeVendorKey(v.cstoreName || v.name)
      if (!key) continue
      const list = byCstoreKey.get(key) || []
      list.push(v)
      byCstoreKey.set(key, list)
    }

    const rows = vendors.map((v) => {
      const ownKey = normalizeVendorKey(v.name)
      const mappedKey = normalizeVendorKey(v.cstoreName || '')
      const nameEqualsCstore =
        !v.cstoreName || normalizeVendorKey(v.cstoreName) === ownKey
      const collision = mappedKey
        ? (byCstoreKey.get(mappedKey) || []).filter((o) => o.id !== v.id)
        : (byCstoreKey.get(ownKey) || []).filter((o) => o.id !== v.id)

      return {
        ...v,
        mapped: Boolean(v.cstoreName && v.cstoreName.trim()),
        nameEqualsCstore,
        possibleDuplicates: collision.map((o) => ({
          id: o.id,
          name: o.name,
          cstoreName: o.cstoreName,
          invoices: o._count.invoices
        }))
      }
    })

    return NextResponse.json({ vendors: rows })
  } catch (error) {
    console.error('cstore-mapping GET', error)
    return NextResponse.json({ error: 'Failed to load mapping' }, { status: 500 })
  }
}

/**
 * PATCH /api/vendor-payments/vendors/cstore-mapping
 * Body: { updates: [{ id, cstoreName }] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const updates = Array.isArray(body.updates) ? body.updates : []
    if (updates.length === 0) {
      return NextResponse.json({ error: 'updates array is required' }, { status: 400 })
    }

    let saved = 0
    for (const row of updates) {
      if (!row || typeof row.id !== 'string') continue
      const cstoreName =
        typeof row.cstoreName === 'string' && row.cstoreName.trim()
          ? row.cstoreName.trim()
          : null
      await prisma.vendor.update({
        where: { id: row.id },
        data: { cstoreName }
      })
      saved += 1
    }

    return NextResponse.json({ ok: true, saved })
  } catch (error) {
    console.error('cstore-mapping PATCH', error)
    return NextResponse.json({ error: 'Failed to save mapping' }, { status: 500 })
  }
}
