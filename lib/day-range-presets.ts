export type RangePresetId = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'

export type RangePreset = { id: RangePresetId; label: string; from: string; to: string }

function parse(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`)
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(ymd: string, days: number): string {
  const d = parse(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return fmt(d)
}

/** Monday of the week that holds `ymd` (weeks run Monday to Sunday, like the current End of Day page). */
function mondayOf(ymd: string): string {
  const dow = parse(ymd).getUTCDay() || 7
  return addDays(ymd, -(dow - 1))
}

function lastDayOfMonth(year: number, month1to12: number): string {
  return fmt(new Date(Date.UTC(year, month1to12, 0, 12)))
}

/** The four quick ranges for the End of Day report, worked out from today's date (YYYY-MM-DD). */
export function rangePresets(todayYmd: string): RangePreset[] {
  const monday = mondayOf(todayYmd)
  const lastMonday = addDays(monday, -7)
  const year = Number(todayYmd.slice(0, 4))
  const month = Number(todayYmd.slice(5, 7))
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    { id: 'thisWeek', label: 'This week', from: monday, to: addDays(monday, 6) },
    { id: 'lastWeek', label: 'Last week', from: lastMonday, to: addDays(lastMonday, 6) },
    { id: 'thisMonth', label: 'This month', from: `${year}-${pad(month)}-01`, to: lastDayOfMonth(year, month) },
    {
      id: 'lastMonth',
      label: 'Last month',
      from: `${prevYear}-${pad(prevMonth)}-01`,
      to: lastDayOfMonth(prevYear, prevMonth)
    }
  ]
}
