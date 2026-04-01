'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

export default function AttendanceSettingsPage() {
  const [expectedPunchesPerDay, setExpectedPunchesPerDay] = useState(4)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [eodLoading, setEodLoading] = useState(true)
  const [eodSaving, setEodSaving] = useState(false)
  const [eodTesting, setEodTesting] = useState(false)
  const [eodError, setEodError] = useState<string | null>(null)
  const [eodSuccess, setEodSuccess] = useState<string | null>(null)
  const [eodEnabled, setEodEnabled] = useState(false)
  const [eodRecipients, setEodRecipients] = useState('')
  const [eodTimeZone, setEodTimeZone] = useState('America/St_Lucia')
  const [eodLastSentDate, setEodLastSentDate] = useState('')

  const loadExpected = useCallback(async () => {
    setMessage(null)
    try {
      const res = await fetch('/api/attendance/settings', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { expectedPunchesPerDay?: number }
      if (typeof data.expectedPunchesPerDay === 'number' && data.expectedPunchesPerDay >= 1) {
        setExpectedPunchesPerDay(data.expectedPunchesPerDay)
      }
    } catch {
      // ignore
    }
  }, [])

  const loadEod = useCallback(async () => {
    setEodError(null)
    try {
      const res = await fetch('/api/attendance/end-of-day-email', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setEodEnabled(!!data.enabled)
      setEodRecipients(typeof data.recipients === 'string' ? data.recipients : '')
      setEodTimeZone(typeof data.timeZone === 'string' && data.timeZone ? data.timeZone : 'America/St_Lucia')
      setEodLastSentDate(typeof data.lastSentDate === 'string' ? data.lastSentDate : '')
    } catch (e) {
      setEodError(e instanceof Error ? e.message : 'Failed to load end-of-day email settings')
    }
  }, [])

  useEffect(() => {
    void loadExpected()
  }, [loadExpected])

  useEffect(() => {
    setEodLoading(true)
    void loadEod().finally(() => setEodLoading(false))
  }, [loadEod])

  const saveExpected = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/attendance/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedPunchesPerDay })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
      }
      if (typeof data.expectedPunchesPerDay === 'number') {
        setExpectedPunchesPerDay(data.expectedPunchesPerDay)
      }
      setMessage('Saved.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveEod = async () => {
    setEodSaving(true)
    setEodError(null)
    setEodSuccess(null)
    try {
      const res = await fetch('/api/attendance/end-of-day-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: eodEnabled,
          recipients: eodRecipients,
          timeZone: eodTimeZone
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setEodSuccess('Saved.')
      if (typeof data.lastSentDate === 'string') setEodLastSentDate(data.lastSentDate)
    } catch (err) {
      setEodError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setEodSaving(false)
    }
  }

  const sendEodTest = async () => {
    setEodTesting(true)
    setEodError(null)
    setEodSuccess(null)
    try {
      const res = await fetch('/api/attendance/end-of-day-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendTest: true,
          recipients: eodRecipients,
          timeZone: eodTimeZone
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setEodSuccess(
        `Test email sent for ${data.reportDate ?? 'report date'} (${data.sent} recipient(s)).`
      )
    } catch (err) {
      setEodError(err instanceof Error ? err.message : 'Failed to send test')
    } finally {
      setEodTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <Link href="/attendance" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Attendance
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Attendance settings</h1>
          <p className="mt-1 text-sm text-gray-600">
            Irregular punch rules for the Attendance Logs tab, and optional daily End of Day summary email.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Irregular punch rules</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="expected-punches-per-day"
                className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1"
              >
                Expected punches per day
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="expected-punches-per-day"
                  type="number"
                  min={1}
                  max={24}
                  value={expectedPunchesPerDay}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!Number.isFinite(v)) return
                    setExpectedPunchesPerDay(Math.min(24, Math.max(1, v)))
                  }}
                  className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => void saveExpected()}
                  disabled={saving}
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-600 max-w-xl pb-0.5">
              Default <span className="font-medium text-gray-800">4</span> is a standard full day (two in/out pairs). Colors use the same
              calendar day as the <span className="font-medium text-gray-800">Date</span> column in your browser (not UTC). Deleted punches
              are not counted. On the logs table: <span className="font-medium text-gray-800">green</span> when that day has this many
              punches and valid in/out pairing; <span className="font-medium text-sky-800">blue</span> (Possible missed) when there are only two punches but
              they form a valid in/out pair; <span className="font-medium text-red-800">red</span> for any other issue.
            </p>
          </div>
          {message && (
            <p className={`mt-3 text-sm ${message === 'Saved.' ? 'text-emerald-700' : 'text-red-700'}`}>{message}</p>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">End of day email</h2>
          <p className="text-sm text-gray-600 mb-4">
            Optional daily email with the previous calendar day&apos;s End of Day summary (totals and scan links). Uses the same SMTP as
            the rest of the app. Schedule a server cron to call the URL below once per day after shifts are closed.
          </p>

          {eodLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eodEnabled}
                    onChange={(e) => setEodEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="font-medium text-gray-900">Send automated end-of-day email</span>
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label>
                  <textarea
                    value={eodRecipients}
                    onChange={(e) => setEodRecipients(e.target.value)}
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
                    value={eodTimeZone}
                    onChange={(e) => setEodTimeZone(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    IANA name, e.g. America/St_Lucia. Override with env EOD_EMAIL_TIMEZONE if empty.
                  </p>
                </div>

                {eodLastSentDate ? (
                  <p className="text-sm text-gray-600">
                    Last automated send for date: <strong>{eodLastSentDate}</strong>
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void saveEod()}
                    disabled={eodSaving}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {eodSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendEodTest()}
                    disabled={eodTesting}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {eodTesting ? 'Sending…' : 'Send test email'}
                  </button>
                </div>

                {eodError ? <p className="text-sm text-red-600">{eodError}</p> : null}
                {eodSuccess ? <p className="text-sm text-emerald-700">{eodSuccess}</p> : null}
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
                  Set <code className="bg-white px-1 rounded">CRON_SECRET</code> in the environment (same as pay-day reminders). The job
                  sends at most once per report date per recipient list.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
