'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

interface DailyFinancialSummary {
  date: string
  deposits: number[]
  totalDeposits: number
  creditTotal: number
  debitTotal: number
  unleaded: number
  diesel: number
  totalRevenue: number
  fleetCardRevenue: number
  massyCoupons: number
  voucherRevenue: number
}

type FilterType = 'all' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom'

export default function DailyFinancialSummaryPage() {
  const router = useRouter()
  const [data, setData] = useState<DailyFinancialSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterType>('thisMonth')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [showReportsDropdown, setShowReportsDropdown] = useState(false)
  const reportsDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reportsDropdownRef.current && !reportsDropdownRef.current.contains(event.target as Node)) {
        setShowReportsDropdown(false)
      }
    }
    if (showReportsDropdown) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReportsDropdown])

  useEffect(() => {
    fetchData()
  }, [activeFilter, startDate, endDate])

  const fetchData = async () => {
    setLoading(true)
    try {
      let url = '/api/reports/daily-financial-summary'
      const params = new URLSearchParams()

      if (activeFilter === 'custom' && startDate && endDate) {
        params.append('startDate', startDate)
        params.append('endDate', endDate)
      } else if (activeFilter !== 'all') {
        const { start, end } = getDateRange(activeFilter)
        params.append('startDate', start)
        params.append('endDate', end)
      }

      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const res = await fetch(url)
      if (!res.ok) {
        throw new Error('Failed to fetch data')
      }
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching daily financial summary:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDateRange = (filter: FilterType): { start: string; end: string } => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (filter === 'thisWeek') {
      const day = today.getDay()
      const diff = today.getDate() - day + (day === 0 ? -6 : 1) // Monday
      const weekStart = new Date(today.getFullYear(), today.getMonth(), diff)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      return {
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0]
      }
    }

    if (filter === 'lastWeek') {
      const day = today.getDay()
      const diff = today.getDate() - day + (day === 0 ? -6 : 1) - 7
      const weekStart = new Date(today.getFullYear(), today.getMonth(), diff)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      return {
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0]
      }
    }

    if (filter === 'thisMonth') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return {
        start: monthStart.toISOString().split('T')[0],
        end: monthEnd.toISOString().split('T')[0]
      }
    }

    if (filter === 'lastMonth') {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      return {
        start: monthStart.toISOString().split('T')[0],
        end: monthEnd.toISOString().split('T')[0]
      }
    }

    return { start: '', end: '' }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
  }

  const formatCurrency = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const exportToExcel = () => {
    if (!data || data.length === 0) return

    const wb = XLSX.utils.book_new()

    // Header row
    const headers = [
      'Date',
      '# Deposit 1',
      '# Deposit 2',
      '# Deposit 3',
      '# Deposit 4',
      '# Deposit 5',
      '# Deposit 6',
      'Total Deposits',
      'Credit Total',
      '# Debit Total',
      '# Unleaded',
      'Diesel',
      'Total Revenue',
      'Fleet Card Revenue',
      'Massy Coupons',
      'Voucher Revenue'
    ]

    // Data rows
    const dataRows = data.map(day => [
      formatDate(day.date),
      day.deposits[0] || 0,
      day.deposits[1] || 0,
      day.deposits[2] || 0,
      day.deposits[3] || 0,
      day.deposits[4] || 0,
      day.deposits[5] || 0,
      day.totalDeposits,
      day.creditTotal,
      day.debitTotal,
      day.unleaded,
      day.diesel,
      day.totalRevenue,
      day.fleetCardRevenue,
      day.massyCoupons,
      day.voucherRevenue
    ])

    // Totals row
    const totals = data.reduce(
      (acc, day) => ({
        totalDeposits: acc.totalDeposits + day.totalDeposits,
        creditTotal: acc.creditTotal + day.creditTotal,
        debitTotal: acc.debitTotal + day.debitTotal,
        unleaded: acc.unleaded + day.unleaded,
        diesel: acc.diesel + day.diesel,
        totalRevenue: acc.totalRevenue + day.totalRevenue,
        fleetCardRevenue: acc.fleetCardRevenue + day.fleetCardRevenue,
        massyCoupons: acc.massyCoupons + day.massyCoupons,
        voucherRevenue: acc.voucherRevenue + day.voucherRevenue
      }),
      {
        totalDeposits: 0,
        creditTotal: 0,
        debitTotal: 0,
        unleaded: 0,
        diesel: 0,
        totalRevenue: 0,
        fleetCardRevenue: 0,
        massyCoupons: 0,
        voucherRevenue: 0
      }
    )

    const totalsRow = [
      'TOTAL',
      '', // Deposit 1 - empty
      '', // Deposit 2 - empty
      '', // Deposit 3 - empty
      '', // Deposit 4 - empty
      '', // Deposit 5 - empty
      '', // Deposit 6 - empty
      totals.totalDeposits,
      totals.creditTotal,
      totals.debitTotal,
      totals.unleaded,
      totals.diesel,
      totals.totalRevenue,
      totals.fleetCardRevenue,
      totals.massyCoupons,
      totals.voucherRevenue
    ]

    const allRows = [headers, ...dataRows, totalsRow]
    const ws = XLSX.utils.aoa_to_sheet(allRows)

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 14 }, // Deposit 1
      { wch: 14 }, // Deposit 2
      { wch: 14 }, // Deposit 3
      { wch: 14 }, // Deposit 4
      { wch: 14 }, // Deposit 5
      { wch: 14 }, // Deposit 6
      { wch: 15 }, // Total Deposits
      { wch: 14 }, // Credit Total
      { wch: 14 }, // Debit Total
      { wch: 14 }, // Unleaded
      { wch: 12 }, // Diesel
      { wch: 15 }, // Total Revenue
      { wch: 18 }, // Fleet Card Revenue
      { wch: 15 }, // Massy Coupons
      { wch: 16 }  // Voucher Revenue
    ]

    // Style the totals row
    const totalsRowIndex = dataRows.length + 1
    for (let col = 0; col < headers.length; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: totalsRowIndex, c: col })
      if (!ws[cellRef]) continue
      ws[cellRef].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'E0E0E0' } }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Daily Financial Summary')
    XLSX.writeFile(wb, `daily-financial-summary-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="w-full mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Daily Financial Summary</h1>
          <div className="flex gap-4">
            <div className="relative" ref={reportsDropdownRef}>
              <button
                onClick={() => setShowReportsDropdown(!showReportsDropdown)}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 flex items-center gap-1"
              >
                Reports
                <span className="text-xs">▼</span>
              </button>
              {showReportsDropdown && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl z-50 min-w-[180px]">
                  <button
                    onClick={() => { router.push('/reports'); setShowReportsDropdown(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-t-lg"
                  >
                    Reports Center
                  </button>
                  <button
                    onClick={() => { router.push('/customer-accounts'); setShowReportsDropdown(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-b-lg"
                  >
                    Customer Accounts
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => router.push('/shifts')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Back to Shifts
            </button>
            <button
              onClick={exportToExcel}
              disabled={!data || data.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400"
            >
              Export Excel
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setActiveFilter('all')
                setStartDate('')
                setEndDate('')
              }}
              className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => {
                setActiveFilter('thisWeek')
                setStartDate('')
                setEndDate('')
              }}
              className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                activeFilter === 'thisWeek'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => {
                setActiveFilter('lastWeek')
                setStartDate('')
                setEndDate('')
              }}
              className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                activeFilter === 'lastWeek'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Last Week
            </button>
            <button
              onClick={() => {
                setActiveFilter('thisMonth')
                setStartDate('')
                setEndDate('')
              }}
              className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                activeFilter === 'thisMonth'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => {
                setActiveFilter('lastMonth')
                setStartDate('')
                setEndDate('')
              }}
              className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                activeFilter === 'lastMonth'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Last Month
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveFilter('custom')}
                className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                  activeFilter === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Custom
              </button>
              {activeFilter === 'custom' && (
                <>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="Start Date"
                  />
                  <span className="text-gray-600">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="End Date"
                  />
                </>
              )}
            </div>
            {activeFilter !== 'all' && (
              <span className="text-sm text-gray-600 ml-2">
                ({data.length} day{data.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        {data && data.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Date</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold"># Deposit 1</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold"># Deposit 2</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold"># Deposit 3</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold"># Deposit 4</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold"># Deposit 5</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold"># Deposit 6</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Total Deposits</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Credit Total</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold"># Debit Total</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold"># Unleaded</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Diesel</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Total Revenue</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Fleet Card Revenue</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Massy Coupons</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Voucher Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.map((day, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-2 py-1.5 font-medium">{formatDate(day.date)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[0] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[1] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[2] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[3] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[4] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[5] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold">{formatCurrency(day.totalDeposits)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.creditTotal)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.debitTotal)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.unleaded)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.diesel)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-blue-600">${formatCurrency(day.totalRevenue)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.fleetCardRevenue)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{day.massyCoupons}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">${formatCurrency(day.voucherRevenue)}</td>
                  </tr>
                ))}
                {/* Totals Row */}
                {data.length > 0 && (() => {
                  const totals = data.reduce(
                    (acc, day) => (                    {
                      totalDeposits: acc.totalDeposits + day.totalDeposits,
                      creditTotal: acc.creditTotal + day.creditTotal,
                      debitTotal: acc.debitTotal + day.debitTotal,
                      unleaded: acc.unleaded + day.unleaded,
                      diesel: acc.diesel + day.diesel,
                      totalRevenue: acc.totalRevenue + day.totalRevenue,
                      fleetCardRevenue: acc.fleetCardRevenue + day.fleetCardRevenue,
                      massyCoupons: acc.massyCoupons + day.massyCoupons,
                      voucherRevenue: acc.voucherRevenue + day.voucherRevenue
                    }),
                    {
                      totalDeposits: 0,
                      creditTotal: 0,
                      debitTotal: 0,
                      unleaded: 0,
                      diesel: 0,
                      totalRevenue: 0,
                      fleetCardRevenue: 0,
                      massyCoupons: 0,
                      voucherRevenue: 0
                    }
                  )
                  return (
                    <tr className="bg-gray-200 font-bold border-t-2 border-gray-400">
                      <td className="border border-gray-400 px-2 py-1.5">TOTAL</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">-</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">-</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">-</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">-</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">-</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">-</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totals.totalDeposits)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totals.creditTotal)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totals.debitTotal)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totals.unleaded)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totals.diesel)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right text-blue-600">${formatCurrency(totals.totalRevenue)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totals.fleetCardRevenue)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{totals.massyCoupons}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">${formatCurrency(totals.voucherRevenue)}</td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            No financial data available for the selected period.
          </div>
        )}
      </div>
    </div>
  )
}

