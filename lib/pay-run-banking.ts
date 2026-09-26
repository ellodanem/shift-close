import { extraPayTotal, parseExtraLines, parseMoney, type PayRunExtraLine } from './pay-run'
import { SAINT_LUCIA_BANK_GROUPS } from './saint-lucia-banks'

export type BankingLine = {
  staffName: string
  staffNo?: string | null
  bankCode?: string | null
  bankName?: string | null
  accountNo?: string | null
  netPay: number
}

export type BankingListingRow = {
  bankCode: string
  bankName: string
  staffName: string
  staffNo: string
  accountNo: string
  netPay: number
}

export type CreditUnionRef = {
  code: string
  name: string
}

/** Short Pay+ codes for the credit-union dropdown. NFGWCCU keeps the code already on file. */
const CREDIT_UNIONS: Array<CreditUnionRef & { pattern: RegExp }> = [
  { code: 'NFGWCCU', name: 'National Farmers & General Workers', pattern: /nfgw|national farmers|general workers/ },
  { code: 'CHOISEUL', name: 'Choiseul Co-operative Credit Union', pattern: /choiseul/ },
  { code: 'DENNERY', name: 'Dennery Community Co-operative Credit Union', pattern: /dennery/ },
  { code: 'ELKS', name: 'Elks City of Castries Co-operative Credit Union', pattern: /elks/ },
  { code: 'FONDSTJ', name: 'Fond St. Jacques Co-operative Credit Union', pattern: /fond st|fondst/ },
  { code: 'JANNOU', name: 'Jannou Credit Union', pattern: /jannou|civil service/ },
  { code: 'LABORIE', name: 'Laborie Co-operative Credit Union', pattern: /laborie/ },
  { code: 'MABOUYA', name: 'Mabouya Valley Co-operative Credit Union', pattern: /mabouya/ },
  { code: 'MONREPOS', name: 'Mon Repos Eastern Co-operative Credit Union', pattern: /mon repos|monrepos/ },
  { code: 'POLICE', name: 'Royal St. Lucia Police and Allied Services', pattern: /police/ },
  { code: 'SALTIBUS', name: 'Saltibus Co-operative Credit Union', pattern: /saltibus/ },
  { code: 'HOSPITALITY', name: 'Saint Lucia Hospitality Industry Workers', pattern: /hospitality/ },
  { code: 'SDA', name: 'Seventh Day Adventist Credit Union', pattern: /seventh day|adventist/ },
  { code: 'TEACHERS', name: "St. Lucia Teachers Co-operative Credit Union", pattern: /teachers/ },
  { code: 'WORKERS', name: "St. Lucia Workers' Credit Co-operative Society", pattern: /workers' credit|workers credit|workers co-operative|workers cooperative/ }
]

export function creditUnionByName(bankName?: string | null): CreditUnionRef | undefined {
  const name = (bankName ?? '').trim().toLowerCase()
  if (!name) return undefined
  const match = CREDIT_UNIONS.find((cu) => cu.pattern.test(name))
  return match ? { code: match.code, name: match.name } : undefined
}

export function creditUnionByCode(bankCode?: string | null): CreditUnionRef | undefined {
  const code = (bankCode ?? '').trim().toUpperCase()
  const match = CREDIT_UNIONS.find((cu) => cu.code === code)
  return match ? { code: match.code, name: match.name } : undefined
}

export function isCreditUnionName(value?: string | null): boolean {
  const name = (value ?? '').trim().toLowerCase()
  if (!name) return false
  if (creditUnionByName(name)) return true
  if (CREDIT_UNION_NAMES.has(name)) return true
  return /credit union|co-operative credit/.test(name)
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
  const creditUnion = creditUnionByName(name)
  if (creditUnion) return creditUnion.code
  if (isCreditUnionName(name)) {
    const compact = name.replace(/[^a-z0-9]+/g, '').slice(0, 12).toUpperCase()
    return compact || 'CU'
  }
  if (/fics|financial investment/.test(name)) return 'FICS'
  if (/firstcaribbean|fcib|\bcibc\b/.test(name)) return 'FCIB'
  if (/bank of saint lucia|\bbosl\b/.test(name)) return 'BOSL'
  if (/republic/.test(name)) return 'REPUBLIC'
  if (!name) return 'CHQ'
  const compact = name.replace(/[^a-z0-9]+/g, '').slice(0, 12).toUpperCase()
  return compact || 'OTHER'
}

/** Footer bucket. FCIB and FICS roll into CIBC. Each credit union stays unsplit. CHQ is Cheques. */
export function bankTotalLabel(bankCode: string): string {
  const code = (bankCode || 'CHQ').toUpperCase()
  if (creditUnionByCode(code)) return code
  if (code === 'BOSL') return 'BOSL S/Station'
  if (code === 'FCIB' || code === 'CIBC' || code === 'FICS') return 'CIBC S/Station'
  if (code === 'CHQ') return 'Cheques'
  if (code === 'REPUBLIC') return 'Republic S/Station'
  return `${code} S/Station`
}

export function isCreditUnionBank(bankCode: string, bankName?: string | null): boolean {
  if (creditUnionByCode(bankCode)) return true
  if (isCreditUnionName(bankName) || isCreditUnionName(bankCode)) return true
  return false
}

export function buildBankingPack(
  lines: BankingLine[],
  extraDisbursements: PayRunExtraLine[] = []
): BankingPack {
  const listing = lines
    .map((line) => {
      const bankName = (line.bankName ?? '').trim()
      const fromName = creditUnionByName(bankName)
      const bankCode = (
        fromName?.code ||
        line.bankCode ||
        payrollBankCode(bankName, line.accountNo) ||
        'CHQ'
      ).toUpperCase()
      return {
        bankCode,
        bankName,
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
    const label = isCreditUnionBank(row.bankCode, row.bankName) ? row.bankCode : bankTotalLabel(row.bankCode)
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
