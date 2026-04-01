import { redirect } from 'next/navigation'

/** Old location; end-of-day email is configured under Attendance settings. */
export default function EndOfDayEmailRedirectPage() {
  redirect('/attendance/settings')
}
