/**
 * End of Day V2: compare the Cstore daily report (whole day only) with the day's shifts added together.
 * Pure functions, no database access. Cstore data is a read-only snapshot and never changes shift data.
 *
 * Mapping (confirmed against Nov 3 and Nov 4 2026):
 *   Cstore "Credit card batches"  = Fleet           = sum of shifts' systemFleet
 *   Cstore "Credit card 2 batch"  = Credit/Debit    = sum of shifts' systemDebit + otherCredit
 *   Cstore "Cust account sales"   = Customer accts  = sum of shifts' systemInhouse
 *   Cstore "Total deposits"       = typed by the manager; compared with the shifts' deposits
 * Cstore labels fuel "gal" but the figures are litres, so no conversion is applied.
 */

/** Dollar differences smaller than this count as equal (rounding noise only). */
export const DOLLAR_TOLERANCE = 0.005
/** Litre differences smaller than this count as equal (Cstore rounds to one decimal, we keep three). */
export const LITRE_TOLERANCE = 0.1
/** Over/short beyond this is worth a look (same band the shift list uses). */
export const OVER_SHORT_LOOK_THRESHOLD = 30

export type TankFigures = {
  opening?: number | null
  purchase?: number | null
  closing?: number | null
  stick?: number | null
  os?: number | null
}

export type CstoreSnapshot = {
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
  tank?: { regular?: TankFigures; diesel?: TankFigures } | null
  pulledAt?: string | null
  source?: string
}

export type ReconcileShiftInput = {
  shift: string
  supervisor: string
  systemCash: number
  systemChecks: number
  systemDebit: number
  otherCredit: number
  systemInhouse: number
  systemFleet: number
  countCash: number
  countChecks: number
  totalDeposits: number
  unleaded: number
  diesel: number
}

export type LineStatus = 'match' | 'differs' | 'none'

export type ReconcileLine = {
  key: string
  label: string
  unit: 'usd' | 'litres'
  /** What Cstore says. Null when Cstore has no figure for this line. */
  cstore: number | null
  /** What the shifts add up to. Null when Shift Close does not track this line. */
  shiftClose: number | null
  /** Shift Close minus Cstore, null when either side is missing. */
  diff: number | null
  status: LineStatus
}

export type ReconcileShiftRow = {
  shift: string
  supervisor: string
  fleet: number
  inhouse: number
  creditDebit: number
  deposited: number
  /** True when this shift has deposits but none of cash, checks, Fleet or In-house entered. */
  missingPos: boolean
}

export type DayVerdict = 'waiting' | 'reconciled' | 'differs'

