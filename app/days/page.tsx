import { redirect } from 'next/navigation'
import { END_OF_DAY_DEFAULT_VERSION, endOfDayEntryPath } from '@/lib/end-of-day-version'

export const dynamic = 'force-dynamic'

/**
 * End of Day entry point. Every link in the app points here; the version it opens is set in
 * lib/end-of-day-version.ts (see docs/END_OF_DAY_V2_MIGRATION.md to go back to V1).
 */
export default function DaysEntry({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  redirect(endOfDayEntryPath(END_OF_DAY_DEFAULT_VERSION, searchParams))
}
