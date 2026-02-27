/**
 * Expands recurring reminders into occurrence dates within a range.
 * Used by dashboard upcoming and reminders check cron.
 */

export interface ReminderWithRecurrence {
  id: string
  title: string
  date: string
  notes?: string | null
  notifyEmail?: boolean
  notifyWhatsApp?: boolean
  notifyDaysBefore?: string | null
  recurrenceType?: string | null
  recurrenceDayOfWeek?: number | null
  recurrenceDayOfMonth?: number | null
  recurrenceEndDate?: string | null
}

export interface Occurrence {
  date: string // YYYY-MM-DD
  reminderId: string
  reminder: ReminderWithRecurrence
}

function parseDate(s: string): Date {
  return new Date(s + 'T12:00:00')
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Returns occurrence dates for a reminder within [startDate, endDate].
 * One-time reminders: returns [date] if in range.
 * Recurring: expands based on recurrenceType.
 */
export function getOccurrenceDates(
  reminder: ReminderWithRecurrence,
  startDate: string,
  endDate: string
): Occurrence[] {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const results: Occurrence[] = []

  const type = reminder.recurrenceType

  if (!type) {
    // One-time
    const d = parseDate(reminder.date)
    if (d >= start && d <= end) {
      results.push({ date: reminder.date, reminderId: reminder.id, reminder })
    }
    return results
  }

  const endLimit = reminder.recurrenceEndDate
    ? parseDate(reminder.recurrenceEndDate)
    : null

  if (type === 'weekly') {
    const intervalDays = 7
    let d = parseDate(reminder.date)
    while (d <= end) {
      if (d >= start) {
        const dateStr = toDateStr(d)
        if (!endLimit || d <= endLimit) {
          results.push({ date: dateStr, reminderId: reminder.id, reminder })
        }
      }
      d.setDate(d.getDate() + intervalDays)
    }
    return results
  }

  if (type === 'biweekly') {
    const intervalDays = 14
    let d = parseDate(reminder.date)
    while (d <= end) {
      if (d >= start) {
        const dateStr = toDateStr(d)
        if (!endLimit || d <= endLimit) {
          results.push({ date: dateStr, reminderId: reminder.id, reminder })
        }
      }
      d.setDate(d.getDate() + intervalDays)
    }
    return results
  }

  if (type === 'monthly') {
    const targetDay = reminder.recurrenceDayOfMonth ?? parseDate(reminder.date).getDate()
    let y = parseDate(reminder.date).getFullYear()
    let m = parseDate(reminder.date).getMonth()
    let d = new Date(y, m, Math.min(targetDay, new Date(y, m + 1, 0).getDate()))
    while (d < start) {
      m += 1
      if (m > 11) {
        m = 0
        y += 1
      }
      d = new Date(y, m, Math.min(targetDay, new Date(y, m + 1, 0).getDate()))
    }
    while (d <= end) {
      const dateStr = toDateStr(d)
      if (dateStr >= startDate && dateStr <= endDate) {
        if (!endLimit || d <= endLimit) {
          results.push({ date: dateStr, reminderId: reminder.id, reminder })
        }
      }
      m += 1
      if (m > 11) {
        m = 0
        y += 1
      }
      d = new Date(y, m, Math.min(targetDay, new Date(y, m + 1, 0).getDate()))
    }
    return results
  }

  return results
}
