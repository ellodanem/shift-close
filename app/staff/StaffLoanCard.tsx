'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDateOnlyForDisplay } from '@/lib/datetime-policy'
import { parsePayCycle, payCycleLabel, type PayCycle } from '@/lib/pay-cycle'
import { formatMoney, parseMoney } from '@/lib/pay-run'
import {
  loanInstallment,
  parseLoanTermUnit,
  paysForLoanTerm,
  previewStaffLoan,
  termPaysForInstallment,
  type LoanTermUnit
} from '@/lib/staff-loan'

type LoanRepayment = {
  payRunId: string
  payDate: string
  amount: number
}

type StaffLoan = {
  id: string
  principal: number
  termPays: number
  installment: number
  startDate: string
  status: 'active' | 'paid' | 'cancelled'
  paid: number
  remaining: number
  lastPayDate: string
  repayments: LoanRepayment[]
}

type LoanResponse = {
  loan: StaffLoan | null
  legacyLoan: number
}

function statusLabel(status: StaffLoan['status']): string {
  if (status === 'paid') return 'Paid'
  if (status === 'cancelled') return 'Cancelled'
  return 'Active'
}

function statusClass(status: StaffLoan['status']): string {
  if (status === 'paid') return 'bg-gray-100 text-gray-700'
  if (status === 'cancelled') return 'bg-gray-100 text-gray-600'
  return 'bg-green-100 text-green-800'
}

