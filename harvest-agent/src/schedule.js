/**
 * schedule.js — keep-alive slots + flexible job schedules (daily / weekly / monthly).
 */

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function zonedParts(timeZone, date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const wdShort = String(parts.weekday || '').slice(0, 3)
  const weekday = Math.max(0, WEEKDAY_NAMES.indexOf(wdShort))
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday
  }
}

function previousCalendarMonth(timeZone, date = new Date()) {
  const { year, month } = zonedParts(timeZone, date)
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

function currentCalendarMonth(timeZone, date = new Date()) {
  const { year, month } = zonedParts(timeZone, date)
  return { year, month }
}

function monthForScope(timeZone, scope, date = new Date()) {
  return scope === 'current'
    ? currentCalendarMonth(timeZone, date)
    : previousCalendarMonth(timeZone, date)
}

function slotKeyFor(timeZone, slotHours, date = new Date()) {
  const { ymd, hour } = zonedParts(timeZone, date)
  const hours = [...slotHours].sort((a, b) => a - b)
  const matching = hours.filter((h) => hour === h)
  if (matching.length === 0) return null
  return `${ymd}-${String(matching[0]).padStart(2, '0')}`
}

function formatSlotHours(slotHours) {
  return [...slotHours]
    .sort((a, b) => a - b)
    .map((h) => `${String(h).padStart(2, '0')}:00`)
    .join(', ')
}

function nextKeepaliveLabel(timeZone, slotHours, date = new Date()) {
  const { hour } = zonedParts(timeZone, date)
  const hours = [...slotHours].sort((a, b) => a - b)
  if (!hours.length) return 'No keep-alive slots'
  const next = hours.find((h) => h > hour) ?? hours[0]
  return `Next keep-alive ${String(next).padStart(2, '0')}:00`
}

function startSlotWatcher({ timeZone, getSlotHours, slotHours, onSlot, pollMs = 30_000 }) {
  const resolveHours = typeof getSlotHours === 'function' ? getSlotHours : () => slotHours || []
  const seen = new Set()
  const { ymd, hour } = zonedParts(timeZone)
  for (const h of resolveHours()) {
    if (hour >= h) seen.add(`${ymd}-${String(h).padStart(2, '0')}`)
  }
  const timer = setInterval(() => {
    const hours = resolveHours()
    const key = slotKeyFor(timeZone, hours)
    if (!key || seen.has(key)) return
    seen.add(key)
    Promise.resolve(onSlot(key)).catch((err) => {
      console.error('[Schedule] slot job failed:', err)
    })
    if (seen.size > 20) {
      const keep = [...seen].slice(-10)
      seen.clear()
      keep.forEach((k) => seen.add(k))
    }
  }, pollMs)
  return () => clearInterval(timer)
}

/** @returns {'off'|'daily'|'weekly'|'monthly'} */
function resolveFrequency(schedule) {
  if (!schedule) return 'off'
  const freq = String(schedule.frequency || '').toLowerCase()
  if (freq === 'daily' || freq === 'weekly' || freq === 'monthly') return freq
  if (freq === 'off') return 'off'
  // Legacy monthly-only configs used `enabled` without frequency
  if (schedule.enabled) return 'monthly'
  return 'off'
}

function formatClock(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * True when the schedule should fire for this zoned clock (minute window: exact + 1).
 */
function scheduleMatchesNow(schedule, parts) {
  const frequency = resolveFrequency(schedule)
  if (frequency === 'off') return false

  const hour = Math.min(23, Math.max(0, Number(schedule.hour) || 0))
  const minute = Math.min(59, Math.max(0, Number(schedule.minute) || 0))
  if (parts.hour !== hour) return false
  if (parts.minute < minute || parts.minute > minute + 1) return false

  if (frequency === 'daily') return true

  if (frequency === 'weekly') {
    const days = Array.isArray(schedule.daysOfWeek)
      ? schedule.daysOfWeek.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
      : []
    return days.includes(parts.weekday)
  }

  if (frequency === 'monthly') {
    const dayOfMonth = Math.min(28, Math.max(1, Number(schedule.dayOfMonth) || 1))
    return parts.day === dayOfMonth
  }

  return false
}

function fireKeyFor(schedule, parts) {
  const frequency = resolveFrequency(schedule)
  const hour = Math.min(23, Math.max(0, Number(schedule.hour) || 0))
  const minute = Math.min(59, Math.max(0, Number(schedule.minute) || 0))
  const clock = formatClock(hour, minute)
  if (frequency === 'daily') return `${parts.ymd}-${clock}-daily`
  if (frequency === 'weekly') return `${parts.ymd}-${clock}-weekly`
  if (frequency === 'monthly') {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${clock}-monthly`
  }
  return null
}

/**
 * Generic watcher for daily / weekly / monthly job schedules.
 */
function startJobScheduleWatcher({ timeZone, getSchedule, onFire, pollMs = 20_000 }) {
  const seen = new Set()
  const timer = setInterval(() => {
    const schedule = (typeof getSchedule === 'function' ? getSchedule() : getSchedule) || {}
    const parts = zonedParts(timeZone)
    if (!scheduleMatchesNow(schedule, parts)) return
    const key = fireKeyFor(schedule, parts)
    if (!key || seen.has(key)) return
    seen.add(key)
    Promise.resolve(
      onFire({
        key,
        frequency: resolveFrequency(schedule),
        hour: Number(schedule.hour) || 0,
        minute: Number(schedule.minute) || 0
      })
    ).catch((err) => {
      console.error('[Schedule] job failed:', err)
    })
    if (seen.size > 48) {
      const keep = [...seen].slice(-24)
      seen.clear()
      keep.forEach((k) => seen.add(k))
    }
  }, pollMs)
  return () => clearInterval(timer)
}

/** @deprecated use startJobScheduleWatcher */
function startMonthlyWatcher(opts) {
  return startJobScheduleWatcher(opts)
}

function describeJobSchedule(label, schedule, timeZone) {
  const frequency = resolveFrequency(schedule)
  if (frequency === 'off') return `${label}: off`

  const hour = Math.min(23, Math.max(0, Number(schedule.hour) || 0))
  const minute = Math.min(59, Math.max(0, Number(schedule.minute) || 0))
  const clock = formatClock(hour, minute)
  const scope = schedule.monthScope === 'current' ? 'current month' : 'previous month'

  if (frequency === 'daily') {
    return `${label}: daily at ${clock} (${scope})`
  }
  if (frequency === 'weekly') {
    const days = Array.isArray(schedule.daysOfWeek)
      ? schedule.daysOfWeek.map((n) => WEEKDAY_NAMES[Number(n)] || '?').join('/')
      : '?'
    return `${label}: weekly ${days} at ${clock} (${scope})`
  }
  const day = Math.min(28, Math.max(1, Number(schedule.dayOfMonth) || 1))
  return `${label}: monthly day ${day} at ${clock} (${scope}, ${timeZone})`
}

function describeCustomerSchedule(schedule, timeZone) {
  return describeJobSchedule('Customer accounts', schedule, timeZone)
}

function describeVendorSchedule(schedule, timeZone) {
  return describeJobSchedule('Vendor invoices', schedule, timeZone)
}

module.exports = {
  WEEKDAY_NAMES,
  zonedParts,
  previousCalendarMonth,
  currentCalendarMonth,
  monthForScope,
  slotKeyFor,
  formatSlotHours,
  nextKeepaliveLabel,
  startSlotWatcher,
  startMonthlyWatcher,
  startJobScheduleWatcher,
  resolveFrequency,
  scheduleMatchesNow,
  describeCustomerSchedule,
  describeVendorSchedule,
  describeJobSchedule
}
