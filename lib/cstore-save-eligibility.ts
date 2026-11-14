/**
 * Which days the harvest agent may start and save in Cstore (only when its auto-save setting is on).
 * A day qualifies when it is in the asked range and before the current business day. Shift Close End
 * of Day does not have to be Complete — Cstore already has the POS figures, and the agent still
 * refuses today, days already saved, gaps, and blank POS pages.
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

function addDays(ymd: string, delta: number): string {
  const m = YMD.exec(ymd)
  if (!m) return ''
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta, 12)).toISOString().slice(0, 10)
}

export function eligibleSaveDates(from: string, to: string, todayYmd: string): string[] {
  if (!YMD.test(from) || !YMD.test(to) || !YMD.test(todayYmd) || from > to) return []
  const out: string[] = []
  for (let d = from; d && d <= to; d = addDays(d, 1)) {
    if (d < todayYmd) out.push(d)
  }
  return out
}
