'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function EndOfDayEmailSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [recipients, setRecipients] = useState('')
  const [timeZone, setTimeZone] = useState('America/St_Lucia')
  const [lastSentDate, setLastSentDate] = useState('')

  useEffect(() => {
    fetch('/api/settings/end-of-day-email')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setEnabled(!!data.enabled)
        setRecipients(typeof data.recipients === 'string' ? data.recipients : '')
        setTimeZone(typeof data.timeZone === 'string' && data.timeZone ? data.timeZone : 'America/St_Lucia')
        setLastSentDate(typeof data.lastSentDate === 'string' ? data.lastSentDate : '')
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/settings/end-of-day-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, recipients, timeZone })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSuccess('Saved.')
      if (typeof data.lastSentDate === 'string') setLastSentDate(data.lastSentDate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/settings/end-of-day-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendTest: true })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setSuccess(`Test email sent for ${data.reportDate ?? 'report date'} (${data.sent} recipient(s)).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">End of day email</h1>
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to Settings
          </button>
        </div>

        <p className="text-gray-600 mb-6">
          When enabled, a daily email summarizes the previous calendar day (in the timezone below) — same
          totals and scan links as the End of Day page. Schedule your host to call the cron URL once per day
          (after shifts are closed) using <code className="bg-gray-100 px-1 rounded">CRON_SECRET</code>.
        </p>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="font-medium text-gray-900">Send automated end-of-day email</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              rows={4}
              placeholder={'one@example.com, other@example.com\nor one address per line'}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-gray-500 mt-1">Separate multiple addresses with commas, semicolons, or new lines.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone (for “previous day”)</label>
            <input
              type="text"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">IANA name, e.g. America/St_Lucia. Override with env EOD_EMAIL_TIMEZONE if empty.</p>
          </div>

          {lastSentDate ? (
            <p className="text-sm text-gray-600">
              Last automated send for date: <strong>{lastSentDate}</strong>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={testing}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? 'Sending…' : 'Send test email'}
            </button>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-green-700">{success}</p> : null}
        </div>

        <div className="mt-8 p-4 bg-gray-100 rounded-lg text-sm text-gray-700">
          <p className="font-medium text-gray-900 mb-2">Cron URL (server-to-server)</p>
          <code className="block break-all text-xs bg-white border border-gray-200 p-2 rounded">
            GET {typeof window !== 'undefined' ? window.location.origin : ''}/api/cron/end-of-day-email
          </code>
          <p className="mt-2">
            Header: <code className="bg-white px-1 rounded">Authorization: Bearer YOUR_CRON_SECRET</code>
          </p>
          <p className="mt-2 text-xs text-gray-600">
            Set <code className="bg-white px-1 rounded">CRON_SECRET</code> in the environment (same as pay-day reminders). The job
            sends at most once per report date per recipient list.
          </p>
        </div>
      </div>
    </div>
  )
}
