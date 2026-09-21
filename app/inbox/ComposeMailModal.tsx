'use client'

import { FormEvent, useEffect, useState, type ReactNode } from 'react'
import {
  INBOX_MAILBOXES,
  type ComposeMode,
  type InboxMailboxId,
  type InboxThread,
  buildComposeDraft
} from '@/lib/inbox-sample'

export type ComposeMailModalProps = {
  open: boolean
  mode: ComposeMode
  thread: InboxThread | null
  onClose: () => void
  onSent?: () => void
}

const MODE_TITLE: Record<ComposeMode, string> = {
  compose: 'New message',
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward'
}

export default function ComposeMailModal({ open, mode, thread, onClose, onSent }: ComposeMailModalProps) {
  const [fromMailboxId, setFromMailboxId] = useState<InboxMailboxId>('station')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentOk, setSentOk] = useState(false)

  useEffect(() => {
    if (!open) return
    const draft = buildComposeDraft(mode, thread)
    setFromMailboxId(draft.fromMailboxId)
    setTo(draft.to)
    setCc(draft.cc)
    setBcc(draft.bcc)
    setSubject(draft.subject)
    setBody(draft.body)
    setShowCc(Boolean(draft.cc) || mode === 'replyAll' || mode === 'compose')
    setShowBcc(Boolean(draft.bcc))
    setError(null)
    setSentOk(false)
  }, [open, mode, thread])

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSentOk(false)
    if (!to.trim()) {
      setError('To is required')
      return
    }
    if (!subject.trim()) {
      setError('Subject is required')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: subject.trim(),
          text: body,
          html: body
            .split('\n')
            .map((line) => `<div>${escapeHtml(line) || '<br/>'}</div>`)
            .join('')
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to send')
        return
      }
      setSentOk(true)
      onSent?.()
      window.setTimeout(() => onClose(), 700)
    } catch {
      setError('Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-mail-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 id="compose-mail-title" className="text-base font-semibold text-gray-900">
            {MODE_TITLE[mode]}
            {thread ? (
              <span className="ml-2 text-sm font-normal text-gray-500">· {thread.mailboxLabel}</span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-0 overflow-y-auto border-b border-gray-100 px-4 py-2">
            <FieldRow label="From">
              <select
                value={fromMailboxId}
                onChange={(e) => setFromMailboxId(e.target.value as InboxMailboxId)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                {INBOX_MAILBOXES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {m.address}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Send uses the station SMTP identity today. Per-mailbox send-as arrives with mailbox sync.
              </p>
            </FieldRow>

            <FieldRow label="To">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="name@example.com, …"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  autoFocus
                />
                <div className="flex shrink-0 gap-1">
                  {!showCc ? (
                    <button
                      type="button"
                      className="rounded px-2 text-xs font-medium text-violet-700 hover:bg-violet-50"
                      onClick={() => setShowCc(true)}
                    >
                      Cc
                    </button>
                  ) : null}
                  {!showBcc ? (
                    <button
                      type="button"
                      className="rounded px-2 text-xs font-medium text-violet-700 hover:bg-violet-50"
                      onClick={() => setShowBcc(true)}
                    >
                      Bcc
                    </button>
                  ) : null}
                </div>
              </div>
            </FieldRow>

            {showCc ? (
              <FieldRow label="Cc">
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@example.com, …"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </FieldRow>
            ) : null}

            {showBcc ? (
              <FieldRow label="Bcc">
                <input
                  type="text"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="bcc@example.com, …"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </FieldRow>
            ) : null}

            <FieldRow label="Subject">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </FieldRow>
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className="min-h-[220px] flex-1 resize-y px-4 py-3 text-sm text-gray-900 outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
            <div className="min-h-[1.25rem] text-sm">
              {error ? <span className="text-red-600">{error}</span> : null}
              {sentOk ? <span className="text-emerald-700">Sent</span> : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={sending}
                className="rounded-md bg-violet-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-gray-100 py-2 last:border-0">
      <span className="w-14 shrink-0 pt-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
