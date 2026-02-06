'use client'

import { useState, useEffect } from 'react'

interface CustomDatePickerProps {
  selectedDate: string
  onDateSelect: (date: string) => void
  onClose: () => void
}

type ViewMode = 'day' | 'month' | 'year'

export default function CustomDatePicker({ selectedDate, onDateSelect, onClose }: CustomDatePickerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (selectedDate) {
      return new Date(selectedDate + 'T00:00:00')
    }
    return new Date()
  })
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth())
  const [selectedDay, setSelectedDay] = useState<number>(currentDate.getDate())

  useEffect(() => {
    if (selectedDate) {
      const date = new Date(selectedDate + 'T00:00:00')
      setCurrentDate(date)
      setSelectedYear(date.getFullYear())
      setSelectedMonth(date.getMonth())
      setSelectedDay(date.getDate())
    }
  }, [selectedDate])

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  const handleDateSelect = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day)
    onDateSelect(formatDate(date))
  }

  const handleYearSelect = (year: number) => {
    setSelectedYear(year)
    setViewMode('month')
  }

  const handleMonthSelect = (month: number) => {
    setSelectedMonth(month)
    setViewMode('day')
  }

  const handleDaySelect = (day: number) => {
    setSelectedDay(day)
    handleDateSelect(selectedYear, selectedMonth, day)
  }

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
            onClick={() => {
              const newStart = years[0] - 21
              // Could implement pagination here if needed
            }}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
          >
            «
          </button>
          <h3 className="font-semibold text-gray-900">
            {years[0]} - {years[years.length - 1]}
          </h3>
          <button
            onClick={() => {
              const newEnd = years[years.length - 1] + 21
              // Could implement pagination here if needed
            }}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
          >
            »
          </button>
        </div>
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
            onClick={() => setViewMode('year')}
            className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded font-semibold"
          >
            ← {selectedYear}
          </button>
          <h3 className="font-semibold text-gray-900">Select Month</h3>
          <div className="w-20"></div>
        </div>
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
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setViewMode('day')}
          className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
            viewMode === 'day'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Day
        </button>
        <button
          onClick={() => setViewMode('month')}
          className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
            viewMode === 'month'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Month
        </button>
        <button
          onClick={() => setViewMode('year')}
          className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
            viewMode === 'year'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Year
        </button>
      </div>
      {viewMode === 'year' && renderYearView()}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'day' && renderDayView()}
    </div>
  )
}

