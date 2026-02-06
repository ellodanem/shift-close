'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { formatDate } from '@/lib/fuelPayments'

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
          paymentDate: new Date(data.paymentDate).toISOString().split('T')[0],
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

    // Check if anything changed
    if (!batch) return

    const hasChanges =
      formData.paymentDate !== new Date(batch.paymentDate).toISOString().split('T')[0] ||
      formData.bankRef !== batch.bankRef

    if (!hasChanges) {
      router.push(`/fuel-payments/batches/${batchId}`)
      return
    }

    // Require reason for changes
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
          changedBy: 'admin' // TODO: Get from auth context
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
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading batch...</p>
      </div>
    )
  }

  if (!batch) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Edit Payment Batch</h1>
          <p className="text-sm text-gray-600 mt-1">
            Update batch details. Changes will be logged in the audit trail.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.paymentDate}
                onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Reference <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.bankRef}
                onChange={(e) => setFormData({ ...formData, bankRef: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="mt-1 text-xs text-gray-500">
                Unique reference for this payment batch. Leave blank for "(No Ref)".
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Reason Modal */}
      {showReasonModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Reason for Changes
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for updating this batch. This will be logged in the audit trail.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="Enter reason for changes..."
              required
            />
            <div className="flex gap-4">
              <button
                onClick={async () => {
                  if (pendingUpdate) {
                    await pendingUpdate()
                  }
                }}
                disabled={!reason.trim() || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => {
                  setShowReasonModal(false)
                  setReason('')
                  setPendingUpdate(null)
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
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

