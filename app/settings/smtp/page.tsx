'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SmtpSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: '587',
    smtp_secure: false,
    smtp_user: '',
    smtp_pass: '',
    smtp_from: ''
  })

  useEffect(() => {
    fetch('/api/settings/smtp')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setForm({
          smtp_host: data.smtp_host || 'smtp.gmail.com',
          smtp_port: data.smtp_port || '587',
          smtp_secure: data.smtp_secure === 'true' || data.smtp_secure === true,
          smtp_user: data.smtp_user || '',
          smtp_pass: data.smtp_pass || '',
          smtp_from: data.smtp_from || ''
        })
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          smtp_secure: form.smtp_secure,
          smtp_user: form.smtp_user,
          smtp_pass: form.smtp_pass || undefined,
          smtp_from: form.smtp_from || form.smtp_user
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSuccess('SMTP settings saved.')
      if (form.smtp_pass) setForm((f) => ({ ...f, smtp_pass: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
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
          <h1 className="text-3xl font-bold text-gray-900">Email (SMTP)</h1>
          <button
            onClick={() => router.push('/settings')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            ← Settings
          </button>
        </div>

        <p className="text-gray-600 mb-6">
          Configure SMTP for sending emails (reports, vendor notifications, reminders). Works with Gmail, Outlook, or any SMTP server.
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">{success}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
            <input
              type="text"
              value={form.smtp_host}
              onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
              placeholder="smtp.gmail.com"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input
                type="text"
                value={form.smtp_port}
                onChange={(e) => setForm((f) => ({ ...f, smtp_port: e.target.value }))}
                placeholder="587"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">587 (TLS) or 465 (SSL)</p>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.smtp_secure}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_secure: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Use SSL (port 465)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={form.smtp_user}
              onChange={(e) => setForm((f) => ({ ...f, smtp_user: e.target.value }))}
              placeholder="your@gmail.com"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={form.smtp_pass}
              onChange={(e) => setForm((f) => ({ ...f, smtp_pass: e.target.value }))}
              placeholder="Leave blank to keep current"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">For Gmail, use an App Password.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From address</label>
            <input
              type="email"
              value={form.smtp_from}
              onChange={(e) => setForm((f) => ({ ...f, smtp_from: e.target.value }))}
              placeholder="Optional, defaults to username"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save SMTP Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
