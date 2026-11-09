/**
 * End of Day V2. Pure functions, no database access. Cstore data is a read-only snapshot and never
 * changes shift data.
 *
 * Collected is laid out like the End of Shift screen, added up for the day: System against Count, with
 * Over/Short = Count minus System. Both columns come from the shifts. The manager keys the Cstore figures
 * from the shift papers, so Cstore is not a second opinion on them; it is the proof that the System
 * column was keyed correctly. Cash + Checks is the headline over/short, as on the shift screen.
 *
 * Cstore (the Daily Report) is used for:
 *   - the Sales section (total sales and fuel litres from the POS against the shifts' fuel litres)
 *   - a keying check: Fleet, Customer accounts, Credit/Debit (Credit card 2 batch) and Deposits as typed in
 *     Cstore against the shifts' System column (and deposits)
 * Cstore labels fuel "gal" but the figures are litres, so no conversion is applied.
 */

/** Dollar differences smaller than this count as equal (rounding noise only). */
export const DOLLAR_TOLERANCE = 0.005
/** Litre differences smaller than this count as equal (Cstore rounds to one decimal, we keep three). */
export const LITRE_TOLERANCE = 0.1
/** Deposited vs counted: a gap beyond this is worth a look (small gaps are change and rounding). */
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
  systemCredit: number
  systemDebit: number
  otherCredit: number
  systemInhouse: number
  systemFleet: number
  systemMassyCoupons: number
  countCash: number
  countChecks: number
  countCredit: number
  countInhouse: number
  countFleet: number
  countMassyCoupons: number
  totalDeposits: number
  unleaded: number
  diesel: number
}

/** 'pending' is only used by the tank table. */
export type LineStatus = 'match' | 'differs' | 'none' | 'pending'

/** A Cstore against Shift Close comparison (used for the Sales section). */
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

/** One row of the Collected table: the shifts' System column against their Count column. */
export type CollectedLine = {
  key: string
  label: string
  system: number
  count: number
  /** Count minus System. */
  overShort: number
  status: 'match' | 'differs'
}

