'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatInvoiceDate, getDueDateStatus } from '@/lib/invoiceHelpers'
import { formatAmount } from '@/lib/fuelPayments'
import html2canvas from 'html2canvas'

interface Invoice {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  status: string
}

const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')

interface Simulation {
  id: string
  simulationDate: string
  transferDescription: string
  invoices: Invoice[]
  totalAmount: number
  invoiceNumbers: string[]
}

function SimulatePaymentPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [simulationDate, setSimulationDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [balance, setBalance] = useState<{ availableFunds: number; balanceAfter: number } | null>(null)
  const [otherUnpaidInvoices, setOtherUnpaidInvoices] = useState<Invoice[]>([])
  const imageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPendingInvoices()
    fetchBalance()
    
    // Check for pre-selected invoices from URL
    const selectedParam = searchParams.get('selected')
    if (selectedParam) {
      const ids = selectedParam.split(',').filter(id => id.trim())
      setSelectedInvoiceIds(new Set(ids))
    }
  }, [searchParams])

  useEffect(() => {
    if (simulation) {
      fetchOtherUnpaidInvoices()
      fetchBalance()
    }
  }, [simulation])

  const fetchPendingInvoices = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fuel-payments/invoices?status=pending')
      if (res.ok) {
        const data = await res.json()
        setPendingInvoices(data)
      } else {
        console.error('Failed to fetch invoices')
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoiceIds)
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId)
    } else {
      newSelected.add(invoiceId)
    }
    setSelectedInvoiceIds(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedInvoiceIds.size === pendingInvoices.length) {
      setSelectedInvoiceIds(new Set())
    } else {
      setSelectedInvoiceIds(new Set(pendingInvoices.map(inv => inv.id)))
    }
  }

  const handleSimulate = async () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }

    setSimulating(true)
    try {
      const res = await fetch('/api/fuel-payments/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulationDate,
          selectedInvoiceIds: Array.from(selectedInvoiceIds)
        })
      })

      if (res.ok) {
        const data = await res.json()
        setSimulation(data)
        // Refresh invoices to show updated status
        fetchPendingInvoices()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to simulate payment')
        setSimulating(false)
      }
    } catch (error) {
      console.error('Error simulating payment:', error)
      alert('Failed to simulate payment')
      setSimulating(false)
    }
  }

  const fetchBalance = async () => {
    try {
      const res = await fetch('/api/fuel-payments/balance')
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
      }
    } catch (error) {
      console.error('Error fetching balance:', error)
    }
  }

  const fetchOtherUnpaidInvoices = async () => {
    if (!simulation) return
    try {
      const res = await fetch('/api/fuel-payments/invoices?status=pending')
      if (res.ok) {
        const allPending = await res.json()
        // Filter out invoices that are in the simulation
        const simulationInvoiceIds = new Set(simulation.invoices.map(inv => inv.id))
        const other = allPending.filter((inv: Invoice) => !simulationInvoiceIds.has(inv.id))
        setOtherUnpaidInvoices(other)
      }
    } catch (error) {
      console.error('Error fetching other unpaid invoices:', error)
    }
  }

  const calculateDaysPastDue = (dueDate: string): number => {
    const due = new Date(dueDate)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    due.setHours(0, 0, 0, 0)
    const diffTime = now.getTime() - due.getTime()
    return Math.floor(diffTime / (1000 * 60 * 60 * 24))
  }

  const generateImage = async (): Promise<string> => {
    if (!imageRef.current || !simulation) {
      throw new Error('Cannot generate image')
    }

    const canvas = await html2canvas(imageRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false
    })
    return canvas.toDataURL('image/png')
  }

  const handleCopyTransferDescription = () => {
    if (simulation?.transferDescription) {
      navigator.clipboard.writeText(simulation.transferDescription)
      alert('Transfer description copied to clipboard!')
    }
  }

  const handleDownloadPNG = async () => {
    try {
      const dataUrl = await generateImage()
      const link = document.createElement('a')
      link.download = `proposed-payment-${formatInvoiceDate(simulation!.simulationDate).replace(/\//g, '-')}.png`
      link.href = dataUrl
      link.click()
    } catch (error) {
      console.error('Error generating PNG:', error)
      alert('Failed to generate PNG')
    }
  }

  const handleCopyPNG = async () => {
    try {
      const dataUrl = await generateImage()
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      alert('Image copied to clipboard!')
    } catch (error) {
      console.error('Error copying PNG:', error)
      alert('Failed to copy PNG to clipboard')
    }
  }

  const handleWhatsApp = async () => {
    try {
      const dataUrl = await generateImage()
      // Convert to blob for WhatsApp
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'proposed-payment.png', { type: 'image/png' })

      // 1) Prefer sharing the actual PNG via Web Share API on mobile (WhatsApp app)
      if (isMobileDevice() && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Proposed Payment'
        })
        return
      }

      // 2) Fallback for WhatsApp Web: copy PNG to clipboard, then open WhatsApp Web tab
      if (navigator.clipboard && 'write' in navigator.clipboard && (window as any).ClipboardItem) {
        try {
          const clipboardItem = new (window as any).ClipboardItem({ 'image/png': blob })
          await (navigator.clipboard as any).write([clipboardItem])
          // Open WhatsApp Web chat; user can paste directly
          window.open('https://web.whatsapp.com/send', '_blank')
          alert('Image copied to clipboard. Paste into WhatsApp Web (Ctrl+V).')
          return
        } catch (clipboardError) {
          console.error('Error copying PNG for WhatsApp Web:', clipboardError)
        }
      }

      // 3) Final fallback
      alert('Your browser cannot share images directly to WhatsApp. Please download or copy the PNG manually.')
    } catch (error) {
      console.error('Error sharing via WhatsApp:', error)
      alert('Failed to share via WhatsApp')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading invoices...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Simulate Payment</h1>
            <p className="text-sm text-gray-600 mt-1">
              Select invoices by ticking the <strong>Select</strong> checkboxes, then pick a date:
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => router.push('/fuel-payments/invoices')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              ← Back to Invoices
            </button>
          </div>
        </div>

        {/* Simulation Form */}
        {!simulation && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Simulated Payment Date
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="date"
                    value={simulationDate}
                    onChange={(e) => setSimulationDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSimulate}
                    disabled={simulating || selectedInvoiceIds.size === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {simulating ? 'Simulating...' : 'Simulate'}
                  </button>
                </div>
              </div>

              {/* Invoices Table */}
              {pendingInvoices.length === 0 ? (
                <p className="text-gray-600 text-center py-8">
                  No pending invoices available. <a href="/fuel-payments/invoices/new" className="text-blue-600 hover:underline">Add an invoice</a>
                </p>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Pending Invoices ({pendingInvoices.length})
                    </h3>
                    <button
                      onClick={handleSelectAll}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {selectedInvoiceIds.size === pendingInvoices.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={selectedInvoiceIds.size === pendingInvoices.length && pendingInvoices.length > 0}
                              onChange={handleSelectAll}
                              className="rounded border-gray-300"
                            />
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Invoice #
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Due Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {pendingInvoices.map((invoice) => {
                          const dueStatus = getDueDateStatus(invoice.dueDate)
                          return (
                            <tr key={invoice.id} className="hover:bg-gray-50">
                              <td className="px-4 py-4">
                                <input
                                  type="checkbox"
                                  checked={selectedInvoiceIds.has(invoice.id)}
                                  onChange={() => handleToggleInvoice(invoice.id)}
                                  className="rounded border-gray-300"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                                {invoice.invoiceNumber}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {formatInvoiceDate(invoice.invoiceDate)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 rounded text-xs font-semibold border ${dueStatus.className}`}>
                                  {formatInvoiceDate(invoice.dueDate)}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                {formatAmount(invoice.amount)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {invoice.type}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {selectedInvoiceIds.size > 0 && (
                    <div className="mt-4 p-4 bg-blue-50 rounded border border-blue-200">
                      <p className="text-sm text-blue-900">
                        <strong>{selectedInvoiceIds.size}</strong> invoice{selectedInvoiceIds.size !== 1 ? 's' : ''} selected
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Simulation Results */}
        {simulation && (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-900 font-semibold">Simulation complete.</p>
              <p className="text-sm text-green-800 mt-1">
                You can open the PDF, download/copy the PNG, and copy the transfer description.
              </p>
            </div>

            {/* Transfer Description */}
            <div className="bg-white rounded-lg shadow p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transfer Description
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={simulation.transferDescription}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono"
                />
                <button
                  onClick={handleCopyTransferDescription}
                  className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
                >
                  Copy Transfer Description
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Paste this into the bank transfer description. Format: Total Auto &lt;invoice numbers&gt;
              </p>
            </div>

            {/* PDF Preview Placeholder */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="mb-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Proposed Payment PDF</h3>
                <a
                  href={`/api/fuel-payments/simulate/${simulation.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Open Proposed Payment PDF
                </a>
              </div>
              <div className="border border-gray-300 rounded p-4 bg-gray-50 min-h-[400px] relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-gray-600 mb-2">PDF Preview</p>
                    <p className="text-sm text-gray-500">
                      Proposed Payment - {formatInvoiceDate(simulation.simulationDate)}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Total: {formatAmount(simulation.totalAmount)}
                    </p>
                    <p className="text-xs text-gray-400 mt-4">
                      (PDF generation will be implemented)
                    </p>
                  </div>
                </div>
                {/* DRAFT Watermark */}
                <div className="absolute bottom-10 right-10 transform -rotate-45 text-6xl font-bold text-orange-300 opacity-50">
                  DRAFT
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex gap-4">
                <button
                  onClick={handleDownloadPNG}
                  className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
                >
                  Download PNG
                </button>
                <button
                  onClick={handleCopyPNG}
                  className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
                >
                  Copy PNG
                </button>
                <button
                  onClick={handleWhatsApp}
                  className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
                >
                  WhatsApp Web
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden div for image generation - mirror Marked Paid PNG layout */}
        {simulation && (
          <div
            ref={imageRef}
            className="fixed -left-[9999px] top-0 w-[800px] bg-white p-8"
            style={{ 
              fontFamily: 'monospace, Courier, monospace',
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#000000'
            }}
          >
            {/* Proposed Payment Section */}
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '16px' }}
              >
                Proposed Payment - {formatInvoiceDate(simulation.simulationDate)}
              </div>

              {simulation.invoices.map((inv) => {
                const daysPastDue = calculateDaysPastDue(inv.dueDate)
                const dpdText = daysPastDue > 0 ? `${daysPastDue} dpd` : ''
                return (
                  <div key={inv.id} style={{ marginBottom: '4px' }}>
                    {/* Invoice # */}
                    <span
                      style={{
                        fontWeight: 'bold',
                        display: 'inline-block',
                        width: '70px'
                      }}
                    >
                      {inv.invoiceNumber}
                    </span>
                    {/* Amount */}
                    <span
                      style={{
                        display: 'inline-block',
                        width: '100px',
                        textAlign: 'right'
                      }}
                    >
                      {formatAmount(inv.amount)}
                    </span>
                    {/* Due date */}
                    <span
                      style={{
                        display: 'inline-block',
                        width: '140px',
                        marginLeft: '20px'
                      }}
                    >
                      {`Due ${formatInvoiceDate(inv.dueDate)}`}
                    </span>
                    {/* Type */}
                    <span
                      style={{
                        display: 'inline-block',
                        width: '80px',
                        marginLeft: '20px'
                      }}
                    >
                      {inv.type}
                    </span>
                    {/* dpd (only if overdue) */}
                    {dpdText && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: '80px',
                          marginLeft: '20px',
                          color: '#666'
                        }}
                      >
                        {dpdText}
                      </span>
                    )}
                  </div>
                )
              })}

              {/* Total aligned under amount column */}
              <div style={{ marginTop: '4px', marginBottom: '4px' }}>
                {/* Blank invoice column */}
                <span
                  style={{
                    display: 'inline-block',
                    width: '70px'
                  }}
                >
                  {/* intentionally blank */}
                </span>
                {/* Total amount column, matches invoice amount alignment */}
                <span
                  style={{
                    display: 'inline-block',
                    width: '100px',
                    textAlign: 'right',
                    fontWeight: 'bold'
                  }}
                >
                  {formatAmount(simulation.totalAmount)}
                </span>
                {/* Preserve spacing for Due / Type / dpd columns */}
                <span
                  style={{
                    display: 'inline-block',
                    width: '140px',
                    marginLeft: '20px'
                  }}
                >
                  {/* blank */}
                </span>
                <span
                  style={{
                    display: 'inline-block',
                    width: '80px',
                    marginLeft: '20px'
                  }}
                >
                  {/* blank */}
                </span>
                <span
                  style={{
                    display: 'inline-block',
                    width: '80px',
                    marginLeft: '20px'
                  }}
                >
                  {/* blank */}
                </span>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#666',
                  marginTop: '4px',
                  fontWeight: 'bold',
                  marginLeft: '190px'
                }}
              >
                planned {formatInvoiceDate(simulation.simulationDate)}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#666',
                  fontWeight: 'bold',
                  marginLeft: '190px'
                }}
              >
                Ref pending
              </div>
            </div>

            {/* Balance Information Section */}
            {balance && (
              <div className="mb-6">
                <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
                  Balance Information
                </div>
                <div>
                  Balance Before (Available): {formatAmount(balance.availableFunds)}
                </div>
                <div>
                  Balance After (Available - Planned): {formatAmount(balance.balanceAfter)}
                </div>
              </div>
            )}

            {/* Other Unpaid Invoices Section */}
            {otherUnpaidInvoices.length > 0 && (
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
                  Other Unpaid Invoices
                </div>
                {otherUnpaidInvoices.map((inv) => {
                  const daysPastDue = calculateDaysPastDue(inv.dueDate)
                  const dpdText = daysPastDue > 0 ? `${daysPastDue} dpd` : ''
                  return (
                    <div key={inv.id} style={{ marginBottom: '4px' }}>
                      {/* Invoice # */}
                      <span
                        style={{
                          fontWeight: 'bold',
                          display: 'inline-block',
                          width: '70px'
                        }}
                      >
                        {inv.invoiceNumber}
                      </span>
                      {/* Amount */}
                      <span
                        style={{
                          display: 'inline-block',
                          width: '100px',
                          textAlign: 'right'
                        }}
                      >
                        {formatAmount(inv.amount)}
                      </span>
                      {/* Due date */}
                      <span
                        style={{
                          display: 'inline-block',
                          width: '140px',
                          marginLeft: '20px'
                        }}
                      >
                        {`Due ${formatInvoiceDate(inv.dueDate)}`}
                      </span>
                      {/* Type */}
                      <span
                        style={{
                          display: 'inline-block',
                          width: '80px',
                          marginLeft: '20px'
                        }}
                      >
                        {inv.type}
                      </span>
                      {/* dpd (only if overdue) */}
                      {dpdText && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: '80px',
                            marginLeft: '20px',
                            color: '#666'
                          }}
                        >
                          {dpdText}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SimulatePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <SimulatePaymentPageInner />
    </Suspense>
  )
}

