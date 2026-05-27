'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ATTENDANCE_VIEWER_PATH,
  ATTENDANCE_VIEWER_PAY_PERIOD_PATH,
  canAccessAttendanceViewer
} from '@/lib/attendance-viewer'
import { useAuth } from '@/app/components/AuthContext'
import {
  buildPayPeriodEmailHtml,
  formatSavedPayPeriodDateRange,
  payPeriodReportDefaultTo
} from '@/lib/pay-period-email'
import {
  downloadPayPeriodExcel,
  formatDateDisplay,
  formatDateRange,
  payPeriodExcelFilename,
  type PayPeriodExcelData,
  type PayPeriodExcelRow
} from '@/lib/pay-period-excel'
import { printPayPeriodReport } from '@/lib/pay-period-print'
import { parsePayPeriodPreviousRows } from '@/lib/pay-period-rows'
import MobilePayPeriodEdit, { type MobileEditDraft } from './MobilePayPeriodEdit'

interface SavedPayPeriod {
  id: string
  startDate: string
  endDate: string
  reportDate: string
  entityName: string
  rows: string
  rowsBeforeLastEdit?: string | null
  notes: string
  createdAt: string
  updatedAt: string
  emailSentAt: string | null
}

type PayPeriodData = PayPeriodExcelData & { id: string }

function formatShortage(n: number): string {
  return n > 0 ? `$${n.toFixed(2)}` : ''
}

const pprActionBtn =
  'min-h-[44px] w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.98]'

