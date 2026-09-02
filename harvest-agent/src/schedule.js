/**
 * schedule.js — run at 07:00 and 19:00 in the configured timezone (default St. Lucia).
 */

function zonedParts(timeZone, date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  }
}

function slotKeyFor(timeZone, slotHours, date = new Date()) {
  const { ymd, hour } = zonedParts(timeZone, date)
  const hours = [...slotHours].sort((a, b) => a - b)
  const matching = hours.filter((h) => hour === h)
  if (matching.length === 0) return null
  return `${ymd}-${String(matching[0]).padStart(2, '0')}`
}

function startSlotWatcher({ timeZone, slotHours, onSlot, pollMs = 30_000 }) {
  const seen = new Set()
  const { ymd, hour } = zonedParts(timeZone)
  for (const h of slotHours) {
    if (hour >= h) seen.add(`${ymd}-${String(h).padStart(2, '0')}`)
  }
  const timer = setInterval(() => {
    const key = slotKeyFor(timeZone, slotHours)
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

module.exports = { zonedParts, slotKeyFor, startSlotWatcher }
