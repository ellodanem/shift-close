'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  downloadPayPeriodExcel,
  formatDateDisplay,
  formatDateRange,
  payPeriodExcelFilename
} from '@/lib/pay-period-excel'

interface PayPeriodRow {
  staffId: string
  staffName: string
  transTtl: number
  vacation: string
  shortage: number
  sickLeaveDays?: number
  sickLeaveRanges?: string
}

interface PayPeriodData {
  id?: string
  startDate: string
  endDate: string
  reportDate: string
  entityName: string
  rows: PayPeriodRow[]
  notes?: string
  /** Parsed `rowsBeforeLastEdit` when editing/viewing a saved period — used for Trans Ttl “previous” hints. */
  previousRowsSnapshot?: PayPeriodRow[] | null
}

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Same wording as the saved-period row (for email subject). */
function formatSavedRowDateRange(start: string, end: string): string {
  return `${formatDateDisplay(start)} \u2013 ${formatDateDisplay(end)}`
}

function buildPayPeriodEmailHtml(data: PayPeriodData): string {
  const rows = data.rows
  const totalTrans = rows.reduce((s, r) => s + r.transTtl, 0)
  const totalShortage = rows.reduce((s, r) => s + r.shortage, 0)
  return `
        <h2>Summary Report</h2>
        <p><strong>Report Date:</strong> ${formatDateDisplay(data.reportDate)}</p>
        <p><strong>Date Range:</strong> ${formatDateRange(data.startDate, data.endDate)}</p>
        <p><strong>${data.entityName}</strong></p>
        ${(data.notes ?? '').trim() ? `<p style="white-space: pre-wrap;">${escapeHtml(data.notes ?? '')}</p>` : ''}
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
          <tr><th>Staff</th><th>Trans Ttl</th><th>Vacation</th><th>Sick Days</th><th>Sick Leave</th><th>Shortage</th></tr>
          ${rows
            .map(
              (r) =>
                `<tr><td>${r.staffName}</td><td>${r.transTtl.toFixed(2)}</td><td>${r.vacation}</td><td>${r.sickLeaveDays ?? 0}</td><td>${r.sickLeaveRanges ?? ''}</td><td>${r.shortage > 0 ? `$${r.shortage.toFixed(2)}` : ''}</td></tr>`
            )
            .join('')}
          <tr><td><strong>Total</strong></td><td><strong>${totalTrans.toFixed(1)}</strong></td><td></td><td><strong>${rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0)}</strong></td><td></td><td><strong>${totalShortage > 0 ? `$${totalShortage.toFixed(2)}` : ''}</strong></td></tr>
        </table>
      `
}

function parsePreviousRows(raw: string | null | undefined): PayPeriodRow[] | null {
  if (raw == null || !String(raw).trim()) return null
  try {
    const p = JSON.parse(raw) as PayPeriodRow[]
    return Array.isArray(p) ? p : null
  } catch {
    return null
  }
}

function resolvePreviousRow(
  prevRows: PayPeriodRow[] | null,
  staffId: string,
  index: number
): PayPeriodRow | undefined {
  if (!prevRows?.length) return undefined
  return prevRows.find((r) => r.staffId === staffId) ?? prevRows[index]
}

function formatShortageDisplay(n: number): string {
  return n > 0 ? `$${n.toFixed(2)}` : ''
}

function HoverPreviousValue({
  currentDisplay,
  previousDisplay,
  justify = 'start'
}: {
  currentDisplay: string
  previousDisplay: string | null
  justify?: 'start' | 'center' | 'end'
}) {
  const show = previousDisplay !== null && previousDisplay !== currentDisplay
  const flexCls =
    justify === 'end'
      ? 'flex justify-end'
      : justify === 'center'
        ? 'flex justify-center'
        : 'flex justify-start'
  const tipAlign =
    justify === 'end'
      ? 'right-0 left-auto translate-x-0'
      : justify === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0 translate-x-0'

  const prevTitle = show ? `Previously: ${previousDisplay}` : undefined

  if (!show) {
    return (
      <div className={`${flexCls} w-full min-h-[1.25rem]`}>
        <span>{currentDisplay}</span>
      </div>
    )
  }

  return (
    <div className={`${flexCls} w-full min-h-[1.25rem]`}>
      <span className="group relative inline-block">
        <span
          className="cursor-help border-b border-dotted border-gray-500"
          title={prevTitle}
        >
          {currentDisplay}
        </span>
        <span
          role="tooltip"
          className={`pointer-events-none absolute bottom-full mb-1 ${tipAlign} z-20 max-w-[min(20rem,calc(100vw-2rem))] whitespace-normal rounded-md bg-gray-900 px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100`}
        >
          Previously: {previousDisplay}
        </span>
      </span>
    </div>
  )
}

