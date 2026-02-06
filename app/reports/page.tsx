'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

export default function ReportsPage() {
  const router = useRouter()
  const [showReportsDropdown, setShowReportsDropdown] = useState(false)
  const reportsDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reportsDropdownRef.current && !reportsDropdownRef.current.contains(event.target as Node)) {
        setShowReportsDropdown(false)
      }
    }
    if (showReportsDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReportsDropdown])

  const reports = [
    {
      id: 'weekly',
      title: 'Weekly Reports',
      description: 'Aggregate all days in a week with totals and summaries',
      icon: '📅',
      comingSoon: true
    },
    {
      id: 'monthly',
      title: 'Monthly Reports',
      description: 'Comprehensive monthly revenue, operational metrics, and daily breakdowns',
      icon: '📆',
      comingSoon: false,
      route: '/reports/monthly'
    },
    {
      id: 'financial',
      title: 'Financial Reports',
      description: 'Expenses, payables, receivables, cash flow, and profit & loss',
      icon: '💰',
      comingSoon: false,
      route: '/reports/financial'
    },
    {
      id: 'supervisor',
      title: 'Supervisor Reports',
      description: 'Performance and statistics by supervisor',
      icon: '👤',
      comingSoon: true
    },
    {
      id: 'over-short-trend',
      title: 'Over/Short Trend Reports',
      description: 'Track discrepancies and over/short patterns over time',
      icon: '📈',
      comingSoon: true
    },
    {
      id: 'daily-financial-summary',
      title: 'Daily Financial Summary',
      description: 'Daily revenue, deposits, credit, debit, and fuel totals',
      icon: '📊',
      comingSoon: false,
      route: '/reports/daily-financial-summary'
    },
    {
      id: 'deposit',
      title: 'Deposit Reports',
      description: 'Deposit patterns, totals, and analysis',
      icon: '💰',
      comingSoon: true
    },
    {
      id: 'exception',
      title: 'Exception Reports',
      description: 'Red flags, incomplete days, and missing data alerts',
      icon: '🚨',
      comingSoon: true
    },
    {
      id: 'day',
      title: 'Day Reports',
      description: 'Aggregated daily reports with completeness validation',
      icon: '📊',
      comingSoon: false,
      route: '/days'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Reports Center</h1>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/settings')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
              title="Settings"
            >
              ⚙️
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push('/days')}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
            >
              Day Reports
            </button>
            <button
              onClick={() => router.push('/shifts')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold"
            >
              Back to Shifts
            </button>
            <button
              onClick={() => router.push('/staff')}
              className="px-4 py-2 bg-purple-600 text-white rounded font-semibold hover:bg-purple-700"
            >
              Staff
            </button>
            <button
              onClick={() => router.push('/fuel-payments')}
              className="px-4 py-2 bg-orange-600 text-white rounded font-semibold hover:bg-orange-700"
            >
              Fuel Payments
            </button>
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
                    onClick={() => setShowReportsDropdown(false)}
                    className="w-full text-left px-4 py-2 text-sm bg-gray-100 text-gray-800 font-medium rounded-t-lg"
                  >
                    Reports Center
                  </button>
                  <button
                    onClick={() => {
                      router.push('/customer-accounts')
                      setShowReportsDropdown(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-b-lg"
                  >
                    Customer Accounts
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => (
            <div
              key={report.id}
              onClick={() => {
                if (!report.comingSoon && report.route) {
                  router.push(report.route)
                }
              }}
              className={`bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6 cursor-pointer transition-all ${
                report.comingSoon
                  ? 'opacity-75 hover:border-gray-300'
                  : 'hover:border-blue-400 hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="text-4xl">{report.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{report.title}</h3>
                    {report.comingSoon && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{report.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

