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

type Ctx = { params: { id: string } }

/**
 * Bulk import entries for a promotion.
 * Sheet columns: Name (required), Draw Date (optional — if omitted, use form field drawDate
 * or create/match draws from the Date column).
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const promotion = await prisma.promotion.findUnique({ where: { id: params.id } })
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const defaultDrawDate =
      typeof formData.get('drawDate') === 'string'
        ? String(formData.get('drawDate')).trim()
        : ''

    const buffer = Buffer.from(await file.arrayBuffer())
    const staffIndex = await loadActiveStaffIndex()
    const parsed = parseEntrySheet(buffer, staffIndex)

    const draws = await prisma.promotionDraw.findMany({
      where: { promotionId: params.id },
      select: { id: true, drawDate: true }
    })
    const drawByDate = new Map(draws.map((d) => [d.drawDate, d.id]))
    const keysByDraw = new Map<string, Set<string>>()

    let created = 0
    let drawsCreated = 0
    let skippedDuplicate = 0
    let skippedNoDate = 0
    const rowErrors = [...parsed.errors]

    for (const row of parsed.rows) {
      const drawDate = row.drawDate || (defaultDrawDate || null)
      if (!drawDate) {
        skippedNoDate++
        rowErrors.push(`Row ${row.rowNum}: missing draw date (add a Date column or pick a draw)`)
        continue
      }

      let drawId = drawByDate.get(drawDate)
      if (!drawId) {
        const draw = await prisma.promotionDraw.create({
          data: { promotionId: params.id, drawDate, notes: 'Created from entry import' }
        })
        drawId = draw.id
        drawByDate.set(drawDate, drawId)
        drawsCreated++
      }

      let keys = keysByDraw.get(drawId)
      if (!keys) {
        keys = await existingEntryKeys(drawId)
        keysByDraw.set(drawId, keys)
      }

      const dedupe = entryDedupeKey(row.staffId, row.entrantName)
      const nameKey = `name:${normalizeEntrantKey(row.entrantName)}`
      if (keys.has(dedupe) || keys.has(nameKey)) {
        skippedDuplicate++
        continue
      }

      await prisma.promotionEntry.create({
        data: {
          drawId,
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
      drawsCreated,
      skippedDuplicate,
      skippedNoDate,
      errors: rowErrors.slice(0, 50),
      columnNames: parsed.columnNames,
      totalRows: parsed.rows.length
    })
  } catch (error) {
    console.error('Error bulk-importing promotion entries:', error)
    return NextResponse.json({ error: 'Failed to import entries' }, { status: 500 })
  }
}
