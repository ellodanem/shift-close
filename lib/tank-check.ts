/**
 * Tank levels: Cstore's stick reading (St.Gal) against the physical reading taken at the end of the day.
 * Pure functions, no database access. Cstore labels fuel "gal" but the figures are litres.
 *
 * What Cstore's tank rows mean (confirmed against Nov 3 to Nov 6 2026):
 *   - St.Gal is the stick (physical) reading in litres. The next day's Opening equals it.
 *   - Closing is a book figure (Opening + Purchase - Sold). It is only as good as the Purchase row.
 *   - O/S is St.Gal minus Closing.
 * So the stick is the figure to trust, and the physical reading taken at the end of the shift (saved in
 * Shift Close as the opening of the next day) is checked against it.
 *
 * Cstore's "Regular" tank is Shift Close's unleaded. Shift Close pools unleaded, Cstore does not.
 */
import { addCalendarDaysYmd } from '@/lib/datetime-policy'
import type { CstoreSnapshot, TankFigures } from '@/lib/day-reconcile'

/** Stick and gauge readings are whole litres, so a gap this small is rounding and not a real difference. */
export const TANK_ROUNDING_LITRES = 1
/** Cstore's own over/short beyond this means its book is off (usually a delivery not entered there). */
export const TANK_BOOK_OFF_LITRES = 500

export type TankGrade = 'unleaded' | 'diesel'
export type TankPair = { unleaded: number; diesel: number }

export type TankCheckStatus =
  /** Both numbers are there and they agree (to within rounding). */
  | 'match'
  | 'differs'
  /** Cstore has a report but the stick has not been typed there yet (a 0 stick means not entered). */
  | 'pending'
  /** One side is missing. */
  | 'none'

export type TankCheckGrade = {
  grade: TankGrade
  label: string
  cstoreOpening: number | null
  cstorePurchase: number | null
  cstoreSold: number | null
  cstoreClosing: number | null
  /** Cstore's stick reading. Null when Cstore has no figure or the stick is not entered (0). */
  cstoreStick: number | null
  cstoreOs: number | null
  /** The physical reading saved in Shift Close for the end of this day. */
  reading: number | null
  /** Reading minus Cstore stick. Null unless both are there. */
  diff: number | null
  status: TankCheckStatus
  /** True when the two differ by a little (1 L or less), which is rounding. */
  rounding: boolean
  /** Cstore's book is far from its own stick, so its closing and O/S should not be trusted. */
  bookOff: boolean
}

export type DayTankCheck = {
  date: string
  /** The date the reading is saved under: the start of the next day. */
  readingDate: string
  hasCstore: boolean
  hasReading: boolean
  grades: TankCheckGrade[]
  notes: string[]
}

export type EndOfDayReading = { unleaded: number; diesel: number }

export function stickEntered(stick: number | null | undefined): stick is number {
  return stick != null && Number.isFinite(stick) && stick > 0
}

/** Reading minus Cstore stick, with the rounding tolerance applied. */
export function compareTank(
  cstoreStick: number | null,
  reading: number | null
): { diff: number | null; status: 'match' | 'differs' | 'none'; rounding: boolean } {
  if (cstoreStick == null || reading == null) return { diff: null, status: 'none', rounding: false }
  const diff = Math.round((reading - cstoreStick) * 10) / 10
  const abs = Math.abs(diff)
  return {
    diff,
    status: abs <= TANK_ROUNDING_LITRES + 1e-9 ? 'match' : 'differs',
    rounding: abs > 1e-9 && abs <= TANK_ROUNDING_LITRES + 1e-9
  }
}

function litresText(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} L`
}

function signedLitres(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(Math.round(n * 10) / 10).toLocaleString('en-US')} L`
}

function gradeCheck(
  grade: TankGrade,
  label: string,
  figures: TankFigures | undefined,
  sold: number | null,
  hasCstore: boolean,
  reading: number | null
): TankCheckGrade {
  const stickOk = stickEntered(figures?.stick)
  const cstoreStick = stickOk ? (figures?.stick as number) : null
  const cmp = compareTank(cstoreStick, reading)
  const os = figures?.os ?? null
  const status: TankCheckStatus =
    hasCstore && !stickOk && reading != null ? 'pending' : cmp.status
  return {
    grade,
    label,
    cstoreOpening: figures?.opening ?? null,
    cstorePurchase: figures?.purchase ?? null,
    cstoreSold: sold,
    // A closing and O/S saved before the stick is typed are not real, so they are only shown with a stick.
    cstoreClosing: stickOk ? (figures?.closing ?? null) : null,
    cstoreStick,
    cstoreOs: stickOk ? os : null,
    reading,
    diff: cmp.diff,
    status,
    rounding: cmp.rounding,
    bookOff: stickOk && os != null && Math.abs(os) > TANK_BOOK_OFF_LITRES
  }
}

