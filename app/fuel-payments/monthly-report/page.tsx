'use client'

import { useEffect, useState } from 'react'
import { GroupedReport } from '@/lib/fuelPayments'
import { padInvoiceNumber, formatAmount, formatDate } from '@/lib/fuelPayments'

export default function MonthlyFuelPaymentReportPage() {
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">No data available</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between no-print">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Monthly Fuel Payment Report
          </h1>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button
              onClick={handlePrint}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              Print
            </button>
            <button
              onClick={openEmailModal}
              className="min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 sm:min-h-0"
            >
              Email Report
            </button>
            <button
              disabled
              title="Coming soon – share PDF via WhatsApp"
              className="min-h-[44px] cursor-not-allowed rounded bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-500 sm:min-h-0"
            >
              WhatsApp (PDF)
            </button>
          </div>
        </div>

        {/* Month Selector */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm no-print">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="min-h-[44px] rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
              />
            </div>
            <button
              onClick={() => {
                const now = new Date()
                setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
              }}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              Current Month
            </button>
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
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm print:p-4 print-content sm:p-8">
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
                        <div
                          key={invIndex}
                          className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:block"
                        >
                          <span className="font-mono sm:inline-block sm:w-16 sm:text-left">
                            {padInvoiceNumber(invoice.invoiceNumber)}
                          </span>
                          <span className="font-mono sm:ml-4 sm:inline-block sm:w-24 sm:text-right">
                            {formatAmount(invoice.amount)}
                          </span>
                          <span className="sm:ml-4">{invoice.type}</span>
                        </div>
                      ))}

                      {/* Underline */}
                      <div className="mb-1">------------------------</div>

                      {/* Subtotal */}
                      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 sm:block">
                        <span className="hidden sm:inline-block sm:w-16" />
                        <span className="font-mono font-semibold sm:ml-4 sm:inline-block sm:w-24 sm:text-right">
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
          <div className="my-4 w-full max-h-[90vh] max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Email Monthly Report</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Send to</label>
                <select
                  value={emailToId}
                  onChange={(e) => setEmailToId(e.target.value)}
                  className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 sm:min-h-0"
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
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 sm:min-h-0"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 sm:min-h-0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="min-h-[44px] rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 sm:min-h-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendEmailReport}
                disabled={emailing || !(emailOther.trim() || (emailToId && emailToId !== 'other' && emailRecipients.some((r) => r.id === emailToId)))}
                className="min-h-[44px] rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0"
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

