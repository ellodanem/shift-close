import { businessTodayYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { parsePayCycle, type PayCycle } from '@/lib/pay-cycle'
import { formatMoney, parseOptionalMoney } from '@/lib/pay-run'

/** Letterhead and close taken from the Total Auto job-letter samples. */
export const JOB_LETTER_COMPANY = {
  name: 'Total Auto Inc.',
  addressLine: 'John Compton Highway & Cul-de-sac',
  cityLine: 'Castries, St Lucia',
  phoneLine: 'Tele. (758) 451-5969 or 451-5400',
  signatory: 'Elrus Elcock',
  signatoryTitle: 'Managing Director'
} as const

const PAYS_PER_YEAR: Record<PayCycle, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12
}

/** How the job letter names the pay cadence. Semi-monthly is written "bi-monthly", as on the hourly sample. */
const PAYABLE_CADENCE: Record<PayCycle, string> = {
  weekly: 'weekly',
  biweekly: 'bi-weekly',
  semimonthly: 'bi-monthly',
  monthly: 'monthly'
}

const SMALL_NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen'
]

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

const COURTESY_TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr'])

export type JobLetterInput = {
  name: string
  startDate?: string | null
  /** Display name from staff roles, preferred over the legacy role string. */
  roleName?: string | null
  role?: string | null
  payType?: string | null
  payCycle?: string | null
  hourlyRate?: number | null
  /** Basic pay for one cycle. The letter states the monthly equivalent. */
  salariedAmount?: number | null
  /** Monthly traveling allowance, when it is known. */
  monthlyTravelAllowance?: number | null
}

function spellCount(n: number): string {
  const value = Math.floor(Math.abs(n))
  if (value < 20) return SMALL_NUMBERS[value]
  if (value < 100) {
    const ten = Math.floor(value / 10)
    const one = value % 10
    return one ? `${TENS[ten]}-${SMALL_NUMBERS[one]}` : TENS[ten]
  }
  if (value < 1000) {
    const hundreds = Math.floor(value / 100)
    const rest = value % 100
    const head = `${SMALL_NUMBERS[hundreds]} hundred`
    return rest ? `${head} ${spellCount(rest)}` : head
  }
  return String(value)
}

function countedPhrase(count: number, singular: string, plural: string): string {
  const label = count === 1 ? singular : plural
  return `${spellCount(count)} (${count}) ${label}`
}

export function formatJobLetterDate(ymd: string): string {
  const date = ymdToUtcNoonDate(ymd)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

function parseYmd(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

function compareYmd(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): number {
  if (a.y !== b.y) return a.y - b.y
  if (a.m !== b.m) return a.m - b.m
  return a.d - b.d
}

/** Completed years and months from a start date through the letter date. */
export function employmentTenure(
  startDate: string | null | undefined,
  asOfYmd: string
): { years: number; months: number } | null {
  const start = parseYmd(startDate)
  const asOf = parseYmd(asOfYmd)
  if (!start || !asOf || compareYmd(start, asOf) > 0) return null
  let years = asOf.y - start.y
  let months = asOf.m - start.m
  if (asOf.d < start.d) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years < 0) return null
  return { years, months }
}

export function jobLetterPosition(roleName?: string | null, legacyRole?: string | null): string {
  const raw = (roleName ?? '').trim() || (legacyRole ?? '').trim()
  if (!raw) return ''
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .filter(Boolean)
    .join(' ')
}

function displayName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

/** Second mention: "Ms. Poleon" when a courtesy title is present, otherwise the full name. */
export function jobLetterLaterName(name: string): string {
  const full = displayName(name)
  const parts = full.split(' ')
  if (parts.length < 3) return full
  const titleKey = parts[0].replace(/\./g, '').toLowerCase()
  if (!COURTESY_TITLES.has(titleKey)) return full
  const title = titleKey === 'miss' ? 'Miss' : `${titleKey.charAt(0).toUpperCase()}${titleKey.slice(1)}.`
  return `${title} ${parts[parts.length - 1]}`
}

function positiveAmount(value: unknown): number | null {
  const amount = parseOptionalMoney(value)
  if (amount == null || amount <= 0) return null
  return amount
}

/** Full-time average monthly pay: hourly rate × 40 hours × 52 weeks / 12. */
export function averageMonthlyFromHourly(hourlyRate: number): number {
  return Math.round(((hourlyRate * 40 * 52) / 12) * 100) / 100
}

function spellDollarAmount(amount: number): string {
  const dollars = Math.floor(Math.abs(amount) + 1e-9)
  if (dollars < 1000) return spellCount(dollars)
  const thousands = Math.floor(dollars / 1000)
  const rest = dollars % 1000
  const head = `${spellCount(thousands)} thousand`
  return rest ? `${head}, ${spellCount(rest)}` : head
}

/** "one thousand, one hundred seventy dollars" — cents added only when the amount is not a whole dollar. */
function moneyWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const dollars = Math.floor(rounded + 1e-9)
  const cents = Math.round((rounded - dollars) * 100)
  const dollarLabel = dollars === 1 ? 'dollar' : 'dollars'
  const words = `${spellDollarAmount(dollars)} ${dollarLabel}`
  if (!cents) return words
  const centLabel = cents === 1 ? 'cent' : 'cents'
  return `${words} and ${spellCount(cents)} ${centLabel}`
}

