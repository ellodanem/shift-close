'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { litresToGallons } from '@/lib/fuel-constants'

type ViewMode = 'day' | 'month'

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

interface MonthRow {
  month: number
  monthName: string
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
  isIncomplete: boolean
  isFuture: boolean
}

interface Totals {
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

interface DayApiResponse {
  view: 'day'
  year: number
  month: number
  prevYear: number
  days: DayRow[]
  totals: Totals
}

interface MonthApiResponse {
  view: 'month'
  year: number
  prevYear: number
  months: MonthRow[]
  totals: Totals
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function formatNum(n: number): string {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

function formatVariance(n: number): string {
  return `${n >= 0 ? '' : '-'}${formatNum(Math.abs(n))}`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  return `${day}.${month}.${year}`
}

function varianceClass(n: number): string {
  return n >= 0 ? 'text-green-600' : 'text-red-600'
}

export default function FuelComparisonPage() {
  const router = useRouter()
  const today = new Date()
  const [view, setView] = useState<ViewMode>('day')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [dayData, setDayData] = useState<DayApiResponse | null>(null)
  const [monthData, setMonthData] = useState<MonthApiResponse | null>(null)
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
      const qs = view === 'month'
        ? `view=month&year=${year}`
        : `year=${year}&month=${month}`
      const res = await fetch(`/api/reports/fuel-comparison?${qs}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      if (view === 'month') {
        setMonthData(json as MonthApiResponse)
      } else {
        const dayJson = json as DayApiResponse
        setDayData(dayJson)
        setLocalDays(dayJson.days)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [year, month, view])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openDayView = (nextMonth: number) => {
    setMonth(nextMonth)
    setView('day')
    setSuccess(null)
  }

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
    if (!dayData) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const days = localDays.map(d => ({
        day: d.day,
        unleadedLitres: d.gasLitresPrev,
        dieselLitres: d.dieselLitresPrev
      }))
      const res = await fetch(`/api/settings/fuel-data/${dayData.prevYear}/${dayData.month}`, {
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

  const exportDayExcel = () => {
    if (!dayData || !localDays.length) return
    const monthName = MONTHS[dayData.month - 1]
    const headers = [
      'Date',
      'GAS ' + dayData.year,
      'GAS ' + dayData.prevYear,
      'DIESEL ' + dayData.year,
      'DIESEL ' + dayData.prevYear,
      'GAS ' + dayData.year,
      'GAS ' + dayData.prevYear,
      'DIESEL ' + dayData.year,
      'DIESEL ' + dayData.prevYear,
      'TOTAL ' + dayData.year,
      'TOTAL ' + dayData.prevYear,
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
    const expTotals = displayDayTotals || dayData.totals
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
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['Comparative Fuel Data'], [''], headers, subHeaders, ...dataRows, totalsRow])
    ws['!cols'] = Array(12).fill({ wch: 12 })
    XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${dayData.year}`)
    XLSX.writeFile(wb, `fuel-comparison-${dayData.year}-${String(dayData.month).padStart(2, '0')}.xlsx`)
  }

  const exportMonthExcel = () => {
    if (!monthData) return
    const headers = [
      'Month',
      'GAS ' + monthData.year,
      'GAS ' + monthData.prevYear,
      'DIESEL ' + monthData.year,
      'DIESEL ' + monthData.prevYear,
      'GAS ' + monthData.year,
      'GAS ' + monthData.prevYear,
      'DIESEL ' + monthData.year,
      'DIESEL ' + monthData.prevYear,
      'TOTAL ' + monthData.year,
      'TOTAL ' + monthData.prevYear,
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
    const dataRows = monthData.months.map(m => m.isFuture
      ? [m.monthName, '', '', '', '', '', '', '', '', '', '', '']
      : [
        m.monthName,
        m.gasLitresCur,
        m.gasLitresPrev,
        m.dieselLitresCur,
        m.dieselLitresPrev,
        m.gasGallonsCur,
        m.gasGallonsPrev,
        m.dieselGallonsCur,
        m.dieselGallonsPrev,
        m.totalGallonsCur,
        m.totalGallonsPrev,
        m.variance
      ]
    )
    const t = monthData.totals
    const totalsRow = [
      'TOTAL',
      t.gasLitresCur,
      t.gasLitresPrev,
      t.dieselLitresCur,
      t.dieselLitresPrev,
      t.gasGallonsCur,
      t.gasGallonsPrev,
      t.dieselGallonsCur,
      t.dieselGallonsPrev,
      t.totalGallonsCur,
      t.totalGallonsPrev,
      t.variance
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['Comparative Fuel Data — Monthly'], [''], headers, subHeaders, ...dataRows, totalsRow])
    ws['!cols'] = Array(12).fill({ wch: 12 })
    XLSX.utils.book_append_sheet(wb, ws, `${monthData.year}`)
    XLSX.writeFile(wb, `fuel-comparison-${monthData.year}-monthly.xlsx`)
  }

  const hasEdits = dayData && localDays.some((d, i) => {
    const orig = dayData.days[i]
    return d.gasLitresPrev !== orig.gasLitresPrev || d.dieselLitresPrev !== orig.dieselLitresPrev
  })

  const displayDayTotals = dayData && (() => {
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

  const cumulativeDayVariances = (() => {
    let sum = 0
    return localDays.map(d => {
      const variance =
        litresToGallons(d.gasLitresCur) + litresToGallons(d.dieselLitresCur) -
        (litresToGallons(d.gasLitresPrev) + litresToGallons(d.dieselLitresPrev))
      sum += variance
      return sum
    })
  })()

  const cumulativeMonthVariances = (() => {
    let sum = 0
    return (monthData?.months ?? []).map(m => {
      if (m.isFuture) return sum
      sum += m.variance
      return sum
    })
  })()

  const yearOptions = Array.from({ length: 6 }, (_, i) => today.getFullYear() - i)
  const exportDisabled = view === 'month' ? !monthData : !dayData || !localDays.length
  const headerYears = view === 'month' ? monthData : dayData

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 pl-14 sm:p-8 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:flex-wrap sm:justify-between sm:items-center">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push('/reports')}
              className="text-gray-600 hover:text-gray-900 flex items-center gap-1 min-h-[44px] sm:min-h-0"
            >
              ← Reports
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Comparative Fuel Data</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="col-span-2 flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => { setView('day'); setSuccess(null) }}
                className={`flex-1 min-h-[44px] sm:min-h-0 px-3 py-1.5 font-medium ${
                  view === 'day' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => { setView('month'); setSuccess(null) }}
                className={`flex-1 min-h-[44px] sm:min-h-0 px-3 py-1.5 font-medium border-l border-gray-300 ${
                  view === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Month
              </button>
            </div>
            {view === 'day' && (
              <select
                value={month}
                onChange={e => setMonth(parseInt(e.target.value))}
                className="min-h-[44px] sm:min-h-0 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            )}
            <select
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              className={`min-h-[44px] sm:min-h-0 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm ${view === 'month' ? 'col-span-2 sm:col-span-1' : ''}`}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={fetchData}
              className="min-h-[44px] sm:min-h-0 px-4 py-2 bg-gray-200 text-gray-700 rounded-md font-semibold hover:bg-gray-300 text-sm"
            >
              Refresh
            </button>
            <button
              onClick={view === 'month' ? exportMonthExcel : exportDayExcel}
              disabled={exportDisabled}
              className="min-h-[44px] sm:min-h-0 px-4 py-2 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700 disabled:bg-gray-400 text-sm"
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

        {loading && (
          <p className="text-gray-600 py-8 text-center">Loading...</p>
        )}

        {!loading && view === 'day' && dayData && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm text-gray-600">
                  Edit {dayData.prevYear} data (GAS & DIESEL litres) below or paste from Excel.
                </span>
                <span className="text-sm text-amber-700 bg-amber-100 px-2 py-1 rounded" title="A shift (6-1 or 1-9) is missing or has no fuel data for that day">
                  Yellow = incomplete shift data
                </span>
                <button
                  onClick={() => { setPasteColumn('GAS'); setShowPasteModal(true) }}
                  className="min-h-[44px] sm:min-h-0 px-3 py-1.5 bg-blue-100 text-blue-800 rounded font-medium text-sm hover:bg-blue-200"
                >
                  Paste GAS {dayData.prevYear}
                </button>
                <button
                  onClick={() => { setPasteColumn('DIESEL'); setShowPasteModal(true) }}
                  className="min-h-[44px] sm:min-h-0 px-3 py-1.5 bg-green-100 text-green-800 rounded font-medium text-sm hover:bg-green-200"
                >
                  Paste DIESEL {dayData.prevYear}
                </button>
                {hasEdits && (
                  <button
                    onClick={savePrevYearData}
                    disabled={saving}
                    className="min-h-[44px] sm:min-h-0 px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400 text-sm"
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
                      <th className="border border-gray-300 px-3 py-2 text-center font-semibold text-gray-700" title="Hover a day for cumulative variance from the 1st">Variance</th>
                    </tr>
                    <ComparisonSubHead year={dayData.year} prevYear={dayData.prevYear} />
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
                      const cumulative = cumulativeDayVariances[i]
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
                          <td
                            className={`group relative ${cellClass('border border-gray-300 px-2 py-2 text-right font-medium')} ${varianceClass(variance)}`}
                            title={title}
                          >
                            {formatVariance(variance)}
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                            >
                              Cumulative: {formatVariance(cumulative)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {displayDayTotals && <TotalsRow totals={displayDayTotals} />}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!loading && view === 'month' && monthData && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm text-gray-600">
                  Same month last year, using the daily totals. Year total is January through the current month.
                  Tap a month to open the day view.
                </span>
                <span className="text-sm text-amber-700 bg-amber-100 px-2 py-1 rounded">
                  Yellow = incomplete shift data
                </span>
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              {monthData.months.map((m, i) => {
                if (m.isFuture) {
                  return (
                    <div key={m.month} className="bg-white rounded-lg border border-gray-200 p-4 text-gray-400">
                      <div className="font-semibold text-gray-500">{m.monthName}</div>
                      <p className="text-sm mt-1">No comparison yet</p>
                    </div>
                  )
                }
                const highlight = m.hasMissingShiftData || m.isIncomplete
                return (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() => openDayView(m.month)}
                    className={`w-full text-left bg-white rounded-lg border p-4 min-h-[44px] ${
                      highlight ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">{m.monthName}</div>
                        {m.isIncomplete && (
                          <div className="text-xs text-amber-800 mt-0.5">In progress</div>
                        )}
                        {m.missingShiftInfo && (
                          <div className="text-xs text-amber-800 mt-0.5">{m.missingShiftInfo}</div>
                        )}
                      </div>
                      <div className={`text-right font-semibold tabular-nums ${varianceClass(m.variance)}`}>
                        {formatVariance(m.variance)} gal
                        <div className="text-xs font-medium text-gray-500">YTD {formatVariance(cumulativeMonthVariances[i])}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Total {monthData.year}</div>
                        <div className="font-medium tabular-nums">{formatNum(m.totalGallonsCur)} gal</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Total {monthData.prevYear}</div>
                        <div className="font-medium tabular-nums">{formatNum(m.totalGallonsPrev)} gal</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">GAS L {monthData.year}</div>
                        <div className="tabular-nums">{formatNum(m.gasLitresCur)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">DIESEL L {monthData.year}</div>
                        <div className="tabular-nums">{formatNum(m.dieselLitresCur)}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm font-medium text-blue-700">View days →</div>
                  </button>
                )
              })}
              <div className="bg-gray-100 rounded-lg border border-gray-300 p-4 font-semibold">
                <div className="flex items-start justify-between gap-3">
                  <div>Year total</div>
                  <div className={`text-right tabular-nums ${varianceClass(monthData.totals.variance)}`}>
                    {formatVariance(monthData.totals.variance)} gal
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-medium">
                  <div>{monthData.year}: {formatNum(monthData.totals.totalGallonsCur)} gal</div>
                  <div>{monthData.prevYear}: {formatNum(monthData.totals.totalGallonsPrev)} gal</div>
                </div>
              </div>
            </div>

            <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">Month</th>
                      <th colSpan={4} className="border border-gray-300 px-2 py-2 text-center font-semibold text-gray-700">Litres</th>
                      <th colSpan={4} className="border border-gray-300 px-2 py-2 text-center font-semibold text-gray-700">Gallons</th>
                      <th colSpan={2} className="border border-gray-300 px-2 py-2 text-center font-semibold text-gray-700">Total</th>
                      <th className="border border-gray-300 px-3 py-2 text-center font-semibold text-gray-700" title="Hover a month for year-to-date variance">Variance</th>
                    </tr>
                    <ComparisonSubHead year={monthData.year} prevYear={monthData.prevYear} />
                  </thead>
                  <tbody>
                    {monthData.months.map((m, i) => {
                      const highlight = m.hasMissingShiftData || m.isIncomplete
                      const cellClass = (base: string) =>
                        highlight ? `${base} bg-amber-100` : base
                      const title = [
                        m.isIncomplete ? 'Month in progress' : '',
                        m.missingShiftInfo ?? ''
                      ].filter(Boolean).join(' · ') || undefined
                      if (m.isFuture) {
                        return (
                          <tr key={m.month} className="text-gray-400">
                            <td className="border border-gray-300 px-3 py-2 font-medium">{m.monthName}</td>
                            {Array.from({ length: 11 }, (_, idx) => (
                              <td key={idx} className="border border-gray-300 px-2 py-2 text-center">—</td>
                            ))}
                          </tr>
                        )
                      }
                      return (
                        <tr
                          key={m.month}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => openDayView(m.month)}
                          title={title ? `${title}. Click to view days.` : 'Click to view days'}
                        >
                          <td className={`border border-gray-300 px-3 py-2 font-medium text-gray-900 ${highlight ? 'bg-amber-100' : ''}`}>
                            {m.monthName}
                            {m.isIncomplete && <span className="ml-2 text-xs font-normal text-amber-800"> in progress</span>}
                          </td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')}>{formatNum(m.gasLitresCur)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')}>{formatNum(m.gasLitresPrev)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')}>{formatNum(m.dieselLitresCur)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')}>{formatNum(m.dieselLitresPrev)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')}>{formatNum(m.gasGallonsCur)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')}>{formatNum(m.gasGallonsPrev)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')}>{formatNum(m.dieselGallonsCur)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right')}>{formatNum(m.dieselGallonsPrev)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right font-medium')}>{formatNum(m.totalGallonsCur)}</td>
                          <td className={cellClass('border border-gray-300 px-2 py-2 text-right font-medium')}>{formatNum(m.totalGallonsPrev)}</td>
                          <td
                            className={`group relative ${cellClass('border border-gray-300 px-2 py-2 text-right font-medium')} ${varianceClass(m.variance)}`}
                          >
                            {formatVariance(m.variance)}
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                            >
                              YTD: {formatVariance(cumulativeMonthVariances[i])}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    <TotalsRow totals={monthData.totals} />
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!loading && !error && ((view === 'day' && !dayData) || (view === 'month' && !monthData)) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            No data available.
          </div>
        )}
      </div>

      {showPasteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Paste {pasteColumn} {headerYears?.prevYear}</h3>
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
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => { setShowPasteModal(false); setPasteData(''); setPasteColumn(null) }}
                className="min-h-[44px] sm:min-h-0 px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handlePaste}
                disabled={!pasteData.trim()}
                className="min-h-[44px] sm:min-h-0 px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
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

function ComparisonSubHead({ year, prevYear }: { year: number; prevYear: number }) {
  return (
    <tr className="bg-gray-50">
      <th className="border border-gray-300 px-3 py-1.5 text-left text-xs text-gray-600"></th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">GAS {year}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">GAS {prevYear}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">DIESEL {year}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">DIESEL {prevYear}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">GAS {year}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">GAS {prevYear}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">DIESEL {year}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">DIESEL {prevYear}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">{year}</th>
      <th className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-600">{prevYear}</th>
      <th className="border border-gray-300 px-3 py-1.5 text-center text-xs text-gray-600"></th>
    </tr>
  )
}

function TotalsRow({ totals }: { totals: Totals }) {
  return (
    <tr className="bg-gray-200 font-bold border-t-2 border-gray-400">
      <td className="border border-gray-400 px-3 py-2">TOTAL</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.gasLitresCur)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.gasLitresPrev)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.dieselLitresCur)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.dieselLitresPrev)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.gasGallonsCur)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.gasGallonsPrev)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.dieselGallonsCur)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.dieselGallonsPrev)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.totalGallonsCur)}</td>
      <td className="border border-gray-400 px-2 py-2 text-right">{formatNum(totals.totalGallonsPrev)}</td>
      <td className={`border border-gray-400 px-2 py-2 text-right ${totals.variance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
        {formatVariance(totals.variance)}
      </td>
    </tr>
  )
}
