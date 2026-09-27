'use client'

import { useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import { formatCurrency } from '@/lib/format'
import { pdfIframeSrc } from '@/lib/pdf-iframe-src'
import { slipTasksForDay, type SlipTask, type SlipTaskId } from '@/lib/day-slip-tasks'
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

function bagLine(day: DayReport): string {
  const seen = new Set<string>()
  const bags: string[] = []
  for (const shift of day.shifts) {
    for (const raw of shift.depositBagNumbers ?? []) {
      const bag = String(raw).trim()
      if (!bag || seen.has(bag)) continue
      seen.add(bag)
      bags.push(bag)
    }
  }
  if (bags.length === 0) return 'No bag number on the shifts'
  if (bags.length === 1) return `Bag ${bags[0]}`
  return `Bags ${bags.join(', ')}`
}

function rowSubtitle(day: DayReport, id: SlipTaskId): string {
  if (id === 'deposit') return bagLine(day)
  if (id === 'debit') {
    return `Credit ${formatCurrency(day.totals.totalCredit)} · Debit ${formatCurrency(day.totals.totalDebit)}`
  }
  return ROW_COPY.security.fallback
}

function statusLine(day: DayReport, task: SlipTask): { text: string; tone: 'green' | 'amber' | 'muted' } {
  if (task.photoCount > 0) {
    const noun = task.photoCount === 1 ? 'photo' : 'photos'
    return { text: `${task.photoCount} ${noun} added`, tone: 'green' }
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

function scanUrls(day: DayReport, id: ScanKind): string[] {
  if (id === 'deposit') return day.depositScans
  if (id === 'debit') return day.debitScans
  return day.securityScans ?? []
}

export function DayDetailsSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-gray-200">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-600 hover:bg-gray-50"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span aria-hidden>{open ? '▼' : '▶'}</span>
        Details — money, fuel, shifts, review deposits, export
      </button>
      {open ? <div className="border-t border-gray-100">{children}</div> : null}
    </div>
  )
}

export default function DaySlipTasks({
  dayReport,
  onRefresh,
  onEmail,
  onMissingDepositSlip
}: {
  dayReport: DayReport
  onRefresh: () => void
  onEmail: (kind: ScanKind) => void
  onMissingDepositSlip: () => void
}) {
  const tasks = slipTasksForDay(dayReport)
  const [compareId, setCompareId] = useState<ScanKind | null>(null)
  const [uploading, setUploading] = useState<ScanKind | null>(null)
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
    if (!window.confirm('Delete this file? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/days/${dayReport.date}/upload`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(typeof err.error === 'string' ? err.error : 'Delete failed')
        return
      }
      onRefresh()
    } catch {
      alert('Delete failed')
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

  if (tasks.length === 0) {
    return (
      <div className="border-t border-gray-200 px-4 py-4">
        <p className="text-sm text-gray-600">No slips needed for this day.</p>
      </div>
    )
  }

  const remaining = tasks.filter((task) => !task.done).length

  return (
    <div className="border-t border-gray-200 px-4 py-4">
      <h3 className="font-semibold text-gray-900">
        {remaining === 0 ? 'Slips filed' : 'Take a photo of each slip'}
      </h3>
      <p className="mt-0.5 text-sm text-gray-500">
        {remaining === 0
          ? 'Compare or email a pile if you need to.'
          : 'Match the paper in your hand, then take the photo.'}
      </p>

      <div className="mt-3 space-y-3">
        {tasks.map((task, index) => {
          const status = statusLine(dayReport, task)
          const compareOpen = compareId === task.id
          const showException = exceptionId === task.id && task.id !== 'deposit'
          return (
            <div
              key={task.id}
              className={`rounded-lg border border-gray-200 border-l-4 bg-white ${
                task.done ? 'border-l-green-500' : 'border-l-amber-400'
              }`}
            >
              <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-gray-300 text-xs font-semibold text-gray-700">
                      {index + 1}
                    </span>
                    <p className="font-semibold text-gray-900">{ROW_COPY[task.id].title}</p>
                  </div>
                  <p className="mt-1 pl-8 text-sm text-gray-600">{rowSubtitle(dayReport, task.id)}</p>
                  {status.text ? (
                    <p
                      className={`mt-0.5 pl-8 text-sm font-medium ${
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
                      className="mt-1 pl-8 text-sm font-medium text-blue-700 hover:underline"
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
                        className="mt-1 pl-8 text-sm font-medium text-blue-700 hover:underline"
                        disabled={savingException}
                        onClick={() => void saveWaiver(task.id as 'debit' | 'security', false, '')}
                      >
                        Undo — I have the slip
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mt-1 pl-8 text-sm font-medium text-blue-700 hover:underline"
                        onClick={() => openException(task)}
                      >
                        I don&apos;t have this slip
                      </button>
                    )
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
                      className="rounded-md border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      disabled={uploading !== null}
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
                  {task.photoCount > 0 ? (
                    <button
                      type="button"
                      className={`rounded-md px-4 py-2 text-sm font-semibold ${
                        compareOpen
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'border border-blue-600 text-blue-700 hover:bg-blue-50'
                      }`}
                      aria-pressed={compareOpen}
                      onClick={() => setCompareId(compareOpen ? null : task.id)}
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
              </div>

              {showException ? (
                <div className="border-t border-gray-100 px-3 py-3 sm:pl-11">
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

              {compareOpen && task.id === 'deposit' ? (
                <DepositCompare
                  dayReport={dayReport}
                  urls={scanUrls(dayReport, 'deposit')}
                  onDelete={(url) => void deleteUrl(url, 'deposit')}
                  onMissingDepositSlip={onMissingDepositSlip}
                />
              ) : null}
              {compareOpen && task.id === 'debit' ? (
                <CardCompare
                  dayReport={dayReport}
                  urls={scanUrls(dayReport, 'debit')}
                  onDelete={(url) => void deleteUrl(url, 'debit')}
                />
              ) : null}
              {compareOpen && task.id === 'security' ? (
                <div className="border-t border-gray-100">
                  <ScanPane
                    heading="Security scans"
                    urls={scanUrls(dayReport, 'security')}
                    onDelete={(url) => void deleteUrl(url, 'security')}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DepositCompare({
  dayReport,
  urls,
  onDelete,
  onMissingDepositSlip
}: {
  dayReport: DayReport
  urls: string[]
  onDelete: (url: string) => void
  onMissingDepositSlip: () => void
}) {
  return (
    <div className="grid border-t border-gray-100 md:grid-cols-2">
      <div className="space-y-4 p-3 sm:p-4">
        {dayReport.shifts.map((shift) => {
          const deposits = Array.isArray(shift.deposits) ? shift.deposits : []
          const lines = deposits
            .map((amount, index) => ({ amount, index }))
            .filter((line) => line.amount > 0)
          if (lines.length === 0) return null
          const bags = (shift.depositBagNumbers ?? []).map((bag) => String(bag).trim()).filter(Boolean)
          return (
            <div key={shift.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-gray-900">
                  {shift.shift} · {shift.supervisor}
                </p>
              </div>
              {bags.length > 0 ? (
                <p className="font-mono text-xs text-gray-500">Bag {bags.join(', ')}</p>
              ) : null}
              <div className="mt-1 space-y-1">
                {lines.map((line) => (
                  <div key={line.index} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-gray-600">Deposit {line.index + 1}</span>
                    <span className="font-medium tabular-nums text-gray-900">{formatCurrency(line.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2">
          <span className="font-semibold text-gray-900">Grand total</span>
          <span className="font-bold tabular-nums text-gray-900">
            {formatCurrency(dayReport.totals.totalDeposits)}
          </span>
        </div>
        <button
          type="button"
          className="text-sm font-medium text-blue-700 hover:underline"
          onClick={onMissingDepositSlip}
        >
          Missing slip
        </button>
      </div>
      <ScanPane heading="Deposit scans" urls={urls} onDelete={onDelete} />
    </div>
  )
}

function CardCompare({
  dayReport,
  urls,
  onDelete
}: {
  dayReport: DayReport
  urls: string[]
  onDelete: (url: string) => void
}) {
  return (
    <div className="grid border-t border-gray-100 md:grid-cols-2">
      <div className="space-y-4 p-3 sm:p-4">
        {dayReport.shifts.map((shift) => (
          <div key={shift.id}>
            <p className="font-semibold text-gray-900">
              {shift.shift} · {shift.supervisor}
            </p>
            <div className="mt-1 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-600">Credit</span>
                <span className="font-medium tabular-nums">{formatCurrency(shift.otherCredit)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-600">Debit</span>
                <span className="font-medium tabular-nums">{formatCurrency(shift.systemDebit)}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="space-y-1 border-t border-gray-200 pt-2 text-sm">
          <div className="flex justify-between gap-3 font-semibold">
            <span>Day total — Credit</span>
            <span className="tabular-nums">{formatCurrency(dayReport.totals.totalCredit)}</span>
          </div>
          <div className="flex justify-between gap-3 font-semibold">
            <span>Day total — Debit</span>
            <span className="tabular-nums">{formatCurrency(dayReport.totals.totalDebit)}</span>
          </div>
        </div>
      </div>
      <ScanPane heading="Card machine scans" urls={urls} onDelete={onDelete} />
    </div>
  )
}

function ScanPane({
  heading,
  urls,
  onDelete
}: {
  heading: string
  urls: string[]
  onDelete: (url: string) => void
}) {
  const [index, setIndex] = useState(0)
  const safeIndex = urls.length === 0 ? 0 : Math.min(index, urls.length - 1)
  const url = urls[safeIndex] ?? null

  return (
    <div className="border-t border-gray-100 bg-slate-50 md:border-l md:border-t-0">
      <div className="px-3 py-2 sm:px-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{heading}</p>
        {urls.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">No photos yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {urls.map((scanUrl, scanIndex) => (
              <button
                key={`${scanUrl}-${scanIndex}`}
                type="button"
                onClick={() => setIndex(scanIndex)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  scanIndex === safeIndex
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {urls.length > 1 ? `Scan ${scanIndex + 1}` : 'Scan'}
              </button>
            ))}
          </div>
        )}
      </div>
      {url ? (
        <>
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2 sm:px-4">
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
                className="text-xs font-semibold text-red-700 hover:underline"
                onClick={() => onDelete(url)}
              >
                Remove
              </button>
            </span>
          </div>
          <div className="min-h-[240px] bg-slate-200/80">
            <iframe src={pdfIframeSrc(url)} className="h-72 w-full border-0" title={`${heading} scan ${safeIndex + 1}`} />
          </div>
        </>
      ) : null}
    </div>
  )
}