function indefiniteArticle(phrase: string): 'a' | 'an' {
  return /^[aeiou]/i.test(phrase.trim()) ? 'an' : 'a'
}

function isHourlyLetter(input: JobLetterInput): boolean {
  if (input.payType === 'hourly') return true
  if (input.payType === 'salaried') return false
  return positiveAmount(input.hourlyRate) != null
}

function courtesyPronoun(name: string): { possessive: string; object: string } | null {
  const parts = displayName(name).split(' ')
  if (parts.length < 3) return null
  const titleKey = parts[0].replace(/\./g, '').toLowerCase()
  if (titleKey === 'mr') return { possessive: 'his', object: 'him' }
  if (titleKey === 'mrs' || titleKey === 'ms' || titleKey === 'miss') return { possessive: 'her', object: 'her' }
  return null
}

/** "for the past 2 years seven months" */
function hourlyTenurePhrase(tenure: { years: number; months: number }): string | null {
  const parts: string[] = []
  if (tenure.years >= 1) parts.push(`${tenure.years} ${tenure.years === 1 ? 'year' : 'years'}`)
  if (tenure.months >= 1) parts.push(`${spellCount(tenure.months)} ${tenure.months === 1 ? 'month' : 'months'}`)
  if (!parts.length) return null
  return `for the past ${parts.join(' ')}`
}

/** Salaried cycle pay stated as a monthly basic, matching the salaried job-letter template. */
export function monthlyBasicSalary(input: {
  payType?: string | null
  payCycle?: string | null
  salariedAmount?: number | null
}): number | null {
  if (input.payType === 'hourly') return null
  const cycleAmount = positiveAmount(input.salariedAmount)
  if (cycleAmount == null) return null
  if (input.payType != null && input.payType !== 'salaried') return null
  const cycle = parsePayCycle(input.payCycle)
  return Math.round(((cycleAmount * PAYS_PER_YEAR[cycle]) / 12) * 100) / 100
}

function salariedEarningsSentence(later: string, input: JobLetterInput): string | null {
  const travel = positiveAmount(input.monthlyTravelAllowance)
  const travelText = travel != null ? formatMoney(travel) : null
  const monthly = monthlyBasicSalary(input)
  if (monthly != null) {
    const basic = formatMoney(monthly)
    if (travelText) {
      return `${later} earns a basic salary of ${basic} plus ${travelText} traveling allowance per month.`
    }
    return `${later} earns a basic salary of ${basic} per month.`
  }
  if (travelText) return `${later} earns a traveling allowance of ${travelText} per month.`
  return null
}

function hourlyEarningsSentence(later: string, input: JobLetterInput): string | null {
  const hourly = positiveAmount(input.hourlyRate)
  if (hourly == null) return null
  const average = averageMonthlyFromHourly(hourly)
  const cadence = PAYABLE_CADENCE[parsePayCycle(input.payCycle)]
  return `${later} is paid at the rate of ${formatMoney(hourly)} per hour, resulting in an average monthly salary of ${moneyWords(average)} (${formatMoney(average)}) monthly (payable ${cadence}).`
}

