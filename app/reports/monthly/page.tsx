'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { MonthlyReportData } from './types'
import PrintPreviewModal from './PrintPreviewModal'
import ShareModal from './ShareModal'
import { exportToPDF } from './pdfExport'

export default function MonthlyReportPage() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [data, setData] = useState<MonthlyReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  useEffect(() => {
    fetchData()
  }, [year, month])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString()
      })

      const res = await fetch(`/api/reports/monthly?${params}`)
      if (!res.ok) {
        throw new Error('Failed to fetch data')
      }
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching monthly report:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const formatNumber = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatDateShort = (dateStr: string): string => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
  }

  const exportToExcel = () => {
    if (!data) return

    const wb = XLSX.utils.book_new()

    // Sheet 1: Executive Summary
    const summaryRows = [
      ['Monthly Report - Executive Summary'],
      [`${data.monthName} ${data.year}`],
      [],
      ['Period Overview'],
      ['Total Days', data.period.totalDays],
      ['Working Days', data.period.workingDays],
      ['Complete Days', data.period.completeDays],
      ['Incomplete Days', data.period.incompleteDays],
      [],
      ['Financial Summary'],
      ['Total Deposits', data.summary.totalDeposits],
      ['Debit & Credit', data.summary.debitAndCredit],
      ['Fleet Revenue', data.summary.fleet],
      ['Vouchers/Coupons', data.summary.vouchers],
      ['Unleaded Sales', data.summary.unleaded],
      ['Diesel Sales', data.summary.diesel],
      ['Grand Total', data.summary.grandTotal],
      [],
      ['Operational Metrics'],
      ['Total Shifts', data.summary.totalShifts],
      ['Draft Shifts', data.summary.draftShifts],
      [],
      ['Over/Short Analysis'],
      ['Total Over/Short', data.overShortAnalysis.totalOverShort],
      ['Average per Shift', data.overShortAnalysis.averageOverShort],
      ['Shifts with Discrepancy', data.overShortAnalysis.shiftsWithOverShort],
      ['Shifts Balanced', data.overShortAnalysis.shiftsWithZeroOverShort],
      ['Largest Over', data.overShortAnalysis.largestOver],
      ['Largest Short', data.overShortAnalysis.largestShort]
    ]
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    // Sheet 2: Daily Breakdown
    const dailyHeaders = [
      'Date',
      'Deposit 1', 'Deposit 2', 'Deposit 3', 'Deposit 4', 'Deposit 5', 'Deposit 6',
      'Total Deposits',
      'Credit Total',
      'Debit Total',
      'Unleaded',
      'Diesel',
      'Total Revenue',
      'Fleet Card',
      'Vouchers',
      'Over/Short'
    ]
    const dailyRows = data.dailyBreakdown.map(day => [
      formatDateShort(day.date),
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
      day.voucherRevenue,
      day.overShortTotal
    ])
    const dailyWs = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyRows])
    XLSX.utils.book_append_sheet(wb, dailyWs, 'Daily Breakdown')

    // Sheet 3: Over/Short Details
    const overShortHeaders = ['Date', 'Shift', 'Supervisor', 'Over/Short', 'Explained', 'Explanation']
    const overShortRows = data.overShortAnalysis.significantDiscrepancies.map(d => [
      formatDateShort(d.date),
      d.shift,
      d.supervisor,
      d.overShortTotal,
      d.overShortExplained ? 'Yes' : 'No',
      d.overShortExplanation || ''
    ])
    const overShortWs = XLSX.utils.aoa_to_sheet([overShortHeaders, ...overShortRows])
    XLSX.utils.book_append_sheet(wb, overShortWs, 'Over/Short Details')

    XLSX.writeFile(wb, `monthly-report-${data.year}-${String(data.month).padStart(2, '0')}.xlsx`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">No data available</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Monthly Report</h1>
          <div className="flex gap-4">
            <button
              onClick={() => data && exportToPDF(data)}
              disabled={!data}
              className="px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700 disabled:bg-gray-400"
            >
              Export PDF
            </button>
            <button
              onClick={exportToExcel}
              disabled={!data}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400"
            >
              Export Excel
            </button>
            <button
              onClick={() => setShowPrintPreview(true)}
              disabled={!data}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
            >
              Print Preview
            </button>
            <button
              onClick={() => setShowShareModal(true)}
              disabled={!data}
              className="px-4 py-2 bg-purple-600 text-white rounded font-semibold hover:bg-purple-700 disabled:bg-gray-400"
            >
              Share
            </button>
          </div>
        </div>

        {/* Month Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => currentYear - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setYear(currentYear)
                  setMonth(currentMonth)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Current Month
              </button>
            </div>
          </div>
        </div>

        {/* Section 1: Executive Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Executive Summary - {data.monthName} {data.year}
          </h2>

          {/* Period Overview */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Period Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-600 mb-1">Total Days</div>
                <div className="text-2xl font-bold text-gray-900">{data.period.totalDays}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-600 mb-1">Working Days</div>
                <div className="text-2xl font-bold text-gray-900">{data.period.workingDays}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-xs font-medium text-green-700 mb-1">Complete Days</div>
                <div className="text-2xl font-bold text-green-900">{data.period.completeDays}</div>
              </div>
              <div className={`rounded-lg p-4 ${data.period.incompleteDays > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-medium mb-1 ${data.period.incompleteDays > 0 ? 'text-red-700' : 'text-gray-600'}`}>
                  Incomplete Days
                </div>
                <div className={`text-2xl font-bold ${data.period.incompleteDays > 0 ? 'text-red-900' : 'text-gray-900'}`}>
                  {data.period.incompleteDays}
                </div>
              </div>
            </div>
          </div>

          {/* Key Financial Totals */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Financial Totals</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="text-xs font-medium text-blue-700 mb-1">Total Deposits</div>
                <div className="text-xl font-bold text-blue-900">${formatCurrency(data.summary.totalDeposits)}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="text-xs font-medium text-purple-700 mb-1">Debit & Credit</div>
                <div className="text-xl font-bold text-purple-900">${formatCurrency(data.summary.debitAndCredit)}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-xs font-medium text-green-700 mb-1">Fleet Revenue</div>
                <div className="text-xl font-bold text-green-900">${formatCurrency(data.summary.fleet)}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-xs font-medium text-orange-700 mb-1">Vouchers/Coupons</div>
                <div className="text-xl font-bold text-orange-900">${formatCurrency(data.summary.vouchers)}</div>
              </div>
              <div className="bg-gray-100 rounded-lg p-4 border-2 border-gray-300 col-span-2 md:col-span-3 lg:col-span-1">
                <div className="text-xs font-medium text-gray-700 mb-1">Grand Total</div>
                <div className="text-2xl font-bold text-gray-900">${formatCurrency(data.summary.grandTotal)}</div>
              </div>
            </div>
          </div>

          {/* Operational Metrics */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Operational Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-600 mb-1">Total Shifts</div>
                <div className="text-2xl font-bold text-gray-900">{data.summary.totalShifts}</div>
              </div>
              <div className={`rounded-lg p-4 ${data.summary.draftShifts > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                <div className={`text-xs font-medium mb-1 ${data.summary.draftShifts > 0 ? 'text-yellow-700' : 'text-gray-600'}`}>
                  Draft Shifts
                </div>
                <div className={`text-2xl font-bold ${data.summary.draftShifts > 0 ? 'text-yellow-900' : 'text-gray-900'}`}>
                  {data.summary.draftShifts}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-600 mb-1">Unleaded Sales</div>
                <div className="text-xl font-bold text-gray-900">{formatNumber(data.summary.unleaded)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-600 mb-1">Diesel Sales</div>
                <div className="text-xl font-bold text-gray-900">{formatNumber(data.summary.diesel)}</div>
              </div>
            </div>
          </div>

          {/* Financial Placeholder */}
          <div className="mb-6 border-t-2 border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Financial Summary</h3>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800 italic">
                Financial data (Expenses, Payables, Receivables, Net Profit, Cash Flow) will appear here once the Financial module is implemented.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Daily Financial Breakdown */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Daily Financial Breakdown</h2>
          <div className="overflow-x-auto">
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
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Credit</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Debit</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Unleaded</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Diesel</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Total Revenue</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">Over/Short</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyBreakdown.map((day, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-2 py-1.5 font-medium">{formatDateShort(day.date)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[0] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[1] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[2] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[3] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[4] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.deposits[5] || 0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold">{formatCurrency(day.totalDeposits)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.creditTotal)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(day.debitTotal)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatNumber(day.unleaded)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{formatNumber(day.diesel)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-blue-600">${formatCurrency(day.totalRevenue)}</td>
                    <td className={`border border-gray-300 px-2 py-1.5 text-right font-semibold ${
                      day.overShortTotal > 0 ? 'text-green-600' : day.overShortTotal < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {day.overShortTotal >= 0 ? '+' : ''}{formatCurrency(day.overShortTotal)}
                    </td>
                  </tr>
                ))}
                {/* Totals Row */}
                {data.dailyBreakdown.length > 0 && (() => {
                  const totals = data.dailyBreakdown.reduce(
                    (acc, day) => ({
                      deposits: acc.deposits.map((sum, i) => sum + (day.deposits[i] || 0)),
                      totalDeposits: acc.totalDeposits + day.totalDeposits,
                      creditTotal: acc.creditTotal + day.creditTotal,
                      debitTotal: acc.debitTotal + day.debitTotal,
                      unleaded: acc.unleaded + day.unleaded,
                      diesel: acc.diesel + day.diesel,
                      totalRevenue: acc.totalRevenue + day.totalRevenue,
                      overShortTotal: acc.overShortTotal + day.overShortTotal
                    }),
                    {
                      deposits: [0, 0, 0, 0, 0, 0],
                      totalDeposits: 0,
                      creditTotal: 0,
                      debitTotal: 0,
                      unleaded: 0,
                      diesel: 0,
                      totalRevenue: 0,
                      overShortTotal: 0
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
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{formatNumber(totals.unleaded)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right">{formatNumber(totals.diesel)}</td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right text-blue-600">${formatCurrency(totals.totalRevenue)}</td>
                      <td className={`border border-gray-400 px-2 py-1.5 text-right ${
                        totals.overShortTotal > 0 ? 'text-green-600' : totals.overShortTotal < 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {totals.overShortTotal >= 0 ? '+' : ''}{formatCurrency(totals.overShortTotal)}
                      </td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Over/Short Analysis */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Over/Short Analysis</h2>

          {/* Summary Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-600 mb-1">Total Over/Short</div>
              <div className={`text-xl font-bold ${
                data.overShortAnalysis.totalOverShort > 0 ? 'text-green-600' : 
                data.overShortAnalysis.totalOverShort < 0 ? 'text-red-600' : 'text-gray-600'
              }`}>
                {data.overShortAnalysis.totalOverShort >= 0 ? '+' : ''}{formatCurrency(data.overShortAnalysis.totalOverShort)}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-600 mb-1">Average per Shift</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(data.overShortAnalysis.averageOverShort)}</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-xs font-medium text-yellow-700 mb-1">With Discrepancy</div>
              <div className="text-xl font-bold text-yellow-900">{data.overShortAnalysis.shiftsWithOverShort}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-xs font-medium text-green-700 mb-1">Balanced</div>
              <div className="text-xl font-bold text-green-900">{data.overShortAnalysis.shiftsWithZeroOverShort}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-xs font-medium text-green-700 mb-1">Largest Over</div>
              <div className="text-xl font-bold text-green-900">${formatCurrency(data.overShortAnalysis.largestOver)}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-xs font-medium text-red-700 mb-1">Largest Short</div>
              <div className="text-xl font-bold text-red-900">${formatCurrency(data.overShortAnalysis.largestShort)}</div>
            </div>
          </div>

          {/* Significant Discrepancies */}
          {data.overShortAnalysis.significantDiscrepancies.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-3">
                Significant Discrepancies (Over $100)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Date</th>
                      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Shift</th>
                      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Supervisor</th>
                      <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Over/Short</th>
                      <th className="border border-gray-300 px-4 py-2 text-center font-semibold">Explained</th>
                      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.overShortAnalysis.significantDiscrepancies.map((d, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2">{formatDateShort(d.date)}</td>
                        <td className="border border-gray-300 px-4 py-2">{d.shift}</td>
                        <td className="border border-gray-300 px-4 py-2">{d.supervisor}</td>
                        <td className={`border border-gray-300 px-4 py-2 text-right font-semibold ${
                          d.overShortTotal > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {d.overShortTotal >= 0 ? '+' : ''}{formatCurrency(d.overShortTotal)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {d.overShortExplained ? (
                            <span className="text-green-600 font-semibold">✓</span>
                          ) : (
                            <span className="text-red-600 font-semibold">✗</span>
                          )}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-sm">
                          {d.overShortExplanation || <span className="text-gray-400 italic">No explanation</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Placeholder for Supervisor Performance (Phase 2) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Supervisor Performance</h2>
          {data.supervisorPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Supervisor</th>
                    <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Shifts</th>
                    <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Total Revenue</th>
                    <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Avg Revenue</th>
                    <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Avg Over/Short</th>
                    <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Discrepancies</th>
                  </tr>
                </thead>
                <tbody>
                  {data.supervisorPerformance.map((sup, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2 font-medium">{sup.name}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{sup.shifts}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right font-semibold">${formatCurrency(sup.totalRevenue)}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">${formatCurrency(sup.averageRevenue)}</td>
                      <td className={`border border-gray-300 px-4 py-2 text-right ${
                        sup.averageOverShort > 0 ? 'text-green-600' : 
                        sup.averageOverShort < 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {sup.averageOverShort >= 0 ? '+' : ''}{formatCurrency(sup.averageOverShort)}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{sup.shiftsWithDiscrepancy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center italic">No supervisor data available</p>
          )}
        </div>
      </div>

      {/* Modals */}
      {data && (
        <>
          <PrintPreviewModal
            data={data}
            isOpen={showPrintPreview}
            onClose={() => setShowPrintPreview(false)}
          />
          <ShareModal
            data={data}
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
          />
        </>
      )}
    </div>
  )
}

