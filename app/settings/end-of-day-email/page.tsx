'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

/** Shift-close End of Day summary email (totals, scan links). Configured under Settings, not Attendance. */
export default function EndOfDayEmailSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [recipients, setRecipients] = useState('')
  const [timeZone, setTimeZone] = useState('America/St_Lucia')
  const [lastSentDate, setLastSentDate] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/attendance/end-of-day-email', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setEnabled(!!data.enabled)
      setRecipients(typeof data.recipients === 'string' ? data.recipients : '')
      setTimeZone(typeof data.timeZone === 'string' && data.timeZone ? data.timeZone : 'America/St_Lucia')
      setLastSentDate(typeof data.lastSentDate === 'string' ? data.lastSentDate : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load end-of-day email settings')
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
      const res = await fetch('/api/attendance/end-of-day-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          recipients,
          timeZone
        })
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
      const res = await fetch('/api/attendance/end-of-day-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendTest: true,
          recipients,
          timeZone
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setSuccess(
        `Test email sent for ${data.reportDate ?? 'report date'} (${data.sent} recipient(s)).`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <Link href="/settings" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Settings
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">End of day email</h1>
          <p className="mt-1 text-sm text-gray-600">
            Optional daily email with the previous calendar day&apos;s End of Day summary from shift close (totals and
            scan links). Uses the same SMTP as the rest of the app.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              <div className="space-y-4">
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
                  <p className="text-xs text-gray-500 mt-1">
                    Separate multiple addresses with commas, semicolons, or new lines.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone (for previous day)</label>
                  <input
                    type="text"
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    IANA name, e.g. America/St_Lucia. Override with env EOD_EMAIL_TIMEZONE if empty. This timezone is also
                    used for the attendance summary daily email if you use that feature.
                  </p>
                </div>

                {lastSentDate ? (
                  <p className="text-sm text-gray-600">
                    Last automated send for date: <strong>{lastSentDate}</strong>
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendTest()}
                    disabled={testing}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testing ? 'Sending…' : 'Send test email'}
                  </button>
                </div>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100">
                <p className="font-medium text-gray-900 mb-2">Cron URL (server-to-server)</p>
                <code className="block break-all text-xs bg-white border border-gray-200 p-2 rounded">
                  GET {typeof window !== 'undefined' ? window.location.origin : ''}/api/cron/end-of-day-email
                </code>
                <p className="mt-2">
                  Header:{' '}
                  <code className="bg-white px-1 rounded border border-gray-100">
                    Authorization: Bearer YOUR_CRON_SECRET
                  </code>
                </p>
                <p className="mt-2 text-xs text-gray-600">
                  Set <code className="bg-white px-1 rounded">CRON_SECRET</code> in the environment (same as pay-day
                  reminders). The job sends at most once per report date per recipient list.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