function employmentSentence(
  full: string,
  position: string,
  startDate: string | null | undefined,
  asOfYmd: string,
  hourly: boolean
): string {
  const asRole = position ? (hourly ? ` as ${indefiniteArticle(position)} ${position}` : ` as ${position}`) : ''
  const start = parseYmd(startDate)
  const asOf = parseYmd(asOfYmd)
  if (start && asOf && compareYmd(start, asOf) > 0) {
    return `This serves to confirm that ${full} is to commence employment with Total Auto Inc.${asRole} on ${formatJobLetterDate(startDate!.trim())}.`
  }
  const tenure = employmentTenure(startDate, asOfYmd)
  let duration = ''
  if (hourly) {
    const phrase = tenure ? hourlyTenurePhrase(tenure) : null
    if (phrase) duration = ` ${phrase}`
    else if (tenure) duration = ` since ${formatJobLetterDate(startDate!.trim())}`
  } else if (tenure && tenure.years >= 1) {
    duration = ` for the past ${countedPhrase(tenure.years, 'year', 'years')}`
  } else if (tenure && tenure.months >= 1) {
    duration = ` for the past ${countedPhrase(tenure.months, 'month', 'months')}`
  } else if (tenure) {
    duration = ` since ${formatJobLetterDate(startDate!.trim())}`
  }
  const verb = hourly ? 'is employed' : 'has been employed'
  return `This serves to confirm that ${full} ${verb} with Total Auto Inc.${asRole}${duration}.`
}

function interestParagraph(full: string, later: string, hourly: boolean): string {
  if (!hourly) {
    return `${later} has indicated an interest in doing business with your company.\nAny courtesies extended would be greatly appreciated.`
  }
  const courtesy = courtesyPronoun(full)
  if (courtesy) {
    return `${later} has indicated ${courtesy.possessive} interest in doing business with your institution. Any courtesies extended to ${courtesy.object} will be greatly appreciated.`
  }
  return `${later} has indicated an interest in doing business with your institution. Any courtesies extended will be greatly appreciated.`
}

export function buildJobLetter(input: JobLetterInput, asOfYmd = businessTodayYmd()): string {
  const full = displayName(input.name) || 'the employee'
  const later = jobLetterLaterName(full)
  const hourly = isHourlyLetter(input)
  const position = jobLetterPosition(input.roleName, input.role)
  const confirm = employmentSentence(full, position, input.startDate, asOfYmd, hourly)
  const earnings = hourly ? hourlyEarningsSentence(later, input) : salariedEarningsSentence(later, input)
  const body = earnings ? `${confirm} ${earnings}` : confirm
  const { signatory, signatoryTitle } = JOB_LETTER_COMPANY

  return [
    jobLetterHeadText(),
    formatJobLetterDate(asOfYmd),
    'The Manager',
    'Dear Sir/Madam,',
    body,
    interestParagraph(full, later, hourly),
    `Yours truly,\n\n\n${signatory}\n${signatoryTitle}`
  ].join('\n\n')
}

export function jobLetterHeadText(): string {
  const { name, addressLine, cityLine, phoneLine } = JOB_LETTER_COMPANY
  return [name, addressLine, cityLine, phoneLine].join('\n')
}

/** Letter text under the formatted letterhead. */
export function jobLetterBodyText(content: string): string {
  const head = jobLetterHeadText()
  if (!content.startsWith(head)) return content
  return content.slice(head.length).replace(/^\n+/, '')
}

export function withJobLetterHead(body: string): string {
  return `${jobLetterHeadText()}\n\n${body.replace(/^\n+/, '')}`
}

function escapeLetterHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Printable page whose letterhead matches the Word sample: centered name, italic address, rule. */
export function jobLetterPrintHtml(title: string, body: string): string {
  const { name, addressLine, cityLine, phoneLine } = JOB_LETTER_COMPANY
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeLetterHtml(title)}</title>
  <style>
    @page { margin: 0.85in; }
    body {
      margin: 0;
      color: #111;
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.45;
    }
    .letterhead { text-align: center; }
    .letterhead h1 {
      margin: 0;
      font-family: "Times New Roman", Times, serif;
      font-size: 28pt;
      font-weight: 700;
      line-height: 1.1;
    }
    .letterhead p {
      margin: 1px 0 0;
      font-size: 12pt;
      font-style: italic;
      line-height: 1.3;
    }
    .letterhead hr {
      margin: 10px 0 16px;
      border: 0;
      border-top: 2px solid #111;
    }
    .body { white-space: pre-wrap; }
  </style>
</head>
<body>
  <header class="letterhead">
    <h1>${escapeLetterHtml(name)}</h1>
    <p>${escapeLetterHtml(addressLine)}</p>
    <p>${escapeLetterHtml(cityLine)}</p>
    <p>${escapeLetterHtml(phoneLine)}</p>
    <hr />
  </header>
  <div class="body">${escapeLetterHtml(body)}</div>
</body>
</html>`
}