export default function StaffLoanCard({
  staffId,
  payCycle,
  legacyLoan,
  onLegacyCleared
}: {
  staffId: string
  payCycle: string
  legacyLoan: number
  onLegacyCleared?: () => void
}) {
  const cycle = parsePayCycle(payCycle)
  const [data, setData] = useState<LoanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<'add' | 'adjust' | null>(null)
  const [principal, setPrincipal] = useState('')
  const [termCount, setTermCount] = useState('5')
  const [termUnit, setTermUnit] = useState<LoanTermUnit>('months')
  const [installment, setInstallment] = useState('')
  const [lastEdited, setLastEdited] = useState<'term' | 'amount'>('term')
  const [startDate, setStartDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/${staffId}/loan`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to load staff loan')
      setData(body as LoanResponse)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Failed to load staff loan')
    } finally {
      setLoading(false)
    }
  }, [staffId])

  useEffect(() => {
    void load()
  }, [load])

  const loan = data?.loan ?? null
  const openEnded = !loan && (data?.legacyLoan || legacyLoan) > 0 ? data?.legacyLoan || legacyLoan : 0

  const preview = useMemo(() => {
    const amount = modal === 'adjust' && loan ? loan.remaining : parseMoney(principal)
    const count = Number(termCount)
    const chosen = parseMoney(installment)
    if (amount <= 0 || !startDate) return null
    if (lastEdited === 'amount') {
      if (chosen <= 0) return null
      return previewStaffLoan({
        principal: amount,
        termCount: 1,
        termUnit: 'pays',
        cycle,
        startDate,
        installment: chosen
      })
    }
    if (!Number.isFinite(count) || count < 1) return null
    return previewStaffLoan({
      principal: amount,
      termCount: count,
      termUnit,
      cycle,
      startDate
    })
  }, [principal, termCount, termUnit, installment, lastEdited, startDate, cycle, modal, loan])

  const openAdd = () => {
    const today = new Date().toISOString().slice(0, 10)
    setPrincipal('')
    setTermCount('5')
    setTermUnit('months')
    setInstallment('')
    setLastEdited('term')
    setStartDate(today)
    setError(null)
    setModal('add')
  }

  const openAdjust = () => {
    if (!loan) return
    const today = new Date().toISOString().slice(0, 10)
    setPrincipal(String(loan.remaining))
    setInstallment(String(loan.installment))
    setTermCount(String(termPaysForInstallment(loan.remaining, loan.installment)))
    setTermUnit('pays')
    setLastEdited('amount')
    setStartDate(today)
    setError(null)
    setModal('adjust')
  }

  const balanceAmount = () => (modal === 'adjust' && loan ? loan.remaining : parseMoney(principal))

  const changePrincipal = (value: string) => {
    setPrincipal(value)
    const total = parseMoney(value)
    if (lastEdited === 'amount') {
      const due = parseMoney(installment)
      if (total > 0 && due > 0) {
        setTermCount(String(termPaysForInstallment(total, due)))
        setTermUnit('pays')
      }
      return
    }
    const pays = paysForLoanTerm(cycle, Number(termCount), termUnit)
    if (total > 0 && pays > 0) setInstallment(String(loanInstallment(total, pays)))
  }

  const changeTermCount = (value: string) => {
    setTermCount(value)
    setLastEdited('term')
    const total = balanceAmount()
    const pays = paysForLoanTerm(cycle, Number(value), termUnit)
    if (total > 0 && pays > 0) setInstallment(String(loanInstallment(total, pays)))
  }

  const changeTermUnit = (value: LoanTermUnit) => {
    setTermUnit(value)
    setLastEdited('term')
    const total = balanceAmount()
    const pays = paysForLoanTerm(cycle, Number(termCount), value)
    if (total > 0 && pays > 0) setInstallment(String(loanInstallment(total, pays)))
  }

  const changeInstallment = (value: string) => {
    setInstallment(value)
    setLastEdited('amount')
    const total = balanceAmount()
    const due = parseMoney(value)
    if (total > 0 && due > 0) {
      setTermCount(String(termPaysForInstallment(total, due)))
      setTermUnit('pays')
    }
  }

  const submit = async () => {
    if (!modal) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/${staffId}/loan`, {
        method: modal === 'add' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          modal === 'add'
            ? {
                principal: parseMoney(principal),
                termCount: Number(termCount),
                termUnit,
                startDate,
                installment: preview?.installment ?? parseMoney(installment)
              }
            : {
                action: 'adjust',
                termCount: Number(termCount),
                termUnit,
                installment: preview?.installment ?? parseMoney(installment)
              }
        )
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to save staff loan')
      setData(body as LoanResponse)
      setModal(null)
      if (modal === 'add') onLegacyCleared?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save staff loan')
    } finally {
      setBusy(false)
    }
  }

  const cancelLoan = async () => {
    if (!loan || !confirm('Stop deducting this loan on future pay runs?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/${staffId}/loan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to cancel staff loan')
      setData(body as LoanResponse)
      setModal(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel staff loan')
    } finally {
      setBusy(false)
    }
  }

  const paidPays = loan?.repayments.length ?? 0
  const progress =
    loan && loan.principal > 0 ? Math.min(100, Math.round((loan.paid / loan.principal) * 100)) : 0

  return (
    <section className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Staff loan</h2>
            {loan ? (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusClass(loan.status)}`}>
                {statusLabel(loan.status)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-gray-500">Deducted on each processed pay run.</p>
        </div>
        {!loan ? (
          <button
            type="button"
            onClick={openAdd}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50"
          >
            Add loan
          </button>
        ) : loan.status === 'active' ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openAdjust}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50"
            >
              Adjust
            </button>
            <button
              type="button"
              onClick={() => void cancelLoan()}
              disabled={busy}
              className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded font-medium hover:bg-red-50 disabled:opacity-60"
            >
              Cancel loan
            </button>
          </div>
        ) : loan.status === 'paid' ? (
          <button
            type="button"
            onClick={openAdd}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50"
          >
            Add loan
          </button>
        ) : null}
      </div>

      {error && !modal ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading loan…</p>
      ) : loan ? (
        <>
          <dl className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs font-medium text-gray-500">Total</dt>
              <dd className="mt-0.5 text-sm text-gray-900 tabular-nums">{formatMoney(loan.principal)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Each pay</dt>
              <dd className="mt-0.5 text-sm text-gray-900 tabular-nums">{formatMoney(loan.installment)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Paid</dt>
              <dd className="mt-0.5 text-sm text-gray-900 tabular-nums">{formatMoney(loan.paid)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Remaining</dt>
              <dd className="mt-0.5 text-sm font-medium text-gray-900 tabular-nums">
                {formatMoney(loan.remaining)}
              </dd>
            </div>
          </dl>
          <div className="mt-3 h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {paidPays} of {loan.termPays} pays · last pay expected {formatDateOnlyForDisplay(loan.lastPayDate)}
          </p>
          {loan.repayments.length > 0 ? (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3 font-medium">Pay date</th>
                  <th className="py-2 text-right font-medium">Repayment</th>
                </tr>
              </thead>
              <tbody>
                {loan.repayments.map((row) => (
                  <tr key={`${row.payRunId}-${row.payDate}`} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-900">{formatDateOnlyForDisplay(row.payDate)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-900">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No processed repayments yet.</p>
          )}
        </>
      ) : openEnded > 0 ? (
        <p className="mt-4 text-sm text-gray-700">
          Open-ended deduction of {formatMoney(openEnded)} each pay. Add a total and term to track the
          balance.
        </p>
      ) : (
        <p className="mt-4 text-sm text-gray-500">No active loan.</p>
      )}

      {modal ? (
        <LoanModal
          title={modal === 'add' ? 'Add staff loan' : 'Adjust loan'}
          cycle={cycle}
          principal={principal}
          termCount={termCount}
          termUnit={termUnit}
          installment={installment}
          startDate={startDate}
          showPrincipal={modal === 'add'}
          showStart={modal === 'add'}
          preview={preview}
          error={error}
          busy={busy}
          onPrincipal={changePrincipal}
          onTermCount={changeTermCount}
          onTermUnit={changeTermUnit}
          onInstallment={changeInstallment}
          onStartDate={setStartDate}
          onClose={() => {
            setModal(null)
            setError(null)
          }}
          onSubmit={() => void submit()}
        />
      ) : null}
    </section>
  )
}

function LoanModal({
  title,
  cycle,
  principal,
  termCount,
  termUnit,
  installment,
  startDate,
  showPrincipal,
  showStart,
  preview,
  error,
  busy,
  onPrincipal,
  onTermCount,
  onTermUnit,
  onInstallment,
  onStartDate,
  onClose,
  onSubmit
}: {
  title: string
  cycle: PayCycle
  principal: string
  termCount: string
  termUnit: LoanTermUnit
  installment: string
  startDate: string
  showPrincipal: boolean
  showStart: boolean
  preview: ReturnType<typeof previewStaffLoan> | null
  error: string | null
  busy: boolean
  onPrincipal: (value: string) => void
  onTermCount: (value: string) => void
  onTermUnit: (value: LoanTermUnit) => void
  onInstallment: (value: string) => void
  onStartDate: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{payCycleLabel(cycle)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Close">
            ×
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {showPrincipal ? (
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Total loan amount</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={principal}
                onChange={(e) => onPrincipal(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </label>
          ) : (
            <p className="text-sm text-gray-700">
              Remaining {principal ? formatMoney(parseMoney(principal)) : '—'}. Change the amount each
              pay or how long is left.
            </p>
          )}
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Each pay</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={installment}
              onChange={(e) => onInstallment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </label>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Repay over</span>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={termCount}
                onChange={(e) => onTermCount(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded"
              />
              <select
                value={termUnit}
                onChange={(e) => onTermUnit(parseLoanTermUnit(e.target.value))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded"
              >
                <option value="months">months</option>
                <option value="pays">pays</option>
              </select>
            </div>
          </div>
          {showStart ? (
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Start on next pay</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </label>
          ) : null}
        </div>
        {preview ? (
          <dl className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-gray-800 space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt>Pay runs</dt>
              <dd className="tabular-nums">{preview.termPays}</dd>
            </div>
            {preview.lastInstallment !== preview.installment ? (
              <div className="flex justify-between gap-3">
                <dt>Last payment</dt>
                <dd className="tabular-nums">{formatMoney(preview.lastInstallment)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt>Last pay expected</dt>
              <dd>{formatDateOnlyForDisplay(preview.lastPayDate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Interest</dt>
              <dd>None</dd>
            </div>
          </dl>
        ) : null}
        <p className="mt-3 text-xs text-gray-500">
          The last pay takes leftover cents. Missing a pay does not double the next one.
        </p>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !preview}
            onClick={onSubmit}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:bg-gray-400"
          >
            {busy ? 'Saving…' : title === 'Add staff loan' ? 'Add loan' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
