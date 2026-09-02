import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  entryDedupeKey,
  existingEntryKeys,
  loadActiveStaffIndex,
  normalizeEntrantKey,
  parseEntrySheet
} from '@/lib/promotion-entries'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; drawId: string } }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const draw = await prisma.promotionDraw.findFirst({
      where: { id: params.drawId, promotionId: params.id }
    })
    if (!draw) {
      return NextResponse.json({ error: 'Draw not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const staffIndex = await loadActiveStaffIndex()
    const parsed = parseEntrySheet(buffer, staffIndex)

    const keys = await existingEntryKeys(params.drawId)
    let created = 0
    let skippedDuplicate = 0
    const rowErrors = [...parsed.errors]

    for (const row of parsed.rows) {
      // Per-draw import ignores draw date column if present
      const dedupe = entryDedupeKey(row.staffId, row.entrantName)
      const nameKey = `name:${normalizeEntrantKey(row.entrantName)}`
      if (keys.has(dedupe) || keys.has(nameKey)) {
        skippedDuplicate++
        continue
      }
      await prisma.promotionEntry.create({
        data: {
          drawId: params.drawId,
          staffId: row.staffId,
          entrantName: row.entrantName
        }
      })
      keys.add(dedupe)
      keys.add(nameKey)
      created++
    }

    return NextResponse.json({
      created,
      skippedDuplicate,
      errors: rowErrors,
      columnNames: parsed.columnNames,
      totalRows: parsed.rows.length
    })
  } catch (error) {
    console.error('Error importing promotion entries:', error)
    return NextResponse.json({ error: 'Failed to import entries' }, { status: 500 })
  }
}
