'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { payCycleLabel } from '@/lib/pay-cycle'
import { formatDateRange } from '@/lib/pay-period-excel'
import {
  formatMoney,
  parseExtraLines,
  parseMoney,
  parsePayType,
  payTypeLabel,
  type PayRunExtraLine
} from '@/lib/pay-run'

type PayRunLine = {
  id: string
  staffId: string | null
  staffName: string
  staffNo: string | null
  payType: string
  payCycle: string
  transTtl: number
  basicHours: number
  otHours: number
  hourlyRate: number
  salariedAmount: number
  basicPay: number
  otPay: number
  extraPay: number
  extraLines: PayRunExtraLine[]
  extraDeductions: PayRunExtraLine[]
  extraDeductionPay: number
  grossPay: number
  shortageReady: number
  nisEmployee: number
  nisEmployer: number
  staffLoan: number
  medical: number
  totalDeductions: number
  netPay: number
}

type PayRun = {
  id: string
  cycle: string
  status: string
  startDate: string
  endDate: string
  payDate: string
  notes: string
  hoursOutOfDate?: boolean
  lines: PayRunLine[]
}

function ExtraLineEditor({
  rows,
  onChange,
  addLabel
}: {
  rows: PayRunExtraLine[]
  onChange: (rows: PayRunExtraLine[]) => void
  addLabel: string
}) {
  return (
    <div className="space-y-2">
      {rows.map((extra, index) => (
        <div key={`${extra.label}-${index}`} className="flex gap-2">
          <input
            type="text"
            value={extra.label}
            onChange={(e) =>
              onChange(rows.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))
            }
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Label"
          />
          <input
            type="number"
            step="0.01"
            value={extra.amount}
            onChange={(e) =>
              onChange(
                rows.map((row, i) =>
                  i === index ? { ...row, amount: parseMoney(e.target.value) } : row
                )
              )
            }
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="text-xs text-red-700"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { label: '', amount: 0 }])}
        className="text-xs text-teal-800"
      >
        {addLabel}
      </button>
    </div>
  )
}

