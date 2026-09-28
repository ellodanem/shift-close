'use client'

import Link from 'next/link'
import { useRef, useState, type Ref, type RefObject } from 'react'
import { OS_REVIEW_THRESHOLD } from '@/lib/calculations'
import { confirmDeleteDayScan, deleteDayScan } from '@/lib/delete-day-scan'
import { formatCurrency } from '@/lib/format'
import { pdfIframeSrc } from '@/lib/pdf-iframe-src'
import { IconDebitCard, IconDepositSlip, IconShield } from '@/app/components/IconDropdown'
import {
  slipIconTone,
  slipTasksForDay,
  slipWaiverNote,
  type SlipIconTone,
  type SlipTask,
  type SlipTaskId
} from '@/lib/day-slip-tasks'
import type { DayReport } from '@/lib/types'

type ScanKind = SlipTaskId

const ROW_COPY: Record<
  SlipTaskId,
  { title: string; fallback: string }
> = {
  deposit: { title: 'Deposit slip', fallback: 'Night deposit slip' },
  debit: { title: 'Card machine slip', fallback: 'Credit and debit batch slip' },
  security: { title: 'Security slip', fallback: 'Pickup receipt for this deposit' }
}

function statusLine(day: DayReport, task: SlipTask): { text: string; tone: 'green' | 'amber' | 'muted' } {
  if (task.photoCount > 0) {
    const noun = task.photoCount === 1 ? 'photo' : 'photos'
    return { text: `${task.photoCount} ${noun}`, tone: 'green' }
  }
  if (task.id === 'deposit' && day.missingDepositSlipAlertOpen) {
    return { text: 'Missing slip flagged', tone: 'amber' }
  }
  if (task.waived && task.id === 'deposit') {
    return {
      text:
        day.depositSlipUnavailableReason === 'destroyed'
          ? 'Marked done — slip destroyed'
          : 'Marked done — slip missing',
      tone: 'amber'
    }
  }
  if (task.waived && task.id === 'debit') {
    const note = (day.debitScanWaiverNote ?? '').trim()
    return { text: note ? `Marked done — no slip (${note})` : 'Marked done — no slip', tone: 'amber' }
  }
  if (task.waived && task.id === 'security') {
    const note = (day.securityScanWaiverNote ?? '').trim()
    return {
      text: note ? `Marked done — no pickup (${note})` : 'Marked done — no pickup',
      tone: 'amber'
    }
  }
  return { text: '', tone: 'muted' }
}

function slipIconClass(id: SlipTaskId, tone?: SlipIconTone): string {
  if (tone === 'uploaded') return 'h-7 w-7 text-green-600'
  if (tone === 'noted') return 'h-7 w-7 text-yellow-600'
  if (tone === 'missing') return 'h-7 w-7 text-gray-400'
  if (id === 'deposit') return 'h-7 w-7 text-blue-600'
  if (id === 'debit') return 'h-7 w-7 text-violet-600'
  return 'h-7 w-7 text-green-600'
}

function SlipIcon({ id, tone }: { id: SlipTaskId; tone?: SlipIconTone }) {
  const className = slipIconClass(id, tone)
  if (id === 'deposit') return <IconDepositSlip className={className} />
  if (id === 'debit') return <IconDebitCard className={className} />
  return <IconShield className={className} />
}

function slipIconTitle(day: DayReport, task: SlipTask, tone: SlipIconTone): string {
  const name = task.id === 'deposit' ? 'Deposit slip' : task.id === 'debit' ? 'Card machine slip' : 'Security slip'
  if (tone === 'uploaded') {
    const noun = task.photoCount === 1 ? 'photo' : 'photos'
    return `${name} — ${task.photoCount} ${noun}`
  }
  if (tone === 'noted') return `${name} — ${slipWaiverNote(day, task.id)}`
  if (task.id === 'deposit' && (day.missingDepositSlipAlertOpen || day.depositSlipUnavailableReason === 'missing')) {
    return `${name} — missing`
  }
  return `${name} — not uploaded`
}

export function CollapsedSlipIcons({ dayReport }: { dayReport: DayReport }) {
  const tasks = slipTasksForDay(dayReport)
  if (tasks.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      {tasks.map((task) => {
        const tone = slipIconTone(dayReport, task)
        return (
          <span key={task.id} title={slipIconTitle(dayReport, task, tone)} className="inline-flex">
            <SlipIcon id={task.id} tone={tone} />
          </span>
        )
      })}
    </div>
  )
}

