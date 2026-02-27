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
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState<{ id: string; label: string; email: string }[]>([])
  const [emailToId, setEmailToId] = useState('')
  const [emailOther, setEmailOther] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailing, setEmailing] = useState(false)

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

  const openEmailModal = () => {
    const [year, monthNum] = month.split('-').map(Number)
    const monthName = new Date(year, monthNum - 1, 1).toLocaleString('default', {
      month: 'long',
      year: 'numeric'
    })
    setEmailSubject(`Monthly Fuel Payment Report – ${monthName}`)
    setEmailBody(`Please find the Monthly Fuel Payment Report for ${monthName} attached.`)
    setEmailToId('')
    setEmailOther('')
    fetch('/api/email-recipients')
      .then((res) => res.json())
      .then((data) => {
        const raw = Array.isArray(data) ? data : []
        const list = raw.map((r: { id: string; label?: string; email?: string }) => ({
          id: String(r.id),
          label: r.label ?? '',
          email: r.email ?? ''
        }))
        setEmailRecipients(list)
        if (list.length > 0) setEmailToId(list[0].id)
        else setEmailToId('other')
      })
      .catch(() => {
        setEmailRecipients([])
        setEmailToId('other')
      })
    setShowEmailModal(true)
  }

  const sendEmailReport = async () => {
    const to = emailOther.trim() || (emailToId && emailToId !== 'other' ? emailRecipients.find((r) => r.id === emailToId)?.email?.trim() : '') || ''
    if (!to) {
      alert('Choose a recipient from the list or enter an email address below.')
      return
    }
    setEmailing(true)
    try {
      const res = await fetch('/api/fuel-payments/monthly/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, to, subject: emailSubject, body: emailBody })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to send email')
      setShowEmailModal(false)
      alert(result.message || 'Report emailed successfully.')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setEmailing(false)
    }
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
              onClick={() => router.push('/fuel-payments')}
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
            <button
              onClick={openEmailModal}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              Email Report
            </button>
            <button
              disabled
              title="Coming soon – share PDF via WhatsApp"
              className="px-4 py-2 bg-slate-300 text-slate-500 rounded font-semibold cursor-not-allowed"
            >
              WhatsApp (PDF)
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

      {/* Email modal: select recipient, review message, then send */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Monthly Report</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send to</label>
                <select
                  value={emailToId}
                  onChange={(e) => setEmailToId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  <option value="">Choose a recipient…</option>
                  {emailRecipients.map((r) => (
                    <option key={r.id} value={r.id}>{r.label} ({r.email})</option>
                  ))}
                  <option value="other">Other (enter below)</option>
                </select>
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Or enter another email address</label>
                  <input
                    type="email"
                    placeholder="e.g. someone@example.com"
                    value={emailOther}
                    onChange={(e) => setEmailOther(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendEmailReport}
                disabled={emailing || !(emailOther.trim() || (emailToId && emailToId !== 'other' && emailRecipients.some((r) => r.id === emailToId)))}
                className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {emailing ? 'Sending…' : 'Send email'}
              </button>
            </div>
          </div>
        </div>
      )}

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

