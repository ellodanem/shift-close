'use client'

import { useState } from 'react'

export function VendorRevertPaymentModal({
  open,
  vendorId,
  onClose,
  onSuccess
}: {
  open: boolean
  vendorId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [bankRef, setBankRef] = useState('')
  const [processing, setProcessing] = useState(false)

  const handleRevert = async () => {
    if (!bankRef.trim()) {
      alert('Please enter a bank reference or check number')
      return
    }

    const confirmed = window.confirm(
      `Revert vendor payment with reference "${bankRef.trim()}"?\n\nThis will move all invoices from that payment back to pending status.`
    )
    if (!confirmed) return

    setProcessing(true)
    try {
      const res = await fetch('/api/vendor-payments/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, bankRef: bankRef.trim() })
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
      console.error('Error reverting vendor payment:', error)
      alert('Failed to revert payment')
    } finally {
      setProcessing(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vendor-revert-payment-title"
        className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 id="vendor-revert-payment-title" className="text-2xl font-bold text-gray-900">
            Revert payment by reference
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Enter a bank reference/check number to move that vendor payment back to pending.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Bank reference / check number
          </label>
          <input
            type="text"
            value={bankRef}
            onChange={(e) => setBankRef(e.target.value)}
            placeholder="e.g., 18921926"
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleRevert}
            disabled={processing || !bankRef.trim()}
            className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {processing ? 'Reverting...' : 'Revert payment'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
