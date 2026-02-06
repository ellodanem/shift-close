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
 */
export function getDueDateStatus(dueDate: Date | string): DueDateStatus {
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)

  const diffTime = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

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
 * Format date as DD/MM/YYYY
 *
 * Important: For plain "YYYY-MM-DD" strings (from <input type="date">),
 * we parse as a local calendar date to avoid timezone shifts that can
 * move the day backward/forward.
 */
export function formatInvoiceDate(date: Date | string): string {
  let d: Date

  if (typeof date === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (match) {
      const [, year, month, day] = match
      d = new Date(Number(year), Number(month) - 1, Number(day))
    } else {
      d = new Date(date)
    }
  } else {
    d = date
  }

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

