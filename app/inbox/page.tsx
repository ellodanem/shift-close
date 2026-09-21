'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import ComposeMailModal from './ComposeMailModal'
import {
  INBOX_MAILBOXES,
  SAMPLE_INBOX_THREADS,
  statusLabel,
  type ComposeMode,
  type InboxMailboxId,
  type InboxQueueStatus,
  type InboxThread
} from '@/lib/inbox-sample'

type QueueFilter = 'open' | 'mine' | 'waiting' | 'done' | 'all'

type LiveMailbox = {
  id: string
  key: string
  label: string
  enabled: boolean
  hasPassword: boolean
  lastSyncAt: string | null
  lastSyncError: string | null
}

function mapLiveThread(raw: {
  id: string
  subject: string
  mailboxId: string
  mailboxLabel: string
  topic: string
  status: string
  assignee: string | null
  unread: boolean
  preview: string
  when: string
  messages: Array<{
    id: string
    from: { name: string; email: string }
    to: Array<{ name: string; email: string }>
    cc: Array<{ name: string; email: string }>
    sentAt: string
    body: string
    attachments?: Array<{ id?: string; name: string; sizeLabel: string; url?: string }>
  }>
}): InboxThread {
  return {
    id: raw.id,
    subject: raw.subject,
    mailboxId: (raw.mailboxId as InboxMailboxId) || 'station',
    mailboxLabel: raw.mailboxLabel,
    topic: raw.topic as InboxThread['topic'],
    status: raw.status as InboxQueueStatus,
    assignee: raw.assignee,
    unread: raw.unread,
    preview: raw.preview,
    when: raw.when,
    messages: raw.messages.map((m) => ({
      id: m.id,
      from: m.from,
      to: m.to,
      cc: m.cc,
      sentAt: m.sentAt,
      body: m.body,
      attachments: m.attachments?.map((a) => ({
        name: a.name,
        sizeLabel: a.sizeLabel,
        id: a.id,
        url: a.url
      }))
    }))
  }
}

