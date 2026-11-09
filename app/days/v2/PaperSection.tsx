'use client'

import { Fragment, useRef, useState } from 'react'
import { formatMoney } from '@/lib/day-reconcile'
import { confirmDeleteDayScan, deleteDayScan } from '@/lib/delete-day-scan'
import { slipTasksForDay, slipWaiverNote, type SlipTask, type SlipTaskId } from '@/lib/day-slip-tasks'
import type { DayReport } from '@/lib/types'
import DepositBreakdownModal from '../DepositBreakdownModal'
import OtherItemsBreakdownModal from '../OtherItemsBreakdownModal'
import { SecurityScanModal } from '../DaySlipTasks'
import { useScanEmail } from '../ScanEmailModal'

const LABEL: Record<SlipTaskId, string> = {
  deposit: 'Deposit slip',
  debit: 'Credit/Debit slip',
  security: 'Security slip'
}

const SHORT_LABEL: Record<SlipTaskId, string> = {
  deposit: 'Deposit',
  debit: 'Credit/Debit',
  security: 'Security'
}

function scanUrls(day: DayReport, id: SlipTaskId): string[] {
  if (id === 'deposit') return day.depositScans
  if (id === 'debit') return day.debitScans
  return day.securityScans ?? []
}

/** What a waived (marked done, no photo) slip says on its row. */
function waivedText(day: DayReport, task: SlipTask): string {
  if (task.id === 'deposit') {
    return day.depositSlipUnavailableReason === 'destroyed'
      ? 'Marked done: slip destroyed'
      : 'Marked done: slip missing'
  }
  const note = slipWaiverNote(day, task.id)
  return task.id === 'debit'
    ? note
      ? `Marked done: no slip (${note})`
      : 'Marked done: no slip'
    : note
      ? `Marked done: no pickup (${note})`
      : 'Marked done: no pickup'
}

function Dot({ filled }: { filled: boolean }) {
  return filled ? (
    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-600 align-middle" />
  ) : (
    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-gray-400 align-middle" />
  )
}

const LINK = 'text-sm font-medium text-blue-700 hover:underline disabled:opacity-50'

/**
 * Paper on an End of Day V2 card: one row per slip. Opens by itself when a slip is still needed,
 * and folds to a single "Slips filed" line once everything is in.
 */
