'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { litresToGallons } from '@/lib/fuel-constants'

interface DayRow {
  date: string
  day: number
  gasLitresCur: number
  gasLitresPrev: number
  dieselLitresCur: number
  dieselLitresPrev: number
  gasGallonsCur: number
  gasGallonsPrev: number
  dieselGallonsCur: number
  dieselGallonsPrev: number
  totalGallonsCur: number
  totalGallonsPrev: number
  variance: number
  hasMissingShiftData?: boolean
  missingShiftInfo?: string
}

interface ApiResponse {
  year: number
  month: number
  prevYear: number
  days: DayRow[]
  totals: {
    gasLitresCur: number
    gasLitresPrev: number
    dieselLitresCur: number
    dieselLitresPrev: number
    gasGallonsCur: number
    gasGallonsPrev: number
    dieselGallonsCur: number
    dieselGallonsPrev: number
    totalGallonsCur: number
    totalGallonsPrev: number
    variance: number
  }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function formatNum(n: number): string {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  return `${day}.${month}.${year}`
}

export default function FuelComparisonPage() {
  const router = useRouter()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [localDays, setLocalDays] = useState<DayRow[]>([])
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteColumn, setPasteColumn] = useState<'GAS' | 'DIESEL' | null>(null)
  const [pasteData, setPasteData] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/fuel-comparison?year=${year}&month=${month}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json: ApiResponse = await res.json()
      setData(json)
      setLocalDays(json.days)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handlePrevYearEdit = (dayIndex: number, field: 'gasLitresPrev' | 'dieselLitresPrev', value: string) => {
    const num = value === '' ? 0 : parseFloat(value) || 0
    setLocalDays(prev =>
      prev.map((d, i) =>
        i === dayIndex ? { ...d, [field]: num } : d
      )
    )
    setSuccess(null)
  }

  const savePrevYearData = async () => {
    if (!data) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const days = localDays.map(d => ({
        day: d.day,
        unleadedLitres: d.gasLitresPrev,
        dieselLitres: d.dieselLitresPrev
      }))
      const res = await fetch(`/api/settings/fuel-data/${data.prevYear}/${data.month}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to save')
      setSuccess(`Saved ${result.updated} day(s)`)
      fetchData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handlePaste = () => {
    if (!pasteData.trim() || !pasteColumn) return
    const lines = pasteData.trim().split(/\r?\n/)
    const values: number[] = []
    for (const line of lines) {
      const parts = line.split(/[,\t\s]+/).filter(p => p.trim())
      for (const part of parts) {
        const cleaned = part.replace(/[^\d.-]/g, '')
        const num = parseFloat(cleaned)
        if (!isNaN(num)) values.push(num)
      }
    }
    if (values.length === 0) {
      setError('No numeric values found in pasted data')
      return
    }
    setLocalDays(prev =>
      prev.map((d, i) => {
        if (i >= values.length) return d
        return {
          ...d,
          [pasteColumn === 'GAS' ? 'gasLitresPrev' : 'dieselLitresPrev']: values[i]
        }
      })
    )
    setShowPasteModal(false)
    setPasteData('')
    setPasteColumn(null)
    setSuccess(`Pasted ${Math.min(values.length, localDays.length)} values`)
  }

  const exportToExcel = () => {
    if (!data || !localDays.length) return
    const wb = XLSX.utils.book_new()
    const monthName = MONTHS[data.month - 1]
    const headers = [
      'Date',
      'GAS ' + data.year,
      'GAS ' + data.prevYear,
      'DIESEL ' + data.year,
      'DIESEL ' + data.prevYear,
      'GAS ' + data.year,
      'GAS ' + data.prevYear,
      'DIESEL ' + data.year,
      'DIESEL ' + data.prevYear,
      'TOTAL ' + data.year,
      'TOTAL ' + data.prevYear,
      'VARIENCE'
    ]
    const subHeaders = [
      '',
      ...Array(4).fill('Litres'),
      ...Array(4).fill('Gallons'),
      '',
      '',
      ''
    ]
    const dataRows = localDays.map(d => {
      const gCur = litresToGallons(d.gasLitresCur)
      const gPrev = litresToGallons(d.gasLitresPrev)
      const dCur = litresToGallons(d.dieselLitresCur)
      const dPrev = litresToGallons(d.dieselLitresPrev)
      return [
        formatDateShort(d.date),
        d.gasLitresCur,
        d.gasLitresPrev,
        d.dieselLitresCur,
        d.dieselLitresPrev,
        gCur,
        gPrev,
        dCur,
        dPrev,
        gCur + dCur,
        gPrev + dPrev,
        (gCur + dCur) - (gPrev + dPrev)
      ]
    })
    const expTotals = displayTotals || data.totals
    const totalsRow = [
      '',
      expTotals.gasLitresCur,
      expTotals.gasLitresPrev,
      expTotals.dieselLitresCur,
      expTotals.dieselLitresPrev,
      expTotals.gasGallonsCur,
      expTotals.gasGallonsPrev,
      expTotals.dieselGallonsCur,
      expTotals.dieselGallonsPrev,
      expTotals.totalGallonsCur,
      expTotals.totalGallonsPrev,
      expTotals.variance
    ]
    const allRows = [['Comparative Fuel Data'], [''], headers, subHeaders, ...dataRows, totalsRow]
    const ws = XLSX.utils.aoa_to_sheet(allRows)
    ws['!cols'] = Array(12).fill({ wch: 12 })
    XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${data.year}`)
    XLSX.writeFile(wb, `fuel-comparison-${data.year}-${String(data.month).padStart(2, '0')}.xlsx`)
  }

