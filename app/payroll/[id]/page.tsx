'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { payCycleLabel } from '@/lib/pay-cycle'
import { buildBankingPack } from '@/lib/pay-run-banking'
import { downloadBankingPackExcel } from '@/lib/pay-run-banking-excel'
import { printBankingPack } from '@/lib/pay-run-banking-print'
import { creditUnionLetters, downloadCreditUnionLetter } from '@/lib/pay-run-cu-letter'
import { printNisReport, printPayrollPreview } from '@/lib/payroll-print'
import {
  computeGrossPay,
  extraPayTotal,
  formatMoney,
  parseMoney,
  parsePayType,
  salarySkipped,
  setSalarySkipped,
  setSingleExtraAmount,
  type PayRunExtraLine
} from '@/lib/pay-run'

type PayRunLine = {
  id: string
  staffId: string | null
  staffName: string
  staffNo: string | null
  payType: string
  basicHours: number
  otHours: number
  hourlyRate: number
  salariedAmount: number
  extraLines: PayRunExtraLine[]
  extraDeductions: PayRunExtraLine[]
  grossPay: number
  shortageReady: number
  nisEmployee: number
  nisEmployer: number
  staffLoan: number
  medical: number
  totalDeductions: number
  netPay: number
  bankCode?: string
  accountNo?: string | null
  taxCode?: string
}

type PayRun = {
  id: string
  cycle: string
  status: string
  startDate: string
  endDate: string
  payDate: string
  voidedAt?: string | null
  voidReason?: string
  voidedByName?: string
  lines: PayRunLine[]
}

type Draft = {
  rate: string
  salary: string
  basicHours: string
  otHours: string
  extra: string
  paySalary: boolean
  shortage: string
  loan: string
  medical: string
  otherDeduction: string
}

