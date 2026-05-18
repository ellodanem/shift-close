/** Payroll fields used for pay-period notes copy blocks. */
export type StaffPayrollSnapshot = {
  fullName: string
  dateOfBirth: string | null
  nicNumber: string | null
  startDate: string | null
  bankName: string | null
  accountNumber: string | null
}

/** Pad labels so values line up (notes + Excel paste). */
const LABEL_WIDTH = 18

function alignedRow(label: string, value: string): string {
  const padded = label.padEnd(LABEL_WIDTH, ' ')
  return value ? `${padded}${value}` : padded.trimEnd()
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) }
}

function ordinalDay(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** e.g. September 21 1992 */
function formatDobValue(ymd: string | null): string {
  if (!ymd) return ''
  const p = parseYmd(ymd)
  if (!p) return ''
  const date = new Date(p.y, p.m - 1, p.d)
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  return `${month} ${p.d} ${p.y}`
}

/** e.g. May 11th 2026 */
function formatStartDateValue(ymd: string | null): string {
  if (!ymd) return ''
  const p = parseYmd(ymd)
  if (!p) return ''
  const date = new Date(p.y, p.m - 1, p.d)
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  return `${month} ${ordinalDay(p.d)} ${p.y}`
}

/** Build the notes block for one staff member (pay period / payroll paste). */
export function formatPayPeriodStaffNotesBlock(s: StaffPayrollSnapshot): string {
  const lines: string[] = []
  lines.push(alignedRow('Name', s.fullName.trim()))
  lines.push(alignedRow('D.O.B.', formatDobValue(s.dateOfBirth)))
  lines.push(alignedRow('Date Started :', formatStartDateValue(s.startDate)))
  lines.push(alignedRow('N.I.C #', (s.nicNumber ?? '').trim()))
  const bank = (s.bankName ?? '').trim()
  const acct = (s.accountNumber ?? '').trim()
  if (bank || acct) {
    lines.push('')
    if (bank) lines.push(alignedRow('', bank))
    lines.push(alignedRow('Account number:', acct))
  }
  return lines.join('\n')
}
