/**
 * End of Day V2: compare the Cstore daily report (whole day only) with the day's shifts added together.
 * Pure functions, no database access. Cstore data is a read-only snapshot and never changes shift data.
 *
 * Laid out like the End of Shift screen: System (Cstore) against Count (Shift Close), with Over/Short.
 * Over/Short is Count minus System. Cash + Checks is the headline, the others are informational.
 *
 * Mapping (confirmed against Nov 3 and Nov 4 2026):
 *   Cstore "Credit card batches"  = Fleet           vs shifts' countFleet
 *   Cstore "Credit card 2 batch"  = Credit/Debit    vs shifts' countCredit (counted slips)
 *   Cstore "Cust account sales"   = Customer accts  vs shifts' countInhouse
 *   Cash + Checks: Cstore does not print expected cash, so System = total sales minus the three lines
 *   above. Count = the shifts' deposits (what reached the bank).
 *   Cstore "Total deposits" is typed by the manager and is not used for the comparison.
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
  /** Counted slips from the End of Shift screen (the Count column). */
  countCredit: number
  countInhouse: number
  countFleet: number
  totalDeposits: number
  unleaded: number
  diesel: number
}

/** 'pending' = a line the manager types into Cstore that has not been entered there yet. */
export type LineStatus = 'match' | 'differs' | 'none' | 'pending'

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
  /** Cash + Checks first, then Credit/Debit, Fleet and Customer accounts. cstore = System, shiftClose = Count. */
  collected: { lines: ReconcileLine[] }
  /** The Cash + Checks line (the headline over/short). diff = Count minus System. */
  overShort: ReconcileLine
  shifts: ReconcileShiftRow[]
  notes: string[]
  /** Short, always-on warnings that need no Cstore data (a shift with no POS figures entered). */
  shiftWarnings: string[]
  /**
   * Cstore report is saved but the manager has not typed the bank deposits in yet. Cstore's own tank book
   * and over/short are not meaningful until then, so those notes are held back.
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

function pendingLine(
  key: string,
  label: string,
  unit: 'usd' | 'litres',
  shiftClose: number | null
): ReconcileLine {
  return { key, label, unit, cstore: null, shiftClose, diff: null, status: 'pending' }
}

export function shiftHasNoPosFigures(s: ReconcileShiftInput): boolean {
  const posTotal = s.systemCash + s.systemChecks + s.systemFleet + s.systemInhouse + s.countCash + s.countChecks
  return s.totalDeposits > 0 && Math.abs(posTotal) < 0.005
}

export function reconcileDay(
  shifts: ReconcileShiftInput[],
  cstoreSnapshot: CstoreSnapshot | null
): DayReconcile {
  // A Cstore report saved before the manager typed the bank deposits has a huge false short in Cstore's
  // own over/short and tank book, so those notes are held back. The comparison itself does not use
  // Cstore's typed deposits, only its POS figures and the card batch.
  const cstore = cstoreSnapshot
  const awaitingDeposits = !!cstoreSnapshot && cstoreSnapshot.depositsTyped < 0.005
  const sum = (pick: (s: ReconcileShiftInput) => number) => round2(shifts.reduce((t, s) => t + pick(s), 0))
  // Shift Close side = the Count column of the shifts (counted slips) and the deposits.
  const sc = {
    deposits: sum((s) => s.totalDeposits),
    fleet: sum((s) => s.countFleet),
    creditDebit: sum((s) => s.countCredit),
    accounts: sum((s) => s.countInhouse),
    unleaded: Math.round(shifts.reduce((t, s) => t + s.unleaded, 0) * 1000) / 1000,
    diesel: Math.round(shifts.reduce((t, s) => t + s.diesel, 0) * 1000) / 1000
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

  // Credit card 2 batch is typed by the manager. Zero in Cstore while the shifts have card slips means it
  // is not entered yet, and Cash + Checks cannot be worked out without it.
  const cardPending = !!c && c.creditDebitBatch < 0.005 && sc.creditDebit >= 0.005

  // Cstore does not print its expected cash. It is the sales that are not paid by card, Fleet or account.
  const systemCash =
    c && !cardPending ? round2(c.totalSales - c.creditDebitBatch - c.fleetBatch - c.custAccountSales) : null
  const cashLabel = 'Cash + Checks'
  const overShort = c && systemCash === null
    ? pendingLine('cashChecks', cashLabel, 'usd', sc.deposits)
    : makeLine('cashChecks', cashLabel, 'usd', systemCash, sc.deposits)

  const collectedLines: ReconcileLine[] = [
    overShort,
    cardPending
      ? pendingLine('creditDebit', 'Credit/Debit', 'usd', sc.creditDebit)
      : makeLine('creditDebit', 'Credit/Debit', 'usd', c ? c.creditDebitBatch : null, sc.creditDebit),
    makeLine('fleet', 'Fleet', 'usd', c ? c.fleetBatch : null, sc.fleet),
    makeLine('accounts', 'Customer accounts', 'usd', c ? c.custAccountSales : null, sc.accounts)
  ]
  const cashPending = overShort.status === 'pending'

  const compared = [...salesLines.filter((l) => l.status !== 'none'), ...collectedLines]
  const differing = compared.filter((l) => l.status === 'differs')

  const notes: string[] = []
  if (c) {
    const diffLines = collectedLines.filter((l) => l.key !== 'cashChecks' && l.status === 'differs' && l.diff !== null)
    const litreDiffs = salesLines.filter((l) => l.status === 'differs' && l.diff !== null)
    if (differing.length === 0) {
      notes.push(
        cashPending
          ? 'Everything entered in Cstore so far agrees with Shift Close.'
          : 'Shift Close agrees with Cstore on every line.'
      )
    } else {
      if (overShort.status === 'differs' && overShort.diff !== null && overShort.cstore !== null) {
        const short = overShort.diff < 0
        notes.push(
          `Cash + Checks ${short ? 'short' : 'over'} ${money(Math.abs(overShort.diff))}: ${money(sc.deposits)} deposited against ${money(overShort.cstore)} that Cstore expects.`
        )
      }
      if (diffLines.length > 0) {
        const parts = diffLines.map((l) => `${l.label} ${money(l.diff as number, true)}`)
        notes.push(`Count differs from Cstore on: ${parts.join(', ')}.`)
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
    if (cardPending) {
      notes.push('Credit/Debit is not entered in Cstore yet. Cash + Checks compares once it is.')
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
  if (!c) {
    verdict = 'waiting'
    verdictText = 'Waiting for Cstore'
  } else if (differing.length === 0 && cashPending) {
    verdict = 'waiting'
    verdictText = 'Waiting for Cstore entries'
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
    collected: { lines: collectedLines },
    overShort,
    shifts: shiftRows,
    notes,
    shiftWarnings,
    awaitingDeposits,
    pulledAt: cstoreSnapshot?.pulledAt ?? null
  }
}

export { money as formatMoney, litres as formatLitres }
