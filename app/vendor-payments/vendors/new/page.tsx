'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewVendorPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    notificationEmail: '',
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/vendor-payments/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to create vendor')
      }

      const vendor = await res.json()
      router.push(`/vendor-payments/vendors/${vendor.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Add Vendor</h1>
          <button
            onClick={() => router.push('/vendor-payments/vendors')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Vendor name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notification Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.notificationEmail}
                onChange={(e) => setFormData({ ...formData, notificationEmail: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="vendor@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Additional notes"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/vendors')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Saving...' : 'Create Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