export default function PayPeriodPage() {
  const router = useRouter()
  const today = new Date()
  const defaultEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const twoWeeksAgo = new Date(today)
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
  const defaultStart = `${twoWeeksAgo.getFullYear()}-${String(twoWeeksAgo.getMonth() + 1).padStart(2, '0')}-${String(twoWeeksAgo.getDate()).padStart(2, '0')}`

  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [generating, setGenerating] = useState(false)
  const [reportData, setReportData] = useState<PayPeriodData | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedPeriods, setSavedPeriods] = useState<SavedPayPeriod[]>([])
  const [viewingPeriod, setViewingPeriod] = useState<SavedPayPeriod | null>(null)
  /** Open “compose email” modal for a saved pay period (send happens only from the modal). */
  const [emailModalData, setEmailModalData] = useState<PayPeriodData | null>(null)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailHtml, setEmailHtml] = useState('')
  const [emailPrefillLoading, setEmailPrefillLoading] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  /** When set, Save updates this record via PATCH instead of creating a new one. */
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null)

  const loadSavedPeriods = async () => {
    try {
      const res = await fetch('/api/attendance/pay-period')
      if (res.ok) {
        const data = await res.json()
        setSavedPeriods(data)
      }
    } catch {}
  }

  useEffect(() => {
    loadSavedPeriods()
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/attendance/pay-period/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate')
      }
      const data: PayPeriodData = await res.json()
      setReportData({ ...data, notes: data.notes ?? '', previousRowsSnapshot: null })
      setEditingSavedId(null)
      setShowModal(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate')
    } finally {
      setGenerating(false)
    }
  }

  const updateRow = (index: number, field: keyof PayPeriodRow, value: string | number) => {
    if (!reportData) return
    const rows = [...reportData.rows]
    rows[index] = { ...rows[index], [field]: value }
    setReportData({ ...reportData, rows })
  }

  const handleSave = async () => {
    if (!reportData) return
    const wasEditing = !!editingSavedId
    setSaving(true)
    try {
      const payload = {
        startDate: reportData.startDate,
        endDate: reportData.endDate,
        reportDate: reportData.reportDate,
        entityName: reportData.entityName,
        rows: reportData.rows,
        notes: reportData.notes ?? ''
      }
      const res = editingSavedId
        ? await fetch(`/api/attendance/pay-period/${editingSavedId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: payload.rows, notes: payload.notes })
          })
        : await fetch('/api/attendance/pay-period', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
      if (!res.ok) throw new Error('Failed to save')
      setShowConfirm(false)
      setShowModal(false)
      setReportData(null)
      setEditingSavedId(null)
      await loadSavedPeriods()
      alert(wasEditing ? 'Pay period updated successfully.' : 'Pay period saved successfully.')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const startEditFromSaved = (p: SavedPayPeriod) => {
    const rows = JSON.parse(p.rows) as PayPeriodRow[]
    setReportData({
      id: p.id,
      startDate: p.startDate,
      endDate: p.endDate,
      reportDate: p.reportDate,
      entityName: p.entityName,
      rows,
      notes: p.notes ?? '',
      previousRowsSnapshot: parsePreviousRows(p.rowsBeforeLastEdit)
    })
    setEditingSavedId(p.id)
    setShowConfirm(false)
    setShowModal(true)
  }

  const handlePrint = (data: PayPeriodData) => {
    const printWin = window.open('', '_blank')
    if (!printWin) return
    const rows = data.rows
    const totalTrans = rows.reduce((s, r) => s + r.transTtl, 0)
    const totalShortage = rows.reduce((s, r) => s + r.shortage, 0)
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Summary Report</title></head>
        <body style="font-family: system-ui; padding: 24px;">
          <h1 style="text-align: center; margin-bottom: 24px;">Summary Report</h1>
          <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
            <span>Report Date: ${formatDateDisplay(data.reportDate)}</span>
            <span>Date Range: ${formatDateRange(data.startDate, data.endDate)}</span>
          </div>
          <div style="font-weight: bold; margin-bottom: 16px;">${data.entityName}</div>
          ${(data.notes ?? '').trim() ? `<div style="margin-bottom: 16px; white-space: pre-wrap;">${escapeHtml(data.notes ?? '')}</div>` : ''}
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #000;">
                <th style="text-align: left; padding: 8px;">Staff</th>
                <th style="text-align: right; padding: 8px;">Trans Ttl</th>
                <th style="text-align: center; padding: 8px;">Vacation</th>
                <th style="text-align: right; padding: 8px;">Sick Days</th>
                <th style="text-align: left; padding: 8px;">Sick Leave</th>
                <th style="text-align: right; padding: 8px;">Shortage</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px;">${r.staffName}</td>
                  <td style="text-align: right; padding: 8px;">${r.transTtl.toFixed(2)}</td>
                  <td style="text-align: center; padding: 8px;">${r.vacation || ''}</td>
                  <td style="text-align: right; padding: 8px;">${r.sickLeaveDays ?? 0}</td>
                  <td style="text-align: left; padding: 8px;">${r.sickLeaveRanges ?? ''}</td>
                  <td style="text-align: right; padding: 8px;">${r.shortage > 0 ? `$${r.shortage.toFixed(2)}` : ''}</td>
                </tr>
              `).join('')}
              <tr style="border-top: 2px solid #000; font-weight: bold;">
                <td style="padding: 8px;">Total</td>
                <td style="text-align: right; padding: 8px;">${totalTrans.toFixed(1)}</td>
                <td style="padding: 8px;"></td>
                <td style="text-align: right; padding: 8px;">${rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0)}</td>
                <td style="padding: 8px;"></td>
                <td style="text-align: right; padding: 8px;">${totalShortage > 0 ? `$${totalShortage.toFixed(2)}` : ''}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `
    printWin.document.write(html)
    printWin.document.close()
    printWin.focus()
    setTimeout(() => { printWin.print(); printWin.close() }, 250)
  }

  const handleDownloadExcel = (data: PayPeriodData) => {
    downloadPayPeriodExcel(data)
  }

  const closePayPeriodEmailModal = () => {
    setEmailModalData(null)
    setEmailTo('')
    setEmailSubject('')
    setEmailHtml('')
  }

  const openPayPeriodEmailModal = async (data: PayPeriodData) => {
    if (!data.id) {
      alert('Save this pay period first, then use Email from the saved list.')
      return
    }
    setEmailPrefillLoading(true)
    try {
      const recipientsRes = await fetch('/api/email-recipients')
      const list = recipientsRes.ok ? await recipientsRes.json() : []
      const primary = Array.isArray(list) && list.length > 0 ? list[0] : null
      setEmailTo(primary?.email?.trim() ?? '')
      setEmailSubject(formatSavedRowDateRange(data.startDate, data.endDate))
      setEmailHtml(buildPayPeriodEmailHtml(data))
      setEmailModalData(data)
    } catch {
      alert('Could not load email recipients.')
    } finally {
      setEmailPrefillLoading(false)
    }
  }

  const sendPayPeriodEmailFromModal = async () => {
    if (!emailModalData?.id) return
    const to = emailTo.trim()
    if (!to) {
      alert('Enter a recipient email address.')
      return
    }
    const subject = emailSubject.trim()
    if (!subject) {
      alert('Enter a subject.')
      return
    }
    setEmailSending(true)
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
      alert(
        `Report emailed to ${to}. The default attendance log still follows the last saved pay period (not email).`
      )
      closePayPeriodEmailModal()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setEmailSending(false)
    }
  }

  const displayData: PayPeriodData | null = viewingPeriod
    ? {
        ...viewingPeriod,
        rows: JSON.parse(viewingPeriod.rows) as PayPeriodRow[],
        notes: viewingPeriod.notes ?? ''
      }
    : reportData

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance – Pay Period</h1>
            <p className="text-sm text-gray-600 mt-1">Generate and manage pay period summary reports.</p>
          </div>
          <button
            onClick={() => router.push('/attendance')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            ← Attendance
          </button>
        </div>

        {/* Generate section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate Pay Period</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {generating ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
        </div>

        {/* Past pay periods */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Saved Pay Periods</h2>
          {savedPeriods.length === 0 ? (
            <p className="text-gray-500 text-sm">No saved pay periods yet. Generate a report and save it.</p>
          ) : (
            <div className="space-y-2">
              {savedPeriods.map((p) => {
                const rows = JSON.parse(p.rows) as PayPeriodRow[]
                const data: PayPeriodData = { ...p, id: p.id, rows, notes: p.notes ?? '' }
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <span className="font-medium flex flex-wrap items-center gap-2">
                      {formatSavedRowDateRange(p.startDate, p.endDate)}
                      {p.emailSentAt && (
                        <span className="text-xs font-normal px-2 py-0.5 rounded bg-green-100 text-green-800">
                          Emailed
                        </span>
                      )}
                    </span>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <button
                        onClick={() => setViewingPeriod(viewingPeriod?.id === p.id ? null : p)}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                      >
                        {viewingPeriod?.id === p.id ? 'Hide' : 'View'}
                      </button>
                      <button
                        onClick={() => startEditFromSaved(p)}
                        className="px-3 py-1 text-sm bg-amber-100 text-amber-900 rounded hover:bg-amber-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handlePrint(data)}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                      >
                        Print
                      </button>
                      <button
                        onClick={() => handleDownloadExcel(data)}
                        className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded hover:bg-green-200"
                      >
                        Excel
                      </button>
                      <button
                        type="button"
                        onClick={() => void openPayPeriodEmailModal(data)}
                        disabled={emailPrefillLoading}
                        className="px-3 py-1 text-sm bg-indigo-100 text-indigo-800 rounded hover:bg-indigo-200 disabled:opacity-60"
                      >
                        {emailPrefillLoading ? '…' : 'Email'}
                      </button>
                      <button
                        disabled
                        title="Coming soon"
                        className="px-3 py-1 text-sm bg-slate-200 text-slate-500 rounded cursor-not-allowed"
                      >
                        WhatsApp
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {viewingPeriod && displayData && (() => {
            const prevRows = parsePreviousRows(viewingPeriod.rowsBeforeLastEdit)
            const totalTrans = displayData.rows.reduce((s, r) => s + r.transTtl, 0)
            const totalSick = displayData.rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0)
            const totalShort = displayData.rows.reduce((s, r) => s + r.shortage, 0)
            const prevTotalTrans = prevRows ? prevRows.reduce((s, r) => s + r.transTtl, 0) : null
            const prevTotalSick = prevRows ? prevRows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0) : null
            const prevTotalShort = prevRows ? prevRows.reduce((s, r) => s + r.shortage, 0) : null

            return (
            <div className="mt-6 overflow-visible p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-semibold mb-2">Summary Report</h3>
              <p className="text-sm text-gray-600 mb-2">
                Report Date: {formatDateDisplay(displayData.reportDate)} | Date Range: {formatDateRange(displayData.startDate, displayData.endDate)}
              </p>
              <p className="font-medium mb-2">{displayData.entityName}</p>
              <p className="text-xs text-gray-500 mb-2">
                Saved {new Date(viewingPeriod.createdAt).toLocaleString()}
                {viewingPeriod.updatedAt && new Date(viewingPeriod.updatedAt).getTime() !== new Date(viewingPeriod.createdAt).getTime() && (
                  <> · Last edited {new Date(viewingPeriod.updatedAt).toLocaleString()}</>
                )}
              </p>
              {prevRows && (
                <p className="text-xs text-amber-800 mb-2">
                  Underlined figures changed in the last save — hover to see the previous value.
                </p>
              )}
              {(displayData.notes ?? '').trim() ? (
                <p className="text-sm text-gray-800 mb-3 whitespace-pre-wrap border-l-2 border-gray-300 pl-3">{displayData.notes}</p>
              ) : null}
              <table className="w-full text-sm border-collapse overflow-visible">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2">Staff</th>
                    <th className="text-right py-2">Trans Ttl</th>
                    <th className="text-center py-2">Vacation</th>
                    <th className="text-right py-2">Sick Days</th>
                    <th className="text-left py-2">Sick Leave</th>
                    <th className="text-right py-2">Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.rows.map((r, i) => {
                    const prev = resolvePreviousRow(prevRows, r.staffId, i)
                    const curVac = (r.vacation ?? '').trim()
                    const prevVac = prev ? (prev.vacation ?? '').trim() : null
                    const curSickDays = String(r.sickLeaveDays ?? 0)
                    const prevSickDays = prev ? String(prev.sickLeaveDays ?? 0) : null
                    const curRanges = (r.sickLeaveRanges ?? '').trim()
                    const prevRanges = prev ? (prev.sickLeaveRanges ?? '').trim() : null
                    return (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-1">{r.staffName}</td>
                      <td className="text-right align-top">
                        <HoverPreviousValue
                          currentDisplay={r.transTtl.toFixed(2)}
                          previousDisplay={prev ? prev.transTtl.toFixed(2) : null}
                          justify="end"
                        />
                      </td>
                      <td className="text-center align-top">
                        <HoverPreviousValue
                          currentDisplay={curVac}
                          previousDisplay={prevVac}
                          justify="center"
                        />
                      </td>
                      <td className="text-right align-top">
                        <HoverPreviousValue
                          currentDisplay={curSickDays}
                          previousDisplay={prevSickDays}
                          justify="end"
                        />
                      </td>
                      <td className="text-left align-top text-gray-600">
                        <HoverPreviousValue
                          currentDisplay={curRanges}
                          previousDisplay={prevRanges}
                          justify="start"
                        />
                      </td>
                      <td className="text-right align-top">
                        <HoverPreviousValue
                          currentDisplay={formatShortageDisplay(r.shortage)}
                          previousDisplay={prev ? formatShortageDisplay(prev.shortage) : null}
                          justify="end"
                        />
                      </td>
                    </tr>
                  )})}
                  <tr className="font-bold border-t-2 border-gray-300">
                    <td className="py-2">Total</td>
                    <td className="text-right align-top">
                      <HoverPreviousValue
                        currentDisplay={totalTrans.toFixed(1)}
                        previousDisplay={prevTotalTrans !== null ? prevTotalTrans.toFixed(1) : null}
                        justify="end"
                      />
                    </td>
                    <td></td>
                    <td className="text-right align-top">
                      <HoverPreviousValue
                        currentDisplay={String(totalSick)}
                        previousDisplay={prevTotalSick !== null ? String(prevTotalSick) : null}
                        justify="end"
                      />
                    </td>
                    <td></td>
                    <td className="text-right align-top">
                      <HoverPreviousValue
                        currentDisplay={formatShortageDisplay(totalShort)}
                        previousDisplay={prevTotalShort !== null ? formatShortageDisplay(prevTotalShort) : null}
                        justify="end"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            )
          })()}
        </div>
      </div>

      {/* Editable modal */}
      {showModal && reportData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-center mb-2">Summary Report</h2>
              {editingSavedId && (
                <p className="text-center text-sm text-amber-800 mb-2">Editing saved pay period — Save will update this record.</p>
              )}
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Report Date: {formatDateDisplay(reportData.reportDate)}</span>
                <span>Date Range: {formatDateRange(reportData.startDate, reportData.endDate)}</span>
              </div>
              <p className="font-semibold mb-4">{reportData.entityName}</p>

              <table className="w-full text-sm border-collapse mb-6">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2">Staff</th>
                    <th className="text-right py-2 w-24">Trans Ttl</th>
                    <th className="text-center py-2 w-24">Vacation</th>
                    <th className="text-right py-2 w-20">Sick Days</th>
                    <th className="text-left py-2 min-w-[140px]">Sick Leave</th>
                    <th className="text-right py-2 w-28">Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map((r, i) => {
                    const prevRow = resolvePreviousRow(reportData.previousRowsSnapshot ?? null, r.staffId, i)
                    const transPrevTitle =
                      prevRow && prevRow.transTtl.toFixed(2) !== r.transTtl.toFixed(2)
                        ? `Previously: ${prevRow.transTtl.toFixed(2)}`
                        : undefined
                    return (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-1">{r.staffName}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={r.transTtl}
                          title={transPrevTitle}
                          onChange={(e) => updateRow(i, 'transTtl', parseFloat(e.target.value) || 0)}
                          className={`w-full text-right border border-gray-300 rounded px-2 py-1${transPrevTitle ? ' decoration-dotted underline decoration-gray-500' : ''}`}
                        />
                      </td>
                      <td className="text-center">
                        <input
                          type="text"
                          value={r.vacation}
                          onChange={(e) => updateRow(i, 'vacation', e.target.value)}
                          placeholder="********"
                          className="w-full text-center border border-gray-300 rounded px-2 py-1"
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          min={0}
                          value={r.sickLeaveDays ?? ''}
                          onChange={(e) => updateRow(i, 'sickLeaveDays', e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                          className="w-full text-right border border-gray-300 rounded px-2 py-1"
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={r.sickLeaveRanges ?? ''}
                          onChange={(e) => updateRow(i, 'sickLeaveRanges', e.target.value)}
                          placeholder="Mar 3 – Mar 5"
                          className="w-full border border-gray-300 rounded px-2 py-1 text-gray-600"
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={r.shortage || ''}
                          onChange={(e) => updateRow(i, 'shortage', parseFloat(e.target.value) || 0)}
                          className="w-full text-right border border-gray-300 rounded px-2 py-1"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  )})}
                  <tr className="font-bold border-t-2 border-gray-300">
                    <td className="py-2">Total</td>
                    <td className="text-right">{reportData.rows.reduce((s, r) => s + r.transTtl, 0).toFixed(1)}</td>
                    <td></td>
                    <td className="text-right">{reportData.rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0)}</td>
                    <td></td>
                    <td className="text-right">
                      {reportData.rows.reduce((s, r) => s + r.shortage, 0) > 0
                        ? `$${reportData.rows.reduce((s, r) => s + r.shortage, 0).toFixed(2)}`
                        : ''}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={reportData.notes ?? ''}
                  onChange={(e) => setReportData({ ...reportData, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="Internal notes for this pay period…"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowModal(false); setReportData(null); setEditingSavedId(null) }}
                  className="px-4 py-2 border border-gray-300 rounded font-medium hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save confirmation */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Save</h3>
            <p className="text-gray-600 mb-4">
              Please verify the information is correct before saving.
              {editingSavedId
                ? ' Saving will update this record and refresh the last-edited time.'
                : ' Once saved, this pay period can be reviewed and shared (print, email, download).'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded font-medium hover:bg-gray-50"
              >
                Go Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailModalData && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto my-4"
            role="dialog"
            aria-labelledby="pay-period-email-title"
          >
            <div className="p-6">
              <h3 id="pay-period-email-title" className="text-lg font-semibold text-gray-900 mb-1">
                Send pay period report
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Review or edit the message, then send. The same Excel file as the Excel button (
                <span className="font-mono text-xs">{payPeriodExcelFilename(emailModalData)}</span>) is attached
                automatically.
              </p>
              {!emailTo.trim() && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
                  No default recipient is set. Add one under Settings → Email recipients, or type an address below.
                </p>
              )}
              <div className="space-y-4">
                <div>
                  <label htmlFor="pay-period-email-to" className="block text-sm font-medium text-gray-700 mb-1">
                    To
                  </label>
                  <input
                    id="pay-period-email-to"
                    type="email"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    placeholder="accounting@example.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="pay-period-email-subject" className="block text-sm font-medium text-gray-700 mb-1">
                    Subject
                  </label>
                  <input
                    id="pay-period-email-subject"
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="pay-period-email-body" className="block text-sm font-medium text-gray-700 mb-1">
                    Message (HTML)
                  </label>
                  <textarea
                    id="pay-period-email-body"
                    value={emailHtml}
                    onChange={(e) => setEmailHtml(e.target.value)}
                    rows={14}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 justify-end mt-6">
                <button
                  type="button"
                  onClick={closePayPeriodEmailModal}
                  disabled={emailSending}
                  className="px-4 py-2 border border-gray-300 rounded font-medium hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void sendPayPeriodEmailFromModal()}
                  disabled={emailSending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 disabled:opacity-60"
                >
                  {emailSending ? 'Sending…' : 'Send email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
