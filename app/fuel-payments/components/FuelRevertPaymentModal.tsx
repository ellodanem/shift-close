'use client'

import { useState } from 'react'

export function FuelRevertPaymentModal({
  open,
  onClose,
  onSuccess
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [bankRef, setBankRef] = useState('')
  const [processing, setProcessing] = useState(false)

  const handleRevert = async () => {
    if (!bankRef.trim()) {
      alert('Please enter a bank reference number')
      return
    }

    const confirmed = window.confirm(
      `Revert payment with bank reference "${bankRef.trim()}"?\n\nThis will move all invoices from this payment back to pending status.`
    )
    if (!confirmed) return

    setProcessing(true)
    try {
      const res = await fetch('/api/fuel-payments/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankRef: bankRef.trim() })
      })
      if (res.ok) {
        const data = await res.json()
        alert(
          `Successfully reverted ${data.revertedInvoiceIds?.length || 0} invoice(s) back to pending.`
        )
        onSuccess()
        onClose()
        setBankRef('')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to revert payment')
      }
    } catch (error) {
      console.error('Error reverting payment:', error)
      alert('Failed to revert payment')
    } finally {
      setProcessing(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fuel-revert-payment-title"
        className="my-4 w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl sm:p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 id="fuel-revert-payment-title" className="text-xl font-bold text-gray-900 sm:text-2xl">
            Revert payment by bank ref
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Enter a bank reference number to move invoices back to pending.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Bank reference number
          </label>
          <input
            type="text"
            value={bankRef}
            onChange={(e) => setBankRef(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g., 18921926"
            className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
          />
          <p className="mt-2 text-xs text-gray-500">
            All invoices from the most recent payment batch with this reference will be reverted.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={() => void handleRevert()}
            disabled={processing || !bankRef.trim()}
            className="min-h-[44px] rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50 sm:min-h-0"
          >
            {processing ? 'Reverting...' : 'Revert payment'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="min-h-[44px] rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50 sm:min-h-0"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