export default function MobilePayPeriodPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const canView = user ? canAccessAttendanceViewer(user.role) : false

  const [savedPeriods, setSavedPeriods] = useState<SavedPayPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [emailModalData, setEmailModalData] = useState<PayPeriodData | null>(null)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailHtml, setEmailHtml] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<MobileEditDraft | null>(null)

  const loadSavedPeriods = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/attendance/pay-period', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load pay periods')
      }
      setSavedPeriods(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pay periods')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(ATTENDANCE_VIEWER_PAY_PERIOD_PATH)}`)
      return
    }
    if (!canView) {
      router.replace('/dashboard')
    }
  }, [authLoading, user, canView, router])

  useEffect(() => {
    if (!user || !canView) return
    void loadSavedPeriods()
  }, [user, canView, loadSavedPeriods])

  const startEdit = (p: SavedPayPeriod) => {
    setStatusMessage(null)
    const rows = JSON.parse(p.rows) as PayPeriodExcelRow[]
    setEditDraft({
      id: p.id,
      startDate: p.startDate,
      endDate: p.endDate,
      reportDate: p.reportDate,
      entityName: p.entityName,
      rows,
      notes: p.notes ?? '',
      previousRowsSnapshot: parsePayPeriodPreviousRows(p.rowsBeforeLastEdit)
    })
  }

  const toPayPeriodData = (p: SavedPayPeriod): PayPeriodData => ({
    id: p.id,
    startDate: p.startDate,
    endDate: p.endDate,
    reportDate: p.reportDate,
    entityName: p.entityName,
    rows: JSON.parse(p.rows) as PayPeriodExcelRow[],
    notes: p.notes ?? ''
  })

  const closeEmailModal = () => {
    setEmailModalData(null)
    setEmailTo('')
    setEmailSubject('')
    setEmailHtml('')
  }

  const openEmailModal = (data: PayPeriodData) => {
    setStatusMessage(null)
    setEmailTo(payPeriodReportDefaultTo())
    setEmailSubject(formatSavedPayPeriodDateRange(data.startDate, data.endDate))
    setEmailHtml(buildPayPeriodEmailHtml(data))
    setEmailModalData(data)
  }

  const sendEmail = async () => {
    if (!emailModalData?.id) return
    const to = emailTo.trim()
    if (!to) {
      setStatusMessage('Enter a recipient email address.')
      return
    }
    const subject = emailSubject.trim()
    if (!subject) {
      setStatusMessage('Enter a subject.')
      return
    }
    setEmailSending(true)
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/attendance/pay-period/${emailModalData.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html: emailHtml.trim() || undefined
        })
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        const msg = typeof errBody.error === 'string' ? errBody.error : 'Failed to send email'
        throw new Error(msg)
      }
      await loadSavedPeriods()
      setStatusMessage(`Report emailed to ${to}.`)
      closeEmailModal()
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Failed to send email')
    } finally {
      setEmailSending(false)
    }
  }

  if (authLoading || (!user && !error)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <p className="text-sm text-slate-300">Loading…</p>
      </div>
    )
  }

  if (editDraft) {
    return (
      <MobilePayPeriodEdit
        draft={editDraft}
        onCancel={() => setEditDraft(null)}
        onSaved={async () => {
          setEditDraft(null)
          await loadSavedPeriods()
          setStatusMessage('Pay period updated.')
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-700/80 bg-slate-900/95 backdrop-blur px-4 py-3">
        <div className="flex items-start justify-between gap-3 max-w-lg mx-auto">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Pay period reports</h1>
            <p className="text-xs text-slate-400 mt-0.5">Saved reports only — generate in the full app</p>
          </div>
          <Link
            href={ATTENDANCE_VIEWER_PATH}
            className="text-xs font-medium text-blue-300 hover:text-blue-200 px-2 py-1 rounded-md hover:bg-slate-800 shrink-0"
          >
            ← Attendance
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-10 pt-4">
        {statusMessage && !emailModalData ? (
          <p className="mb-3 text-sm text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 rounded-lg px-3 py-2">
            {statusMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void loadSavedPeriods()}
          disabled={loading}
          className="w-full mb-4 rounded-lg border border-slate-600 bg-slate-800 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh list'}
        </button>

        {loading && savedPeriods.length === 0 ? (
          <p className="text-sm text-slate-400">Loading saved reports…</p>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : savedPeriods.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-sm text-slate-300">
            No saved pay period reports yet. Open the full app → Attendance → Pay Period to generate and save a
            report, then return here to email or download it.
          </div>
        ) : (
          <ul className="space-y-3">
            {savedPeriods.map((p) => {
              const data = toPayPeriodData(p)
              const expanded = expandedId === p.id
              const totalTrans = data.rows.reduce((s, r) => s + r.transTtl, 0)
              const totalShort = data.rows.reduce((s, r) => s + r.shortage, 0)
              return (
                <li
                  key={p.id}
                  className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden"
                >
                  <div className="px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : p.id)}
                        className="text-left flex-1 min-w-0"
                      >
                        <p className="font-medium text-slate-100">
                          {formatSavedPayPeriodDateRange(p.startDate, p.endDate)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Report {formatDateDisplay(p.reportDate)}
                          {p.emailSentAt ? (
                            <span className="ml-2 text-emerald-400">· Emailed</span>
                          ) : null}
                        </p>
                      </button>
                      <span className="text-[10px] text-slate-500 shrink-0 pt-0.5">
                        {expanded ? '▼' : '▶'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : p.id)}
                        className={`${pprActionBtn} bg-slate-700 text-slate-200 hover:bg-slate-600`}
                      >
                        {expanded ? 'Hide' : 'View'}
                      </button>
                      <button
                        type="button"
                        onClick={() => printPayPeriodReport(data)}
                        className={`${pprActionBtn} bg-blue-900/50 text-blue-200 hover:bg-blue-900`}
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadPayPeriodExcel(data)}
                        className={`${pprActionBtn} bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/60`}
                      >
                        Excel
                      </button>
                      <button
                        type="button"
                        onClick={() => openEmailModal(data)}
                        className={`${pprActionBtn} bg-indigo-900/50 text-indigo-200 hover:bg-indigo-900`}
                      >
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className={`${pprActionBtn} col-span-2 bg-amber-900/45 text-amber-100 border border-amber-700/50 hover:bg-amber-900/65`}
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="border-t border-slate-700 px-3 py-3 bg-slate-800/60">
                      <p className="text-xs text-slate-400 mb-2">
                        {data.entityName} · {formatDateRange(data.startDate, data.endDate)}
                      </p>
                      {(data.notes ?? '').trim() ? (
                        <p className="text-xs text-slate-300 mb-3 whitespace-pre-wrap border-l-2 border-slate-600 pl-2">
                          {data.notes}
                        </p>
                      ) : null}
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full min-w-[28rem] text-xs">
                          <thead>
                            <tr className="border-b border-slate-600 text-slate-400">
                              <th className="text-left py-1 pr-2 font-medium">Staff</th>
                              <th className="text-right py-1 px-1 font-medium">Trans</th>
                              <th className="text-center py-1 px-1 font-medium">Vac</th>
                              <th className="text-right py-1 px-1 font-medium">Sick</th>
                              <th className="text-left py-1 px-1 font-medium">Leave</th>
                              <th className="text-right py-1 pl-1 font-medium">Short</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.rows.map((r, i) => (
                              <tr key={i} className="border-b border-slate-700/80">
                                <td className="py-1.5 pr-2 text-slate-200">{r.staffName}</td>
                                <td className="py-1.5 text-right tabular-nums">{r.transTtl.toFixed(2)}</td>
                                <td className="py-1.5 text-center">{r.vacation || '—'}</td>
                                <td className="py-1.5 text-right tabular-nums">{r.sickLeaveDays ?? 0}</td>
                                <td className="py-1.5 text-slate-400 max-w-[6rem] truncate">
                                  {r.sickLeaveRanges || '—'}
                                </td>
                                <td className="py-1.5 text-right tabular-nums">
                                  {formatShortage(r.shortage) || '—'}
                                </td>
                              </tr>
                            ))}
                            <tr className="font-semibold text-slate-100">
                              <td className="py-2 pr-2">Total</td>
                              <td className="py-2 text-right tabular-nums">{totalTrans.toFixed(1)}</td>
                              <td className="py-2" />
                              <td className="py-2 text-right tabular-nums">
                                {data.rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0)}
                              </td>
                              <td className="py-2" />
                              <td className="py-2 text-right tabular-nums">
                                {formatShortage(totalShort) || '—'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {emailModalData ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-0 sm:p-4">
          <div
            className="bg-slate-800 border border-slate-600 rounded-t-xl sm:rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl"
            role="dialog"
            aria-labelledby="mobile-ppr-email-title"
          >
            <div className="p-4 pb-6">
              <h3 id="mobile-ppr-email-title" className="text-base font-semibold text-white">
                Send pay period report
              </h3>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                Sent from Shift Close (not your phone&apos;s mail app). Excel attachment:{' '}
                <span className="font-mono">{payPeriodExcelFilename(emailModalData)}</span>
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="mobile-ppr-email-to" className="block text-xs font-medium text-slate-300 mb-1">
                    To
                  </label>
                  <input
                    id="mobile-ppr-email-to"
                    type="text"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    className="w-full border border-slate-600 rounded-lg px-3 py-2 text-sm bg-slate-900 text-slate-100"
                    placeholder={payPeriodReportDefaultTo()}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label
                    htmlFor="mobile-ppr-email-subject"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Subject
                  </label>
                  <input
                    id="mobile-ppr-email-subject"
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full border border-slate-600 rounded-lg px-3 py-2 text-sm bg-slate-900 text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="mobile-ppr-email-body" className="block text-xs font-medium text-slate-300 mb-1">
                    Message (HTML)
                  </label>
                  <textarea
                    id="mobile-ppr-email-body"
                    value={emailHtml}
                    onChange={(e) => setEmailHtml(e.target.value)}
                    rows={10}
                    className="w-full border border-slate-600 rounded-lg px-3 py-2 text-xs font-mono bg-slate-900 text-slate-100"
                    spellCheck={false}
                  />
                </div>
              </div>
              {statusMessage ? (
                <p className="mt-3 text-sm text-amber-300">{statusMessage}</p>
              ) : null}
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={closeEmailModal}
                  disabled={emailSending}
                  className="flex-1 rounded-lg border border-slate-600 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void sendEmail()}
                  disabled={emailSending}
                  className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {emailSending ? 'Sending…' : 'Send email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
