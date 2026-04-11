'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

export default function MissingDepositSlipAlertsSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [digestEnabled, setDigestEnabled] = useState(true)
  const [recipients, setRecipients] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/settings/missing-deposit-slip-alerts', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setEnabled(!!data.enabled)
      setDigestEnabled(data.digestEnabled !== false)
      setRecipients(typeof data.recipients === 'string' ? data.recipients : '')
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
      const res = await fetch('/api/settings/missing-deposit-slip-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, digestEnabled, recipients })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setEnabled(!!data.enabled)
      setDigestEnabled(data.digestEnabled !== false)
      setRecipients(typeof data.recipients === 'string' ? data.recipients : '')
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
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Missing deposit slip alerts</h1>
          <p className="mt-1 text-sm text-gray-600">
            When someone flags missing deposit scan slips on End of Day (Deposit Breakdown), the app can email a small
            list of recipients. Immediate emails are debounced after save; an optional daily digest reminds you while a
            flag stays open (skips the same calendar day as the first immediate send). Uses the same SMTP as the rest of
            the app.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-5">
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable missing-deposit-slip notification emails
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={digestEnabled}
                onChange={(e) => setDigestEnabled(e.target.checked)}
              />
              Enable daily digest for still-open flags (cron:{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">/api/cron/missing-deposit-slip-digest</code>)
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recipient emails (comma or space)</label>
              <textarea
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={3}
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="accounting@example.com, manager@example.com"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-700">{success}</p>}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
