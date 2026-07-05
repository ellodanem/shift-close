'use client'

import { useEffect, useState } from 'react'
import {
  EmailRecipientOption,
  openWhatsAppWithMessage,
  pickDefaultRecipientId
} from '@/lib/scan-share'
import { buildWhatsAppStatementMessage } from '@/lib/customer-statement-pdf'
import { formatStatementDateRange, type AccountStatement, type StatementMode } from '@/lib/customer-statement'

type ExportFormat = 'pdf' | 'excel' | 'summary'

type Props = {
  open: boolean
  onClose: () => void
  account: string
  startDate: string
  endDate: string
  mode: StatementMode
  statement: AccountStatement | null
}

export default function ShareStatementModal({
  open,
  onClose,
  account,
  startDate,
  endDate,
  mode,
  statement
}: Props) {
  const [recipients, setRecipients] = useState<EmailRecipientOption[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [otherEmail, setOtherEmail] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const rangeLabel = formatStatementDateRange(startDate, endDate)
  const selectedRecipient = recipients.find((r) => r.id === recipientId)
  const mobileNumber = selectedRecipient?.mobileNumber

  useEffect(() => {
    if (!open) return
    setSubject(`Account Statement — ${account} (${rangeLabel})`)
    setMessage(
      `Please find attached your customer account statement for ${rangeLabel}.`
    )
    setFormat(mode === 'summary' ? 'summary' : 'pdf')
    fetch('/api/email-recipients')
      .then((res) => res.json())
      .then((data) => {
        const list: EmailRecipientOption[] = Array.isArray(data)
          ? data.map((r: EmailRecipientOption) => ({
              id: String(r.id),
              label: r.label ?? '',
              email: r.email ?? '',
              mobileNumber: r.mobileNumber ?? null
            }))
          : []
        setRecipients(list)
        const defaultId = pickDefaultRecipientId(list)
        setRecipientId(defaultId || (list.length > 0 ? list[0].id : 'other'))
        if (list.length === 0) setRecipientId('other')
      })
      .catch(() => {
        setRecipients([])
        setRecipientId('other')
      })
  }, [open, account, rangeLabel, mode])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const resolveToEmail = () =>
    otherEmail.trim() ||
    (recipientId && recipientId !== 'other'
      ? recipients.find((r) => r.id === recipientId)?.email?.trim()
      : '') ||
    ''

  const effectiveMode: StatementMode =
    format === 'summary' ? 'summary' : mode

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const base = `/api/customer-accounts/statement/${format === 'excel' ? 'excel' : 'pdf'}`
      const q = new URLSearchParams({
        account,
        startDate,
        endDate,
        mode: effectiveMode
      })
      const res = await fetch(`${base}?${q}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Download failed')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename =
        match?.[1] ||
        `statement-${account.replace(/\s+/g, '-')}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const handleSendEmail = async () => {
    const to = resolveToEmail()
    if (!to) {
      alert('Choose a recipient or enter an email address.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/customer-accounts/statement/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account,
          startDate,
          endDate,
          mode: effectiveMode,
          format,
          to,
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject,
          body: message
        })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to send email')
      alert(result.message || 'Statement sent.')
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  const handleWhatsApp = () => {
    if (!statement) {
      alert('Generate the statement first, then share via WhatsApp.')
      return
    }
    const text = buildWhatsAppStatementMessage(statement)
    openWhatsAppWithMessage(text, mobileNumber)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="mt-8 mb-8 w-full max-w-lg bg-white rounded-lg shadow-xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 py-4 rounded-t-lg bg-indigo-50/60">
          <h2 className="text-lg font-semibold text-gray-900">
            Send to {selectedRecipient?.label || account}
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {account} — {rangeLabel}
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
            {recipients.length > 0 ? (
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white"
              >
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.email})
                  </option>
                ))}
                <option value="other">Other…</option>
              </select>
            ) : null}
            {(recipientId === 'other' || recipients.length === 0) && (
              <input
                type="email"
                value={otherEmail}
                onChange={(e) => setOtherEmail(e.target.value)}
                placeholder="email@example.com"
                className={`w-full px-3 py-2 border border-gray-300 rounded text-sm ${recipients.length > 0 ? 'mt-2' : ''}`}
              />
            )}
            {mobileNumber && (
              <p className="text-xs text-gray-500 mt-1">WhatsApp: {mobileNumber}</p>
            )}
            <button
              type="button"
              onClick={() => setShowCcBcc((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 mt-1"
            >
              {showCcBcc ? 'Hide Cc/Bcc' : 'Cc/Bcc'}
            </button>
            {showCcBcc && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="Cc"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
                <input
                  type="text"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="Bcc"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Format</p>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="stmt-format"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                />
                PDF statement ({mode === 'detail' ? 'detail' : 'current view'})
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="stmt-format"
                  checked={format === 'excel'}
                  onChange={() => setFormat('excel')}
                />
                Excel export
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="stmt-format"
                  checked={format === 'summary'}
                  onChange={() => setFormat('summary')}
                />
                Summary only (monthly roll-forward PDF)
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleSendEmail()}
              disabled={sending}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send Email'}
            </button>
            <button
              type="button"
              onClick={handleWhatsApp}
              className="px-4 py-2 bg-green-50 text-green-800 border border-green-300 rounded text-sm font-semibold hover:bg-green-100"
            >
              Share via WhatsApp
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="px-4 py-2 bg-gray-100 text-gray-800 border border-gray-300 rounded text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
            >
              {downloading ? 'Downloading…' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 text-sm hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