export function buildDayTankCheck(
  date: string,
  snapshot: CstoreSnapshot | null,
  reading: EndOfDayReading | null
): DayTankCheck {
  const hasCstore = !!snapshot
  const tank = snapshot?.tank ?? null
  const grades = [
    gradeCheck('unleaded', 'Unleaded', tank?.regular, snapshot ? snapshot.regularLitres : null, hasCstore, reading ? reading.unleaded : null),
    gradeCheck('diesel', 'Diesel', tank?.diesel, snapshot ? snapshot.dieselLitres : null, hasCstore, reading ? reading.diesel : null)
  ]

  const notes: string[] = []
  const compared = grades.filter((g) => g.status === 'match' || g.status === 'differs')
  const matching = compared.filter((g) => g.status === 'match')
  const differing = compared.filter((g) => g.status === 'differs')
  if (compared.length === 2 && matching.length === 2) {
    const rounded = matching.filter((g) => g.rounding)
    notes.push(
      rounded.length > 0
        ? `Tank readings agree with Cstore (${rounded
            .map((g) => `${g.label} ${signedLitres(g.diff as number)}`)
            .join(', ')} is rounding).`
        : 'Tank readings agree with Cstore.'
    )
  }
  for (const g of differing) {
    notes.push(
      `${g.label} reading ${litresText(g.reading as number)} differs from the Cstore stick ${litresText(g.cstoreStick as number)} by ${signedLitres(g.diff as number)}.`
    )
  }
  const pending = grades.filter((g) => g.status === 'pending')
  if (pending.length > 0) {
    notes.push(`Cstore stick reading not entered yet for ${pending.map((g) => g.label.toLowerCase()).join(' and ')}.`)
  }
  for (const g of grades.filter((x) => x.bookOff)) {
    notes.push(
      `Cstore's ${g.label.toLowerCase()} book is ${signedLitres(g.cstoreOs as number)} from its stick, so a delivery may not be entered there. The stick is the figure to use.`
    )
  }

  return {
    date,
    readingDate: addCalendarDaysYmd(date, 1),
    hasCstore,
    hasReading: !!reading,
    grades,
    notes
  }
}

export type OpeningReadingInput = {
  date: string
  createdAt: string
  unleadedLitres: number
  dieselLitres: number
}

/** The end of day `date` is the opening saved for the next morning. A newer save replaces an older one. */
export function endOfDayReadingFor(date: string, openings: OpeningReadingInput[]): EndOfDayReading | null {
  const next = addCalendarDaysYmd(date, 1)
  const onDate = openings.filter((o) => o.date === next)
  if (onDate.length === 0) return null
  onDate.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return { unleaded: onDate[0].unleadedLitres, diesel: onDate[0].dieselLitres }
}

export type CstoreOpeningSuggestion = {
  /** The day whose Cstore stick this is. */
  fromDate: string
  /** The date to save the opening under (the next morning). */
  date: string
  unleaded: number
  diesel: number
}

/**
 * Newest day whose Cstore stick (both grades) is entered and has not been saved as an opening yet.
 * Days at or before the latest saved opening are skipped: that baseline is already newer.
 */
export function suggestOpeningFromCstore(
  checks: DayTankCheck[],
  snapshots: Map<string, CstoreSnapshot>,
  openings: OpeningReadingInput[],
  asOfYmd: string
): CstoreOpeningSuggestion | null {
  const latestOpening = openings.reduce<string | null>((max, o) => (max == null || o.date > max ? o.date : max), null)
  const sorted = [...checks].sort((a, b) => (a.date < b.date ? 1 : -1))
  for (const check of sorted) {
    if (check.readingDate > asOfYmd) continue
    if (latestOpening != null && check.readingDate <= latestOpening) return null
    if (check.hasReading) continue
    const tank = snapshots.get(check.date)?.tank
    const unleaded = tank?.regular?.stick
    const diesel = tank?.diesel?.stick
    if (!stickEntered(unleaded) || !stickEntered(diesel)) continue
    return { fromDate: check.date, date: check.readingDate, unleaded, diesel }
  }
  return null
}
