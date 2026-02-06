'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RevertPaymentPage() {
  const router = useRouter()
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
        body: JSON.stringify({
          bankRef: bankRef.trim()
        })
      })

      if (res.ok) {
        const data = await res.json()
        alert(`Successfully reverted ${data.revertedInvoiceIds?.length || 0} invoice(s) back to pending.`)
        router.push('/fuel-payments/invoices')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to revert payment')
        setProcessing(false)
      }
    } catch (error) {
      console.error('Error reverting payment:', error)
      alert('Failed to revert payment')
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Revert Payment by Bank Ref</h1>
            <p className="text-sm text-gray-600 mt-1">
              Enter a bank reference number to revert invoices back to pending status
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

        {/* Revert Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bank Reference Number
              </label>
              <input
                type="text"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g., 18921926"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="mt-2 text-xs text-gray-500">
                Enter the bank reference number of the payment you want to revert.
                All invoices from that payment will be moved back to pending status.
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={handleRevert}
                disabled={processing || !bankRef.trim()}
                className="px-6 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {processing ? 'Reverting...' : 'Revert Payment'}
              </button>
              <button
                onClick={() => router.back()}
                className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

