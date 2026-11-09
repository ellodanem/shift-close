'use client'

import { useState, type ReactNode } from 'react'

export type ScanKind = 'deposit' | 'debit' | 'security'

type EmailDraft = { subject: string; body: string; urls: string[] }
type Recipient = { id: string; label: string; email: string }

const KIND_LABEL: Record<ScanKind, string> = {
  deposit: 'Deposit',
  debit: 'Debit',
  security: 'Security'
}

function toAbsoluteUrl(url: string): string {
  if (url.startsWith('http')) return url
  if (typeof window === 'undefined') return url
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * "Email these scans" dialog: pick a recipient from the saved list (or type one) and send the links.
 * Same behaviour as the email dialog on the current End of Day page.
 */
export function useScanEmail(): { openEmail: (date: string, kind: ScanKind, urls: string[]) => void; modal: ReactNode } {
  const [draft, setDraft] = useState<EmailDraft | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [toId, setToId] = useState('')
  const [other, setOther] = useState('')
  const [sending, setSending] = useState(false)

  const openEmail = (date: string, kind: ScanKind, urls: string[]) => {
    const links = urls.map(toAbsoluteUrl)
    const label = KIND_LABEL[kind]
    const noun = kind
    const subject = links.length > 1 ? `${label} Scans - ${date} (${links.length} files)` : `${label} Scan - ${date}`
    const body =
      links.length > 1
        ? `Please find the ${noun} scans from ${date}.\n\n${links.map((link, i) => `Scan ${i + 1}: ${link}`).join('\n')}`
        : `Please find the ${noun} scan from ${date}.\n\nLink: ${links[0]}`
    setDraft({ subject, body, urls: links })
    setToId('')
    setOther('')
    fetch('/api/email-recipients')
      .then((res) => res.json())
      .then((data) => {
        const raw = Array.isArray(data) ? data : []
        const list: Recipient[] = raw.map((r: { id: string; label?: string; email?: string }) => ({
          id: String(r.id),
          label: r.label ?? '',
          email: r.email ?? ''
        }))
        setRecipients(list)
        setToId(list.length > 0 ? list[0].id : 'other')
      })
      .catch(() => {
        setRecipients([])
        setToId('other')
      })
  }

  const close = () => setDraft(null)

  const send = async () => {
    if (!draft) return
    const to =
      other.trim() || (toId && toId !== 'other' ? recipients.find((r) => r.id === toId)?.email?.trim() : '') || ''
    if (!to) {
      alert('Choose a recipient from the list or enter an email address below.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: draft.subject,
          html: draft.body
            .replace(/\n/g, '<br>')
            .replace(/(https?:\/\/[^\s<>]+)/g, '<a href="$1">$1</a>')
        })
      })
      if (res.ok) {
        close()
        alert('Email sent.')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to send email')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to send email')
    } finally {
      setSending(false)
    }
  }

  const modal = draft ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Email scan</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Send to</label>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Choose a recipient…</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.email})
                </option>
              ))}
              <option value="other">Other (enter below)</option>
            </select>
            <div className="mt-2">
              <label className="mb-1 block text-xs text-gray-500">Or enter another email address</label>
              <input
                type="email"
                placeholder="e.g. someone@example.com"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Subject</label>
            <input
              type="text"
              value={draft.subject}
              onChange={(e) => setDraft((d) => (d ? { ...d, subject: e.target.value } : null))}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : null))}
              rows={4}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || (!other.trim() && (!toId || toId === 'other'))}
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { openEmail, modal }
}
