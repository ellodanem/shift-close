/**
 * Which End of Day page `/days` opens.
 *
 *   'v2' (current): `/days` redirects to `/days/v2` (the Cstore comparison, Paper table and range report).
 *   'v1'          : `/days` redirects to `/days/v1` (the original End of Day page, unchanged).
 *
 * Both pages stay in the app. To go back to V1, change the value below to 'v1' and deploy.
 * See docs/END_OF_DAY_V2_MIGRATION.md.
 */
export type EndOfDayVersion = 'v1' | 'v2'

export const END_OF_DAY_DEFAULT_VERSION: EndOfDayVersion = 'v2'

type SearchParams = Record<string, string | string[] | undefined>

/** Where `/days` should send the visitor. Query parameters (such as `?date=`) are carried across. */
export function endOfDayEntryPath(version: EndOfDayVersion, searchParams: SearchParams = {}): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) qs.append(key, v)
  }
  const query = qs.toString()
  return `/days/${version}${query ? `?${query}` : ''}`
}
