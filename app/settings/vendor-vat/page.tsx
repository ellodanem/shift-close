'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_VAT_RATE, formatVatRatePercent } from '@/lib/vendorVat'

export default function VendorVatSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [vatRatePercent, setVatRatePercent] = useState(formatVatRatePercent(DEFAULT_VAT_RATE))

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/settings/vendor-vat', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setVatRatePercent(data.vatRatePercent ?? formatVatRatePercent(DEFAULT_VAT_RATE))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void load().finally(() => setLoading(false))
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/settings/vendor-vat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vatRatePercent })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setVatRatePercent(data.vatRatePercent ?? vatRatePercent)
      setSuccess('Saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <Link href="/settings" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Settings
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Vendor VAT rate</h1>
          <p className="mt-1 text-sm text-gray-600">
            Global VAT rate used by the vendor invoice calculator when splitting a total into amount and VAT.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4">
            <div>
              <label htmlFor="vat-rate-percent" className="block text-sm font-medium text-gray-700 mb-1">
                VAT rate (%)
              </label>
              <input
                id="vat-rate-percent"
                type="number"
                step="0.01"
                min="0"
                value={vatRatePercent}
                onChange={(e) => setVatRatePercent(e.target.value)}
                className="w-32 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="mt-2 text-xs text-gray-500">
                Applies to all VAT-registered vendors. Default is 12.5%.
              </p>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-green-700">{success}</p> : null}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