export type DayReconcile = {
  hasCstore: boolean
  verdict: DayVerdict
  verdictText: string
  /** Number of comparison lines that differ (collected lines and fuel litres). */
  differenceCount: number
  sales: { lines: ReconcileLine[]; totalSales: number | null }
  collected: { lines: ReconcileLine[]; total: ReconcileLine }
  overShort: ReconcileLine
  shifts: ReconcileShiftRow[]
  notes: string[]
  /** Short, always-on warnings that need no Cstore data (a shift with no POS figures entered). */
  shiftWarnings: string[]
  /** Cstore report is saved but the bank deposits are not typed in yet, so no comparison is shown. */
  awaitingDeposits: boolean
  pulledAt: string | null
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function money(n: number, sign = false): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : sign && n > 0 ? '+' : ''}$${abs}`
}

function litres(n: number): string {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
}

function makeLine(
  key: string,
  label: string,
  unit: 'usd' | 'litres',
  cstore: number | null,
  shiftClose: number | null
): ReconcileLine {
  if (cstore === null || shiftClose === null) {
    return { key, label, unit, cstore, shiftClose, diff: null, status: 'none' }
  }
  const tol = unit === 'litres' ? LITRE_TOLERANCE : DOLLAR_TOLERANCE
  const diff = unit === 'litres' ? Math.round((shiftClose - cstore) * 1000) / 1000 : round2(shiftClose - cstore)
  return { key, label, unit, cstore, shiftClose, diff, status: Math.abs(diff) < tol ? 'match' : 'differs' }
}

export function shiftHasNoPosFigures(s: ReconcileShiftInput): boolean {
  const posTotal = s.systemCash + s.systemChecks + s.systemFleet + s.systemInhouse + s.countCash + s.countChecks
  return s.totalDeposits > 0 && Math.abs(posTotal) < 0.005
}

export function reconcileDay(
  shifts: ReconcileShiftInput[],
  cstoreSnapshot: CstoreSnapshot | null
): DayReconcile {
  // A Cstore report saved before the manager typed the bank deposits shows a huge false short.
  // Treat it as not ready until deposits are in.
  const awaitingDeposits = !!cstoreSnapshot && cstoreSnapshot.depositsTyped < 0.005
  const cstore = awaitingDeposits ? null : cstoreSnapshot
  const sum = (pick: (s: ReconcileShiftInput) => number) => round2(shifts.reduce((t, s) => t + pick(s), 0))
  const sc = {
    deposits: sum((s) => s.totalDeposits),
    fleet: sum((s) => s.systemFleet),
    creditDebit: sum((s) => s.systemDebit + s.otherCredit),
    accounts: sum((s) => s.systemInhouse),
    unleaded: Math.round(shifts.reduce((t, s) => t + s.unleaded, 0) * 1000) / 1000,
    diesel: Math.round(shifts.reduce((t, s) => t + s.diesel, 0) * 1000) / 1000
  }
  const scTotal = round2(sc.deposits + sc.fleet + sc.creditDebit + sc.accounts)

  const shiftRows: ReconcileShiftRow[] = shifts.map((s) => ({
    shift: s.shift,
    supervisor: s.supervisor,
    fleet: s.systemFleet,
    inhouse: s.systemInhouse,
    creditDebit: round2(s.systemDebit + s.otherCredit),
    deposited: s.totalDeposits,
    missingPos: shiftHasNoPosFigures(s)
  }))

  const shiftWarnings = shifts.filter(shiftHasNoPosFigures).map(
    (s) =>
      `${s.shift} shift${s.supervisor ? ` (${s.supervisor})` : ''}: no cash, checks, Fleet or In-house entered. ${money(s.totalDeposits)} deposited.`
  )

  const c = cstore
  const salesLines: ReconcileLine[] = c
    ? [
        makeLine('grocery', 'Grocery', 'usd', c.grocery, null),
        makeLine('salesTax', 'Sales tax', 'usd', c.salesTax, null),
        makeLine('regularAmt', 'Regular', 'usd', c.regularAmt, null),
        makeLine('dieselAmt', 'Diesel', 'usd', c.dieselAmt, null),
        ...(Math.abs(c.custAccountPayIn) >= 0.005
          ? [makeLine('payIn', 'Customer account pay-in', 'usd', c.custAccountPayIn, null)]
          : []),
        makeLine('regularLitres', 'Regular sold', 'litres', c.regularLitres, sc.unleaded),
        makeLine('dieselLitres', 'Diesel sold', 'litres', c.dieselLitres, sc.diesel)
      ]
    : []

  const collectedLines: ReconcileLine[] = [
    makeLine('deposits', 'Deposits', 'usd', c ? c.depositsTyped : null, sc.deposits),
    makeLine('fleet', 'Fleet', 'usd', c ? c.fleetBatch : null, sc.fleet),
    makeLine('creditDebit', 'Credit/Debit', 'usd', c ? c.creditDebitBatch : null, sc.creditDebit),
    makeLine('accounts', 'Customer accounts', 'usd', c ? c.custAccountSales : null, sc.accounts)
  ]
  const total = makeLine('total', 'Total collected', 'usd', c ? c.totalCollections : null, scTotal)

  const scOverShort = c ? round2(scTotal - c.totalSales) : null
  const overShort = makeLine('overShort', 'Collected minus sales', 'usd', c ? c.shortOver : null, scOverShort)

  const compared = [...salesLines.filter((l) => l.status !== 'none'), ...collectedLines]
  const differing = compared.filter((l) => l.status === 'differs')

  const notes: string[] = []
  if (c) {
    const diffLines = collectedLines.filter((l) => l.status === 'differs' && l.diff !== null)
    const litreDiffs = salesLines.filter((l) => l.status === 'differs' && l.diff !== null)
    if (differing.length === 0 && overShort.status === 'match') {
      notes.push('Shift Close agrees with Cstore on every line.')
    } else {
      if (diffLines.length > 0) {
        const parts = diffLines.map((l) => `${l.label} ${money(l.diff as number, true)}`)
        notes.push(`Shift Close differs from Cstore on: ${parts.join(', ')}.`)
      }
      if (litreDiffs.length > 0) {
        const parts = litreDiffs.map((l) => `${l.label} ${(l.diff as number) > 0 ? '+' : ''}${(l.diff as number).toFixed(1)} L`)
        notes.push(`Fuel litres differ: ${parts.join(', ')}.`)
      }
      const agree = collectedLines.filter((l) => l.status === 'match').map((l) => l.label)
      if (agree.length > 0 && agree.length < collectedLines.length) {
        notes.push(`Agrees: ${agree.join(', ')}.`)
      }
    }
    if (
      overShort.diff !== null &&
      Math.abs(overShort.diff) <= OVER_SHORT_LOOK_THRESHOLD &&
      Math.abs(c.shortOver) > OVER_SHORT_LOOK_THRESHOLD
    ) {
      notes.push(
        `Both sides show about ${money(c.shortOver, true)}, so this is a real ${c.shortOver < 0 ? 'short' : 'over'} and not missing data.`
      )
    }
    const other = round2(c.totalCollections - (c.depositsTyped + c.fleetBatch + c.creditDebitBatch + c.custAccountSales))
    if (Math.abs(other) >= 0.005) {
      notes.push(`Cstore has ${money(other)} of other collections that Shift Close does not track.`)
    }
    const t = c.tank
    if (t && (t.regular?.os != null || t.diesel?.os != null)) {
      const bits: string[] = []
      if (t.regular?.os != null) bits.push(`Regular ${t.regular.os > 0 ? '+' : ''}${t.regular.os.toFixed(1)} L`)
      if (t.diesel?.os != null) bits.push(`Diesel ${t.diesel.os > 0 ? '+' : ''}${t.diesel.os.toFixed(1)} L`)
      notes.push(`Tanks over/short: ${bits.join(', ')}.`)
    }
  }

  let verdict: DayVerdict
  let verdictText: string
  if (!c) {
    verdict = 'waiting'
    verdictText = awaitingDeposits ? 'Waiting for deposits' : 'Waiting for Cstore'
  } else if (differing.length === 0 && overShort.status === 'match') {
    verdict = 'reconciled'
    verdictText = 'Reconciled'
  } else {
    verdict = 'differs'
    const n = differing.length
    verdictText = n > 0 ? `${n} ${n === 1 ? 'difference' : 'differences'}` : 'Over/short differs'
  }

  return {
    hasCstore: !!c,
    verdict,
    verdictText,
    differenceCount: differing.length,
    sales: { lines: salesLines, totalSales: c ? c.totalSales : null },
    collected: { lines: collectedLines, total },
    overShort,
    shifts: shiftRows,
    notes,
    shiftWarnings,
    awaitingDeposits,
    pulledAt: cstoreSnapshot?.pulledAt ?? null
  }
}

export { money as formatMoney, litres as formatLitres }