export default function InboxPage() {
  const [queue, setQueue] = useState<QueueFilter>('open')
  const [mailboxFilter, setMailboxFilter] = useState<InboxMailboxId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<'loading' | 'live' | 'sample'>('loading')
  const [liveThreads, setLiveThreads] = useState<InboxThread[]>([])
  const [mailboxes, setMailboxes] = useState<LiveMailbox[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('compose')
  const [statuses, setStatuses] = useState<Record<string, InboxQueueStatus>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setSyncMsg(null)
    try {
      const [threadsRes, boxesRes] = await Promise.all([
        fetch(`/api/inbox/threads?queue=all`),
        fetch('/api/inbox/mailboxes')
      ])
      const threadsData = await threadsRes.json()
      const boxesData = await boxesRes.json()
      setMailboxes(boxesData.mailboxes || [])

      if (threadsRes.ok && Array.isArray(threadsData.threads) && threadsData.threads.length > 0) {
        const mapped = threadsData.threads.map(mapLiveThread)
        setLiveThreads(mapped)
        setSource('live')
        setOpenCount(threadsData.openCount ?? mapped.filter((t: InboxThread) => t.status !== 'done').length)
        setStatuses(Object.fromEntries(mapped.map((t: InboxThread) => [t.id, t.status])))
        setSelectedId((prev) => prev || mapped[0]?.id || '')
      } else {
        setLiveThreads([])
        setSource('sample')
        setOpenCount(SAMPLE_INBOX_THREADS.filter((t) => t.status !== 'done').length)
        setStatuses(Object.fromEntries(SAMPLE_INBOX_THREADS.map((t) => [t.id, t.status])))
        setSelectedId((prev) => prev || SAMPLE_INBOX_THREADS[0]?.id || '')
      }
    } catch {
      setSource('sample')
      setLiveThreads([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const baseThreads = source === 'live' ? liveThreads : SAMPLE_INBOX_THREADS

  const threads = useMemo(() => {
    return baseThreads
      .map((t) => ({ ...t, status: statuses[t.id] ?? t.status }))
      .filter((t) => {
        if (mailboxFilter !== 'all' && t.mailboxId !== mailboxFilter) return false
        if (queue === 'open') return t.status !== 'done'
        if (queue === 'waiting') return t.status === 'waiting'
        if (queue === 'done') return t.status === 'done'
        if (queue === 'mine') {
          return t.status !== 'done' && (t.status === 'assigned' || t.status === 'new' || Boolean(t.assignee))
        }
        return true
      })
      .filter((t) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        const hay = `${t.subject} ${t.preview} ${t.topic} ${t.messages.map((m) => m.from.name).join(' ')}`
        return hay.toLowerCase().includes(q)
      })
  }, [queue, mailboxFilter, search, statuses, baseThreads])

  const selected: InboxThread | null =
    threads.find((t) => t.id === selectedId) ?? threads[0] ?? null

  const openCompose = (mode: ComposeMode) => {
    setComposeMode(mode)
    setComposeOpen(true)
  }

  const syncNow = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/inbox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setSyncMsg(`Imported ${data.imported} new message(s).`)
      await load()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const setStatus = async (threadId: string, status: InboxQueueStatus) => {
    setStatuses((prev) => ({ ...prev, [threadId]: status }))
    if (source === 'live') {
      await fetch('/api/inbox/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: threadId, status, unread: status === 'done' ? false : undefined })
      })
    }
  }

  const needsSetup = mailboxes.length > 0 && !mailboxes.some((m) => m.enabled && m.hasPassword)

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col px-3 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Westline · {mailboxes.length || INBOX_MAILBOXES.length} mailboxes · {openCount} need action
            {source === 'sample' ? (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                Sample data — connect mailboxes to go live
              </span>
            ) : source === 'live' ? (
              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Live sync
              </span>
            ) : null}
          </p>
          {syncMsg ? <p className="mt-1 text-xs text-gray-600">{syncMsg}</p> : null}
          {needsSetup ? (
            <p className="mt-1 text-xs text-amber-800">
              Add IMAP app passwords in{' '}
              <Link href="/settings/inbox-mailboxes" className="font-medium underline">
                Settings → Inbox mailboxes
              </Link>
              , enable, then Sync.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mail…"
            className="w-44 rounded-md border border-gray-300 px-3 py-1.5 text-sm sm:w-56"
          />
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <Link
            href="/settings/inbox-mailboxes"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Mailboxes
          </Link>
          <button
            type="button"
            onClick={() => openCompose('compose')}
            className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800"
          >
            Compose
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1.15fr)]">
        <aside className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Queues</p>
          <div className="flex flex-col gap-1">
            {(
              [
                ['open', 'All open'],
                ['mine', 'Needs me'],
                ['waiting', 'Waiting'],
                ['done', 'Done'],
                ['all', 'Everything']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setQueue(id)}
                className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
                  queue === id ? 'bg-violet-100 font-medium text-violet-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Mailboxes</p>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setMailboxFilter('all')}
              className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
                mailboxFilter === 'all' ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              All mailboxes
            </button>
            {(mailboxes.length
              ? mailboxes.map((m) => ({ id: m.key as InboxMailboxId, label: m.label }))
              : INBOX_MAILBOXES.map((m) => ({ id: m.id, label: m.label }))
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMailboxFilter(m.id)}
                className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
                  mailboxFilter === m.id
                    ? 'bg-gray-100 font-medium text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
          {source === 'loading' ? (
            <p className="p-6 text-sm text-gray-500">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No threads in this queue.</p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-y-auto">
              {threads.map((t) => {
                const active = selected?.id === t.id
                const from = t.messages[t.messages.length - 1]?.from.name ?? 'Unknown'
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`block w-full px-3 py-3 text-left transition-colors ${
                        active ? 'bg-violet-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-sm ${t.unread ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>
                          {from}
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">{t.when}</span>
                      </div>
                      <p className={`mt-0.5 text-sm ${t.unread ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                        {t.subject}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{t.preview}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
                          {t.topic}
                        </span>
                        <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600">
                          {statusLabel(t.status)}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
          {!selected ? (
            <p className="p-6 text-sm text-gray-500">Select a thread</p>
          ) : (
            <>
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900">{selected.subject}</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {selected.mailboxLabel}
                      {selected.assignee ? ` · Assigned ${selected.assignee}` : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <ActionButton onClick={() => openCompose('reply')}>Reply</ActionButton>
                    <ActionButton onClick={() => openCompose('replyAll')} primary>
                      Reply all
                    </ActionButton>
                    <ActionButton onClick={() => openCompose('forward')}>Forward</ActionButton>
                    <ActionButton
                      onClick={() =>
                        void setStatus(
                          selected.id,
                          (statuses[selected.id] ?? selected.status) === 'done' ? 'assigned' : 'done'
                        )
                      }
                    >
                      {(statuses[selected.id] ?? selected.status) === 'done' ? 'Reopen' : 'Done'}
                    </ActionButton>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {selected.messages.map((m) => (
                  <article key={m.id} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {m.from.name}{' '}
                        <span className="font-normal text-gray-500">&lt;{m.from.email}&gt;</span>
                      </p>
                      <time className="text-xs text-gray-400">{m.sentAt}</time>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      To: {m.to.map((p) => p.email).join(', ')}
                      {m.cc.length ? ` · Cc: ${m.cc.map((p) => p.email).join(', ')}` : ''}
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-gray-800">{m.body}</pre>
                    {m.attachments?.length ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {m.attachments.map((a) => {
                          const href =
                            (a as { url?: string; id?: string }).url ||
                            ((a as { id?: string }).id
                              ? `/api/inbox/attachments/${(a as { id: string }).id}`
                              : undefined)
                          return (
                            <li key={a.name + a.sizeLabel}>
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50"
                                >
                                  {a.name} · {a.sizeLabel}
                                  <span className="text-violet-500">View</span>
                                </a>
                              ) : (
                                <span className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500">
                                  {a.name} · {a.sizeLabel} (sample)
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                  </article>
                ))}

                {selected.linkedWork ? (
                  <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
                      Linked in Shift Close
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-900">{selected.linkedWork.label}</p>
                    <p className="text-sm text-gray-600">{selected.linkedWork.detail}</p>
                    {selected.linkedWork.href ? (
                      <Link
                        href={selected.linkedWork.href}
                        className="mt-2 inline-block text-sm font-medium text-violet-700 hover:underline"
                      >
                        Open record
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      <ComposeMailModal
        open={composeOpen}
        mode={composeMode}
        thread={composeMode === 'compose' ? null : selected}
        onClose={() => setComposeOpen(false)}
      />
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  primary
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? 'rounded-md bg-violet-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-800'
          : 'rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50'
      }
    >
      {children}
    </button>
  )
}
