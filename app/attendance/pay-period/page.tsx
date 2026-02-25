'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

interface PayPeriodRow {
  staffId: string
  staffName: string
  transTtl: number
  vacation: string
  shortage: number
}

interface PayPeriodData {
  startDate: string
  endDate: string
  reportDate: string
  entityName: string
  rows: PayPeriodRow[]
}

interface SavedPayPeriod {
  id: string
  startDate: string
  endDate: string
  reportDate: string
  entityName: string
  rows: string
  createdAt: string
}

function formatDateDisplay(d: string): string {
  const [y, m, day] = d.split('-')
  const date = new Date(parseInt(y!), parseInt(m!) - 1, parseInt(day!))
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T23:59:59')
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 0:00 To ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 23:59`
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
  const [emailing, setEmailing] = useState(false)

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
      setReportData(data)
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
    setSaving(true)
    try {
      const res = await fetch('/api/attendance/pay-period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: reportData.startDate,
          endDate: reportData.endDate,
          reportDate: reportData.reportDate,
          entityName: reportData.entityName,
          rows: reportData.rows
        })
      })
      if (!res.ok) throw new Error('Failed to save')
      setShowConfirm(false)
      setShowModal(false)
      setReportData(null)
      await loadSavedPeriods()
      alert('Pay period saved successfully.')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
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
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #000;">
                <th style="text-align: left; padding: 8px;">Staff</th>
                <th style="text-align: right; padding: 8px;">Trans Ttl</th>
                <th style="text-align: center; padding: 8px;">Vacation</th>
                <th style="text-align: right; padding: 8px;">Shortage</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px;">${r.staffName}</td>
                  <td style="text-align: right; padding: 8px;">${r.transTtl.toFixed(2)}</td>
                  <td style="text-align: center; padding: 8px;">${r.vacation || ''}</td>
                  <td style="text-align: right; padding: 8px;">${r.shortage > 0 ? `$${r.shortage.toFixed(2)}` : ''}</td>
                </tr>
              `).join('')}
              <tr style="border-top: 2px solid #000; font-weight: bold;">
                <td style="padding: 8px;">Total</td>
                <td style="text-align: right; padding: 8px;">${totalTrans.toFixed(1)}</td>
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
    const rows = data.rows
    const totalTrans = rows.reduce((s, r) => s + r.transTtl, 0)
    const totalShortage = rows.reduce((s, r) => s + r.shortage, 0)
    const wsData = [
      ['Summary Report'],
      ['Report Date:', formatDateDisplay(data.reportDate)],
      ['Date Range:', formatDateRange(data.startDate, data.endDate)],
      [data.entityName],
      [],
      ['Staff', 'Trans Ttl', 'Vacation', 'Shortage'],
      ...rows.map(r => [r.staffName, r.transTtl, r.vacation, r.shortage > 0 ? r.shortage : '']),
      ['Total', totalTrans, '', totalShortage > 0 ? totalShortage : '']
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pay Period')
    XLSX.writeFile(wb, `pay-period-${data.startDate}-${data.endDate}.xlsx`)
  }

  const handleEmail = async (data: PayPeriodData) => {
    setEmailing(true)
    try {
      const recipientsRes = await fetch('/api/email-recipients')
      const list = recipientsRes.ok ? await recipientsRes.json() : []
      const primary = Array.isArray(list) && list.length > 0 ? list[0] : null
      const to = primary?.email
      if (!to) {
        alert('No email recipients configured. Add one in Settings → Email recipients.')
        return
      }
      const rows = data.rows
      const totalTrans = rows.reduce((s, r) => s + r.transTtl, 0)
      const totalShortage = rows.reduce((s, r) => s + r.shortage, 0)
      const html = `
        <h2>Summary Report</h2>
        <p><strong>Report Date:</strong> ${formatDateDisplay(data.reportDate)}</p>
        <p><strong>Date Range:</strong> ${formatDateRange(data.startDate, data.endDate)}</p>
        <p><strong>${data.entityName}</strong></p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
          <tr><th>Staff</th><th>Trans Ttl</th><th>Vacation</th><th>Shortage</th></tr>
          ${rows.map(r => `<tr><td>${r.staffName}</td><td>${r.transTtl.toFixed(2)}</td><td>${r.vacation}</td><td>${r.shortage > 0 ? `$${r.shortage.toFixed(2)}` : ''}</td></tr>`).join('')}
          <tr><td><strong>Total</strong></td><td><strong>${totalTrans.toFixed(1)}</strong></td><td></td><td><strong>${totalShortage > 0 ? `$${totalShortage.toFixed(2)}` : ''}</strong></td></tr>
        </table>
      `
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: `Pay Period Report – ${data.startDate} to ${data.endDate}`,
          html
        })
      })
      if (!res.ok) throw new Error('Failed to send email')
      alert(`Report emailed to ${to}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setEmailing(false)
    }
  }

  const displayData = viewingPeriod
    ? { ...viewingPeriod, rows: JSON.parse(viewingPeriod.rows) as PayPeriodRow[] }
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
                const data: PayPeriodData = { ...p, rows }
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <span className="font-medium">
                      {formatDateDisplay(p.startDate)} – {formatDateDisplay(p.endDate)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewingPeriod(viewingPeriod?.id === p.id ? null : p)}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                      >
                        {viewingPeriod?.id === p.id ? 'Hide' : 'View'}
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
                        onClick={() => handleEmail(data)}
                        disabled={emailing}
                        className="px-3 py-1 text-sm bg-indigo-100 text-indigo-800 rounded hover:bg-indigo-200 disabled:opacity-60"
                      >
                        Email
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

          {viewingPeriod && displayData && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-semibold mb-2">Summary Report</h3>
              <p className="text-sm text-gray-600 mb-2">
                Report Date: {formatDateDisplay(displayData.reportDate)} | Date Range: {formatDateRange(displayData.startDate, displayData.endDate)}
              </p>
              <p className="font-medium mb-3">{displayData.entityName}</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2">Staff</th>
                    <th className="text-right py-2">Trans Ttl</th>
                    <th className="text-center py-2">Vacation</th>
                    <th className="text-right py-2">Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-1">{r.staffName}</td>
                      <td className="text-right">{r.transTtl.toFixed(2)}</td>
                      <td className="text-center">{r.vacation || ''}</td>
                      <td className="text-right">{r.shortage > 0 ? `$${r.shortage.toFixed(2)}` : ''}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2 border-gray-300">
                    <td className="py-2">Total</td>
                    <td className="text-right">{displayData.rows.reduce((s, r) => s + r.transTtl, 0).toFixed(1)}</td>
                    <td></td>
                    <td className="text-right">
                      {displayData.rows.reduce((s, r) => s + r.shortage, 0) > 0
                        ? `$${displayData.rows.reduce((s, r) => s + r.shortage, 0).toFixed(2)}`
                        : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Editable modal */}
      {showModal && reportData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-center mb-2">Summary Report</h2>
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
                    <th className="text-right py-2 w-28">Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-1">{r.staffName}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={r.transTtl}
                          onChange={(e) => updateRow(i, 'transTtl', parseFloat(e.target.value) || 0)}
                          className="w-full text-right border border-gray-300 rounded px-2 py-1"
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
                          step="0.01"
                          value={r.shortage || ''}
                          onChange={(e) => updateRow(i, 'shortage', parseFloat(e.target.value) || 0)}
                          className="w-full text-right border border-gray-300 rounded px-2 py-1"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2 border-gray-300">
                    <td className="py-2">Total</td>
                    <td className="text-right">{reportData.rows.reduce((s, r) => s + r.transTtl, 0).toFixed(1)}</td>
                    <td></td>
                    <td className="text-right">
                      {reportData.rows.reduce((s, r) => s + r.shortage, 0) > 0
                        ? `$${reportData.rows.reduce((s, r) => s + r.shortage, 0).toFixed(2)}`
                        : ''}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowModal(false); setReportData(null) }}
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
              Please verify the information is correct before saving. Once saved, this pay period can be reviewed and shared (print, email, download).
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
    </div>
  )
}
