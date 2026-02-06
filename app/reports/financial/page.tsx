'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function FinancialReportPage() {
  const router = useRouter()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Financial Report</h1>
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
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              Dashboard
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
          </div>
        </div>

        {/* Placeholder Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">💰</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Financial Report</h2>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              This report will track expenses, payables, receivables, cash flow, and profit & loss statements.
              The Financial module is currently under development.
            </p>

            {/* Placeholder Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 text-left">
              {/* Expenses */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Expenses</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Fuel payments
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Utilities
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Supplies & maintenance
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Other operational expenses
                  </li>
                </ul>
              </div>

              {/* Payables */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Payables</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Outstanding bills tracking
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Due dates & payment status
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Payment history
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Vendor management
                  </li>
                </ul>
              </div>

              {/* Receivables */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Receivables</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Money owed to business
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Payment tracking
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Aging reports
                  </li>
                </ul>
              </div>

              {/* Cash Flow & P&L */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Cash Flow & P&L</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Cash flow statement
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Profit & Loss summary
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Net profit/loss calculation
                  </li>
                  <li className="flex items-center">
                    <span className="text-gray-400 mr-2">•</span>
                    Financial health indicators
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Coming Soon:</strong> This module will integrate with the Monthly Report to provide a complete financial picture, 
                including net profit/loss and cash flow analysis.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

