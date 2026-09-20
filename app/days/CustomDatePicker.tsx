'use client'

import { useState, useEffect } from 'react'
import { toYmdInBusinessTz } from '@/lib/datetime-policy'

interface CustomDatePickerProps {
  selectedDate: string
  onDateSelect: (date: string) => void
  onClose: () => void
}

type ViewMode = 'day' | 'month' | 'year'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonthYmd(year: number, month1to12: number): string {
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  return `${year}-${pad2(month1to12)}-${pad2(last)}`
}

/** YYYY-MM-DD (day), YYYY-MM (month), or YYYY (year) → inclusive from/to dates. */
export function customDateRangeFromValue(value: string): { from: string; to: string } | null {
  const v = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { from: v, to: v }
  const month = /^(\d{4})-(\d{2})$/.exec(v)
  if (month) {
    const year = Number(month[1])
    const m = Number(month[2])
    if (m < 1 || m > 12) return null
    return { from: `${year}-${pad2(m)}-01`, to: lastDayOfMonthYmd(year, m) }
  }
  if (/^\d{4}$/.test(v)) {
    return { from: `${v}-01-01`, to: `${v}-12-31` }
  }
  return null
}

export function formatCustomDateLabel(value: string): string {
  const v = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const month = /^(\d{4})-(\d{2})$/.exec(v)
  if (month) {
    const year = Number(month[1])
    const m = Number(month[2])
    if (m >= 1 && m <= 12) {
      return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      })
    }
  }
  if (/^\d{4}$/.test(v)) return v
  return v
}

function parseSelectedDate(value: string): {
  year: number
  month: number
  day: number
  granularity: ViewMode
} {
  const v = String(value || '').trim()
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (day) {
    return {
      year: Number(day[1]),
      month: Number(day[2]) - 1,
      day: Number(day[3]),
      granularity: 'day'
    }
  }
  const month = /^(\d{4})-(\d{2})$/.exec(v)
  if (month) {
    return {
      year: Number(month[1]),
      month: Number(month[2]) - 1,
      day: 1,
      granularity: 'month'
    }
  }
  if (/^\d{4}$/.test(v)) {
    return { year: Number(v), month: 0, day: 1, granularity: 'year' }
  }
  const now = new Date()
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
    granularity: 'month'
  }
}

