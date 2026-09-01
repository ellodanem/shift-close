/**
 * Quiet hours: 11:00pm–5:30am America/St_Lucia.
 * Keep in sync with lib/datetime-policy.ts. Agent skips Vercel staff polls
 * in this window so Neon can scale to zero. Local device ping still runs.
 */
const TZ = 'America/St_Lucia'
const START_MINUTES = 23 * 60
const END_MINUTES = 5 * 60 + 30

function minutesInBusinessTz(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0)
  return hour * 60 + minute
}

function quietHoursDisabled() {
  return process.env.QUIET_HOURS_DISABLED === '1'
}

function isQuietHours(now = new Date()) {
  if (quietHoursDisabled()) return false
  const mins = minutesInBusinessTz(now)
  return mins >= START_MINUTES || mins < END_MINUTES
}

module.exports = { isQuietHours, TZ, START_MINUTES, END_MINUTES }
