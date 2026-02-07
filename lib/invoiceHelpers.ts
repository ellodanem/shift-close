// Helper functions for invoice management

export interface DueDateStatus {
  status: 'ok' | 'warning' | 'due' | 'overdue'
  daysUntil: number
  className: string
}

/**
 * Calculate due date status and styling
 * - Yellow (warning): 1 day before due date
 * - Orange (due): On due date
 * - Red (overdue): Past due date
 * Uses UTC calendar days so status matches the displayed due date in all timezones.
 */
export function getDueDateStatus(dueDate: Date | string): DueDateStatus {
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const now = new Date()

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const diffTime = dueUtc - todayUtc
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    // Overdue
    return {
      status: 'overdue',
      daysUntil: Math.abs(diffDays),
      className: 'bg-red-100 text-red-800 border-red-300'
    }
  } else if (diffDays === 0) {
    // Due today
    return {
      status: 'due',
      daysUntil: 0,
      className: 'bg-orange-100 text-orange-800 border-orange-300'
    }
  } else if (diffDays === 1) {
    // 1 day before due
    return {
      status: 'warning',
      daysUntil: 1,
      className: 'bg-yellow-100 text-yellow-800 border-yellow-300'
    }
  } else {
    // OK
    return {
      status: 'ok',
      daysUntil: diffDays,
      className: 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }
}

/**
 * Parse a date-only string (YYYY-MM-DD) to a Date at UTC noon.
 * Use this when saving invoice/due dates so the calendar day is preserved
 * regardless of server or client timezone (avoids off-by-one display bugs).
 */
export function parseInvoiceDateToUTC(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr).trim())
  if (!match) {
    return new Date(dateStr)
  }
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0))
}

/**
 * Return YYYY-MM-DD for use in <input type="date"> value.
 * Uses UTC date parts so the calendar day is correct regardless of client timezone.
 */
export function invoiceDateToInputValue(date: Date | string): string {
  let d: Date
  if (typeof date === 'string') {
    const plainMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
    if (plainMatch) {
      return date.slice(0, 10)
    }
    d = new Date(date)
  } else {
    d = date
  }
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Format date as DD/MM/YYYY.
 * For values from the server (ISO string or Date), uses UTC date parts so the
 * stored calendar day displays correctly in all timezones.
 */
export function formatInvoiceDate(date: Date | string): string {
  let d: Date
  let useUTC = false

  if (typeof date === 'string') {
    const plainMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (plainMatch) {
      const [, year, month, day] = plainMatch
      d = new Date(Number(year), Number(month) - 1, Number(day))
    } else {
      d = new Date(date)
      useUTC = true
    }
  } else {
    d = date
    useUTC = true
  }

  const day = useUTC ? d.getUTCDate() : d.getDate()
  const month = useUTC ? d.getUTCMonth() + 1 : d.getMonth() + 1
  const year = useUTC ? d.getUTCFullYear() : d.getFullYear()
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