export default function PaperSection({ day, onRefresh }: { day: DayReport; onRefresh: () => void }) {
  const tasks = slipTasksForDay(day)
  const allDone = tasks.every((t) => t.done)
  const [manual, setManual] = useState<boolean | null>(null)
  // Open by itself while a slip is missing; folded to one line once everything is filed.
  const expanded = !allDone || manual === true

  const [uploading, setUploading] = useState<SlipTaskId | null>(null)
  const [busy, setBusy] = useState(false)
  const [exceptionId, setExceptionId] = useState<SlipTaskId | null>(null)
  const [exceptionNote, setExceptionNote] = useState('')
  const [depositModal, setDepositModal] = useState<{ missingSlip: boolean; scans: boolean } | null>(null)
  const [otherItemsOpen, setOtherItemsOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const { openEmail, modal: emailModal } = useScanEmail()

  const depositInput = useRef<HTMLInputElement>(null)
  const debitInput = useRef<HTMLInputElement>(null)
  const securityInput = useRef<HTMLInputElement>(null)
  const inputFor = (id: SlipTaskId) => (id === 'deposit' ? depositInput : id === 'debit' ? debitInput : securityInput)

  if (tasks.length === 0) return null

  const uploadFiles = async (files: FileList | null, type: SlipTaskId) => {
    if (!files?.length) return
    setUploading(type)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('type', type)
        const res = await fetch(`/api/days/${day.date}/upload`, { method: 'POST', body: formData })
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

  const saveWaiver = async (kind: 'debit' | 'security', waived: boolean, note: string) => {
    setBusy(true)
    try {
      const path = kind === 'debit' ? 'debit-scan-waiver' : 'security-scan-waiver'
      const res = await fetch(`/api/days/${encodeURIComponent(day.date)}/${path}`, {
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
      setBusy(false)
    }
  }

  const removeSecurityScan = async (url: string) => {
    if (!confirmDeleteDayScan()) return
    setBusy(true)
    try {
      await deleteDayScan(day.date, url, 'security')
      onRefresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const openException = (task: SlipTask) => {
    if (task.id === 'deposit') {
      setDepositModal({ missingSlip: true, scans: false })
      return
    }
    setExceptionNote(task.id === 'debit' ? day.debitScanWaiverNote ?? '' : day.securityScanWaiverNote ?? '')
    setExceptionId(task.id)
  }

  const slipAmount = (id: SlipTaskId): string => {
    if (id === 'deposit') return formatMoney(day.totals.totalDeposits)
    if (id === 'debit') return `${formatMoney(day.totals.totalCredit)} credit + ${formatMoney(day.totals.totalDebit)} debit`
    return ''
  }

  const slipsLeft = tasks.filter((t) => !t.done).length

  return (
    <div>
      <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">
        Paper
        {slipsLeft > 0 ? (
          <span className="ml-2 text-xs font-semibold text-amber-800">
            {slipsLeft === 1 ? '1 slip still needed' : `${slipsLeft} slips still needed`}
          </span>
        ) : null}
      </h3>

      {!expanded ? (
        <div className="flex flex-wrap items-center border-b border-gray-200 py-2 text-sm">
          <Dot filled />
          <span className="font-semibold">Slips filed</span>
          <span className="ml-2 text-xs text-gray-500">
            {tasks
              .map((t) => `${SHORT_LABEL[t.id]} ${t.photoCount > 0 ? t.photoCount : 'none'}`)
              .join(' \u00b7 ')}
          </span>
          <button type="button" className={`ml-auto ${LINK}`} onClick={() => setManual(true)}>
            Open paper &#9662;
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="px-2 py-1 text-left font-normal">Slip</th>
                  <th className="px-2 py-1 text-right font-normal">On the slip, system says</th>
                  <th className="px-2 py-1 text-right font-normal">Photos</th>
                  <th className="px-2 py-1 text-right font-normal">Actions</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {tasks.map((task) => {
                  const urls = scanUrls(day, task.id)
                  const showException = exceptionId === task.id && task.id !== 'deposit'
                  return (
                    <Fragment key={task.id}>
                      <tr className={`border-b border-gray-100 ${task.done ? '' : 'bg-amber-50'}`}>
                        <td className="px-2 py-1.5 text-left">
                          <Dot filled={task.done} />
                          {LABEL[task.id]}
                          {task.photoCount === 0 && task.waived ? (
                            <span className="mt-0.5 block pl-[18px] text-xs text-gray-500">{waivedText(day, task)}</span>
                          ) : null}
                          {task.id === 'deposit' && day.missingDepositSlipAlertOpen && task.photoCount === 0 ? (
                            <span className="mt-0.5 block pl-[18px] text-xs text-amber-800">Missing slip flagged</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right">{slipAmount(task.id)}</td>
                        <td className="px-2 py-1.5 text-right">{task.photoCount}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            ref={inputFor(task.id)}
                            type="file"
                            accept="image/jpeg,image/png,image/jpg,application/pdf"
                            multiple
                            className="hidden"
                            onChange={(e) => void uploadFiles(e.target.files, task.id)}
                          />
                          {task.photoCount > 0 ? (
                            <span className="inline-flex flex-wrap items-center justify-end gap-x-3">
                              <button
                                type="button"
                                className={LINK}
                                disabled={uploading !== null}
                                onClick={() => inputFor(task.id).current?.click()}
                              >
                                {uploading === task.id ? 'Uploading…' : 'Add'}
                              </button>
                              <button
                                type="button"
                                className={LINK}
                                onClick={() => {
                                  if (task.id === 'deposit') setDepositModal({ missingSlip: false, scans: true })
                                  else if (task.id === 'debit') setOtherItemsOpen(true)
                                  else setSecurityOpen(true)
                                }}
                              >
                                {task.id === 'security' ? 'View' : 'Compare'}
                              </button>
                              <button type="button" className={LINK} onClick={() => openEmail(day.date, task.id, urls)}>
                                Email
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                              <button
                                type="button"
                                className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                disabled={uploading !== null}
                                onClick={() => inputFor(task.id).current?.click()}
                              >
                                {uploading === task.id ? 'Uploading…' : 'Take photo'}
                              </button>
                              {task.waived && task.id !== 'deposit' ? (
                                <button
                                  type="button"
                                  className={LINK}
                                  disabled={busy}
                                  onClick={() => void saveWaiver(task.id as 'debit' | 'security', false, '')}
                                >
                                  Undo, I have the slip
                                </button>
                              ) : (
                                <button type="button" className={LINK} onClick={() => openException(task)}>
                                  {task.id === 'deposit' && (task.waived || day.missingDepositSlipAlertOpen)
                                    ? 'Missing slip'
                                    : "I don't have this slip"}
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                      {showException ? (
                        <tr className="border-b border-gray-100">
                          <td colSpan={4} className="px-2 py-3 text-left">
                            <label className="block text-xs font-medium text-gray-600" htmlFor={`paper-note-${day.date}-${task.id}`}>
                              Optional note
                            </label>
                            <input
                              id={`paper-note-${day.date}-${task.id}`}
                              type="text"
                              className="mt-1 w-full max-w-xl rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder={task.id === 'debit' ? 'e.g. machine error, paper jam' : 'e.g. security did not come'}
                              value={exceptionNote}
                              disabled={busy}
                              onChange={(e) => setExceptionNote(e.target.value)}
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                                disabled={busy}
                                onClick={() => void saveWaiver(task.id as 'debit' | 'security', true, exceptionNote)}
                              >
                                {busy ? 'Saving…' : 'Mark done without a slip'}
                              </button>
                              <button
                                type="button"
                                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:underline"
                                disabled={busy}
                                onClick={() => setExceptionId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {allDone ? (
            <button type="button" className={`mt-2 ${LINK}`} onClick={() => setManual(false)}>
              Hide paper &#9652;
            </button>
          ) : null}
        </>
      )}

      {emailModal}
      {depositModal ? (
        <DepositBreakdownModal
          date={day.date}
          dayReport={day}
          depositScanUrls={day.depositScans}
          onClose={() => setDepositModal(null)}
          onSaved={onRefresh}
          startWithMissingSlip={depositModal.missingSlip}
          startWithScans={depositModal.scans}
        />
      ) : null}
      {otherItemsOpen ? (
        <OtherItemsBreakdownModal
          date={day.date}
          dayReport={day}
          debitScanUrls={day.debitScans}
          onClose={() => setOtherItemsOpen(false)}
          onSaved={onRefresh}
          startWithScans
        />
      ) : null}
      {securityOpen ? (
        <SecurityScanModal
          urls={day.securityScans ?? []}
          onClose={() => setSecurityOpen(false)}
          onDelete={(url) => void removeSecurityScan(url)}
          deleting={busy}
        />
      ) : null}
    </div>
  )
}