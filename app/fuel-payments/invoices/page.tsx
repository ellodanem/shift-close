'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatInvoiceDate, getDueDateStatus } from '@/lib/invoiceHelpers'
import { formatAmount } from '@/lib/fuelPayments'

interface Invoice {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  status: 'pending' | 'simulated' | 'paid'
  notes: string | null
  paidInvoice?: {
    batch: {
      paymentDate: string
      bankRef: string
    }
  }
}

type TabType = 'pending' | 'paid'

// Helper function to get icon for invoice type
const getInvoiceTypeIcon = (type: string): string => {
  switch (type) {
    case 'Fuel':
      return '⛽'
    case 'LPG':
      return '🔥'
    case 'Lubricants':
      return '🛢️'
    case 'Rent':
      return '🏢'
    default:
      return '📄'
  }
}

export default function InvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  
  // Balance modal state
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balance, setBalance] = useState<{ availableFunds: number; balanceAfter: number; planned: number } | null>(null)
  const [balanceFormData, setBalanceFormData] = useState({
    currentBalance: '',
    availableFunds: ''
  })
  const [savingBalance, setSavingBalance] = useState(false)

  useEffect(() => {
    fetchInvoices()
  }, [activeTab])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const status = activeTab === 'paid' ? 'paid' : 'pending'
      const res = await fetch(`/api/fuel-payments/invoices?status=${status}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data)
      } else {
        console.error('Failed to fetch invoices')
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch counts for both tabs
  const [pendingCount, setPendingCount] = useState(0)
  const [paidCount, setPaidCount] = useState(0)
  const [simulatedCount, setSimulatedCount] = useState(0)
  const [showFixAlert, setShowFixAlert] = useState(false)
  const [copyNotification, setCopyNotification] = useState<string | null>(null)

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [pendingRes, paidRes, simulatedRes] = await Promise.all([
          fetch('/api/fuel-payments/invoices?status=pending'),
          fetch('/api/fuel-payments/invoices?status=paid'),
          fetch('/api/fuel-payments/invoices?status=simulated')
        ])
        if (pendingRes.ok) {
          const pendingData = await pendingRes.json()
          setPendingCount(pendingData.length)
        }
        if (paidRes.ok) {
          const paidData = await paidRes.json()
          setPaidCount(paidData.length)
        }
        if (simulatedRes.ok) {
          const simulatedData = await simulatedRes.json()
          setSimulatedCount(simulatedData.length)
          if (simulatedData.length > 0) {
            setShowFixAlert(true)
          }
        }
      } catch (error) {
        console.error('Error fetching counts:', error)
      }
    }
    fetchCounts()
    fetchBalance()
  }, [])

  // Auto-hide "Reference copied" notification
  useEffect(() => {
    if (!copyNotification) return
    const timer = setTimeout(() => setCopyNotification(null), 2000)
    return () => clearTimeout(timer)
  }, [copyNotification])

  // Clear selection when switching tabs
  useEffect(() => {
    setSelectedInvoiceIds(new Set())
  }, [activeTab])

  const fetchBalance = async () => {
    try {
      const res = await fetch('/api/fuel-payments/balance')
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
        setBalanceFormData({
          currentBalance: data.currentBalance.toString(),
          availableFunds: data.availableFunds.toString()
        })
      }
    } catch (error) {
      console.error('Error fetching balance:', error)
    }
  }

  const handleSaveBalance = async () => {
    setSavingBalance(true)
    try {
      const res = await fetch('/api/fuel-payments/balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentBalance: parseFloat(balanceFormData.currentBalance) || 0,
          availableFunds: parseFloat(balanceFormData.availableFunds) || 0
        })
      })

      if (res.ok) {
        const data = await res.json()
        setBalance(data)
        setShowBalanceModal(false)
        alert('Balance updated successfully!')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to update balance')
      }
    } catch (error) {
      console.error('Error updating balance:', error)
      alert('Failed to update balance')
    } finally {
      setSavingBalance(false)
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
    if (selectedInvoiceIds.size === invoices.length) {
      setSelectedInvoiceIds(new Set())
    } else {
      setSelectedInvoiceIds(new Set(invoices.map(inv => inv.id)))
    }
  }

  const handleSimulateSelected = () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    // Navigate to simulate page with selected invoice IDs
    const ids = Array.from(selectedInvoiceIds).join(',')
    router.push(`/fuel-payments/simulate?selected=${ids}`)
  }

  const handleMakePaymentSelected = () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    // Navigate to make-payment page with selected invoice IDs
    const ids = Array.from(selectedInvoiceIds).join(',')
    router.push(`/fuel-payments/make-payment?selected=${ids}`)
  }

  const selectedTotal = invoices
    .filter(inv => selectedInvoiceIds.has(inv.id))
    .reduce((sum, inv) => sum + inv.amount, 0)

  // Filtered invoices for display (search applies only to Paid tab)
  const filteredInvoices =
    activeTab === 'paid' && searchQuery.trim()
      ? invoices.filter(inv => {
          const query = searchQuery.trim().toLowerCase()
          const invoiceNumberMatch = inv.invoiceNumber.toLowerCase().includes(query)
          const bankRef = inv.paidInvoice?.batch.bankRef ?? ''
          const bankRefMatch = bankRef.toLowerCase().includes(query)
          return invoiceNumberMatch || bankRefMatch
        })
      : invoices

  const handleFixSimulatedInvoices = async () => {
    const confirmed = window.confirm(
      `Found ${simulatedCount} invoice(s) stuck in 'simulated' status from before the bug fix.\n\nWould you like to restore them to 'pending' status?`
    )
    if (!confirmed) return

    try {
      const res = await fetch('/api/fuel-payments/fix-simulated-invoices', {
        method: 'POST'
      })

      if (res.ok) {
        const data = await res.json()
        alert(`Successfully restored ${data.fixed} invoice(s) to pending status!`)
        setShowFixAlert(false)
        setSimulatedCount(0)
        // Refresh the page
        fetchInvoices()
        const [pendingRes, paidRes] = await Promise.all([
          fetch('/api/fuel-payments/invoices?status=pending'),
          fetch('/api/fuel-payments/invoices?status=paid')
        ])
        if (pendingRes.ok) {
          const pendingData = await pendingRes.json()
          setPendingCount(pendingData.length)
        }
        if (paidRes.ok) {
          const paidData = await paidRes.json()
          setPaidCount(paidData.length)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to fix simulated invoices')
      }
    } catch (error) {
      console.error('Error fixing simulated invoices:', error)
      alert('Failed to fix simulated invoices')
    }
  }

  const handleDelete = async (id: string, invoiceNumber: string) => {
    const confirmed = window.confirm(
      `Delete invoice "${invoiceNumber}"?\n\nThis cannot be undone.`
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/api/fuel-payments/invoices/${id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        fetchInvoices()
        // Refresh counts
        const [pendingRes, paidRes] = await Promise.all([
          fetch('/api/fuel-payments/invoices?status=pending'),
          fetch('/api/fuel-payments/invoices?status=paid')
        ])
        if (pendingRes.ok) {
          const pendingData = await pendingRes.json()
          setPendingCount(pendingData.length)
        }
        if (paidRes.ok) {
          const paidData = await paidRes.json()
          setPaidCount(paidData.length)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to delete invoice')
      }
    } catch (error) {
      console.error('Error deleting invoice:', error)
      alert('Failed to delete invoice')
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
            <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage pending and paid invoices
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
              title="Dashboard"
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => router.push('/fuel-payments/monthly-report')}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
              title="Monthly Payment Report"
            >
              📄 Reports
            </button>
            <button
              onClick={() => setShowBalanceModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
              title="Quick Balance Entry"
            >
              💵 Balance
            </button>
            <button
              onClick={() => router.push('/fuel-payments/batches')}
              className="px-4 py-2 bg-slate-600 text-white rounded font-semibold hover:bg-slate-700"
              title="Payment Batches"
            >
              Batches
            </button>
            {activeTab === 'pending' && (
              <button
                onClick={() => router.push('/fuel-payments/invoices/new')}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                + Add Invoice
              </button>
            )}
            {activeTab === 'paid' && (
              <button
                onClick={() => router.push('/fuel-payments/revert')}
                className="px-4 py-2 bg-orange-600 text-white rounded font-semibold hover:bg-orange-700"
              >
                ↩️ Revert Payment
              </button>
            )}
          </div>
        </div>

        {/* Alert for stuck simulated invoices */}
        {showFixAlert && simulatedCount > 0 && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-yellow-900">
                  ⚠️ Found {simulatedCount} invoice(s) stuck in 'simulated' status
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  These invoices were simulated before the bug fix and need to be restored to 'pending' status.
                </p>
              </div>
              <button
                onClick={handleFixSimulatedInvoices}
                className="px-4 py-2 bg-yellow-600 text-white rounded font-semibold hover:bg-yellow-700 text-sm"
              >
                Fix Now
              </button>
            </div>
          </div>
        )}

        {/* At-a-glance balance summary */}
        {balance && (
          <div className="mb-4 inline-flex flex-wrap items-baseline gap-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
            <span className="font-semibold">Available:</span>
            <span>{formatAmount(balance.availableFunds)}</span>
            <span className="text-gray-400">|</span>
            <span className="font-semibold">Planned:</span>
            <span>{formatAmount(balance.planned)}</span>
            <span className="text-gray-400">|</span>
            <span className="font-semibold">After:</span>
            <span
              className={
                balance.balanceAfter >= 0
                  ? 'text-green-600 font-semibold'
                  : 'text-red-600 font-semibold'
              }
            >
              {formatAmount(balance.balanceAfter)}
            </span>
          </div>
        )}

        {/* Tabs + Paid search */}
        <div className="mb-6 flex flex-col gap-3 border-b border-gray-200 pb-3 md:flex-row md:items-end md:justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setActiveTab('pending')
                setSearchQuery('')
              }}
              className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 ${
                activeTab === 'pending'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Pending Invoices ({pendingCount})
            </button>
            <button
              onClick={() => setActiveTab('paid')}
              className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 ${
                activeTab === 'paid'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Paid Invoices ({paidCount})
            </button>
          </div>

          {activeTab === 'paid' && (
            <div className="w-full md:w-64">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Search paid invoices
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Invoice # or Ref #"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Contextual Action Bar - appears when invoices are selected on Pending tab */}
        {activeTab === 'pending' && selectedInvoiceIds.size > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  {selectedInvoiceIds.size} invoice{selectedInvoiceIds.size !== 1 ? 's' : ''} selected
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Total: {formatAmount(selectedTotal)}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSimulateSelected}
                  className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 text-sm"
                >
                  🔍 Simulate Selected
                </button>
                <button
                  onClick={handleMakePaymentSelected}
                  className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 text-sm"
                >
                  💰 Mark Selected as Paid
                </button>
                <button
                  onClick={() => setSelectedInvoiceIds(new Set())}
                  className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600 text-sm"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Invoices Table */}
        {invoices.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">
              No {activeTab === 'paid' ? 'paid' : 'pending'} invoices found
            </p>
            {activeTab === 'pending' && (
              <button
                onClick={() => router.push('/fuel-payments/invoices/new')}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Add First Invoice
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {activeTab === 'paid' && searchQuery.trim() && filteredInvoices.length === 0 ? (
              <div className="p-6 text-sm text-gray-600">
                No paid invoices match "<span className="font-mono">{searchQuery}</span>".
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {activeTab === 'pending' && (
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.size === invoices.length && invoices.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  {activeTab === 'pending' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  {activeTab === 'paid' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Info
                    </th>
                  )}
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInvoices.map((invoice) => {
                  const dueStatus = getDueDateStatus(invoice.dueDate)
                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      {activeTab === 'pending' && (
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedInvoiceIds.has(invoice.id)}
                            onChange={() => handleToggleInvoice(invoice.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatInvoiceDate(invoice.invoiceDate)}
                      </td>
                      {activeTab === 'pending' && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold border ${dueStatus.className}`}
                          >
                            {formatInvoiceDate(invoice.dueDate)}
                            {dueStatus.status === 'overdue' && ` (${dueStatus.daysUntil}d overdue)`}
                            {dueStatus.status === 'due' && ' (Due today)'}
                            {dueStatus.status === 'warning' && ' (Due tomorrow)'}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {formatAmount(invoice.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        <span className="flex items-center gap-1.5">
                          <span className="text-base">{getInvoiceTypeIcon(invoice.type)}</span>
                          <span>{invoice.type}</span>
                        </span>
                      </td>
                      {activeTab === 'paid' && invoice.paidInvoice && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          <div>
                            <div>{formatInvoiceDate(invoice.paidInvoice.batch.paymentDate)}</div>
                            <div className="text-xs text-gray-500 font-mono">
                              Ref: {invoice.paidInvoice.batch.bankRef}
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          {activeTab === 'pending' && invoice.status === 'pending' && (
                            <>
                              <button
                                onClick={() => router.push(`/fuel-payments/invoices/${invoice.id}/edit`)}
                                className="text-indigo-600 hover:text-indigo-900 p-1 rounded transition-colors"
                                title="Edit"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDelete(invoice.id, invoice.invoiceNumber)}
                                className="text-red-600 hover:text-red-900 p-1 rounded transition-colors"
                                title="Delete"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </>
                          )}
                          {activeTab === 'paid' && invoice.paidInvoice && (
                            <button
                              onClick={(e) => {
                                navigator.clipboard.writeText(invoice.paidInvoice!.batch.bankRef)
                                setCopyNotification('Reference copied')
                              }}
                              className="text-blue-600 hover:text-blue-900 p-1 rounded transition-colors"
                              title="Copy Reference Number"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            )}
          </div>
        )}

        {/* Balance Modal */}
        {showBalanceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Quick Balance Entry</h2>
                <button
                  onClick={() => setShowBalanceModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={balanceFormData.currentBalance}
                    onChange={(e) => setBalanceFormData({ ...balanceFormData, currentBalance: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Available Funds
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={balanceFormData.availableFunds}
                    onChange={(e) => setBalanceFormData({ ...balanceFormData, availableFunds: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {balance && (
                  <div className="bg-gray-50 rounded p-3 space-y-1">
                    <div className="text-sm">
                      <span className="text-gray-600">Planned: </span>
                      <span className="font-semibold text-blue-600">{formatAmount(balance.planned)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600">Balance After: </span>
                      <span className={`font-semibold ${balance.balanceAfter >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatAmount(balance.balanceAfter)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleSaveBalance}
                  disabled={savingBalance}
                  className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingBalance ? 'Saving...' : 'Save Balance'}
                </button>
                <button
                  onClick={() => setShowBalanceModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Copy notification */}
        {copyNotification && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className="bg-gray-900 text-white text-sm px-4 py-2 rounded shadow-lg">
              {copyNotification}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

