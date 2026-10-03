'use client'

import { useCallback, useEffect, useState } from 'react'

type SyncStep = {
  taskKey: string
  label: string
  status: string
  message: string | null
}

type SyncRun = {
  id: string
  label: string
  status: string
  steps: SyncStep[]
}

type SyncView = {
  month: { year: number; month: number; label: string }
  run: SyncRun | null
  agentOnline: boolean
  agentPaused: boolean
}

function isActive(run: SyncRun | null) {
  return run?.status === 'pending' || run?.status === 'running'
}

function caption(run: SyncRun) {
  if (run.status === 'pending') return 'Waiting for the agent'
  if (run.status === 'pass') return 'Complete'
  if (run.status === 'paused') return 'Paused'
  if (run.status === 'fail') return 'Finished with a failed step'
  const runningAt = run.steps.findIndex((step) => step.status === 'running')
  const done = run.steps.filter((step) => step.status === 'pass' || step.status === 'fail').length
  const stepNo = runningAt >= 0 ? runningAt + 1 : Math.min(done + 1, run.steps.length)
  return `Step ${stepNo} of ${run.steps.length}`
}

function fillClass(status: string) {
  if (status === 'pass') return 'bg-green-500'
  if (status === 'fail') return 'bg-red-500'
  if (status === 'running') return 'bg-amber-400'
  return 'bg-transparent'
}

function fillWidth(status: string) {
  if (status === 'running') return '50%'
  if (status === 'waiting') return '0%'
  return '100%'
}

function pillClass(status: string) {
  if (status === 'pass') return 'bg-green-100 text-green-800'
  if (status === 'fail') return 'bg-red-100 text-red-800'
  if (status === 'running') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-600'
}

function pillLabel(status: string) {
  if (status === 'pass') return 'Pass'
  if (status === 'fail') return 'Fail'
  if (status === 'running') return 'Running'
  return 'Waiting'
}

const READY_STEPS: SyncStep[] = [
  { taskKey: 'customer_accounts', label: 'Customer accounts', status: 'waiting', message: null },
  { taskKey: 'vendor_invoices', label: 'Vendor invoices', status: 'waiting', message: null },
  { taskKey: 'fuel_invoices', label: 'Fuel invoices', status: 'waiting', message: null },
  { taskKey: 'lpg_invoices', label: 'LPG invoices', status: 'waiting', message: null }
]

export default function HarvestSyncCard() {
  const [view, setView] = useState<SyncView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/harvest-agent/sync')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load sync')
    setView(data)
  }, [])

  useEffect(() => {
    let cancelled = false
    load().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sync')
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const runStatus = view?.run?.status
  const runId = view?.run?.id

  useEffect(() => {
    if (runStatus !== 'pending' && runStatus !== 'running') return
    const timer = setInterval(() => {
      load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load sync'))
    }, 3000)
    return () => clearInterval(timer)
  }, [runId, runStatus, load])

  const startSync = async () => {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/harvest-agent/sync', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 409) throw new Error(data.error || 'Failed to start sync')
      if (data.month) setView(data)
      else await load()
      if (res.status === 409) setError(data.error || 'A sync is already waiting or running')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync')
    } finally {
      setStarting(false)
    }
  }

  const monthLabel = view?.month.label ?? 'this month'
  const run = view?.run ?? null
  const active = isActive(run)
  const steps = run?.steps?.length ? run.steps : READY_STEPS
  const blocked = !view || !view.agentOnline || view.agentPaused || active || starting
  const hint = !view
    ? null
    : !view.agentOnline
      ? 'The harvest agent is offline.'
      : view.agentPaused
        ? 'The harvest agent is paused. Resume it on the Windows VM, then sync.'
        : active && run?.status === 'pending'
          ? 'Waiting for the agent to pick this up.'
          : null

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sync {monthLabel}</h2>
          <p className="text-sm text-gray-500 mt-1">Harvest agent on the Windows VM</p>
        </div>
        <button
          type="button"
          onClick={() => void startSync()}
          disabled={blocked}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
        >
          {active || starting ? 'Syncing…' : `Sync ${monthLabel}`}
        </button>
      </div>

      {hint && <p className="text-sm text-gray-600 mb-4">{hint}</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {view && (
        <>
          <div className="flex gap-1 mb-2" aria-hidden="true">
            {steps.map((step) => (
              <div key={step.taskKey} className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full ${fillClass(step.status)}`}
                  style={{ width: fillWidth(step.status) }}
                />
              </div>
            ))}
          </div>
          {run && (
            <p className="text-xs text-gray-500 mb-4">
              {run.label === monthLabel ? caption(run) : `Last sync · ${run.label} · ${caption(run)}`}
            </p>
          )}
          <ul className={`divide-y divide-gray-100 ${run ? '' : 'mt-2'}`}>
            {steps.map((step) => (
              <li key={step.taskKey} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{step.label}</div>
                  {step.message && step.status !== 'waiting' && (
                    <p className="text-sm text-gray-500 mt-0.5">{step.message}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-semibold ${pillClass(step.status)}`}
                >
                  {pillLabel(step.status)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
