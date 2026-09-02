'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Presence = 'online' | 'stale' | 'offline'

type AgentRow = {
  id: string
  agentKey: string
  hostname: string | null
  version: string | null
  lastHeartbeatAt: string
  lastTaskAt: string | null
  cstoreSessionOk: boolean | null
  cstoreSessionAt: string | null
  presence: Presence
}

type TaskRow = {
  id: string
  taskKey: string
  status: string
  message: string | null
  startedAt: string
  finishedAt: string
  agent: { agentKey: string; hostname: string | null }
}

function formatWhen(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    timeZone: 'America/St_Lucia',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function presenceLabel(p: Presence) {
  if (p === 'online') return 'Online'
  if (p === 'stale') return 'Stale'
  return 'Offline'
}

function presenceClass(p: Presence) {
  if (p === 'online') return 'bg-green-100 text-green-800'
  if (p === 'stale') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-700'
}

export default function HarvestAgentSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailTesting, setEmailTesting] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/harvest-agent/status').then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load')
        setAgents(data.agents || [])
        setTasks(data.tasks || [])
      }),
      fetch('/api/settings/harvest-agent-email').then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load email settings')
        setEmailEnabled(!!data.enabled)
        setEmailRecipients(typeof data.recipients === 'string' ? data.recipients : '')
      })
    ])
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const saveEmailSettings = async () => {
    setEmailSaving(true)
    setEmailError(null)
    setEmailSuccess(null)
    try {
      const res = await fetch('/api/settings/harvest-agent-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: emailEnabled, recipients: emailRecipients })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setEmailEnabled(!!data.enabled)
      setEmailRecipients(typeof data.recipients === 'string' ? data.recipients : '')
      setEmailSuccess('Email settings saved.')
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setEmailSaving(false)
    }
  }

  const sendTestEmail = async () => {
    setEmailTesting(true)
    setEmailError(null)
    setEmailSuccess(null)
    try {
      const res = await fetch('/api/settings/harvest-agent-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendTest: true,
          recipients: emailRecipients
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send test')
      setEmailSuccess(`Sample email sent to ${data.sent} recipient(s).`)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send test')
    } finally {
      setEmailTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Harvest agent</h1>
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            ← Settings
          </button>
        </div>

        <p className="text-gray-600 mb-6 max-w-3xl">
          Dedicated PC or Pi that stays logged into Cstore Pro. It pings Shift Close twice a day
          and records each job as pass or fail. Customer account downloads come after the
          keep-alive is stable.
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-600">Loading...</p>
        ) : (
          <>
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Agents</h2>
              {agents.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No harvest agent has checked in yet. On the machine that will run jobs, install
                  the harvest agent, log into Cstore once in the browser it opens, then leave it
                  running.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4 font-medium">Agent</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-4 font-medium">Last ping</th>
                        <th className="py-2 pr-4 font-medium">Cstore session</th>
                        <th className="py-2 font-medium">Last task</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a) => (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">
                            <div className="font-medium text-gray-900">{a.agentKey}</div>
                            <div className="text-xs text-gray-500">
                              {[a.hostname, a.version].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </td>
                          <td className="py-2 pr-4">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${presenceClass(a.presence)}`}
                            >
                              {presenceLabel(a.presence)}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-gray-800">{formatWhen(a.lastHeartbeatAt)}</td>
                          <td className="py-2 pr-4 text-gray-800">
                            {a.cstoreSessionOk == null
                              ? '—'
                              : a.cstoreSessionOk
                                ? `Signed in (${formatWhen(a.cstoreSessionAt)})`
                                : `Needs login (${formatWhen(a.cstoreSessionAt)})`}
                          </td>
                          <td className="py-2 text-gray-800">{formatWhen(a.lastTaskAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Task summary email</h2>
              <p className="text-sm text-gray-600 mb-4">
                After each harvest job finishes, Shift Close can email a summary of completed
                imports, failures, and any new customer names added from Cstore. Uses the same SMTP
                as the rest of the app.
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-800 mb-4">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                />
                Send email when a harvest task finishes
              </label>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient emails (comma or space)
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows={3}
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  placeholder="accounting@example.com, manager@example.com"
                />
              </div>
              {emailError && <p className="text-sm text-red-600 mb-3">{emailError}</p>}
              {emailSuccess && <p className="text-sm text-green-700 mb-3">{emailSuccess}</p>}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void saveEmailSettings()}
                  disabled={emailSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {emailSaving ? 'Saving…' : 'Save email settings'}
                </button>
                <button
                  type="button"
                  onClick={() => void sendTestEmail()}
                  disabled={emailTesting}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-800 rounded-md text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  {emailTesting ? 'Sending…' : 'Send sample email'}
                </button>
              </div>
            </section>

            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Task log</h2>
              {tasks.length === 0 ? (
                <p className="text-sm text-gray-600">No tasks recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4 font-medium">When</th>
                        <th className="py-2 pr-4 font-medium">Task</th>
                        <th className="py-2 pr-4 font-medium">Result</th>
                        <th className="py-2 pr-4 font-medium">Agent</th>
                        <th className="py-2 font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((t) => (
                        <tr key={t.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 whitespace-nowrap">{formatWhen(t.finishedAt)}</td>
                          <td className="py-2 pr-4 font-medium text-gray-900">{t.taskKey}</td>
                          <td className="py-2 pr-4">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                                t.status === 'pass'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {t.status === 'pass' ? 'Pass' : 'Fail'}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-gray-700">{t.agent.agentKey}</td>
                          <td className="py-2 text-gray-700">{t.message || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
