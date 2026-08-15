import {
  formatRosterHours,
  payPeriodHoursTitle,
  payPeriodHoursTone,
  type StaffPayPeriodHours
} from '@/lib/roster-pay-period-hours'

const TONE_CLASS: Record<ReturnType<typeof payPeriodHoursTone>, string> = {
  under: 'text-gray-500',
  on_track: 'text-emerald-700',
  over: 'text-amber-700'
}

export default function RosterPayPeriodHoursBadge({
  hours,
  periodStart,
  compact
}: {
  hours: StaffPayPeriodHours
  periodStart: string
  compact?: boolean
}) {
  const tone = payPeriodHoursTone(hours.periodHours)
  return (
    <span
      className={`roster-editor-only tabular-nums font-semibold ${
        compact ? 'text-[10px] leading-none' : 'text-xs'
      } ${TONE_CLASS[tone]}`}
      title={payPeriodHoursTitle({
        periodStart,
        periodHours: hours.periodHours,
        weekHours: hours.weekHours
      })}
      aria-label={payPeriodHoursTitle({
        periodStart,
        periodHours: hours.periodHours,
        weekHours: hours.weekHours
      })}
    >
      {formatRosterHours(hours.periodHours)}
    </span>
  )
}
