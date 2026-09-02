'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { invoiceDateToInputValue } from '@/lib/invoiceHelpers'

interface PaymentBatch {
  id: string
  paymentDate: string
  bankRef: string
  totalAmount: number
}

export default function EditBatchPage() {
  const router = useRouter()
  const params = useParams()
  const batchId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [batch, setBatch] = useState<PaymentBatch | null>(null)
  const [formData, setFormData] = useState({
    paymentDate: '',
    bankRef: ''
  })
  const [reason, setReason] = useState('')
  const [showReasonModal, setShowReasonModal] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState<(() => void) | null>(null)

  useEffect(() => {
    fetchBatch()
  }, [batchId])

  const fetchBatch = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/fuel-payments/batches/${batchId}`)
      if (res.ok) {
        const data = await res.json()
        setBatch(data)
        setFormData({
          paymentDate: invoiceDateToInputValue(data.paymentDate),
          bankRef: data.bankRef
        })
      } else {
        alert('Failed to load batch')
        router.push('/fuel-payments/batches')
      }
    } catch (error) {
      console.error('Error fetching batch:', error)
      alert('Failed to load batch')
      router.push('/fuel-payments/batches')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!batch) return

    const hasChanges =
      formData.paymentDate !== invoiceDateToInputValue(batch.paymentDate) ||
      formData.bankRef !== batch.bankRef

    if (!hasChanges) {
      router.push(`/fuel-payments/batches/${batchId}`)
      return
    }

    setPendingUpdate(() => async () => {
      await performUpdate()
    })
    setShowReasonModal(true)
  }

  const performUpdate = async () => {
    if (!reason.trim()) {
      alert('Please provide a reason for the changes')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/fuel-payments/batches/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate: formData.paymentDate,
          bankRef: formData.bankRef,
          reason: reason.trim(),
          changedBy: 'admin'
        })
      })

      if (res.ok) {
        router.push(`/fuel-payments/batches/${batchId}`)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to update batch')
        setSaving(false)
        setShowReasonModal(false)
      }
    } catch (error) {
      console.error('Error updating batch:', error)
      alert('Failed to update batch')
      setSaving(false)
      setShowReasonModal(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading batch...</p>
      </div>
    )
  }

  if (!batch) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Edit Payment Batch</h1>
          <p className="mt-1 text-sm text-gray-600">
            Update batch details. Changes will be logged in the audit trail.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.paymentDate}
                onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Bank Reference <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.bankRef}
                onChange={(e) => setFormData({ ...formData, bankRef: e.target.value })}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
              />
              <p className="mt-1 text-xs text-gray-500">
                Unique reference for this payment batch. Leave blank for &quot;(No Ref)&quot;.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:gap-4">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="min-h-[44px] rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 sm:min-h-0"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {showReasonModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
          <div className="my-4 w-full max-w-md rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Reason for Changes</h2>
            <p className="mb-4 text-sm text-gray-600">
              Please provide a reason for updating this batch. This will be logged in the audit
              trail.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter reason for changes..."
              required
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-4">
              <button
                type="button"
                onClick={async () => {
                  if (pendingUpdate) {
                    await pendingUpdate()
                  }
                }}
                disabled={!reason.trim() || saving}
                className="min-h-[44px] rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReasonModal(false)
                  setReason('')
                  setPendingUpdate(null)
                }}
                className="min-h-[44px] rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 sm:min-h-0"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
