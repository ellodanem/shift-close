import { prisma } from '@/lib/prisma'
import { isYmd } from '@/lib/datetime-policy'
import type { CstoreSnapshot, TankFigures } from '@/lib/day-reconcile'

type DbRow = {
  date: string
  grocery: number
  salesTax: number
  regularAmt: number
  dieselAmt: number
  custAccountPayIn: number
  totalSales: number
  depositsTyped: number
  fleetBatch: number
  creditDebitBatch: number
  custAccountSales: number
  totalCollections: number
  shortOver: number
  regularLitres: number
  dieselLitres: number
  tankJson: unknown
  source: string
  pulledAt: Date
}

function toSnapshot(row: DbRow): CstoreSnapshot {
  const tank =
    row.tankJson && typeof row.tankJson === 'object'
      ? (row.tankJson as CstoreSnapshot['tank'])
      : null
  return {
    date: row.date,
    grocery: row.grocery,
    salesTax: row.salesTax,
    regularAmt: row.regularAmt,
    dieselAmt: row.dieselAmt,
    custAccountPayIn: row.custAccountPayIn,
    totalSales: row.totalSales,
    depositsTyped: row.depositsTyped,
    fleetBatch: row.fleetBatch,
    creditDebitBatch: row.creditDebitBatch,
    custAccountSales: row.custAccountSales,
    totalCollections: row.totalCollections,
    shortOver: row.shortOver,
    regularLitres: row.regularLitres,
    dieselLitres: row.dieselLitres,
    tank,
    pulledAt: row.pulledAt.toISOString(),
    source: row.source
  }
}

/** Cstore snapshots for a set of dates, keyed by date. A missing table (migration not run yet) reads as none. */
export async function loadCstoreSnapshots(dates: string[]): Promise<Map<string, CstoreSnapshot>> {
  const out = new Map<string, CstoreSnapshot>()
  if (dates.length === 0) return out
  try {
    const rows = await prisma.cstoreDayReport.findMany({ where: { date: { in: dates } } })
    for (const row of rows) out.set(row.date, toSnapshot(row as unknown as DbRow))
  } catch (error) {
    console.error('Cstore day reports unavailable (has the migration run?):', error)
  }
  return out
}

function num(value: unknown, field: string, required: boolean): number | { error: string } {
  if (value === undefined || value === null || value === '') {
    return required ? { error: `${field} is required` } : 0
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n)) return { error: `${field} must be a number` }
  return n
}

function tankFigures(value: unknown): TankFigures | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const pick = (k: string) => {
    const n = typeof v[k] === 'number' ? (v[k] as number) : Number(v[k])
    return Number.isFinite(n) ? n : null
  }
  return {
    opening: pick('opening'),
    purchase: pick('purchase'),
    closing: pick('closing'),
    stick: pick('stick'),
    os: pick('os')
  }
}

export type CstoreImportInput = Omit<CstoreSnapshot, 'pulledAt'> & { source: string }

/** Validate the body the agent (or a manual import) sends. Cstore labels fuel "gal" but sends litres. */
export function parseCstoreImport(body: unknown): { value: CstoreImportInput } | { error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const date = typeof b.date === 'string' ? b.date.trim() : ''
  if (!isYmd(date)) return { error: 'date must be YYYY-MM-DD' }

  const fields: Array<[keyof CstoreSnapshot, boolean]> = [
    ['grocery', false],
    ['salesTax', false],
    ['regularAmt', false],
    ['dieselAmt', false],
    ['custAccountPayIn', false],
    ['totalSales', true],
    ['depositsTyped', false],
    ['fleetBatch', false],
    ['creditDebitBatch', false],
    ['custAccountSales', false],
    ['totalCollections', true],
    ['shortOver', true],
    ['regularLitres', false],
    ['dieselLitres', false]
  ]
  const out: Record<string, number> = {}
  for (const [field, required] of fields) {
    const r = num(b[field], field, required)
    if (typeof r === 'object') return { error: r.error }
    out[field] = r
  }

  const tankRaw = b.tank && typeof b.tank === 'object' ? (b.tank as Record<string, unknown>) : null
  const tank = tankRaw
    ? { regular: tankFigures(tankRaw.regular), diesel: tankFigures(tankRaw.diesel) }
    : null

  return {
    value: {
      date,
      grocery: out.grocery,
      salesTax: out.salesTax,
      regularAmt: out.regularAmt,
      dieselAmt: out.dieselAmt,
      custAccountPayIn: out.custAccountPayIn,
      totalSales: out.totalSales,
      depositsTyped: out.depositsTyped,
      fleetBatch: out.fleetBatch,
      creditDebitBatch: out.creditDebitBatch,
      custAccountSales: out.custAccountSales,
      totalCollections: out.totalCollections,
      shortOver: out.shortOver,
      regularLitres: out.regularLitres,
      dieselLitres: out.dieselLitres,
      tank,
      source: b.source === 'agent' ? 'agent' : 'manual'
    }
  }
}

export async function saveCstoreSnapshot(input: CstoreImportInput) {
  const data = {
    grocery: input.grocery,
    salesTax: input.salesTax,
    regularAmt: input.regularAmt,
    dieselAmt: input.dieselAmt,
    custAccountPayIn: input.custAccountPayIn,
    totalSales: input.totalSales,
    depositsTyped: input.depositsTyped,
    fleetBatch: input.fleetBatch,
    creditDebitBatch: input.creditDebitBatch,
    custAccountSales: input.custAccountSales,
    totalCollections: input.totalCollections,
    shortOver: input.shortOver,
    regularLitres: input.regularLitres,
    dieselLitres: input.dieselLitres,
    tankJson: input.tank ? (input.tank as object) : undefined,
    source: input.source,
    pulledAt: new Date()
  }
  return prisma.cstoreDayReport.upsert({
    where: { date: input.date },
    create: { date: input.date, ...data },
    update: data
  })
}
