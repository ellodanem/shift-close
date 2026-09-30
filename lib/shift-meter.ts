export const METER_FIELDS = [
  'unleadedMeterOpen',
  'unleadedMeterClose',
  'unleadedMeterTest',
  'dieselMeterOpen',
  'dieselMeterClose',
  'dieselMeterTest'
] as const

export type MeterField = (typeof METER_FIELDS)[number]

export type MeterReadingFields = Record<MeterField, number | null>

export type MeterCarrySource = {
  date: string
  shift: string
}

export type MeterCarry = {
  unleadedOpen: number | null
  dieselOpen: number | null
  unleadedSource: MeterCarrySource | null
  dieselSource: MeterCarrySource | null
}

export type MeterChange = {
  field: MeterField
  oldValue: string
  newValue: string
}

const EMPTY_CARRY: MeterCarry = {
  unleadedOpen: null,
  dieselOpen: null,
  unleadedSource: null,
  dieselSource: null
}

export function emptyMeterReadings(): MeterReadingFields {
  return {
    unleadedMeterOpen: null,
    unleadedMeterClose: null,
    unleadedMeterTest: null,
    dieselMeterOpen: null,
    dieselMeterClose: null,
    dieselMeterTest: null
  }
}

/** 6-1 (and the single custom shift) come before 1-9 on the same date. */
export function shiftSequenceRank(shift: string): number {
  return shift === '1-9' ? 2 : 1
}

export function isBeforeShift(
  candidate: { date: string; shift: string },
  current: { date: string; shift: string }
): boolean {
  if (candidate.date < current.date) return true
  if (candidate.date > current.date) return false
  return shiftSequenceRank(candidate.shift) < shiftSequenceRank(current.shift)
}

export function roundMeterLitres(value: number): number {
  return Math.round(value * 100) / 100
}

export function parseMeterField(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return roundMeterLitres(n)
}

export function meterReadingsFromUnknown(source: object | null | undefined): MeterReadingFields {
  const record = (source ?? {}) as Record<string, unknown>
  const readings = emptyMeterReadings()
  for (const field of METER_FIELDS) {
    readings[field] = parseMeterField(record[field])
  }
  return readings
}

export function hasMeterReadings(readings: MeterReadingFields): boolean {
  return (
    readings.unleadedMeterOpen != null ||
    readings.unleadedMeterClose != null ||
    readings.dieselMeterOpen != null ||
    readings.dieselMeterClose != null
  )
}

/** Litres that passed through the pumps: close − open − test. */
export function meterLitres(open: number | null, close: number | null, test: number | null): number | null {
  if (open == null || close == null) return null
  return roundMeterLitres(close - open - (test ?? 0))
}

/** Meter litres minus the CStore litres already stored on the shift. */
export function meterVariance(meter: number | null, cstoreLitres: number): number | null {
  if (meter == null) return null
  const cstore = Number.isFinite(cstoreLitres) ? cstoreLitres : 0
  return roundMeterLitres(meter - cstore)
}

export function formatMeterVariance(variance: number | null): string {
  if (variance == null) return '—'
  if (Math.abs(variance) < 0.05) return '0'
  const text = Number.isInteger(variance) ? String(variance) : variance.toFixed(2)
  return variance > 0 ? `+${text} L` : `${text} L`
}

function sameReading(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 0.001
}

export function meterPatchFromBody(
  body: object,
  existing: Partial<MeterReadingFields>
): { data: Partial<MeterReadingFields>; changes: MeterChange[] } {
  const record = body as Record<string, unknown>
  const data: Partial<MeterReadingFields> = {}
  const changes: MeterChange[] = []
  for (const field of METER_FIELDS) {
    if (!(field in record)) continue
    const next = parseMeterField(record[field])
    const prev = parseMeterField(existing[field])
    data[field] = next
    if (!sameReading(prev, next)) {
      changes.push({
        field,
        oldValue: prev == null ? '' : String(prev),
        newValue: next == null ? '' : String(next)
      })
    }
  }
  return { data, changes }
}

type CarryRow = {
  date: string
  shift: string
  unleadedMeterClose: number | null
  dieselMeterClose: number | null
}

export function pickMeterCarry(rows: CarryRow[], current: { date: string; shift: string }): MeterCarry {
  const prior = rows
    .filter((row) => isBeforeShift(row, current))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return shiftSequenceRank(b.shift) - shiftSequenceRank(a.shift)
    })

  const carry: MeterCarry = { ...EMPTY_CARRY }
  for (const row of prior) {
    if (carry.unleadedOpen == null && row.unleadedMeterClose != null) {
      carry.unleadedOpen = row.unleadedMeterClose
      carry.unleadedSource = { date: row.date, shift: row.shift }
    }
    if (carry.dieselOpen == null && row.dieselMeterClose != null) {
      carry.dieselOpen = row.dieselMeterClose
      carry.dieselSource = { date: row.date, shift: row.shift }
    }
    if (carry.unleadedOpen != null && carry.dieselOpen != null) break
  }
  return carry
}
