'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

export default function AttendanceSettingsPage() {
  const [expectedPunchesPerDay, setExpectedPunchesPerDay] = useState(4)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [asumLoading, setAsumLoading] = useState(true)
  const [asumSaving, setAsumSaving] = useState(false)
  const [asumTesting, setAsumTesting] = useState(false)
  const [asumError, setAsumError] = useState<string | null>(null)
  const [asumSuccess, setAsumSuccess] = useState<string | null>(null)
  const [asumEnabled, setAsumEnabled] = useState(false)
  const [asumRecipients, setAsumRecipients] = useState('')
  const [asumLastSentDate, setAsumLastSentDate] = useState('')
  const [asumTimeZone, setAsumTimeZone] = useState('America/St_Lucia')

  const [paEnabled, setPaEnabled] = useState(false)
  const [paGraceMinutes, setPaGraceMinutes] = useState(60)
  const [paNotifyEmail, setPaNotifyEmail] = useState(false)
  const [paNotifyWhatsApp, setPaNotifyWhatsApp] = useState(false)
  const [paNotifyEmailRecipients, setPaNotifyEmailRecipients] = useState('')
  const [paNotifyWhatsAppNumbers, setPaNotifyWhatsAppNumbers] = useState('')
  const [paSaving, setPaSaving] = useState(false)
  const [paMessage, setPaMessage] = useState<string | null>(null)

  const loadExpected = useCallback(async () => {
    setMessage(null)
    try {
      const res = await fetch('/api/attendance/settings', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as {
        expectedPunchesPerDay?: number
        presentAbsenceEnabled?: boolean
        graceMinutes?: number
        absenceNotifyEmail?: boolean
        absenceNotifyWhatsApp?: boolean
        absenceNotifyEmailRecipients?: string
        absenceNotifyWhatsAppNumbers?: string
      }
      if (typeof data.expectedPunchesPerDay === 'number' && data.expectedPunchesPerDay >= 1) {
        setExpectedPunchesPerDay(data.expectedPunchesPerDay)
      }
      if (typeof data.presentAbsenceEnabled === 'boolean') setPaEnabled(data.presentAbsenceEnabled)
      if (typeof data.graceMinutes === 'number' && data.graceMinutes >= 1) {
        setPaGraceMinutes(data.graceMinutes)
      }
      if (typeof data.absenceNotifyEmail === 'boolean') setPaNotifyEmail(data.absenceNotifyEmail)
      if (typeof data.absenceNotifyWhatsApp === 'boolean') setPaNotifyWhatsApp(data.absenceNotifyWhatsApp)
      if (typeof data.absenceNotifyEmailRecipients === 'string') {
        setPaNotifyEmailRecipients(data.absenceNotifyEmailRecipients)
      }
      if (typeof data.absenceNotifyWhatsAppNumbers === 'string') {
        setPaNotifyWhatsAppNumbers(data.absenceNotifyWhatsAppNumbers)
      }
    } catch {
      // ignore
    }
  }, [])

  const loadAsum = useCallback(async () => {
    setAsumError(null)
    try {
      const res = await fetch('/api/attendance/attendance-summary-email', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setAsumEnabled(!!data.enabled)
      setAsumRecipients(typeof data.recipients === 'string' ? data.recipients : '')
      setAsumLastSentDate(typeof data.lastSentDate === 'string' ? data.lastSentDate : '')
      setAsumTimeZone(
        typeof data.timeZone === 'string' && data.timeZone.trim() ? data.timeZone.trim() : 'America/St_Lucia'
      )
    } catch (e) {
      setAsumError(e instanceof Error ? e.message : 'Failed to load attendance summary email settings')
    }
  }, [])

  useEffect(() => {
    void loadExpected()
  }, [loadExpected])

  useEffect(() => {
    setAsumLoading(true)
    void loadAsum().finally(() => setAsumLoading(false))
  }, [loadAsum])

  const savePresentAbsence = async () => {
    setPaSaving(true)
    setPaMessage(null)
    try {
      const res = await fetch('/api/attendance/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presentAbsenceEnabled: paEnabled,
          graceMinutes: paGraceMinutes,
          absenceNotifyEmail: paNotifyEmail,
          absenceNotifyWhatsApp: paNotifyWhatsApp,
          absenceNotifyEmailRecipients: paNotifyEmailRecipients,
          absenceNotifyWhatsAppNumbers: paNotifyWhatsAppNumbers
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
      }
      setPaMessage('Saved.')
    } catch (e) {
      setPaMessage(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setPaSaving(false)
    }
  }

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

  const saveAsum = async () => {
    setAsumSaving(true)
    setAsumError(null)
    setAsumSuccess(null)
    try {
      const res = await fetch('/api/attendance/attendance-summary-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: asumEnabled,
          recipients: asumRecipients
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      const tzRes = await fetch('/api/attendance/end-of-day-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeZone: asumTimeZone.trim() || 'America/St_Lucia' })
      })
      const tzData = await tzRes.json().catch(() => ({}))
      if (!tzRes.ok) {
        throw new Error(typeof tzData.error === 'string' ? tzData.error : 'Failed to save timezone')
      }

      setAsumSuccess('Saved.')
      if (typeof data.lastSentDate === 'string') setAsumLastSentDate(data.lastSentDate)
    } catch (err) {
      setAsumError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setAsumSaving(false)
    }
  }

  const sendAsumTest = async () => {
    setAsumTesting(true)
    setAsumError(null)
    setAsumSuccess(null)
    try {
      const res = await fetch('/api/attendance/attendance-summary-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendTest: true,
          recipients: asumRecipients,
          timeZone: asumTimeZone.trim() || 'America/St_Lucia'
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setAsumSuccess(
        `Test email sent for ${data.reportDate ?? 'report date'} (${data.sent} recipient(s)).`
      )
    } catch (err) {
      setAsumError(err instanceof Error ? err.message : 'Failed to send test')
    } finally {
      setAsumTesting(false)
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
            Irregular punch rules and optional daily attendance summary email (hours and punches per staff).
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
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Present / absent (roster day)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Track scheduled staff vs punches for each calendar day (same timezone as end-of-day email). After the grace
            period from shift start, staff with no punch show as late until they clock in; past days without a punch are
            absent. Optional email and WhatsApp alerts when someone is late (no punch after grace).
          </p>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={paEnabled}
                onChange={(e) => setPaEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="font-medium text-gray-900">Enable present / absent on dashboard</span>
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Grace after shift start (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={paGraceMinutes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!Number.isFinite(v)) return
                    setPaGraceMinutes(Math.min(1440, Math.max(1, v)))
                  }}
                  className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
                />
              </div>
              <p className="text-xs text-gray-600 max-w-lg pb-0.5">
                No late/absent until at least this long after the roster shift start. Any punch that day (station time)
                counts as present.
              </p>
            </div>
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">Late alerts (optional)</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paNotifyEmail}
                  onChange={(e) => setPaNotifyEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-gray-900">Email when someone is past grace with no punch</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paNotifyWhatsApp}
                  onChange={(e) => setPaNotifyWhatsApp(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-gray-900">WhatsApp (Twilio) for the same</span>
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email recipients</label>
                <textarea
                  value={paNotifyEmailRecipients}
                  onChange={(e) => setPaNotifyEmailRecipients(e.target.value)}
                  rows={2}
                  placeholder="comma or line separated"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp numbers (E.164)</label>
                <textarea
                  value={paNotifyWhatsAppNumbers}
                  onChange={(e) => setPaNotifyWhatsAppNumbers(e.target.value)}
                  rows={2}
                  placeholder="+17581234567, one per line or comma separated"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                />
              </div>
              <p className="text-xs text-gray-500">
                Schedule cron:{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">
                  GET /api/cron/present-absence-notify
                </code>{' '}
                with <code className="bg-gray-100 px-1 rounded text-xs">Authorization: Bearer CRON_SECRET</code> (e.g.
                every 15–30 minutes during the day).
              </p>
            </div>
            <button
              type="button"
              onClick={() => void savePresentAbsence()}
              disabled={paSaving}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {paSaving ? 'Saving…' : 'Save present / absent settings'}
            </button>
            {paMessage ? (
              <p className={`text-sm ${paMessage === 'Saved.' ? 'text-emerald-700' : 'text-red-700'}`}>{paMessage}</p>
            ) : null}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Attendance summary email</h2>
          <p className="text-sm text-gray-600 mb-4">
            Daily email for the previous calendar day: hours and punch list per staff, plus running hours for the current pay period (from the day after the last saved &amp; emailed pay period, or the first of the month). Set the report timezone below (shared with shift-close email jobs in{' '}
            <Link href="/settings/end-of-day-email" className="text-blue-600 hover:text-blue-800 font-medium">
              Settings → End of day email
            </Link>
            ).
          </p>

          {asumLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asumEnabled}
                    onChange={(e) => setAsumEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="font-medium text-gray-900">Send automated attendance summary</span>
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label>
                  <textarea
                    value={asumRecipients}
                    onChange={(e) => setAsumRecipients(e.target.value)}
                    rows={4}
                    placeholder={'one@example.com, other@example.com\nor one address per line'}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Separate multiple addresses with commas, semicolons, or new lines.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone (for report day)</label>
                  <input
                    type="text"
                    value={asumTimeZone}
                    onChange={(e) => setAsumTimeZone(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    IANA name (e.g. America/St_Lucia). Saved with this form; also used by the end-of-day cron. Override with env{' '}
                    <code className="bg-gray-100 px-1 rounded text-xs">EOD_EMAIL_TIMEZONE</code> when unset in the database.
                  </p>
                </div>

                {asumLastSentDate ? (
                  <p className="text-sm text-gray-600">
                    Last automated send for report date: <strong>{asumLastSentDate}</strong>
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void saveAsum()}
                    disabled={asumSaving}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {asumSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendAsumTest()}
                    disabled={asumTesting}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {asumTesting ? 'Sending…' : 'Send test email'}
                  </button>
                </div>

                {asumError ? <p className="text-sm text-red-600">{asumError}</p> : null}
                {asumSuccess ? <p className="text-sm text-emerald-700">{asumSuccess}</p> : null}
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100">
                <p className="font-medium text-gray-900 mb-2">Cron URL (server-to-server)</p>
                <code className="block break-all text-xs bg-white border border-gray-200 p-2 rounded">
                  GET {typeof window !== 'undefined' ? window.location.origin : ''}/api/cron/attendance-summary-email
                </code>
                <p className="mt-2">
                  Header:{' '}
                  <code className="bg-white px-1 rounded border border-gray-100">
                    Authorization: Bearer YOUR_CRON_SECRET
                  </code>
                </p>
                <p className="mt-2 text-xs text-gray-600">
                  At most one send per report date. Schedule after shifts close if you use automated sends.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
