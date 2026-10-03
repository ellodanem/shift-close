'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { harvestSyncMonthLabel, previousHarvestSyncMonth } from '@/lib/harvest-sync-month'
import { isFullAccessRole, isOperationsManagerRole } from '@/lib/roles'

type SyncStep = {
  taskKey: string
  status: string
}

type SyncRun = {
  id: string
  label: string
  status: string
  finishedAt: string | null
  steps: SyncStep[]
}

type SyncView = {
  month: { year: number; month: number; label: string }
  run: SyncRun | null
  lastFinished: SyncRun | null
  agentOnline: boolean
  agentPaused: boolean
}

function isActiveStatus(status: string | undefined) {
  return status === 'pending' || status === 'running'
}

function outcomeLabel(status: string) {
  if (status === 'pass') return 'Complete'
  if (status === 'fail') return 'Finished with a failed step'
  if (status === 'paused') return 'Paused'
  return status
}

function formatWhen(value: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', {
    timeZone: 'America/St_Lucia',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function stepCaption(run: SyncRun) {
  if (run.status === 'pending') return 'Waiting for the agent'
  const runningAt = run.steps.findIndex((step) => step.status === 'running')
  const done = run.steps.filter((step) => step.status === 'pass' || step.status === 'fail').length
  const stepNo = runningAt >= 0 ? runningAt + 1 : Math.min(done + 1, run.steps.length)
  return `Step ${stepNo} of ${run.steps.length}`
}

function lastSyncSummary(lastFinished: SyncRun | null, active: SyncRun | null) {
  if (lastFinished) {
    const when = formatWhen(lastFinished.finishedAt)
    const outcome = outcomeLabel(lastFinished.status)
    return when
      ? `Last sync · ${lastFinished.label} · ${outcome} · ${when}`
      : `Last sync · ${lastFinished.label} · ${outcome}`
  }
  if (active) return `Syncing ${active.label} · ${stepCaption(active)}`
  return 'No sync yet'
}

function dotClass(active: boolean, lastFinished: SyncRun | null) {
  if (active) return 'bg-amber-400 animate-pulse'
  if (lastFinished?.status === 'pass') return 'bg-emerald-400'
  if (lastFinished?.status === 'fail') return 'bg-red-400'
  if (lastFinished?.status === 'paused') return 'bg-amber-400'
  return 'bg-slate-500'
}

function canUseHarvestSync(role: string) {
  return isFullAccessRole(role) || isOperationsManagerRole(role)
}

export default function HarvestSyncControl() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const allowed = Boolean(user) && canUseHarvestSync(role)
  const [view, setView] = useState<SyncView | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/harvest-agent/sync')
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) return
    if (!res.ok) throw new Error(data.error || 'Failed to load sync')
    setView(data)
    setError(null)
  }, [])

  const active = view?.run && isActiveStatus(view.run.status) ? view.run : null

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    const tick = () => {
      load().catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sync')
      })
    }
    tick()
    const timer = setInterval(tick, active ? 3000 : 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [allowed, active?.id, active?.status, load])

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const startSync = async (year: number, month: number) => {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/harvest-agent/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 409) throw new Error(data.error || 'Failed to start sync')
      if (data.month) setView(data)
      else await load()
      if (res.status === 409) {
        setError(data.error || 'A sync is already waiting or running')
        return
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync')
    } finally {
      setStarting(false)
    }
  }

  if (!allowed) return null

  const lastFinished =
    view?.lastFinished ?? (view?.run && !isActiveStatus(view.run.status) ? view.run : null)
  const summary = view ? lastSyncSummary(lastFinished, active) : 'Loading sync status…'
  const current = view?.month
  const previous = current ? previousHarvestSyncMonth(current.year, current.month) : null
  const blocked = !view || !view.agentOnline || view.agentPaused || Boolean(active) || starting
  const hint = !view
    ? null
    : !view.agentOnline
      ? 'The harvest agent is offline.'
      : view.agentPaused
        ? 'The harvest agent is paused.'
        : null
  const buttonLabel = active ? 'Syncing…' : 'Sync'

  return (
    <div className="group relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-200 hover:bg-slate-700 hover:text-white"
        aria-label={summary}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(Boolean(active), lastFinished)}`} />
        <span>{buttonLabel}</span>
      </button>
      {!open ? (
        <div className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-max max-w-xs rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-left text-xs leading-snug text-slate-100 shadow-lg group-hover:block">
          {summary}
        </div>
      ) : (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-slate-600 bg-slate-900 p-2 shadow-lg"
        >
          <p className="px-2 py-1.5 text-xs leading-snug text-slate-300">{summary}</p>
          {hint ? <p className="px-2 pb-1 text-xs text-amber-200">{hint}</p> : null}
          {error ? <p className="px-2 pb-1 text-xs text-red-300">{error}</p> : null}
          {current && previous ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={blocked}
                onClick={() => void startSync(current.year, current.month)}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent"
              >
                {current.label}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={blocked}
                onClick={() => void startSync(previous.year, previous.month)}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent"
              >
                {harvestSyncMonthLabel(previous.year, previous.month)}
              </button>
            </>
          ) : (
            <p className="px-2 py-1.5 text-sm text-slate-400">Loading…</p>
          )}
          <Link
            href="/settings/harvest-agent"
            prefetch={false}
            onClick={() => setOpen(false)}
            className="mt-1 block rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-100"
          >
            Harvest agent
          </Link>
        </div>
      )}
    </div>
  )
}
