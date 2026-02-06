'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface MonthStatus {
  month: number
  monthName: string
  hasData: boolean
  daysWithData: number
  totalDays: number
}

export default function FuelDataYearPage() {
  const router = useRouter()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState<number>(currentYear - 1)
  const [monthStatuses, setMonthStatuses] = useState<MonthStatus[]>([])
  const [loading, setLoading] = useState(true)

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  useEffect(() => {
    fetchMonthStatuses()
  }, [selectedYear])

  const fetchMonthStatuses = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/fuel-data/${selectedYear}/status`)
      if (res.ok) {
        const data = await res.json()
        setMonthStatuses(data)
      }
    } catch (error) {
      console.error('Error fetching month statuses:', error)
    } finally {
      setLoading(false)
    }
  }

  const getMonthStatus = (month: number): MonthStatus | null => {
    return monthStatuses.find(m => m.month === month) || null
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <button
              onClick={() => router.push('/settings')}
              className="text-gray-600 hover:text-gray-900 mb-2 flex items-center gap-2"
            >
              ← Back to Settings
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Update Past Fuel Data</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manually enter or edit historical fuel data. 2026+ is tracked automatically from shifts.
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Dashboard
            </button>
          </div>
        </div>

        {/* Year Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Year
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Month Grid */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-600">Loading...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              {selectedYear} - Select Month
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {months.map((monthName, index) => {
                const month = index + 1
                const status = getMonthStatus(month)
                const hasData = status?.hasData || false
                const daysWithData = status?.daysWithData || 0
                const totalDays = status?.totalDays || new Date(selectedYear, month, 0).getDate()

                return (
                  <button
                    key={month}
                    onClick={() => router.push(`/settings/fuel-data/${selectedYear}/${month}`)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      hasData
                        ? 'border-green-300 bg-green-50 hover:border-green-400 hover:shadow-md'
                        : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900">{monthName}</span>
                      {hasData && (
                        <span className="text-green-600 text-lg">✓</span>
                      )}
                    </div>
                    {hasData && (
                      <div className="text-xs text-gray-600">
                        {daysWithData} of {totalDays} days
                      </div>
                    )}
                    {!hasData && (
                      <div className="text-xs text-gray-400 italic">
                        No data
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

