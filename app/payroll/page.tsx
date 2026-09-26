'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { payPeriodCycleNumber } from '@/lib/pay-cycle'
import {
  PAYROLL_MONTHS,
  activePayrollYear,
  filterPayRuns,
  payrollCycleOptions,
  payrollYears,
  shownCycleNumber,
  type PayRunSort
} from '@/lib/pay-run-list'
import { PayrollSettingsButton } from '@/app/payroll/PayrollSettingsButton'

type SavedPeriod = {
  id: string
  startDate: string
  endDate: string
}

type RunListItem = {
  id: string
  cycleNumber: number
  status: string
  startDate: string
  endDate: string
  payDate: string
}

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${Number(m)}/${Number(d)}/${y}`
}

function cycleLabel(cycleNumber: number, endDate: string): string {
  const n = shownCycleNumber(cycleNumber, endDate)
  return n > 0 ? `Cycle ${n}` : 'Cycle'
}

export default function PayrollStartPage() {
  const router = useRouter()
  const [periods, setPeriods] = useState<SavedPeriod[]>([])
  const [runs, setRuns] = useState<RunListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [periodId, setPeriodId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [payDate, setPayDate] = useState('')
  const [cycleNumber, setCycleNumber] = useState('')
  const [cycleTouched, setCycleTouched] = useState(false)
  const [hideVoided, setHideVoided] = useState(true)
  const [year, setYear] = useState<number | 'all'>(() => activePayrollYear())
  const [month, setMonth] = useState<number | 'all'>('all')
  const [cycle, setCycle] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<PayRunSort>('latest')

  useEffect(() => {
    Promise.all([
      fetch('/api/attendance/pay-period').then(async (res) => {
        if (!res.ok) throw new Error('Failed to load attendance periods')
        return res.json()
      }),
      fetch('/api/pay-runs').then(async (res) => {
        if (!res.ok) throw new Error('Failed to load payroll')
        return res.json()
      })
    ])
      .then(([periodList, runList]) => {
        const nextPeriods = Array.isArray(periodList) ? (periodList as SavedPeriod[]) : []
        setPeriods(nextPeriods)
        setRuns(Array.isArray(runList) ? runList : [])
        const first = nextPeriods[0]
        if (first) {
          setPeriodId(first.id)
          setStartDate(first.startDate)
          setEndDate(first.endDate)
          setPayDate(first.endDate)
          setCycleNumber(payPeriodCycleNumber(first.endDate))
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load payroll'))
      .finally(() => setLoading(false))
  }, [])

  const applyEndDate = (value: string, forceCycle: boolean) => {
    setPayDate((current) => (forceCycle || current === endDate ? value : current))
    setEndDate(value)
    if (forceCycle || !cycleTouched) setCycleNumber(payPeriodCycleNumber(value))
  }

  const choosePeriod = (id: string) => {
    setPeriodId(id)
    const period = periods.find((item) => item.id === id)
    if (!period) return
    setCycleTouched(false)
    setStartDate(period.startDate)
    applyEndDate(period.endDate, true)
  }

  const deleteDraft = async (runId: string) => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${runId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete draft')
      setRuns((current) => current.filter((run) => run.id !== runId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete draft')
    } finally {
      setBusy(false)
    }
  }

  const enterPayroll = async () => {
    if (!periodId) {
      setError('Choose an attendance period. Hours are filled from that extract.')
      return
    }
    if (!startDate || !endDate || startDate > endDate) {
      setError('Choose a pay range. The end date has to be on or after the start date.')
      return
    }
    const cycle = Number(cycleNumber)
    if (!Number.isInteger(cycle) || cycle < 1 || cycle > 53) {
      setError('Pay cycle must be a number from 1 to 53.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/pay-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payPeriodId: periodId,
          payDate: payDate || endDate,
          startDate,
          endDate,
          cycleNumber: cycle
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to open payroll')
      router.push(`/payroll/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open payroll')
      setBusy(false)
    }
  }

  const yearOptions = useMemo(() => payrollYears(runs), [runs])
  const cycleOptions = useMemo(() => {
    const source = hideVoided ? runs.filter((run) => run.status !== 'void') : runs
    const present = payrollCycleOptions(source, year, month)
    if (cycle !== 'all' && !present.includes(cycle)) return [...present, cycle].sort((a, b) => a - b)
    return present
  }, [runs, year, month, cycle, hideVoided])
  const matchedRuns = useMemo(
    () => filterPayRuns(runs, { year, month, cycle, hideVoided: false, sort }),
    [runs, year, month, cycle, sort]
  )
  const visibleRuns = hideVoided ? matchedRuns.filter((run) => run.status !== 'void') : matchedRuns
  const listMessage =
    runs.length === 0
      ? 'No payroll runs yet.'
      : matchedRuns.length > 0 && visibleRuns.length === 0
        ? 'All payroll runs are voided.'
        : year !== 'all' && month === 'all' && cycle === 'all'
          ? `No payroll runs in ${year}.`
          : 'No payroll runs match these filters.'

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Run a new payroll</h1>
            <p className="mt-1 text-sm text-slate-500">
              Choose the pay range and pay date. Hours come from the attendance extract.
            </p>
          </div>
          <PayrollSettingsButton />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-800">Hours from attendance</span>
            <select
              value={periodId}
              onChange={(e) => choosePeriod(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            >
              {periods.length === 0 ? <option value="">No extracted period yet</option> : null}
              {periods.map((period, index) => (
                <option key={period.id} value={period.id}>
                  {mdy(period.startDate)} – {mdy(period.endDate)}
                  {index === 0 ? ' (latest)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-800">Pay range start</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Pay range end</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => applyEndDate(e.target.value, false)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Pay cycle</span>
            <input
              type="number"
              min={1}
              max={53}
              value={cycleNumber}
              onChange={(e) => {
                setCycleTouched(true)
                setCycleNumber(e.target.value)
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Pay date</span>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <p className="mt-4 max-w-2xl text-sm text-slate-500">
          People are included from the pay frequency on their staff record. A 1st–15th or 16th–end range pays
          semi-monthly staff.
        </p>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={enterPayroll}
            disabled={busy || loading || !periodId}
            className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {busy ? 'Opening…' : 'Enter payroll'}
          </button>
        </div>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Payroll runs</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Year</span>
                <select
                  value={year === 'all' ? 'all' : String(year)}
                  onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  {yearOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value="all">All years</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Month</span>
                <select
                  value={month === 'all' ? 'all' : String(month)}
                  onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="all">All months</option>
                  {PAYROLL_MONTHS.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Cycle</span>
                <select
                  value={cycle === 'all' ? 'all' : String(cycle)}
                  onChange={(e) => setCycle(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="all">All cycles</option>
                  {cycleOptions.map((option) => (
                    <option key={option} value={option}>
                      Cycle {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value === 'earliest' ? 'earliest' : 'latest')}
                  className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="latest">Latest cycle</option>
                  <option value="earliest">Earliest cycle</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={hideVoided}
                  onChange={(e) => setHideVoided(e.target.checked)}
                />
                Hide voided
              </label>
            </div>
          </div>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : visibleRuns.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{listMessage}</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {visibleRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => router.push(`/payroll/${run.id}`)}
                    className="flex min-w-0 flex-1 items-center justify-between text-left"
                  >
                    <span>
                      <span className="font-medium text-slate-900">
                        {mdy(run.startDate)} – {mdy(run.endDate)}
                      </span>
                      <span className="ml-2 text-sm text-slate-500">
                        {cycleLabel(run.cycleNumber, run.endDate)} · Pay {mdy(run.payDate)}
                      </span>
                    </span>
                    <span
                      className={`ml-3 shrink-0 text-xs font-semibold uppercase ${
                        run.status === 'processed'
                          ? 'text-emerald-700'
                          : run.status === 'void'
                            ? 'text-red-700'
                            : 'text-violet-700'
                      }`}
                    >
                      {run.status === 'processed' ? 'Approved' : run.status === 'void' ? 'Voided' : 'Draft'}
                    </span>
                  </button>
                  {run.status === 'draft' ? (
                    <button
                      type="button"
                      onClick={() => deleteDraft(run.id)}
                      disabled={busy}
                      className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