  const hasEdits = data && localDays.some((d, i) => {
    const orig = data.days[i]
    return d.gasLitresPrev !== orig.gasLitresPrev || d.dieselLitresPrev !== orig.dieselLitresPrev
  })

  const displayTotals = data && (() => {
    const t = localDays.reduce(
      (acc, d) => ({
        gasLitresCur: acc.gasLitresCur + d.gasLitresCur,
        gasLitresPrev: acc.gasLitresPrev + d.gasLitresPrev,
        dieselLitresCur: acc.dieselLitresCur + d.dieselLitresCur,
        dieselLitresPrev: acc.dieselLitresPrev + d.dieselLitresPrev,
        gasGallonsCur: acc.gasGallonsCur + litresToGallons(d.gasLitresCur),
        gasGallonsPrev: acc.gasGallonsPrev + litresToGallons(d.gasLitresPrev),
        dieselGallonsCur: acc.dieselGallonsCur + litresToGallons(d.dieselLitresCur),
        dieselGallonsPrev: acc.dieselGallonsPrev + litresToGallons(d.dieselLitresPrev)
      }),
      { gasLitresCur: 0, gasLitresPrev: 0, dieselLitresCur: 0, dieselLitresPrev: 0, gasGallonsCur: 0, gasGallonsPrev: 0, dieselGallonsCur: 0, dieselGallonsPrev: 0 }
    )
    const totalGallonsCur = t.gasGallonsCur + t.dieselGallonsCur
    const totalGallonsPrev = t.gasGallonsPrev + t.dieselGallonsPrev
    return { ...t, totalGallonsCur, totalGallonsPrev, variance: totalGallonsCur - totalGallonsPrev }
  })()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/reports')}
              className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              ← Reports
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Comparative Fuel Data</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={month}
              onChange={e => setMonth(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
            >
              {Array.from({ length: 6 }, (_, i) => today.getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md font-semibold hover:bg-gray-300 text-sm"
            >
              Refresh
            </button>
            <button
              onClick={exportToExcel}
              disabled={!data || !localDays.length}
              className="px-4 py-2 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700 disabled:bg-gray-400 text-sm"
            >
              Export Excel
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">{success}</div>
        )}

        {data && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm text-gray-600">
                  Edit {data.prevYear} data (GAS & DIESEL litres) below or paste from Excel.
                </span>
                <span className="text-sm text-amber-700 bg-amber-100 px-2 py-1 rounded" title="A shift (6-1 or 1-9) is missing or has no fuel data for that day">
                  Yellow = incomplete shift data
                </span>
                <button
                  onClick={() => { setPasteColumn('GAS'); setShowPasteModal(true) }}
                  className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded font-medium text-sm hover:bg-blue-200"
                >
                  Paste GAS {data.prevYear}
                </button>
                <button
                  onClick={() => { setPasteColumn('DIESEL'); setShowPasteModal(true) }}
                  className="px-3 py-1.5 bg-green-100 text-green-800 rounded font-medium text-sm hover:bg-green-200"
                >
                  Paste DIESEL {data.prevYear}
                </button>
                {hasEdits && (
                  <button
                    onClick={savePrevYearData}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400 text-sm"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                      <th colSpan={4} className="border border-gray-300 px-2 py-2 text-center font-semibold text-gray-700">Litres</th>
                      <th colSpan={4} className="border border-gray-300 px-2 py-2 text-center font-semibold text-gray-700">Gallons</th>
                      <th colSpan={2} className="border border-gray-300 px-2 py-2 text-center font-semibold text-gray-700">Total</th>
                      <th className="border border-gray-300 px-3 py-2 text-center font-semibold text-gray-700">Variance</th>
                    </tr>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-3 py-1.5 text-left text-xs text-gray-600"></th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">GAS {data.year}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">GAS {data.prevYear}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">DIESEL {data.year}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">DIESEL {data.prevYear}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">GAS {data.year}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">GAS {data.prevYear}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">DIESEL {data.year}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">DIESEL {data.prevYear}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">{data.year}</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">{data.prevYear}</th>
                      <th className="border border-gray-300 px-3 py-1.5 text-center text-xs text-gray-600"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {localDays.map((d, i) => {
                      const gasGallonsCur = litresToGallons(d.gasLitresCur)
                      const gasGallonsPrev = litresToGallons(d.gasLitresPrev)
                      const dieselGallonsCur = litresToGallons(d.dieselLitresCur)
                      const dieselGallonsPrev = litresToGallons(d.dieselLitresPrev)
                      const totalCur = gasGallonsCur + dieselGallonsCur
                      const totalPrev = gasGallonsPrev + dieselGallonsPrev
                      const variance = totalCur - totalPrev
                      const highlight = d.hasMissingShiftData
                      const cellClass = (base: string) =>
                        highlight ? `${base} bg-amber-100` : base
                      const title = d.missingShiftInfo ? `Missing: ${d.missingShiftInfo}` : undefined
                      return (
                        <tr key={d.date} className="hover:bg-gray-50">
                          <td className={`border border-gray-300 px-3 py-2 font-medium text-gray-900 ${highlight ? 'bg-amber-100' : ''}`} title={title}>
                            {formatDateShort(d.date)}
                          </td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')} title={title}>{formatNum(d.gasLitresCur)}</td>
                          <td className="border border-gray-300 px-2 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={d.gasLitresPrev || ''}
                              onChange={e => handlePrevYearEdit(i, 'gasLitresPrev', e.target.value)}
                              className="w-full min-w-[4rem] px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')} title={title}>{formatNum(d.dieselLitresCur)}</td>
                          <td className="border border-gray-300 px-2 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={d.dieselLitresPrev || ''}
                              onChange={e => handlePrevYearEdit(i, 'dieselLitresPrev', e.target.value)}
                              className="w-full min-w-[4rem] px-2 py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')} title={title}>{formatNum(gasGallonsCur)}</td>
                          <td className="border border-gray-300 px-2 py-2 text-right">{formatNum(gasGallonsPrev)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')} title={title}>{formatNum(dieselGallonsCur)}</td>
                          <td className="border border-gray-300 px-2 py-2 text-right">{formatNum(dieselGallonsPrev)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right font-medium')} title={title}>{formatNum(totalCur)}</td>
                          <td className="border border-gray-300 px-2 py-2 text-right font-medium">{formatNum(totalPrev)}</td>
                          <td className={`${cellClass('border border-gray-300 px-2 py-2 text-right font-medium')} ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`} title={title}>
                            {variance >= 0 ? '' : '-'}{formatNum(Math.abs(variance))}
                          </td>
                        </tr>
                      )
                    })}
                    {displayTotals && (
                      <tr className="bg-gray-200 font-bold border-t-2 border-gray-400">
                        <td className="border border-gray-400 px-3 py-2">TOTAL</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.gasLitresCur)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.gasLitresPrev)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.dieselLitresCur)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.dieselLitresPrev)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.gasGallonsCur)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.gasGallonsPrev)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.dieselGallonsCur)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.dieselGallonsPrev)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.totalGallonsCur)}</td>
                        <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(displayTotals.totalGallonsPrev)}</td>
                        <td className={`border border-gray-400 px-2 py-2 text-right ${displayTotals.variance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {displayTotals.variance >= 0 ? '' : '-'}{formatNum(Math.abs(displayTotals.variance))}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!loading && !data && !error && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            No data available.
          </div>
        )}
      </div>

      {showPasteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Paste {pasteColumn} {data?.prevYear}</h3>
            <p className="text-sm text-gray-600 mb-4">
              Paste the {pasteColumn} column. Numbers can be separated by commas, tabs, or newlines.
              First number = Day 1, second = Day 2, etc.
            </p>
            <textarea
              value={pasteData}
              onChange={e => setPasteData(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="Paste numbers here..."
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowPasteModal(false); setPasteData(''); setPasteColumn(null) }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handlePaste}
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
