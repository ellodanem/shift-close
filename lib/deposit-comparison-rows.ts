import type { DepositRecord, ShiftClose } from '@prisma/client'

export const BANK_STATUSES = ['pending', 'cleared', 'discrepancy'] as const
export type BankStatus = (typeof BANK_STATUSES)[number]

export const RECORD_KINDS = ['deposit', 'debit'] as const
export type RecordKind = (typeof RECORD_KINDS)[number]

export type ComparisonRow = {
  shiftId: string
  date: string
  shift: string
  supervisor: string
  recordKind: RecordKind
  lineIndex: number
  amount: number
  systemDebit?: number
  otherCredit?: number
  debitDayAggregate?: boolean
  contributingShifts?: Array<{ shiftId: string; shift: string }>
  scanUrls: string[]
  securitySlipUrl: string | null
  bankStatus: BankStatus
  notes: string
}

export type ShiftWithDepositRecords = ShiftClose & { depositRecords: DepositRecord[] }

export function parseDeposits(raw: string): number[] {
  try {
    const arr = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    return arr.map((n) => (typeof n === 'number' && !Number.isNaN(n) ? n : Number(n))).filter((n) => !Number.isNaN(n))
  } catch {
    return []
  }
}

export function parseUrlList(raw: string): string[] {
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === 'string' && u.length > 0) : []
  } catch {
    return []
  }
}

export function recordKey(shiftId: string, recordKind: string, lineIndex: number): string {
  return `${shiftId}:${recordKind}:${lineIndex}`
}

/** Build deposit + day-aggregated debit rows from loaded shifts (same rules as deposit-comparisons GET). */
export function buildComparisonRowsFromShifts(shifts: ShiftWithDepositRecords[]): ComparisonRow[] {
  const recordByKey = new Map<string, DepositRecord>()
  for (const s of shifts) {
    for (const r of s.depositRecords) {
      const k = r.recordKind || 'deposit'
      recordByKey.set(recordKey(s.id, k, r.lineIndex), r)
    }
  }

  const rows: ComparisonRow[] = []

  type DayDebitBucket = {
    date: string
    shifts: ShiftWithDepositRecords[]
    sumDebit: number
    sumOtherCredit: number
    scanUrls: string[]
  }
  const debitByDate = new Map<string, DayDebitBucket>()

  for (const s of shifts) {
    const amounts = parseDeposits(s.deposits)
    const depositScanUrls = parseUrlList(s.depositScanUrls)
    const debitScanUrls = parseUrlList(s.debitScanUrls)
    const daySheetDebit = Number(s.systemDebit) || 0
    const daySheetCredit = Number(s.otherCredit) || 0
    const debitCreditCombined = daySheetDebit + daySheetCredit

    for (let i = 0; i < amounts.length; i++) {
      const rec = recordByKey.get(recordKey(s.id, 'deposit', i))
      const bankStatus = (rec?.bankStatus as BankStatus) || 'pending'
      const notes = rec?.notes ?? ''
      const securitySlipUrl = rec?.securitySlipUrl ?? null

      rows.push({
        shiftId: s.id,
        date: s.date,
        shift: s.shift,
        supervisor: s.supervisor,
        recordKind: 'deposit',
        lineIndex: i,
        amount: amounts[i],
        scanUrls: depositScanUrls,
        securitySlipUrl,
        bankStatus: BANK_STATUSES.includes(bankStatus as BankStatus) ? bankStatus : 'pending',
        notes
      })
    }

    const showDebitForShift = debitCreditCombined !== 0 || debitScanUrls.length > 0
    if (showDebitForShift) {
      let bucket = debitByDate.get(s.date)
      if (!bucket) {
        bucket = { date: s.date, shifts: [], sumDebit: 0, sumOtherCredit: 0, scanUrls: [] }
        debitByDate.set(s.date, bucket)
      }
      bucket.shifts.push(s)
      bucket.sumDebit += daySheetDebit
      bucket.sumOtherCredit += daySheetCredit
      for (const u of debitScanUrls) {
        if (!bucket.scanUrls.includes(u)) bucket.scanUrls.push(u)
      }
    }
  }

  for (const bucket of debitByDate.values()) {
    bucket.shifts.sort((a, b) => a.shift.localeCompare(b.shift, undefined, { numeric: true }))
    const canonical = bucket.shifts[0]
    const combined = bucket.sumDebit + bucket.sumOtherCredit
    if (combined === 0 && bucket.scanUrls.length === 0) continue

    let rec = recordByKey.get(recordKey(canonical.id, 'debit', 0))
    if (!rec) {
      for (const s of bucket.shifts) {
        const r = recordByKey.get(recordKey(s.id, 'debit', 0))
        if (r) {
          rec = r
          break
        }
      }
    }

    const bankStatus = (rec?.bankStatus as BankStatus) || 'pending'
    const notes = rec?.notes ?? ''
    let securitySlipUrl: string | null = rec?.securitySlipUrl ?? null
    if (!securitySlipUrl) {
      for (const s of bucket.shifts) {
        const r = recordByKey.get(recordKey(s.id, 'debit', 0))
        if (r?.securitySlipUrl) {
          securitySlipUrl = r.securitySlipUrl
          break
        }
      }
    }

    rows.push({
      shiftId: canonical.id,
      date: bucket.date,
      shift: 'Day total',
      supervisor: bucket.shifts.map((x) => x.supervisor).filter(Boolean).join(' · ') || '—',
      recordKind: 'debit',
      lineIndex: 0,
      amount: combined,
      systemDebit: bucket.sumDebit,
      otherCredit: bucket.sumOtherCredit,
      debitDayAggregate: true,
      contributingShifts: bucket.shifts.map((x) => ({ shiftId: x.id, shift: x.shift })),
      scanUrls: bucket.scanUrls,
      securitySlipUrl,
      bankStatus: BANK_STATUSES.includes(bankStatus as BankStatus) ? bankStatus : 'pending',
      notes
    })
  }

  return rows
}