function scanUrls(day: DayReport, id: ScanKind): string[] {
  if (id === 'deposit') return day.depositScans
  if (id === 'debit') return day.debitScans
  return day.securityScans ?? []
}

export default function DaySlipTasks({
  dayReport,
  onRefresh,
  onEmail,
  onMissingDepositSlip,
  onCompare,
  reviewHref,
  onExport,
  onOpenShift
}: {
  dayReport: DayReport
  onRefresh: () => void
  onEmail: (kind: ScanKind) => void
  onMissingDepositSlip: () => void
  onCompare: (kind: 'deposit' | 'debit') => void
  reviewHref: string
  onExport: () => void
  onOpenShift: (shiftId: string) => void
}) {
  const tasks = slipTasksForDay(dayReport)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [uploading, setUploading] = useState<ScanKind | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exceptionId, setExceptionId] = useState<ScanKind | null>(null)
  const [exceptionNote, setExceptionNote] = useState('')
  const [savingException, setSavingException] = useState(false)
  const depositInput = useRef<HTMLInputElement>(null)
  const debitInput = useRef<HTMLInputElement>(null)
  const securityInput = useRef<HTMLInputElement>(null)

  const inputFor = (id: ScanKind): RefObject<HTMLInputElement | null> => {
    if (id === 'deposit') return depositInput
    if (id === 'debit') return debitInput
    return securityInput
  }

  const uploadFiles = async (files: FileList | null, type: ScanKind) => {
    if (!files?.length) return
    setUploading(type)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('type', type)
        const res = await fetch(`/api/days/${dayReport.date}/upload`, { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(typeof err.error === 'string' ? err.error : 'Upload failed')
        }
      }
      onRefresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(null)
      const input = inputFor(type).current
      if (input) input.value = ''
    }
  }

  const deleteUrl = async (url: string, type: ScanKind) => {
    if (!confirmDeleteDayScan()) return
    setDeleting(true)
    try {
      await deleteDayScan(dayReport.date, url, type)
      onRefresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const saveWaiver = async (kind: 'debit' | 'security', waived: boolean, note: string) => {
    setSavingException(true)
    try {
      const path = kind === 'debit' ? 'debit-scan-waiver' : 'security-scan-waiver'
      const res = await fetch(`/api/days/${encodeURIComponent(dayReport.date)}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waived, note })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.error === 'string' ? err.error : 'Save failed')
      }
      setExceptionId(null)
      onRefresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save')
    } finally {
      setSavingException(false)
    }
  }

  const openException = (task: SlipTask) => {
    if (task.id === 'deposit') {
      onMissingDepositSlip()
      return
    }
    const existing =
      task.id === 'debit' ? dayReport.debitScanWaiverNote ?? '' : dayReport.securityScanWaiverNote ?? ''
    setExceptionNote(existing)
    setExceptionId(task.id)
  }

  return (
    <div>
      {tasks.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-600">No slips needed for this day.</p>
      ) : (
      <div className="grid grid-cols-1 divide-y divide-gray-200 border-t border-gray-200 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {tasks.map((task) => {
          const status = statusLine(dayReport, task)
          const showException = exceptionId === task.id && task.id !== 'deposit'
          return (
            <div
              key={task.id}
              className={`flex flex-col gap-3 px-5 py-5 ${task.done ? 'bg-white' : 'bg-amber-50/50'}`}
            >
              <div className={`h-1 w-12 rounded-full ${task.done ? 'bg-green-500' : 'bg-amber-400'}`} />
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center">
                  <SlipIcon id={task.id} />
                </span>
                <p className="font-semibold text-gray-900">{ROW_COPY[task.id].title}</p>
              </div>
              {task.id === 'deposit' ? (
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(dayReport.totals.totalDeposits)}</p>
              ) : null}
              {task.id === 'debit' ? (
                <div className="flex gap-8">
                  <div>
                    <p className="text-sm text-gray-500">Credit</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(dayReport.totals.totalCredit)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Debit</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(dayReport.totals.totalDebit)}</p>
                  </div>
                </div>
              ) : null}
              {task.id === 'security' ? (
                <p className="text-sm text-gray-600">{ROW_COPY.security.fallback}</p>
              ) : null}
              {status.text ? (
                <p
                  className={`text-sm font-medium ${
                    status.tone === 'green'
                      ? 'text-green-700'
                      : status.tone === 'amber'
                        ? 'text-amber-800'
                        : 'text-gray-500'
                  }`}
                >
                  {status.text}
                </p>
              ) : null}
              {task.photoCount === 0 && task.id === 'deposit' ? (
                <button
                  type="button"
                  className="w-fit text-sm font-medium text-blue-700 hover:underline"
                  onClick={onMissingDepositSlip}
                >
                  {task.waived || dayReport.missingDepositSlipAlertOpen
                    ? 'Missing slip'
                    : "I don't have this slip"}
                </button>
              ) : null}
              {task.photoCount === 0 && task.id !== 'deposit' && !showException ? (
                task.waived ? (
                  <button
                    type="button"
                    className="w-fit text-sm font-medium text-blue-700 hover:underline"
                    disabled={savingException}
                    onClick={() => void saveWaiver(task.id as 'debit' | 'security', false, '')}
                  >
                    Undo — I have the slip
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-fit text-sm font-medium text-blue-700 hover:underline"
                    onClick={() => openException(task)}
                  >
                    I don&apos;t have this slip
                  </button>
                )
              ) : null}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  <input
                    ref={inputFor(task.id) as Ref<HTMLInputElement>}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(event) => void uploadFiles(event.target.files, task.id)}
                  />
                  {task.photoCount > 0 ? (
                    <button
                      type="button"
                      className="px-1 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
                      disabled={uploading !== null || deleting}
                      onClick={() => inputFor(task.id).current?.click()}
                    >
                      {uploading === task.id ? 'Uploading…' : 'Add photo'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      disabled={uploading !== null}
                      onClick={() => inputFor(task.id).current?.click()}
                    >
                      {uploading === task.id ? 'Uploading…' : 'Take photo'}
                    </button>
                  )}
                  {task.photoCount === 1 ? (
                    <button
                      type="button"
                      className="px-1 text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                      disabled={deleting || uploading !== null}
                      onClick={() => {
                        const url = scanUrls(dayReport, task.id)[0]
                        if (url) void deleteUrl(url, task.id)
                      }}
                    >
                      {deleting ? 'Removing…' : 'Remove photo'}
                    </button>
                  ) : null}
                  {task.photoCount > 0 ? (
                    <button
                      type="button"
                      className="rounded-md border border-blue-600 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                      onClick={() => {
                        if (task.id === 'security') setSecurityOpen(true)
                        else onCompare(task.id)
                      }}
                    >
                      {task.id === 'security' ? 'View' : 'Compare'}
                    </button>
                  ) : null}
                  {task.photoCount > 0 ? (
                    <button
                      type="button"
                      className="px-1 text-sm font-medium text-blue-700 hover:underline"
                      onClick={() => onEmail(task.id)}
                    >
                      Email
                    </button>
                  ) : null}
                </div>

              {showException ? (
                <div className="border-t border-gray-200 pt-3">
                  <label className="block text-xs font-medium text-gray-600" htmlFor={`slip-note-${dayReport.date}-${task.id}`}>
                    Optional note
                  </label>
                  <input
                    id={`slip-note-${dayReport.date}-${task.id}`}
                    type="text"
                    className="mt-1 w-full max-w-xl rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder={
                      task.id === 'debit' ? 'e.g. machine error, paper jam' : 'e.g. security did not come'
                    }
                    value={exceptionNote}
                    disabled={savingException}
                    onChange={(event) => setExceptionNote(event.target.value)}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                      disabled={savingException}
                      onClick={() => void saveWaiver(task.id as 'debit' | 'security', true, exceptionNote)}
                    >
                      {savingException ? 'Saving…' : 'Mark done without a slip'}
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:underline"
                      disabled={savingException}
                      onClick={() => setExceptionId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

            </div>
          )
        })}
      </div>
      )}
      <DayFacts
        dayReport={dayReport}
        reviewHref={reviewHref}
        onExport={onExport}
        onOpenShift={onOpenShift}
      />
      {securityOpen ? (
        <SecurityScanModal
          urls={scanUrls(dayReport, 'security')}
          onClose={() => setSecurityOpen(false)}
          onDelete={(url) => void deleteUrl(url, 'security')}
          deleting={deleting}
        />
      ) : null}
    </div>
  )
}

function gallons(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function DayFacts({
  dayReport,
  reviewHref,
  onExport,
  onOpenShift
}: {
  dayReport: DayReport
  reviewHref: string
  onExport: () => void
  onOpenShift: (shiftId: string) => void
}) {
  const flagged = dayReport.shifts.filter((shift) => shift.hasRedFlag)
  const short = dayReport.totals.overShortTotal
  const shortClass =
    flagged.length > 0
      ? 'text-red-600'
      : Math.abs(short) <= OS_REVIEW_THRESHOLD
        ? 'text-green-700'
        : short > 0
          ? 'text-blue-700'
          : 'text-red-600'

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 border-t-4 border-slate-400 bg-slate-100 px-5 py-5">
      <Fact label="Counted" value={formatCurrency(dayReport.totals.countCashTotal)} />
      <Fact label="System" value={formatCurrency(dayReport.totals.systemCashTotal)} />
      <Fact label="Short" value={formatCurrency(short)} valueClass={`text-2xl ${shortClass}`} />
      {flagged.length > 0 ? (
        <button
          type="button"
          className="mb-0.5 text-red-600 hover:text-red-700"
          aria-label="Red flag"
          title="Red flag"
          onClick={() => onOpenShift(flagged[0].id)}
        >
          <RedFlagIcon />
        </button>
      ) : null}
      <div className={`flex items-end gap-x-6 ${flagged.length > 0 ? 'ml-10' : ''}`}>
        <Fact label="Unleaded" value={gallons(dayReport.totals.totalUnleaded)} />
        <Fact label="Diesel" value={gallons(dayReport.totals.totalDiesel)} />
      </div>
      <span className="ml-auto flex items-center gap-2">
        <Link
          href={reviewHref}
          className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm font-semibold text-blue-800 hover:bg-blue-100"
        >
          Review deposits
        </Link>
        <button
          type="button"
          onClick={onExport}
          className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Export Excel
        </button>
      </span>
    </div>
  )
}

function RedFlagIcon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M6 2.75v18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 3.5h12.2L14.4 8.2 18.2 13H6V3.5z" fill="currentColor" />
    </svg>
  )
}

function Fact({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold leading-tight text-gray-950 ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}

function SecurityScanModal({
  urls,
  onClose,
  onDelete,
  deleting
}: {
  urls: string[]
  onClose: () => void
  onDelete: (url: string) => void
  deleting: boolean
}) {
  const [index, setIndex] = useState(0)
  const safeIndex = urls.length === 0 ? 0 : Math.min(index, urls.length - 1)
  const url = urls[safeIndex] ?? null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div
        className="flex h-[94vh] w-full max-w-[min(96vw,1200px)] flex-col overflow-hidden rounded-lg border-2 border-gray-300 bg-gray-50 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-scan-modal-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-gray-300 px-4 py-3 sm:px-6">
          <h3 id="security-scan-modal-title" className="text-base font-semibold text-gray-900 sm:text-lg">
            Security slip
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="px-1 text-2xl font-bold leading-none text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Security scans</p>
          {urls.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {urls.map((scanUrl, scanIndex) => (
                <button
                  key={`${scanUrl}-${scanIndex}`}
                  type="button"
                  onClick={() => setIndex(scanIndex)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    scanIndex === safeIndex
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {urls.length > 1 ? `Scan ${scanIndex + 1}` : 'Scan'}
                </button>
              ))}
              {url ? (
                <button
                  type="button"
                  className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  disabled={deleting}
                  onClick={() => onDelete(url)}
                >
                  {deleting ? 'Removing…' : 'Remove'}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-600">No photos yet.</p>
          )}
        </div>
        {url ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
              <span className="text-xs text-slate-600">
                Scan {safeIndex + 1} of {urls.length}
              </span>
              <span className="flex items-center gap-3">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
                  disabled={deleting}
                  onClick={() => onDelete(url)}
                >
                  {deleting ? 'Removing…' : 'Remove'}
                </button>
              </span>
            </div>
            <div className="min-h-0 flex-1 bg-slate-200/80">
              <iframe
                src={pdfIframeSrc(url)}
                className="h-full min-h-[50vh] w-full border-0"
                title={`Security scan ${safeIndex + 1}`}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