/** Cash and checks counted against what reached the bank. */
export type DepositCheck = {
  counted: number
  deposited: number
  /** Deposited minus counted. */
  diff: number
  status: 'match' | 'differs'
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
  /** Over/short rows, the deposit gap and fuel litres that differ. */
  differenceCount: number
  sales: { lines: ReconcileLine[]; totalSales: number | null }
  /** Cash + Checks first, then Credit/Debit, In-House, Fleets (and Massy Coupons when used). */
  collected: { lines: CollectedLine[]; deposit: DepositCheck }
  /** The Cash + Checks line (the headline over/short). */
  overShort: CollectedLine
  shifts: ReconcileShiftRow[]
  notes: string[]
  /** Short, always-on warnings that need no Cstore data (a shift with no POS figures entered). */
  shiftWarnings: string[]
  /**
   * Cstore report is saved but the manager has not typed the bank deposits in yet. Cstore's own tank book
   * and collection lines are not meaningful until then, so those notes are held back.
   */
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

function collectedLine(key: string, label: string, system: number, count: number): CollectedLine {
  const overShort = round2(count - system)
  return { key, label, system: round2(system), count: round2(count), overShort, status: Math.abs(overShort) < DOLLAR_TOLERANCE ? 'match' : 'differs' }
}

export function shiftHasNoPosFigures(s: ReconcileShiftInput): boolean {
  const posTotal = s.systemCash + s.systemChecks + s.systemFleet + s.systemInhouse + s.countCash + s.countChecks
  return s.totalDeposits > 0 && Math.abs(posTotal) < 0.005
}

export function reconcileDay(
  shifts: ReconcileShiftInput[],
  cstoreSnapshot: CstoreSnapshot | null
): DayReconcile {
  const c = cstoreSnapshot
  const awaitingDeposits = !!c && c.depositsTyped < 0.005
  const sum = (pick: (s: ReconcileShiftInput) => number) => round2(shifts.reduce((t, s) => t + pick(s), 0))

  // Both columns of Collected come from the shifts, exactly as on the End of Shift screen.
  const cashLine = collectedLine(
    'cashChecks',
    'Cash + Checks',
    sum((s) => s.systemCash + s.systemChecks),
    sum((s) => s.countCash + s.countChecks)
  )
  const massySystem = sum((s) => s.systemMassyCoupons)
  const massyCount = sum((s) => s.countMassyCoupons)
  const collectedLines: CollectedLine[] = [
    cashLine,
    collectedLine('credits', 'Credit/Debit', sum((s) => s.systemCredit), sum((s) => s.countCredit)),
    collectedLine('inhouse', 'In-House', sum((s) => s.systemInhouse), sum((s) => s.countInhouse)),
    collectedLine('fleets', 'Fleets', sum((s) => s.systemFleet), sum((s) => s.countFleet)),
    ...(Math.abs(massySystem) + Math.abs(massyCount) >= 0.005
      ? [collectedLine('massy', 'Massy Coupons', massySystem, massyCount)]
      : [])
  ]

  const deposited = sum((s) => s.totalDeposits)
  const depositDiff = round2(deposited - cashLine.count)
  const deposit: DepositCheck = {
    counted: cashLine.count,
    deposited,
    diff: depositDiff,
    status: Math.abs(depositDiff) > OVER_SHORT_LOOK_THRESHOLD ? 'differs' : 'match'
  }

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

  // Sales: what the POS says (Cstore). Nothing to compare: the shifts' figures come from the same POS.
  const salesLines: ReconcileLine[] = c
    ? [
        makeLine('grocery', 'Grocery', 'usd', c.grocery, null),
        makeLine('salesTax', 'Sales tax', 'usd', c.salesTax, null),
        makeLine('regularAmt', 'Regular', 'usd', c.regularAmt, null),
        makeLine('dieselAmt', 'Diesel', 'usd', c.dieselAmt, null),
        ...(Math.abs(c.custAccountPayIn) >= 0.005
          ? [makeLine('payIn', 'Customer account pay-in', 'usd', c.custAccountPayIn, null)]
          : []),
        makeLine('regularLitres', 'Regular sold', 'litres', c.regularLitres, null),
        makeLine('dieselLitres', 'Diesel sold', 'litres', c.dieselLitres, null)
      ]
    : []

  // Keying check: what was typed into Cstore against the shifts' System column. Cstore minus shifts.
  const keyed: Array<{ label: string; diff: number }> = []
  if (c) {
    const pairs: Array<{ label: string; cstore: number; shifts: number; typed: boolean }> = [
      { label: 'Fleet', cstore: c.fleetBatch, shifts: sum((s) => s.systemFleet), typed: true },
      { label: 'Customer accounts', cstore: c.custAccountSales, shifts: sum((s) => s.systemInhouse), typed: true },
      {
        label: 'Credit/Debit',
        cstore: c.creditDebitBatch,
        shifts: sum((s) => s.systemDebit + s.otherCredit),
        typed: c.creditDebitBatch >= 0.005
      },
      { label: 'Deposits', cstore: c.depositsTyped, shifts: deposited, typed: c.depositsTyped >= 0.005 }
    ]
    for (const p of pairs) {
      if (!p.typed) continue
      const diff = round2(p.cstore - p.shifts)
      if (Math.abs(diff) >= DOLLAR_TOLERANCE) keyed.push({ label: p.label, diff })
    }
  }

  const differing: string[] = [
    ...collectedLines.filter((l) => l.status === 'differs').map((l) => l.label),
    ...(deposit.status === 'differs' ? ['Deposits'] : []),
    ...salesLines.filter((l) => l.status === 'differs').map((l) => l.label)
  ]

  const notes: string[] = []
  if (cashLine.status === 'differs') {
    const short = cashLine.overShort < 0
    notes.push(
      `Cash + Checks ${short ? 'short' : 'over'} ${money(Math.abs(cashLine.overShort))}: ${money(cashLine.count)} counted against ${money(cashLine.system)} on the system.`
    )
  }
  const otherOS = collectedLines.filter((l) => l.key !== 'cashChecks' && l.status === 'differs')
  if (otherOS.length > 0) {
    notes.push(`Over/short on: ${otherOS.map((l) => `${l.label} ${money(l.overShort, true)}`).join(', ')}.`)
  }
  if (deposit.status === 'differs') {
    notes.push(
      `Deposited ${money(deposit.deposited)}, ${money(Math.abs(deposit.diff))} ${deposit.diff < 0 ? 'less' : 'more'} than the ${money(deposit.counted)} counted.`
    )
  }
  if (c) {
    if (keyed.length > 0) {
      notes.push(
        `Cstore was keyed differently from the shifts on: ${keyed.map((k) => `${k.label} ${money(k.diff, true)}`).join(', ')}.`
      )
    }
    if (differing.length === 0 && keyed.length === 0) {
      notes.push('Shift Close agrees with Cstore on every line.')
    }
    const other = round2(c.totalCollections - (c.depositsTyped + c.fleetBatch + c.creditDebitBatch + c.custAccountSales))
    if (!awaitingDeposits && Math.abs(other) >= 0.005) {
      notes.push(`Cstore has ${money(other)} of other collections that Shift Close does not track.`)
    }
    const t = c.tank
    // The tank book is typed along with the deposits, so its O/S is meaningless until then.
    if (!awaitingDeposits && t && (t.regular?.os != null || t.diesel?.os != null)) {
      const bits: string[] = []
      if (t.regular?.os != null) bits.push(`Regular ${t.regular.os > 0 ? '+' : ''}${t.regular.os.toFixed(1)} L`)
      if (t.diesel?.os != null) bits.push(`Diesel ${t.diesel.os > 0 ? '+' : ''}${t.diesel.os.toFixed(1)} L`)
      notes.push(`Tanks over/short: ${bits.join(', ')}.`)
    }
  }

  let verdict: DayVerdict
  let verdictText: string
  if (differing.length === 0 && keyed.length === 0) {
    verdict = c ? 'reconciled' : 'waiting'
    verdictText = c ? 'Reconciled' : 'Waiting for Cstore'
  } else {
    verdict = 'differs'
    const n = differing.length
    verdictText = n > 0 ? `${n} ${n === 1 ? 'difference' : 'differences'}` : 'Cstore keyed differently'
  }

  return {
    hasCstore: !!c,
    verdict,
    verdictText,
    differenceCount: differing.length,
    sales: { lines: salesLines, totalSales: c ? c.totalSales : null },
    collected: { lines: collectedLines, deposit },
    overShort: cashLine,
    shifts: shiftRows,
    notes,
    shiftWarnings,
    awaitingDeposits,
    pulledAt: cstoreSnapshot?.pulledAt ?? null
  }
}

export { money as formatMoney, litres as formatLitres }
