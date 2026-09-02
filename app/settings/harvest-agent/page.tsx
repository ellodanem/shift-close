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

  useEffect(() => {
    fetch('/api/harvest-agent/status')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load')
        setAgents(data.agents || [])
        setTasks(data.tasks || [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

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
