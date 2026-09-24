import { extraPayTotal, parseExtraLines, parseMoney, type PayRunExtraLine } from './pay-run'
import { SAINT_LUCIA_BANK_GROUPS } from './saint-lucia-banks'

export type BankingLine = {
  staffName: string
  staffNo?: string | null
  bankCode?: string | null
  accountNo?: string | null
  netPay: number
}

export type BankingListingRow = {
  bankCode: string
  staffName: string
  staffNo: string
  accountNo: string
  netPay: number
}

export type BankingPack = {
  listing: BankingListingRow[]
  bankTotals: Array<{ label: string; amount: number }>
  extraDisbursements: PayRunExtraLine[]
  staffTotal: number
  extraTotal: number
  bankingTotal: number
  listingTies: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const CREDIT_UNION_NAMES = new Set(
  (SAINT_LUCIA_BANK_GROUPS.find((g) => g.label === 'Credit Unions')?.banks ?? []).map((name) =>
    name.toLowerCase()
  )
)

/** Map a staff bank name to the Pay+ listing BANKCODE. */
export function payrollBankCode(bankName?: string | null, accountNo?: string | null): string {
  const name = (bankName ?? '').trim().toLowerCase()
  const account = (accountNo ?? '').trim()
  if (!name && !account) return 'CHQ'
  if (/\b(chq|cheque|check)\b/.test(name)) return 'CHQ'
  if (/nfgw|farmers|general workers/.test(name)) return 'NFGWCCU'
  if (/fics|financial investment/.test(name)) return 'FICS'
  if (/firstcaribbean|fcib|\bcibc\b/.test(name)) return 'FCIB'
  if (/bank of saint lucia|\bbosl\b/.test(name)) return 'BOSL'
  if (/republic/.test(name)) return 'REPUBLIC'
  if (!name) return 'CHQ'
  const compact = name.replace(/[^a-z0-9]+/g, '').slice(0, 12).toUpperCase()
  return compact || 'OTHER'
}

/** Footer bucket. FCIB and FICS roll into CIBC. NFGWCCU is unsplit. CHQ is Cheques. */
export function bankTotalLabel(bankCode: string): string {
  const code = (bankCode || 'CHQ').toUpperCase()
  if (code === 'BOSL') return 'BOSL S/Station'
  if (code === 'FCIB' || code === 'CIBC' || code === 'FICS') return 'CIBC S/Station'
  if (code === 'NFGWCCU') return 'NFGWCCU'
  if (code === 'CHQ') return 'Cheques'
  if (code === 'REPUBLIC') return 'Republic S/Station'
  return `${code} S/Station`
}

export function isCreditUnionBank(bankCode: string, bankName?: string | null): boolean {
  if ((bankCode || '').toUpperCase() === 'NFGWCCU') return true
  const name = (bankName ?? '').trim().toLowerCase()
  if (!name) return false
  if (CREDIT_UNION_NAMES.has(name)) return true
  return /credit union|co-operative credit/.test(name)
}

export function buildBankingPack(
  lines: BankingLine[],
  extraDisbursements: PayRunExtraLine[] = []
): BankingPack {
  const listing = lines
    .map((line) => {
      const bankCode = (line.bankCode || payrollBankCode(null, line.accountNo)).toUpperCase() || 'CHQ'
      return {
        bankCode,
        staffName: line.staffName.trim(),
        staffNo: (line.staffNo ?? '').trim(),
        accountNo: bankCode === 'CHQ' ? '' : (line.accountNo ?? '').trim(),
        netPay: parseMoney(line.netPay)
      }
    })
    .sort((a, b) => {
      const bank = a.bankCode.localeCompare(b.bankCode, undefined, { sensitivity: 'base' })
      if (bank !== 0) return bank
      return a.staffName.localeCompare(b.staffName, undefined, { sensitivity: 'base' })
    })

  const totals = new Map<string, number>()
  for (const row of listing) {
    const label = bankTotalLabel(row.bankCode)
    totals.set(label, round2((totals.get(label) ?? 0) + row.netPay))
  }
  const bankTotals = [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))

  const extras = parseExtraLines(extraDisbursements)
  const staffTotal = round2(listing.reduce((s, row) => s + row.netPay, 0))
  const extraTotal = extraPayTotal(extras)
  const bankTotalSum = round2(bankTotals.reduce((s, row) => s + row.amount, 0))

  return {
    listing,
    bankTotals,
    extraDisbursements: extras,
    staffTotal,
    extraTotal,
    bankingTotal: round2(staffTotal + extraTotal),
    listingTies: staffTotal === bankTotalSum
  }
}
