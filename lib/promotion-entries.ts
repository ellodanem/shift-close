import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'

export function normalizeEntrantKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function getCol(row: Record<string, unknown>, ...names: string[]): unknown {
  const keys = Object.keys(row)
  for (const name of names) {
    const exact = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase())
    if (exact != null && row[exact] !== undefined && row[exact] !== '') return row[exact]
  }
  return null
}

/** Excel serial dates or common string formats → YYYY-MM-DD */
export function parseImportDate(val: unknown): string | null {
  if (val == null || val === '') return null
  if (typeof val === 'number' && Number.isFinite(val)) {
    const parsed = XLSX.SSF.parse_date_code(val)
    if (!parsed) return null
    const y = parsed.y
    const m = String(parsed.m).padStart(2, '0')
    const d = String(parsed.d).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const mdy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s)
  if (mdy) {
    let year = Number(mdy[3])
    if (year < 100) year += 2000
    const month = String(Number(mdy[1])).padStart(2, '0')
    const day = String(Number(mdy[2])).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function extractEntrantName(row: Record<string, unknown>): string {
  const raw = getCol(
    row,
    'Name',
    'Entrant',
    'Driver',
    'Bus Driver',
    'Staff',
    'Staff Name',
    'Full Name',
    'Employee',
    'Participant'
  )
  return String(raw ?? '').trim()
}

export type StaffMatch = { id: string; name: string }

export function buildStaffNameIndex(staff: StaffMatch[]): Map<string, StaffMatch> {
  const map = new Map<string, StaffMatch>()
  for (const s of staff) {
    const key = normalizeEntrantKey(s.name)
    if (key && !map.has(key)) map.set(key, s)
  }
  return map
}

export function matchStaffByName(
  name: string,
  index: Map<string, StaffMatch>
): StaffMatch | null {
  return index.get(normalizeEntrantKey(name)) ?? null
}

export type ParsedEntryRow = {
  rowNum: number
  entrantName: string
  drawDate: string | null
  staffId: string | null
}

export function parseEntrySheet(
  buffer: Buffer,
  staffIndex: Map<string, StaffMatch>
): { rows: ParsedEntryRow[]; columnNames: string[]; errors: string[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { rows: [], columnNames: [], errors: ['Workbook has no sheets'] }
  }
  const sheet = workbook.Sheets[sheetName]
  const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  const columnNames = json.length > 0 ? Object.keys(json[0]) : []
  const rows: ParsedEntryRow[] = []
  const errors: string[] = []

  for (let i = 0; i < json.length; i++) {
    const row = json[i]
    const rowNum = i + 2
    const entrantName = extractEntrantName(row)
    if (!entrantName) {
      // Skip blank rows silently
      const hasAny = Object.values(row).some((v) => String(v ?? '').trim())
      if (hasAny) errors.push(`Row ${rowNum}: missing name`)
      continue
    }
    const drawRaw = getCol(row, 'Draw Date', 'Draw date', 'Date', 'draw_date', 'Draw')
    const drawDate = drawRaw != null && String(drawRaw).trim() !== '' ? parseImportDate(drawRaw) : null
    if (drawRaw != null && String(drawRaw).trim() !== '' && !drawDate) {
      errors.push(`Row ${rowNum}: invalid draw date`)
      continue
    }
    const staff = matchStaffByName(entrantName, staffIndex)
    rows.push({
      rowNum,
      entrantName,
      drawDate,
      staffId: staff?.id ?? null
    })
  }

  return { rows, columnNames, errors }
}

export async function loadActiveStaffIndex(): Promise<Map<string, StaffMatch>> {
  const staff = await prisma.staff.findMany({
    where: { status: 'active' },
    select: { id: true, name: true }
  })
  return buildStaffNameIndex(staff)
}

/** Existing entry keys for a draw: staffId or normalized name */
export async function existingEntryKeys(drawId: string): Promise<Set<string>> {
  const existing = await prisma.promotionEntry.findMany({
    where: { drawId },
    select: { staffId: true, entrantName: true }
  })
  const keys = new Set<string>()
  for (const e of existing) {
    if (e.staffId) keys.add(`staff:${e.staffId}`)
    keys.add(`name:${normalizeEntrantKey(e.entrantName)}`)
  }
  return keys
}

export function entryDedupeKey(staffId: string | null, entrantName: string): string {
  if (staffId) return `staff:${staffId}`
  return `name:${normalizeEntrantKey(entrantName)}`
}