const SHOW_ALL_KEY = 'payroll-show-all-money'

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${Number(m)}/${Number(d)}/${y}`
}

function moneyInput(value: number): string {
  return value ? String(value) : ''
}

function draftFromLine(line: PayRunLine): Draft {
  return {
    rate: String(line.hourlyRate || ''),
    salary: String(line.salariedAmount || ''),
    basicHours: line.basicHours ? String(line.basicHours) : '',
    otHours: line.otHours ? String(line.otHours) : '',
    extra: moneyInput(extraPayTotal(line.extraLines)),
    paySalary: !salarySkipped(line.extraLines),
    shortage: moneyInput(line.shortageReady),
    loan: moneyInput(line.staffLoan),
    medical: moneyInput(line.medical),
    otherDeduction: moneyInput(extraPayTotal(line.extraDeductions))
  }
}

function extraLinesFor(line: PayRunLine, draft: Draft): PayRunExtraLine[] {
  const withExtra = setSingleExtraAmount(line.extraLines, parseMoney(draft.extra))
  const salaried = parsePayType(line.payType) === 'salaried'
  return setSalarySkipped(withExtra, salaried && !draft.paySalary)
}

function deductionLines(amount: string): PayRunExtraLine[] {
  const n = parseMoney(amount)
  return n > 0 ? [{ label: 'Other', amount: n }] : []
}

function HoursField({
  value,
  disabled,
  onChange,
  label
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  label: string
}) {
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm tabular-nums disabled:opacity-60"
    />
  )
}

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [run, setRun] = useState<PayRun | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [payDate, setPayDate] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [details, setDetails] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateLineId, setRateLineId] = useState<string | null>(null)
  const [rateValue, setRateValue] = useState('')
  const [taxCode, setTaxCode] = useState('')
  const [rateScope, setRateScope] = useState<'run' | 'future'>('run')
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/pay-runs/${id}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load payroll')
    const next = data as PayRun
    setRun(next)
    setPayDate(next.payDate)
    const seeded: Record<string, Draft> = {}
    for (const line of next.lines) seeded[line.id] = draftFromLine(line)
    setDrafts(seeded)
    if (next.status === 'processed' || next.status === 'void') setStep(3)
    return next
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load payroll'))
      .finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    try {
      setShowAll(window.localStorage.getItem(SHOW_ALL_KEY) === '1')
    } catch {
      setShowAll(false)
    }
  }, [])

  const locked = run?.status === 'processed' || run?.status === 'void'
  const voided = run?.status === 'void'
  const hourly = (run?.lines ?? []).filter((line) => parsePayType(line.payType) === 'hourly')
  const salaried = (run?.lines ?? []).filter((line) => parsePayType(line.payType) === 'salaried')

  const grossFor = useCallback(
    (line: PayRunLine) => {
      const draft = drafts[line.id]
      if (!draft) return line.grossPay
      return computeGrossPay({
        payType: line.payType,
        basicHours: parseMoney(draft.basicHours),
        otHours: parseMoney(draft.otHours),
        hourlyRate: parseMoney(draft.rate),
        salariedAmount: parseMoney(draft.salary),
        extraLines: extraLinesFor(line, draft)
      }).grossPay
    },
    [drafts]
  )

  const patchDraft = (lineId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }))
  }

  const persist = async () => {
    if (!run) return null
    const res = await fetch(`/api/pay-runs/${run.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payDate,
        lines: run.lines.map((line) => {
          const draft = drafts[line.id] ?? draftFromLine(line)
          return {
            id: line.id,
            basicHours: parseMoney(draft.basicHours),
            otHours: parseMoney(draft.otHours),
            hourlyRate: parseMoney(draft.rate),
            salariedAmount: parseMoney(draft.salary),
            extraLines: extraLinesFor(line, draft),
            extraDeductions: deductionLines(draft.otherDeduction),
            shortageReady: parseMoney(draft.shortage),
            staffLoan: parseMoney(draft.loan),
            medical: parseMoney(draft.medical)
          }
        })
      })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to save payroll')
    setRun(data)
    const seeded: Record<string, Draft> = {}
    for (const line of data.lines as PayRunLine[]) seeded[line.id] = draftFromLine(line)
    setDrafts(seeded)
    return data as PayRun
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await persist()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payroll')
    } finally {
      setBusy(false)
    }
  }

  const continueToReview = async () => {
    setBusy(true)
    setError(null)
    try {
      await persist()
      setDetails(false)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payroll')
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      await persist()
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to approve payroll')
      setRun(data)
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve payroll')
    } finally {
      setBusy(false)
    }
  }

  const deleteDraft = async () => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete draft')
      router.push('/payroll')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete draft')
      setBusy(false)
    }
  }

  const voidPayroll = async () => {
    const reason = voidReason.trim()
    if (reason.length < 3) {
      setError('A reason is required to void a payroll.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void', reason })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to void payroll')
      setRun(data)
      setVoidOpen(false)
      setVoidReason('')
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void payroll')
    } finally {
      setBusy(false)
    }
  }

  const reloadHours = async () => {
    if (!window.confirm('Replace edited hours with the extracted attendance for this period?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalc' })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to reload hours')
      setRun(data)
      const seeded: Record<string, Draft> = {}
      for (const line of data.lines as PayRunLine[]) seeded[line.id] = draftFromLine(line)
      setDrafts(seeded)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload hours')
    } finally {
      setBusy(false)
    }
  }

  const clearEntries = () => {
    setDrafts((current) => {
      const next = { ...current }
      for (const line of hourly) {
        const draft = next[line.id]
        if (!draft) continue
        next[line.id] = { ...draft, basicHours: '', otHours: '', extra: '', shortage: '' }
      }
      for (const line of salaried) {
        const draft = next[line.id]
        if (!draft) continue
        next[line.id] = { ...draft, extra: '' }
      }
      return next
    })
  }

  const openPayInfo = (lineId: string) => {
    if (!run || locked) return
    const line = run.lines.find((item) => item.id === lineId)
    const draft = drafts[lineId]
    if (!line || !draft) return
    const salariedLine = parsePayType(line.payType) === 'salaried'
    setRateLineId(line.id)
    setRateValue(salariedLine ? draft.salary : draft.rate)
    setTaxCode(line.taxCode || '')
    setRateScope('run')
    if (line.staffId && !line.taxCode) {
      fetch(`/api/staff/${line.staffId}`)
        .then(async (res) => (res.ok ? res.json() : null))
        .then((staff) => {
          const code = typeof staff?.taxCode === 'string' ? staff.taxCode : ''
          if (code) setTaxCode((current) => current || code)
        })
        .catch(() => undefined)
    }
  }

  const saveRate = async () => {
    if (!run || !rateLineId) return
    const line = run.lines.find((item) => item.id === rateLineId)
    if (!line) return
    const amount = parseMoney(rateValue)
    const code = taxCode.trim()
    const salariedLine = parsePayType(line.payType) === 'salaried'
    patchDraft(line.id, salariedLine ? { salary: String(amount) } : { rate: String(amount) })
    setRun((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((item) =>
              item.id === line.id
                ? {
                    ...item,
                    hourlyRate: salariedLine ? item.hourlyRate : amount,
                    salariedAmount: salariedLine ? amount : item.salariedAmount,
                    taxCode: code
                  }
                : item
            )
          }
        : current
    )
    setRateLineId(null)
    setBusy(true)
    setError(null)
    try {
      const lineRes = await fetch(`/api/pay-runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: {
            id: line.id,
            taxCode: code,
            ...(salariedLine ? { salariedAmount: amount } : { hourlyRate: amount })
          }
        })
      })
      if (!lineRes.ok) {
        const data = await lineRes.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save pay information')
      }
      if (rateScope === 'future' && line.staffId) {
        const res = await fetch(`/api/staff/${line.staffId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            salariedLine
              ? { salariedAmount: amount, taxCode: code }
              : { hourlyRate: amount, taxCode: code }
          )
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to update future pay')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pay information')
    } finally {
      setBusy(false)
    }
  }

  const banking = useMemo(
    () =>
      buildBankingPack(
        (run?.lines ?? []).map((line) => ({
          staffName: line.staffName,
          staffNo: line.staffNo,
          bankCode: line.bankCode,
          accountNo: line.accountNo,
          netPay: line.netPay
        }))
      ),
    [run]
  )
  const letters = useMemo(() => creditUnionLetters(banking), [banking])

  const sumHours = (lines: PayRunLine[], field: 'basicHours' | 'otHours') =>
    lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.[field] ?? ''), 0)
  const sumExtra = (lines: PayRunLine[]) =>
    lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.extra ?? ''), 0)
  const sumGross = (lines: PayRunLine[]) => lines.reduce((sum, line) => sum + grossFor(line), 0)

  const openPreview = async () => {
    if (!run) return
    setBusy(true)
    setError(null)
    try {
      const saved = locked ? run : await persist()
      if (!saved) return
      printPayrollPreview({
        startDate: saved.startDate,
        endDate: saved.endDate,
        payDate: saved.payDate,
        status: saved.status,
        voidReason: saved.voidReason,
        lines: saved.lines.map((line) => ({
          staffName: line.staffName,
          payType: line.payType,
          hours: parseMoney(line.basicHours) + parseMoney(line.otHours),
          grossPay: line.grossPay,
          netPay: line.netPay
        }))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the preview')
    } finally {
      setBusy(false)
    }
  }

  const openNis = () => {
    if (!run) return
    printNisReport({
      startDate: run.startDate,
      endDate: run.endDate,
      cycle: run.cycle,
      voided: run.status === 'void',
      lines: run.lines.map((line) => ({
        staffName: line.staffName,
        staffNo: line.staffNo,
        nisEmployee: line.nisEmployee,
        nisEmployer: line.nisEmployer,
        grossPay: line.grossPay
      }))
    })
  }

  const rateLine = run?.lines.find((line) => line.id === rateLineId) ?? null

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Loading payroll…</p>
  }
  if (!run) {
    return <p className="p-8 text-sm text-red-700">{error || 'Payroll not found.'}</p>
  }

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8 pb-28">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {step === 1 ? 'Run a new payroll' : 'Pay employees'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {payCycleLabel(run.cycle)} · {mdy(run.startDate)} – {mdy(run.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {run.status === 'draft' ? (
              <button
                type="button"
                onClick={deleteDraft}
                disabled={busy}
                className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-40"
              >
                Delete draft
              </button>
            ) : null}
            {run.status === 'processed' ? (
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setVoidOpen(true)
                }}
                disabled={busy}
                className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-40"
              >
                Void payroll
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push('/payroll')}
              className="text-sm font-medium text-violet-700 hover:text-violet-900"
            >
              All payroll
            </button>
          </div>
        </div>

        <ol className="mb-8 grid grid-cols-3 border-b border-slate-200">
          {(['Enter payroll', 'Approve payroll', 'Print'] as const).map((label, index) => {
            const n = (index + 1) as 1 | 2 | 3
            const active = step === n
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => {
                    if (n === 3 && !locked) return
                    if (n === 1 || locked) setStep(n)
                    if (n === 2 && !locked) setStep(2)
                  }}
                  className={`w-full pb-3 text-left text-sm ${
                    active ? 'border-b-2 border-violet-700 font-semibold text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {n}. {label}
                </button>
              </li>
            )
          })}
        </ol>

        {error ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {step === 1 ? (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Pay schedule</p>
                <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {payCycleLabel(run.cycle)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">Pay period</p>
                <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {mdy(run.startDate)} – {mdy(run.endDate)}
                </p>
              </div>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Pay date</span>
                <input
                  type="date"
                  value={payDate}
                  disabled={locked}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Enter hours and money</h2>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => {
                    setShowAll(e.target.checked)
                    try {
                      window.localStorage.setItem(SHOW_ALL_KEY, e.target.checked ? '1' : '0')
                    } catch {
                      // ignore
                    }
                  }}
                />
                Show all hours and money types
              </label>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Basic and OT hours are filled from extracted attendance. Click a name to change the pay rate and tax code.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Hourly employees</th>
                    <th className="py-2 pr-3 font-semibold">Hourly rate</th>
                    <th className="py-2 pr-3 text-right font-semibold">Basic</th>
                    <th className="py-2 pr-3 text-right font-semibold">Overtime</th>
                    {showAll ? <th className="py-2 pr-3 text-right font-semibold">Shortage</th> : null}
                    <th className="py-2 pr-3 text-right font-semibold">Extra</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hourly.length === 0 ? (
                    <tr>
                      <td colSpan={showAll ? 7 : 6} className="py-4 text-slate-500">
                        No hourly staff on this cycle.
                      </td>
                    </tr>
                  ) : (
                    hourly.map((line) => {
                      const draft = drafts[line.id]
                      if (!draft) return null
                      return (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => openPayInfo(line.id)}
                              className="text-left font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700 disabled:cursor-default disabled:text-slate-800 disabled:no-underline"
                            >
                              {line.staffName}
                            </button>
                            {line.taxCode ? (
                              <p className="text-xs text-slate-500">Tax code {line.taxCode}</p>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3 tabular-nums text-slate-700">{formatMoney(parseMoney(draft.rate))}</td>
                          <td className="py-3 pr-3 text-right">
                            <HoursField
                              label={`Basic hours for ${line.staffName}`}
                              value={draft.basicHours}
                              disabled={Boolean(locked)}
                              onChange={(value) => patchDraft(line.id, { basicHours: value })}
                            />
                          </td>
                          <td className="py-3 pr-3 text-right">
                            <HoursField
                              label={`Overtime hours for ${line.staffName}`}
                              value={draft.otHours}
                              disabled={Boolean(locked)}
                              onChange={(value) => patchDraft(line.id, { otHours: value })}
                            />
                          </td>
                          {showAll ? (
                            <td className="py-3 pr-3 text-right">
                              <HoursField
                                label={`Shortage for ${line.staffName}`}
                                value={draft.shortage}
                                disabled={Boolean(locked)}
                                onChange={(value) => patchDraft(line.id, { shortage: value })}
                              />
                            </td>
                          ) : null}
                          <td className="py-3 pr-3 text-right">
                            <HoursField
                              label={`Extra pay for ${line.staffName}`}
                              value={draft.extra}
                              disabled={Boolean(locked)}
                              onChange={(value) => patchDraft(line.id, { extra: value })}
                            />
                          </td>
                          <td className="py-3 text-right font-medium tabular-nums">{formatMoney(grossFor(line))}</td>
                        </tr>
                      )
                    })
                  )}
                  <tr className="text-emerald-700">
                    <td className="py-3 font-semibold" colSpan={2}>
                      Hourly employee totals
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">{sumHours(hourly, 'basicHours').toFixed(2)}</td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">{sumHours(hourly, 'otHours').toFixed(2)}</td>
                    {showAll ? <td /> : null}
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">{formatMoney(sumExtra(hourly))}</td>
                    <td className="py-3 text-right font-semibold tabular-nums">{formatMoney(sumGross(hourly))}</td>
                  </tr>
                </tbody>
              </table>

              <table className="mt-8 w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Salaried employees</th>
                    <th className="py-2 pr-3 font-semibold">Pay salary</th>
                    <th className="py-2 pr-3 font-semibold">Salary</th>
                    <th className="py-2 pr-3 text-right font-semibold">Extra</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salaried.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-slate-500">
                        No salaried staff on this cycle.
                      </td>
                    </tr>
                  ) : (
                    salaried.map((line) => {
                      const draft = drafts[line.id]
                      if (!draft) return null
                      return (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => openPayInfo(line.id)}
                              className="text-left font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700 disabled:cursor-default disabled:text-slate-800 disabled:no-underline"
                            >
                              {line.staffName}
                            </button>
                            {line.taxCode ? (
                              <p className="text-xs text-slate-500">Tax code {line.taxCode}</p>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3">
                            <label className="inline-flex items-center gap-2 text-slate-700">
                              <input
                                type="checkbox"
                                checked={draft.paySalary}
                                disabled={locked}
                                onChange={(e) => patchDraft(line.id, { paySalary: e.target.checked })}
                              />
                              Pay salary
                            </label>
                          </td>
                          <td className="py-3 pr-3 tabular-nums text-slate-700">
                            {formatMoney(parseMoney(draft.salary))}
                          </td>
                          <td className="py-3 pr-3 text-right">
                            <HoursField
                              label={`Extra pay for ${line.staffName}`}
                              value={draft.extra}
                              disabled={Boolean(locked)}
                              onChange={(value) => patchDraft(line.id, { extra: value })}
                            />
                          </td>
                          <td className="py-3 text-right font-medium tabular-nums">{formatMoney(grossFor(line))}</td>
                        </tr>
                      )
                    })
                  )}
                  <tr className="text-emerald-700">
                    <td className="py-3 font-semibold" colSpan={3}>
                      Salaried employee totals
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">{formatMoney(sumExtra(salaried))}</td>
                    <td className="py-3 text-right font-semibold tabular-nums">{formatMoney(sumGross(salaried))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <ReviewStep
            run={run}
            details={details}
            drafts={drafts}
            onToggleDetails={() => setDetails((value) => !value)}
            onDraft={patchDraft}
            onEditName={openPayInfo}
            locked={Boolean(locked)}
          />
        ) : null}

        {step === 3 ? (
          <div>
            {voided ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                <p className="font-semibold">This payroll is voided.</p>
                <p className="mt-1">
                  {run.voidedByName || 'Someone'}
                  {run.voidedAt ? ` on ${new Date(run.voidedAt).toLocaleString()}` : ''}.
                </p>
                <p className="mt-1">Reason: {run.voidReason || '—'}</p>
                <p className="mt-2 text-red-800">
                  The amounts stay on record and no longer count toward N.I.S. You can start a new payroll for this period.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                This payroll is approved. Pay period {mdy(run.startDate)} – {mdy(run.endDate)} · Pay date {mdy(run.payDate)}.
              </div>
            )}
            <h2 className="mt-8 text-lg font-semibold text-slate-900">What would you like to do next?</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openPreview}
                className="rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700"
              >
                Print payroll
              </button>
              <button type="button" onClick={openNis} className="text-sm font-medium text-violet-700 hover:underline">
                N.I.S. report
              </button>
              <button
                type="button"
                onClick={() => printBankingPack(banking, run.payDate)}
                className="text-sm font-medium text-violet-700 hover:underline"
              >
                Print banking pack
              </button>
              <button
                type="button"
                onClick={() => downloadBankingPackExcel(banking, run.payDate)}
                className="text-sm font-medium text-violet-700 hover:underline"
              >
                Download banking pack
              </button>
              {letters.map((letter) => (
                <button
                  key={letter.code}
                  type="button"
                  onClick={() => downloadCreditUnionLetter(letter, run.payDate)}
                  className="text-sm font-medium text-violet-700 hover:underline"
                >
                  {letter.code} letter
                </button>
              ))}
            </div>
            <p className="mt-6 text-sm text-slate-500">
              You can leave and open this payroll again. PAYE stays in Pay+.
            </p>
          </div>
        ) : null}
      </div>

      {step === 1 ? (
        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex gap-4 text-sm">
              <button type="button" onClick={clearEntries} disabled={locked} className="font-medium text-violet-700 disabled:opacity-40">
                Clear entries
              </button>
              <button type="button" onClick={save} disabled={busy || locked} className="font-medium text-violet-700 disabled:opacity-40">
                Save entries
              </button>
              <button type="button" onClick={reloadHours} disabled={busy || locked} className="font-medium text-slate-500 disabled:opacity-40">
                Reload hours from attendance
              </button>
            </div>
            <button
              type="button"
              onClick={continueToReview}
              disabled={busy}
              className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="sticky bottom-0 border-t border-violet-100 bg-violet-50 px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex gap-4 text-sm">
              <button type="button" onClick={() => setStep(1)} className="font-medium text-violet-700">
                Back to employees
              </button>
              <button type="button" onClick={openPreview} className="font-medium text-violet-700">
                Download preview
              </button>
            </div>
            {locked ? null : (
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {busy ? 'Approving…' : 'Approve payroll'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {voidOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Void this payroll</h2>
            <p className="mt-2 text-sm text-slate-600">
              The paycheck amounts stay on file. They stop counting toward N.I.S., and you can run this period again. A
              reason is required.
            </p>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-800">Reason</span>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={voidPayroll}
                disabled={busy || voidReason.trim().length < 3}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? 'Voiding…' : 'Void payroll'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rateLine && !locked ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Edit pay information for {rateLine.staffName}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">
                  {parsePayType(rateLine.payType) === 'salaried' ? 'Salary' : 'Pay rate'}
                </span>
                <input
                  value={rateValue}
                  onChange={(e) => setRateValue(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Tax code</span>
                <input
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="Pay+ tax code"
                />
              </label>
            </div>
            <fieldset className="mt-4 text-sm">
              <legend className="font-medium text-slate-800">Apply to</legend>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="radio"
                  name="rate-scope"
                  checked={rateScope === 'run'}
                  onChange={() => setRateScope('run')}
                />
                Only this payroll
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="radio"
                  name="rate-scope"
                  checked={rateScope === 'future'}
                  onChange={() => setRateScope('future')}
                />
                This payroll and future payrolls
              </label>
            </fieldset>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={saveRate}
                className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Save pay information
              </button>
              <button type="button" onClick={() => setRateLineId(null)} className="text-sm text-slate-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ReviewStep({
  run,
  details,
  drafts,
  onToggleDetails,
  onDraft,
  onEditName,
  locked
}: {
  run: PayRun
  details: boolean
  drafts: Record<string, Draft>
  onToggleDetails: () => void
  onDraft: (lineId: string, patch: Partial<Draft>) => void
  onEditName: (lineId: string) => void
  locked: boolean
}) {
  const hourly = run.lines.filter((line) => parsePayType(line.payType) !== 'salaried')
  const salaried = run.lines.filter((line) => parsePayType(line.payType) === 'salaried')
  const hours = run.lines.reduce((sum, line) => sum + line.basicHours + line.otHours, 0)
  const gross = run.lines.reduce((sum, line) => sum + line.grossPay, 0)
  const net = run.lines.reduce((sum, line) => sum + line.netPay, 0)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{details ? 'Payroll details' : 'Payroll summary'}</h2>
        <button type="button" onClick={onToggleDetails} className="text-sm font-medium text-violet-700 hover:underline">
          {details ? 'View summary' : 'View details'}
        </button>
      </div>
      <p className="mb-6 text-sm text-slate-600">
        Pay period {mdy(run.startDate)} – {mdy(run.endDate)} · Pay date {mdy(run.payDate)}. Net is gross minus employee
        NIS, loan, medical, shortage, and other deductions. Employer NIS is a memo. PAYE stays in Pay+.
      </p>

      {details ? (
        <div className="space-y-10">
          {run.lines.map((line) => {
            const draft = drafts[line.id]
            return (
              <article key={line.id} className="border-b border-slate-200 pb-8">
                <header className="flex items-baseline justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onEditName(line.id)}
                      className="text-left text-base font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700 disabled:cursor-default disabled:text-slate-900 disabled:no-underline"
                    >
                      {line.staffName}
                    </button>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Pay type: {parsePayType(line.payType)}
                      {line.taxCode ? ` · Tax code ${line.taxCode}` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Pay date {mdy(run.payDate)} · {mdy(run.startDate)} – {mdy(run.endDate)}
                  </p>
                </header>
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hours and earnings</h4>
                    <table className="mt-2 w-full text-sm">
                      <tbody>
                        <tr>
                          <td className="py-1">Basic</td>
                          <td className="py-1 text-right tabular-nums">{line.basicHours.toFixed(2)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.hourlyRate)}</td>
                        </tr>
                        <tr>
                          <td className="py-1">Overtime</td>
                          <td className="py-1 text-right tabular-nums">{line.otHours.toFixed(2)}</td>
                          <td className="py-1 text-right" />
                        </tr>
                        <tr>
                          <td className="py-1">Extra</td>
                          <td />
                          <td className="py-1 text-right tabular-nums">{formatMoney(extraPayTotal(line.extraLines))}</td>
                        </tr>
                        <tr className="font-semibold">
                          <td className="py-1">Gross pay</td>
                          <td />
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.grossPay)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deductions</h4>
                    <dl className="mt-2 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt>NIS</dt>
                        <dd className="tabular-nums">{formatMoney(line.nisEmployee)}</dd>
                      </div>
                      <label className="flex items-center justify-between gap-3">
                        <span>Loan</span>
                        <input
                          aria-label={`Loan for ${line.staffName}`}
                          value={draft?.loan ?? ''}
                          disabled={locked}
                          onChange={(e) => onDraft(line.id, { loan: e.target.value })}
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span>Medical</span>
                        <input
                          aria-label={`Medical for ${line.staffName}`}
                          value={draft?.medical ?? ''}
                          disabled={locked}
                          onChange={(e) => onDraft(line.id, { medical: e.target.value })}
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span>Shortage</span>
                        <input
                          aria-label={`Shortage for ${line.staffName}`}
                          value={draft?.shortage ?? ''}
                          disabled={locked}
                          onChange={(e) => onDraft(line.id, { shortage: e.target.value })}
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span>Other</span>
                        <input
                          aria-label={`Other deduction for ${line.staffName}`}
                          value={draft?.otherDeduction ?? ''}
                          disabled={locked}
                          onChange={(e) => onDraft(line.id, { otherDeduction: e.target.value })}
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                        />
                      </label>
                      <div className="flex justify-between font-semibold">
                        <dt>Total deductions</dt>
                        <dd className="tabular-nums">{formatMoney(line.totalDeductions)}</dd>
                      </div>
                      <div className="flex justify-between font-semibold text-emerald-800">
                        <dt>Net pay</dt>
                        <dd className="tabular-nums">{formatMoney(line.netPay)}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-xs text-slate-500">
                      Employer NIS {formatMoney(line.nisEmployer)} is not taken from net.
                      {line.bankCode ? ` Bank ${line.bankCode}` : ''}
                      {line.accountNo ? ` · ${line.accountNo}` : ''}
                    </p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <SummaryTable
          hourly={hourly}
          salaried={salaried}
          hours={hours}
          gross={gross}
          net={net}
          onEditName={locked ? undefined : onEditName}
        />
      )}
    </div>
  )
}

function SummaryTable({
  hourly,
  salaried,
  hours,
  gross,
  net,
  onEditName
}: {
  hourly: PayRunLine[]
  salaried: PayRunLine[]
  hours: number
  gross: number
  net: number
  onEditName?: (lineId: string) => void
}) {
  const block = (title: string, lines: PayRunLine[]) => {
    const blockHours = lines.reduce((sum, line) => sum + line.basicHours + line.otHours, 0)
    const blockGross = lines.reduce((sum, line) => sum + line.grossPay, 0)
    const blockNet = lines.reduce((sum, line) => sum + line.netPay, 0)
    return (
      <>
        <tr>
          <td colSpan={4} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </td>
        </tr>
        {lines.map((line) => (
          <tr key={line.id} className="border-b border-slate-100">
            <td className="py-2">
              {onEditName ? (
                <button
                  type="button"
                  onClick={() => onEditName(line.id)}
                  className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700"
                >
                  {line.staffName}
                </button>
              ) : (
                line.staffName
              )}
              {line.taxCode ? <p className="text-xs font-normal text-slate-500">Tax code {line.taxCode}</p> : null}
            </td>
            <td className="py-2 text-right tabular-nums">
              {parsePayType(line.payType) === 'salaried' ? '—' : (line.basicHours + line.otHours).toFixed(2)}
            </td>
            <td className="py-2 text-right tabular-nums">{formatMoney(line.grossPay)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(line.netPay)}</td>
          </tr>
        ))}
        <tr className="bg-violet-50 font-semibold">
          <td className="py-2">Subtotal</td>
          <td className="py-2 text-right tabular-nums">{blockHours ? blockHours.toFixed(2) : '—'}</td>
          <td className="py-2 text-right tabular-nums">{formatMoney(blockGross)}</td>
          <td className="py-2 text-right tabular-nums">{formatMoney(blockNet)}</td>
        </tr>
      </>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="py-2 font-semibold">Name</th>
          <th className="py-2 text-right font-semibold">Total hours</th>
          <th className="py-2 text-right font-semibold">Gross pay</th>
          <th className="py-2 text-right font-semibold">Net pay</th>
        </tr>
      </thead>
      <tbody>
        {block('Hourly employees', hourly)}
        {block('Salaried employees', salaried)}
        <tr className="bg-violet-100 font-semibold">
          <td className="py-3">Total</td>
          <td className="py-3 text-right tabular-nums">{hours.toFixed(2)}</td>
          <td className="py-3 text-right tabular-nums">{formatMoney(gross)}</td>
          <td className="py-3 text-right tabular-nums">{formatMoney(net)}</td>
        </tr>
      </tbody>
    </table>
  )
}
