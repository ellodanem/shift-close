import { addCalendarDaysYmd } from '@/lib/datetime-policy'
import { loadCstoreSnapshots } from '@/lib/cstore-day-report'
import { prisma } from '@/lib/prisma'
import {
  buildDayTankCheck,
  endOfDayReadingFor,
  suggestOpeningFromCstore,
  type CstoreOpeningSuggestion,
  type DayTankCheck,
  type OpeningReadingInput
} from '@/lib/tank-check'
import type { CstoreSnapshot } from '@/lib/day-reconcile'

/** Opening readings saved for the morning after each of these days (that is the end-of-day reading). */
export async function loadOpeningsAfter(dates: string[]): Promise<OpeningReadingInput[]> {
  if (dates.length === 0) return []
  const nextDates = dates.map((d) => addCalendarDaysYmd(d, 1))
  const rows = await prisma.fuelTankReading.findMany({
    where: { kind: 'opening', date: { in: nextDates } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  })
  return rows.map((row) => ({
    date: row.date,
    createdAt: row.createdAt.toISOString(),
    unleadedLitres: row.unleadedLitres,
    dieselLitres: row.dieselLitres
  }))
}

/** Tank checks for a set of days: Cstore's stick against the reading saved for the end of each day. */
export async function loadDayTankChecks(
  dates: string[],
  snapshotsIn?: Map<string, CstoreSnapshot>
): Promise<Map<string, DayTankCheck>> {
  const [snapshots, openings] = await Promise.all([
    snapshotsIn ? Promise.resolve(snapshotsIn) : loadCstoreSnapshots(dates),
    loadOpeningsAfter(dates)
  ])
  const out = new Map<string, DayTankCheck>()
  for (const date of dates) {
    out.set(date, buildDayTankCheck(date, snapshots.get(date) ?? null, endOfDayReadingFor(date, openings)))
  }
  return out
}

export type CstoreTankCheckPayload = {
  /** Newest first. Only days with a Cstore tank figure or a saved reading. */
  days: DayTankCheck[]
  /** A Cstore stick that has not been saved as an opening yet, for a manager to confirm. */
  suggestion: (CstoreOpeningSuggestion & { shiftCloseBook: { unleaded: number; diesel: number } | null }) | null
}

const CHECK_DAYS = 10

export async function loadCstoreTankCheck(
  asOfYmd: string,
  allOpenings: OpeningReadingInput[],
  bookAt: (ymd: string) => { unleaded: number; diesel: number } | null
): Promise<CstoreTankCheckPayload> {
  const dates: string[] = []
  for (let i = 0; i < CHECK_DAYS; i++) dates.push(addCalendarDaysYmd(asOfYmd, -i))
  const snapshots = await loadCstoreSnapshots(dates)
  const checks = await loadDayTankChecks(dates, snapshots)

  // loadDayTankChecks only sees openings dated the morning after each day, which is what the checks need.
  const days = dates
    .map((d) => checks.get(d) as DayTankCheck)
    .filter((c) => c.hasReading || c.grades.some((g) => g.cstoreStick != null || g.cstoreOpening != null))

  const suggestion = suggestOpeningFromCstore(days, snapshots, allOpenings, asOfYmd)
  return {
    days,
    suggestion: suggestion ? { ...suggestion, shiftCloseBook: bookAt(suggestion.fromDate) } : null
  }
}
