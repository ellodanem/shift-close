'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewVendorPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    notificationEmail: '',
    notes: '',
    isVatRegistered: false,
    cstoreName: ''
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
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Add Vendor</h1>
          <button
            type="button"
            onClick={() => router.push('/vendor-payments/vendors')}
            className="min-h-[44px] rounded bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 sm:min-h-0"
          >
            Cancel
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
        >
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                placeholder="Vendor name"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Cstore name
              </label>
              <input
                type="text"
                value={formData.cstoreName}
                onChange={(e) => setFormData({ ...formData, cstoreName: e.target.value })}
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                placeholder="Name as it appears in Cstore (if different)"
              />
              <p className="mt-1 text-xs text-gray-500">
                Used by the harvest agent when the Cstore vendor spelling does not match Shift Close.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notification Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.notificationEmail}
                onChange={(e) => setFormData({ ...formData, notificationEmail: e.target.value })}
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                placeholder="vendor@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Additional notes"
              />
            </div>
            <div className="flex min-h-[44px] items-start gap-3">
              <input
                id="isVatRegistered"
                type="checkbox"
                checked={formData.isVatRegistered}
                onChange={(e) =>
                  setFormData({ ...formData, isVatRegistered: e.target.checked })
                }
                className="mt-1 rounded border-gray-300"
              />
              <div>
                <label htmlFor="isVatRegistered" className="block text-sm font-medium text-gray-700">
                  VAT registered
                </label>
                <p className="text-xs text-gray-500">
                  Enables VAT calculator when adding invoices for this vendor. VAT rate is set globally in Settings.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-4">
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/vendors')}
              className="min-h-[44px] rounded bg-gray-200 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-300 sm:min-h-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400 sm:min-h-0"
            >
              {loading ? 'Saving...' : 'Create Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
