'use client'

import { useEffect } from 'react'
import { MonthlyReportData } from './types'

interface PrintPreviewModalProps {
  data: MonthlyReportData
  isOpen: boolean
  onClose: () => void
}

export default function PrintPreviewModal({ data, isOpen, onClose }: PrintPreviewModalProps) {
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = 'unset'
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  const formatCurrency = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const formatNumber = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const formatDateShort = (dateStr: string): string => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 print-backdrop"
        onClick={onClose}
      >
        {/* Modal Content */}
        <div
          className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto print-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center no-print">
            <h2 className="text-xl font-bold text-gray-900">Print Preview</h2>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Print
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>

          {/* Report Content - Print Optimized */}
          <div className="p-6 print:p-0 print-content">
            {/* Executive Summary */}
            <div className="mb-6 page-break-inside-avoid">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 print:text-xl">
                Executive Summary - {data.monthName} {data.year}
              </h2>

              {/* Period Overview */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-2 print:text-base">Period Overview</h3>
                <div className="grid grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
                  <div className="bg-gray-50 rounded-lg p-3 print:p-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">Total Days</div>
                    <div className="text-xl font-bold text-gray-900 print:text-lg">{data.period.totalDays}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 print:p-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">Working Days</div>
                    <div className="text-xl font-bold text-gray-900 print:text-lg">{data.period.workingDays}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 print:p-2">
                    <div className="text-xs font-medium text-green-700 mb-1">Complete Days</div>
                    <div className="text-xl font-bold text-green-900 print:text-lg">{data.period.completeDays}</div>
                  </div>
                  <div className={`rounded-lg p-3 print:p-2 ${data.period.incompleteDays > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <div className={`text-xs font-medium mb-1 ${data.period.incompleteDays > 0 ? 'text-red-700' : 'text-gray-600'}`}>
                      Incomplete Days
                    </div>
                    <div className={`text-xl font-bold print:text-lg ${data.period.incompleteDays > 0 ? 'text-red-900' : 'text-gray-900'}`}>
                      {data.period.incompleteDays}
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-2 print:text-base">Financial Totals</h3>
                <div className="grid grid-cols-5 gap-3 print:grid-cols-5 print:gap-2">
                  <div className="bg-blue-50 rounded-lg p-3 print:p-2 border border-blue-200">
                    <div className="text-xs font-medium text-blue-700 mb-1">Total Deposits</div>
                    <div className="text-lg font-bold text-blue-900 print:text-base">${formatCurrency(data.summary.totalDeposits)}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 print:p-2 border border-purple-200">
                    <div className="text-xs font-medium text-purple-700 mb-1">Debit & Credit</div>
                    <div className="text-lg font-bold text-purple-900 print:text-base">${formatCurrency(data.summary.debitAndCredit)}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 print:p-2 border border-green-200">
                    <div className="text-xs font-medium text-green-700 mb-1">Fleet Revenue</div>
                    <div className="text-lg font-bold text-green-900 print:text-base">${formatCurrency(data.summary.fleet)}</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 print:p-2 border border-orange-200">
                    <div className="text-xs font-medium text-orange-700 mb-1">Vouchers/Coupons</div>
                    <div className="text-lg font-bold text-orange-900 print:text-base">${formatCurrency(data.summary.vouchers)}</div>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-3 print:p-2 border-2 border-gray-300">
                    <div className="text-xs font-medium text-gray-700 mb-1">Grand Total</div>
                    <div className="text-xl font-bold text-gray-900 print:text-lg">${formatCurrency(data.summary.grandTotal)}</div>
                  </div>
                </div>
              </div>

              {/* Operational Metrics */}
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2 print:text-base">Operational Metrics</h3>
                <div className="grid grid-cols-4 gap-3 print:grid-cols-4 print:gap-2">
                  <div className="bg-gray-50 rounded-lg p-3 print:p-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">Total Shifts</div>
                    <div className="text-xl font-bold text-gray-900 print:text-lg">{data.summary.totalShifts}</div>
                  </div>
                  <div className={`rounded-lg p-3 print:p-2 ${data.summary.draftShifts > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                    <div className={`text-xs font-medium mb-1 ${data.summary.draftShifts > 0 ? 'text-yellow-700' : 'text-gray-600'}`}>
                      Draft Shifts
                    </div>
                    <div className={`text-xl font-bold print:text-lg ${data.summary.draftShifts > 0 ? 'text-yellow-900' : 'text-gray-900'}`}>
                      {data.summary.draftShifts}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 print:p-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">Unleaded Sales</div>
                    <div className="text-lg font-bold text-gray-900 print:text-base">{formatNumber(data.summary.unleaded)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 print:p-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">Diesel Sales</div>
                    <div className="text-lg font-bold text-gray-900 print:text-base">{formatNumber(data.summary.diesel)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Financial Breakdown */}
            <div className="mb-6 page-break-before">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 print:text-xl">Daily Financial Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs print:text-xs">
                  <thead>
                    <tr className="bg-gray-100 print:bg-gray-100">
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
                      <tr key={index} className="hover:bg-gray-50 print:hover:bg-transparent">
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
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-blue-600 print:text-blue-900">${formatCurrency(day.totalRevenue)}</td>
                        <td className={`border border-gray-300 px-2 py-1.5 text-right font-semibold ${
                          day.overShortTotal > 0 ? 'text-green-600 print:text-green-900' : 
                          day.overShortTotal < 0 ? 'text-red-600 print:text-red-900' : 'text-gray-600'
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
                        <tr className="bg-gray-200 font-bold border-t-2 border-gray-400 print:bg-gray-200">
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
                          <td className="border border-gray-400 px-2 py-1.5 text-right text-blue-600 print:text-blue-900">${formatCurrency(totals.totalRevenue)}</td>
                          <td className={`border border-gray-400 px-2 py-1.5 text-right ${
                            totals.overShortTotal > 0 ? 'text-green-600 print:text-green-900' : 
                            totals.overShortTotal < 0 ? 'text-red-600 print:text-red-900' : 'text-gray-600'
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

            {/* Over/Short Analysis */}
            <div className="mb-6 page-break-before">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 print:text-xl">Over/Short Analysis</h2>

              {/* Summary Statistics */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4 print:grid-cols-6 print:gap-2">
                <div className="bg-gray-50 rounded-lg p-3 print:p-2">
                  <div className="text-xs font-medium text-gray-600 mb-1">Total Over/Short</div>
                  <div className={`text-lg font-bold print:text-base ${
                    data.overShortAnalysis.totalOverShort > 0 ? 'text-green-600 print:text-green-900' : 
                    data.overShortAnalysis.totalOverShort < 0 ? 'text-red-600 print:text-red-900' : 'text-gray-600'
                  }`}>
                    {data.overShortAnalysis.totalOverShort >= 0 ? '+' : ''}{formatCurrency(data.overShortAnalysis.totalOverShort)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 print:p-2">
                  <div className="text-xs font-medium text-gray-600 mb-1">Average per Shift</div>
                  <div className="text-lg font-bold text-gray-900 print:text-base">{formatCurrency(data.overShortAnalysis.averageOverShort)}</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 print:p-2">
                  <div className="text-xs font-medium text-yellow-700 mb-1">With Discrepancy</div>
                  <div className="text-lg font-bold text-yellow-900 print:text-base">{data.overShortAnalysis.shiftsWithOverShort}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 print:p-2">
                  <div className="text-xs font-medium text-green-700 mb-1">Balanced</div>
                  <div className="text-lg font-bold text-green-900 print:text-base">{data.overShortAnalysis.shiftsWithZeroOverShort}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 print:p-2">
                  <div className="text-xs font-medium text-green-700 mb-1">Largest Over</div>
                  <div className="text-lg font-bold text-green-900 print:text-base">${formatCurrency(data.overShortAnalysis.largestOver)}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 print:p-2">
                  <div className="text-xs font-medium text-red-700 mb-1">Largest Short</div>
                  <div className="text-lg font-bold text-red-900 print:text-base">${formatCurrency(data.overShortAnalysis.largestShort)}</div>
                </div>
              </div>

              {/* Significant Discrepancies */}
              {data.overShortAnalysis.significantDiscrepancies.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2 print:text-base">
                    Significant Discrepancies (Over $100)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm print:text-xs">
                      <thead>
                        <tr className="bg-gray-100 print:bg-gray-100">
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Date</th>
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Shift</th>
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Supervisor</th>
                          <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Over/Short</th>
                          <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Explained</th>
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Explanation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.overShortAnalysis.significantDiscrepancies.map((d, index) => (
                          <tr key={index} className="hover:bg-gray-50 print:hover:bg-transparent">
                            <td className="border border-gray-300 px-3 py-2">{formatDateShort(d.date)}</td>
                            <td className="border border-gray-300 px-3 py-2">{d.shift}</td>
                            <td className="border border-gray-300 px-3 py-2">{d.supervisor}</td>
                            <td className={`border border-gray-300 px-3 py-2 text-right font-semibold ${
                              d.overShortTotal > 0 ? 'text-green-600 print:text-green-900' : 'text-red-600 print:text-red-900'
                            }`}>
                              {d.overShortTotal >= 0 ? '+' : ''}{formatCurrency(d.overShortTotal)}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-center">
                              {d.overShortExplained ? (
                                <span className="text-green-600 font-semibold print:text-green-900">✓</span>
                              ) : (
                                <span className="text-red-600 font-semibold print:text-red-900">✗</span>
                              )}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-sm print:text-xs">
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

            {/* Supervisor Performance */}
            {data.supervisorPerformance.length > 0 && (
              <div className="page-break-before">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 print:text-xl">Supervisor Performance</h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm print:text-xs">
                    <thead>
                      <tr className="bg-gray-100 print:bg-gray-100">
                        <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Supervisor</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Shifts</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Total Revenue</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Avg Revenue</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Avg Over/Short</th>
                        <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Discrepancies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.supervisorPerformance.map((sup, index) => (
                        <tr key={index} className="hover:bg-gray-50 print:hover:bg-transparent">
                          <td className="border border-gray-300 px-3 py-2 font-medium">{sup.name}</td>
                          <td className="border border-gray-300 px-3 py-2 text-right">{sup.shifts}</td>
                          <td className="border border-gray-300 px-3 py-2 text-right font-semibold">${formatCurrency(sup.totalRevenue)}</td>
                          <td className="border border-gray-300 px-3 py-2 text-right">${formatCurrency(sup.averageRevenue)}</td>
                          <td className={`border border-gray-300 px-3 py-2 text-right ${
                            sup.averageOverShort > 0 ? 'text-green-600 print:text-green-900' : 
                            sup.averageOverShort < 0 ? 'text-red-600 print:text-red-900' : 'text-gray-600'
                          }`}>
                            {sup.averageOverShort >= 0 ? '+' : ''}{formatCurrency(sup.averageOverShort)}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-right">{sup.shiftsWithDiscrepancy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.4in;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body {
            margin: 0;
            padding: 0;
          }

          .print-backdrop {
            position: static !important;
            inset: auto !important;
            background: transparent !important;
            padding: 0 !important;
            display: block !important;
          }

          .print-modal {
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .page-break-before {
            page-break-before: always;
            break-before: page;
          }

          .page-break-after {
            page-break-after: always;
            break-after: page;
          }

          .page-break-inside-avoid {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          table {
            page-break-inside: auto;
            border-collapse: collapse;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
            break-inside: avoid;
          }

          thead {
            display: table-header-group;
          }

          tfoot {
            display: table-footer-group;
          }

          td,
          th {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  )
}