export default function PayRunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [run, setRun] = useState<PayRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [editLoan, setEditLoan] = useState('')
  const [editMedical, setEditMedical] = useState('')
  const [editShortage, setEditShortage] = useState('')
  const [editExtras, setEditExtras] = useState<PayRunExtraLine[]>([])
  const [editDeductions, setEditDeductions] = useState<PayRunExtraLine[]>([])

  const load = useCallback(async () => {
    const res = await fetch(`/api/pay-runs/${id}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load pay run')
    setRun(data)
    setNotes(typeof data.notes === 'string' ? data.notes : '')
    return data as PayRun
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pay run'))
      .finally(() => setLoading(false))
  }, [load])

  const totals = useMemo(() => {
    const lines = run?.lines ?? []
    return {
      gross: lines.reduce((s, l) => s + l.grossPay, 0),
      nis: lines.reduce((s, l) => s + l.nisEmployee, 0),
      employerNis: lines.reduce((s, l) => s + l.nisEmployer, 0),
      loan: lines.reduce((s, l) => s + l.staffLoan, 0),
      medical: lines.reduce((s, l) => s + l.medical, 0),
      shortage: lines.reduce((s, l) => s + l.shortageReady, 0),
      net: lines.reduce((s, l) => s + l.netPay, 0)
    }
  }, [run])

  const locked = run?.status === 'processed'

  const runAction = async (action: 'recalc' | 'process') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update pay run')
      setRun(data)
      setNotes(typeof data.notes === 'string' ? data.notes : '')
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pay run')
    } finally {
      setBusy(false)
    }
  }

  const unlock = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unlock: true })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to unlock pay run')
      setRun(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock pay run')
    } finally {
      setBusy(false)
    }
  }

  const saveNotes = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save notes')
      setRun(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (line: PayRunLine) => {
    setEditingId(line.id)
    setEditRate(
      parsePayType(line.payType) === 'salaried' ? String(line.salariedAmount) : String(line.hourlyRate)
    )
    setEditLoan(String(line.staffLoan ?? 0))
    setEditMedical(String(line.medical ?? 0))
    setEditShortage(String(line.shortageReady ?? 0))
    setEditExtras(parseExtraLines(line.extraLines))
    setEditDeductions(parseExtraLines(line.extraDeductions))
  }

  const saveLine = async (line: PayRunLine) => {
    setBusy(true)
    setError(null)
    try {
      const extras = parseExtraLines(editExtras)
      const deductions = parseExtraLines(editDeductions)
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: {
            id: line.id,
            extraLines: extras,
            extraDeductions: deductions,
            staffLoan: parseMoney(editLoan),
            medical: parseMoney(editMedical),
            shortageReady: parseMoney(editShortage),
            ...(parsePayType(line.payType) === 'salaried'
              ? { salariedAmount: parseMoney(editRate) }
              : { hourlyRate: parseMoney(editRate) })
          }
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update line')
      setRun(data)
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update line')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pay run</h1>
            {run ? (
              <p className="text-sm text-gray-600 mt-1">
                {formatDateRange(run.startDate, run.endDate)} · {payCycleLabel(run.cycle)}
              </p>
            ) : null}
          </div>
          <button
            onClick={() => router.push('/pay-run')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            ← Pay runs
          </button>
        </div>

        {error ? (
          <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        ) : null}

        {loading || !run ? (
          <p className="text-sm text-gray-500">{loading ? 'Loading…' : 'Pay run not found.'}</p>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      locked ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {locked ? 'Processed' : 'Draft'}
                  </span>
                  {run.hoursOutOfDate ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                      Hours changed — recalc
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!locked ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runAction('recalc')}
                        className="px-3 py-1.5 text-sm bg-slate-100 text-slate-800 rounded hover:bg-slate-200 disabled:opacity-60"
                      >
                        Recalc from hours
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runAction('process')}
                        className="px-3 py-1.5 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-60"
                      >
                        Process pay run
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={unlock}
                      className="px-3 py-1.5 text-sm bg-amber-100 text-amber-900 rounded hover:bg-amber-200 disabled:opacity-60"
                    >
                      Unlock
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Net is gross minus employee NIS (5%, $250 monthly cap), staff loan, medical, shortage,
                and extra deductions. Employer NIS is a memo only. PAYE stays in Pay+.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Staff</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">OT</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">NIS</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Loan</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Med</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Short</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                    {!locked ? (
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        <span className="sr-only">Edit</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {run.lines.map((line) => {
                    const salaried = parsePayType(line.payType) === 'salaried'
                    const extras = parseExtraLines(line.extraLines)
                    const deductions = parseExtraLines(line.extraDeductions)
                    return (
                      <tr key={line.id} className="align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{line.staffName}</div>
                          {line.staffNo ? (
                            <div className="text-xs text-gray-500">{line.staffNo}</div>
                          ) : null}
                          {extras.length > 0 ? (
                            <div className="text-xs text-gray-500 mt-1">
                              {extras.map((extra) => `${extra.label} ${formatMoney(extra.amount)}`).join(' · ')}
                            </div>
                          ) : null}
                          {deductions.length > 0 ? (
                            <div className="text-xs text-amber-800 mt-1">
                              {deductions
                                .map((extra) => `${extra.label} −${formatMoney(extra.amount)}`)
                                .join(' · ')}
                            </div>
                          ) : null}
                          {editingId === line.id ? (
                            <div className="mt-3 space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
                              <label className="block text-xs font-medium text-gray-700">
                                {salaried ? 'Salaried amount' : 'Hourly rate'}
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editRate}
                                  onChange={(e) => setEditRate(e.target.value)}
                                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                />
                              </label>
                              <div className="grid grid-cols-3 gap-2">
                                <label className="block text-xs font-medium text-gray-700">
                                  Loan
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editLoan}
                                    onChange={(e) => setEditLoan(e.target.value)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  />
                                </label>
                                <label className="block text-xs font-medium text-gray-700">
                                  Medical
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editMedical}
                                    onChange={(e) => setEditMedical(e.target.value)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  />
                                </label>
                                <label className="block text-xs font-medium text-gray-700">
                                  Shortage
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editShortage}
                                    onChange={(e) => setEditShortage(e.target.value)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  />
                                </label>
                              </div>
                              <p className="text-xs font-medium text-gray-700">Extra earnings</p>
                              <ExtraLineEditor rows={editExtras} onChange={setEditExtras} addLabel="+ Extra line" />
                              <p className="text-xs font-medium text-gray-700">Extra deductions</p>
                              <ExtraLineEditor
                                rows={editDeductions}
                                onChange={setEditDeductions}
                                addLabel="+ Deduction"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => saveLine(line)}
                                  className="px-2 py-1 text-xs bg-teal-700 text-white rounded disabled:opacity-60"
                                >
                                  Save line
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="px-2 py-1 text-xs bg-gray-200 text-gray-800 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{payTypeLabel(line.payType)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {salaried ? '—' : line.basicHours.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {salaried ? '—' : line.otHours.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {salaried ? formatMoney(line.salariedAmount) : formatMoney(line.hourlyRate)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.grossPay)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.nisEmployee)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.staffLoan > 0 ? formatMoney(line.staffLoan) : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.medical > 0 ? formatMoney(line.medical) : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                          {line.shortageReady > 0 ? formatMoney(line.shortageReady) : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatMoney(line.netPay)}
                        </td>
                        {!locked ? (
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => startEdit(line)}
                              className="text-xs text-teal-800 hover:underline"
                            >
                              Edit
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 font-medium">
                  <tr>
                    <td className="px-3 py-2" colSpan={5}>
                      Totals
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totals.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totals.nis)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {totals.loan > 0 ? formatMoney(totals.loan) : ''}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {totals.medical > 0 ? formatMoney(totals.medical) : ''}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                      {totals.shortage > 0 ? formatMoney(totals.shortage) : ''}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totals.net)}</td>
                    {!locked ? <td /> : null}
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Employer NIS this run: <span className="font-medium">{formatMoney(totals.employerNis)}</span>{' '}
              (memo only — not taken from net). PAYE is still calculated in Pay+.
            </p>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={locked || busy}
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
              />
              {!locked ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={saveNotes}
                    className="px-3 py-1.5 text-sm bg-slate-100 text-slate-800 rounded hover:bg-slate-200 disabled:opacity-60"
                  >
                    Save notes
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
