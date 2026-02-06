'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface DayData {
  day: number
  date: string
  unleadedLitres: number | null
  dieselLitres: number | null
}

export default function FuelDataMonthPage() {
  const router = useRouter()
  const params = useParams()
  const year = parseInt(params.year as string)
  const month = parseInt(params.month as string)

  const [days, setDays] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteColumn, setPasteColumn] = useState<'GAS' | 'DIESEL' | null>(null)
  const [pasteData, setPasteData] = useState<string>('')

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const monthName = monthNames[month - 1]

  useEffect(() => {
    fetchData()
  }, [year, month])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/settings/fuel-data/${year}/${month}`)
      if (!res.ok) {
        throw new Error('Failed to fetch data')
      }
      const data = await res.json()
      setDays(data.days)
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleCellChange = (day: number, field: 'unleadedLitres' | 'dieselLitres', value: string) => {
    const updatedDays = days.map(d => {
      if (d.day === day) {
        return {
          ...d,
          [field]: value === '' ? null : parseFloat(value) || null
        }
      }
      return d
    })
    setDays(updatedDays)
    setSuccess(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/settings/fuel-data/${year}/${month}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      if (data.errors && data.errors.length > 0) {
        setError(`Some errors occurred: ${data.errors.join(', ')}`)
      } else {
        setSuccess(`Successfully saved ${data.updated} day(s)`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handlePasteColumn = () => {
    if (!pasteData.trim() || !pasteColumn) return

    // Parse pasted data
    const lines = pasteData.trim().split(/\r?\n/)
    const values: number[] = []

    for (const line of lines) {
      if (!line.trim()) continue
      const parts = line.split(/[,\t\s]+/).filter(p => p.trim())
      for (const part of parts) {
        const cleaned = part.replace(/[^\d.-]/g, '')
        const num = parseFloat(cleaned)
        if (!isNaN(num)) {
          values.push(num)
        }
      }
    }

    if (values.length === 0) {
      setError('No numeric values found in pasted data')
      return
    }

    // Update days with pasted values
    const updatedDays = days.map((d, index) => {
      if (index < values.length) {
        return {
          ...d,
          [pasteColumn === 'GAS' ? 'unleadedLitres' : 'dieselLitres']: values[index]
        }
      }
      return d
    })

    setDays(updatedDays)
    setShowPasteModal(false)
    setPasteData('')
    setPasteColumn(null)
    setSuccess(`Pasted ${Math.min(values.length, days.length)} values`)
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <button
              onClick={() => router.push(`/settings/fuel-data/${year}`)}
              className="text-gray-600 hover:text-gray-900 mb-2 flex items-center gap-2"
            >
              ← Back to {year}
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              {monthName} {year} - Fuel Data
            </h1>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/settings')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex gap-4 items-center">
            <button
              onClick={() => {
                setPasteColumn('GAS')
                setShowPasteModal(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 text-sm"
            >
              Paste GAS Column
            </button>
            <button
              onClick={() => {
                setPasteColumn('DIESEL')
                setShowPasteModal(true)
              }}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 text-sm"
            >
              Paste DIESEL Column
            </button>
            <div className="flex-1"></div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded text-green-800">
            {success}
          </div>
        )}

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700">Day</th>
                  <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700">Date</th>
                  <th className="border border-gray-300 px-4 py-2 text-center font-semibold text-gray-700">GAS (Litres)</th>
                  <th className="border border-gray-300 px-4 py-2 text-center font-semibold text-gray-700">DIESEL (Litres)</th>
                </tr>
              </thead>
              <tbody>
                {days.map((dayData) => (
                  <tr key={dayData.day} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 font-medium text-gray-900">
                      {dayData.day}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-gray-600">
                      {formatDate(dayData.date)}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={dayData.unleadedLitres ?? ''}
                        onChange={(e) => handleCellChange(dayData.day, 'unleadedLitres', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={dayData.dieselLitres ?? ''}
                        onChange={(e) => handleCellChange(dayData.day, 'dieselLitres', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Paste {pasteColumn} Column
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Paste the {pasteColumn} column data. Numbers can be separated by commas, tabs, or newlines.
              First number = Day 1, second = Day 2, etc.
            </p>
            <textarea
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="Paste numbers here..."
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowPasteModal(false)
                  setPasteData('')
                  setPasteColumn(null)
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteColumn}
                disabled={!pasteData.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
              >
                Paste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

