'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GroupedReport } from '@/lib/fuelPayments'
import { padInvoiceNumber, formatAmount, formatDate } from '@/lib/fuelPayments'

export default function MonthlyFuelPaymentReportPage() {
  const router = useRouter()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  
  // Default to current month (YYYY-MM format)
  const getDefaultMonth = () => {
    return `${currentYear}-${String(currentMonth).padStart(2, '0')}`
  }

  const [month, setMonth] = useState(getDefaultMonth())
  const [data, setData] = useState<GroupedReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [month])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/fuel-payments/monthly?month=${month}`)
      if (!res.ok) {
        throw new Error('Failed to fetch data')
      }
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching monthly fuel payment report:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 no-print">
          <h1 className="text-3xl font-bold text-gray-900">Monthly Fuel Payment Report</h1>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => router.push('/fuel-payments/invoices')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              ← Invoices
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Print
            </button>
          </div>
        </div>

        {/* Month Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 no-print">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  const now = new Date()
                  setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Current Month
              </button>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {data.warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Warnings</h3>
            <ul className="list-disc list-inside text-sm text-yellow-700">
              {data.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Report Content - Monospace */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 print:p-4 print-content">
          {/* Title */}
          <div className="text-center mb-8 print:mb-6">
            <h2 className="text-2xl font-bold print:text-xl">
              Monthly Fuel Payment Report – {data.monthName}
            </h2>
          </div>

          {/* Report Body */}
          {data.byDate.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No payments found for {data.monthName}</p>
            </div>
          ) : (
            <div className="font-mono text-sm print:text-xs">
              {data.byDate.map((dateGroup, dateIndex) => (
                <div key={dateIndex} className="mb-6 print:mb-4">
                  {/* Date Header */}
                  <div className="font-bold mb-2 print:mb-1">
                    {dateGroup.dateFormatted}
                  </div>

                  {/* Blocks for this date */}
                  {dateGroup.blocks.map((block, blockIndex) => (
                    <div key={blockIndex} className="mb-4 print:mb-3">
                      {/* Invoice Lines */}
                      {block.invoices.map((invoice, invIndex) => (
                        <div key={invIndex} className="mb-1">
                          <span className="inline-block w-16 text-left">
                            {padInvoiceNumber(invoice.invoiceNumber)}
                          </span>
                          <span className="inline-block w-24 text-right ml-4">
                            {formatAmount(invoice.amount)}
                          </span>
                          <span className="ml-4">{invoice.type}</span>
                        </div>
                      ))}

                      {/* Underline */}
                      <div className="mb-1">------------------------</div>

                      {/* Subtotal */}
                      <div className="mb-1">
                        <span className="inline-block w-16"></span>
                        <span className="inline-block w-24 text-right ml-4 font-semibold">
                          {formatAmount(block.subtotal)}
                        </span>
                      </div>

                      {/* Ref Line */}
                      <div className="mb-2 print:mb-1">
                        Ref {block.bankRef}
                      </div>

                      {/* Blank line between blocks */}
                      {blockIndex < dateGroup.blocks.length - 1 && (
                        <div className="mb-2"></div>
                      )}
                    </div>
                  ))}

                  {/* Blank line between dates */}
                  {dateIndex < data.byDate.length - 1 && (
                    <div className="mb-4"></div>
                  )}
                </div>
              ))}

              {/* Final Total */}
              <div className="mt-8 print:mt-6 pt-4 border-t-2 border-gray-400">
                <div className="text-lg font-bold print:text-base">
                  TOTAL PAID ({data.monthName}) : {formatAmount(data.grandTotal)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }
          
          .no-print {
            display: none !important;
          }
          
          .print-content {
            font-family: 'Courier New', monospace;
          }
        }
      `}</style>
    </div>
  )
}