export default function CustomDatePicker({ selectedDate, onDateSelect, onClose }: CustomDatePickerProps) {
  const initial = parseSelectedDate(selectedDate)
  const [viewMode, setViewMode] = useState<ViewMode>(initial.granularity)
  const [selectionMode, setSelectionMode] = useState<ViewMode>(initial.granularity)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(initial.year, initial.month, initial.day))
  const [selectedYear, setSelectedYear] = useState<number>(initial.year)
  const [selectedMonth, setSelectedMonth] = useState<number>(initial.month)
  const [selectedDay, setSelectedDay] = useState<number>(initial.day)

  useEffect(() => {
    if (!selectedDate) return
    const parsed = parseSelectedDate(selectedDate)
    setCurrentDate(new Date(parsed.year, parsed.month, parsed.day))
    setSelectedYear(parsed.year)
    setSelectedMonth(parsed.month)
    setSelectedDay(parsed.day)
  }, [selectedDate])

  const formatDate = (date: Date): string => {
    return toYmdInBusinessTz(date)
  }

  const openTab = (mode: ViewMode) => {
    setSelectionMode(mode)
    setViewMode(mode)
  }

  const handleDateSelect = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day)
    onDateSelect(formatDate(date))
  }

  const handleYearSelect = (year: number) => {
    if (selectionMode === 'year') {
      onDateSelect(String(year))
      return
    }
    setSelectedYear(year)
    setViewMode('month')
  }

  const handleMonthSelect = (month: number) => {
    if (selectionMode === 'day') {
      setSelectedMonth(month)
      setViewMode('day')
      return
    }
    setSelectedMonth(month)
    onDateSelect(`${selectedYear}-${pad2(month + 1)}`)
  }

  const handleDaySelect = (day: number) => {
    setSelectedDay(day)
    handleDateSelect(selectedYear, selectedMonth, day)
  }

  const tabClass = (mode: ViewMode) =>
    `px-3 py-1 rounded text-sm font-semibold transition-colors ${
      selectionMode === mode
        ? 'bg-blue-600 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`

  const closeButton = (
    <button
      onClick={onClose}
      className="flex-1 px-3 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700 text-sm"
    >
      Close
    </button>
  )

  // Year view
  const renderYearView = () => {
    const currentYear = new Date().getFullYear()
    const years: number[] = []
    const startYear = currentYear - 10
    const endYear = currentYear + 10

    for (let y = startYear; y <= endYear; y++) {
      years.push(y)
    }

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <button
            type="button"
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
            aria-hidden
          >
            «
          </button>
          <h3 className="font-semibold text-gray-900">
            {years[0]} - {years[years.length - 1]}
          </h3>
          <button
            type="button"
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
            aria-hidden
          >
            »
          </button>
        </div>
        {selectionMode === 'year' ? (
          <p className="mb-3 text-xs text-gray-500">Tap a year to include the whole year.</p>
        ) : (
          <p className="mb-3 text-xs text-gray-500">Pick a year, then a month.</p>
        )}
        <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
          {years.map((year) => (
            <button
              key={year}
              onClick={() => handleYearSelect(year)}
              className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                year === selectedYear
                  ? 'bg-blue-600 text-white'
                  : year === currentYear
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">{closeButton}</div>
      </div>
    )
  }

  // Month view
  const renderMonthView = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setSelectedYear(selectedYear - 1)}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
          >
            «
          </button>
          <button
            onClick={() => setViewMode('year')}
            className="px-3 py-1 text-gray-900 hover:bg-gray-100 rounded font-semibold"
          >
            {selectedYear}
          </button>
          <button
            onClick={() => setSelectedYear(selectedYear + 1)}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
          >
            »
          </button>
        </div>
        {selectionMode === 'day' ? (
          <p className="mb-3 text-xs text-gray-500">Pick a month, then a day.</p>
        ) : (
          <p className="mb-3 text-xs text-gray-500">Tap a month to include the whole month.</p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {months.map((month, index) => (
            <button
              key={index}
              onClick={() => handleMonthSelect(index)}
              className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                index === selectedMonth
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {month.substring(0, 3)}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">{closeButton}</div>
      </div>
    )
  }

  // Day view
  const renderDayView = () => {
    const firstDay = new Date(selectedYear, selectedMonth, 1)
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    const adjustedStart = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1 // Monday = 0

    const days: (number | null)[] = []
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < adjustedStart; i++) {
      days.push(null)
    }
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => {
              const newMonth = selectedMonth - 1
              if (newMonth < 0) {
                setSelectedMonth(11)
                setSelectedYear(selectedYear - 1)
              } else {
                setSelectedMonth(newMonth)
              }
            }}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
          >
            «
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('month')}
              className="px-2 py-1 font-semibold text-gray-900 hover:bg-gray-100 rounded"
            >
              {monthNames[selectedMonth]}
            </button>
            <button
              onClick={() => setViewMode('year')}
              className="px-2 py-1 font-semibold text-gray-900 hover:bg-gray-100 rounded"
            >
              {selectedYear}
            </button>
          </div>
          <button
            onClick={() => {
              const newMonth = selectedMonth + 1
              if (newMonth > 11) {
                setSelectedMonth(0)
                setSelectedYear(selectedYear + 1)
              } else {
                setSelectedMonth(newMonth)
              }
            }}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
          >
            »
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-gray-600 py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => (
            <button
              key={index}
              onClick={() => day !== null && handleDaySelect(day)}
              disabled={day === null}
              className={`px-2 py-2 rounded text-sm transition-colors ${
                day === null
                  ? ''
                  : day === selectedDay &&
                    selectedYear === currentDate.getFullYear() &&
                    selectedMonth === currentDate.getMonth()
                  ? 'bg-blue-600 text-white font-semibold'
                  : day === new Date().getDate() &&
                    selectedYear === new Date().getFullYear() &&
                    selectedMonth === new Date().getMonth()
                  ? 'bg-blue-100 text-blue-800 font-semibold'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              const today = new Date()
              handleDateSelect(today.getFullYear(), today.getMonth(), today.getDate())
            }}
            className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300 text-sm"
          >
            Today
          </button>
          {closeButton}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex gap-2 border-b border-gray-200 pb-2">
        <button onClick={() => openTab('day')} className={tabClass('day')}>
          Day
        </button>
        <button onClick={() => openTab('month')} className={tabClass('month')}>
          Month
        </button>
        <button onClick={() => openTab('year')} className={tabClass('year')}>
          Year
        </button>
      </div>
      {viewMode === 'year' && renderYearView()}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'day' && renderDayView()}
    </div>
  )
}
