'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PAY_CYCLE_LABELS, PAY_CYCLE_VALUES, type PayCycle } from '@/lib/pay-cycle'

type SavedPeriod = {
  id: string
  startDate: string
  endDate: string
}

type RunListItem = {
  id: string
  cycle: string
  status: string
  startDate: string
  endDate: string
  payDate: string
}

const SCHEDULES: Array<{ id: PayCycle | 'off'; label: string; hint: string }> = [
  { id: 'weekly', label: 'Weekly', hint: 'Pay once a week' },
  { id: 'biweekly', label: 'Bi-weekly', hint: 'Pay once every two weeks' },
  { id: 'semimonthly', label: 'Semi-monthly', hint: 'Pay twice a month' },
  { id: 'monthly', label: 'Monthly', hint: 'Pay once a month' },
  { id: 'off', label: 'Off-schedule', hint: 'Choose the dates yourself' }
]

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${Number(m)}/${Number(d)}/${y}`
}

export default function PayrollStartPage() {
  const router = useRouter()
  const [periods, setPeriods] = useState<SavedPeriod[]>([])
  const [runs, setRuns] = useState<RunListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<PayCycle | 'off'>('semimonthly')
  const [staffCycle, setStaffCycle] = useState<PayCycle>('semimonthly')
  const [periodId, setPeriodId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [payDate, setPayDate] = useState('')

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
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load payroll'))
      .finally(() => setLoading(false))
  }, [])

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId) ?? null,
    [periods, periodId]
  )

  const choosePeriod = (id: string) => {
    setPeriodId(id)
    const period = periods.find((item) => item.id === id)
    if (!period || schedule === 'off') return
    setStartDate(period.startDate)
    setEndDate(period.endDate)
    setPayDate(period.endDate)
  }

  const enterPayroll = async () => {
    if (!periodId) {
      setError('Choose an attendance period. Hours are filled from that extract.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const cycle = schedule === 'off' ? staffCycle : schedule
      const res = await fetch('/api/pay-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payPeriodId: periodId,
          cycle,
          payDate: payDate || selectedPeriod?.endDate,
          startDate: schedule === 'off' ? startDate : selectedPeriod?.startDate,
          endDate: schedule === 'off' ? endDate : selectedPeriod?.endDate
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to open payroll')
      if (data.status === 'draft' && data.id) {
        await fetch(`/api/pay-runs/${data.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payDate: payDate || data.payDate,
            ...(schedule === 'off' ? { startDate, endDate } : {})
          })
        })
      }
      router.push(`/payroll/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open payroll')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Run a new payroll</h1>
        <p className="mt-1 text-sm text-slate-500">
          Hours come from extracted attendance. Payroll starts here, not from the attendance page.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Pay schedule</span>
            <select
              value={schedule}
              onChange={(e) => {
                const next = e.target.value as PayCycle | 'off'
                setSchedule(next)
                if (next !== 'off' && selectedPeriod) {
                  setStartDate(selectedPeriod.startDate)
                  setEndDate(selectedPeriod.endDate)
                  setPayDate(selectedPeriod.endDate)
                }
              }}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            >
              {SCHEDULES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} — {item.hint}
                </option>
              ))}
            </select>
          </label>

          {schedule === 'off' ? (
            <>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Staff cycle</span>
                <select
                  value={staffCycle}
                  onChange={(e) => setStaffCycle(e.target.value as PayCycle)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  {PAY_CYCLE_VALUES.map((cycle) => (
                    <option key={cycle} value={cycle}>
                      {PAY_CYCLE_LABELS[cycle]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Period start</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Period end</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            </>
          ) : (
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-slate-800">Pay period</span>
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
          )}

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

        {schedule === 'off' ? (
          <label className="mt-4 block max-w-xl text-sm">
            <span className="font-medium text-slate-800">Hours from attendance period</span>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            >
              {periods.length === 0 ? <option value="">No extracted period yet</option> : null}
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {mdy(period.startDate)} – {mdy(period.endDate)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

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
          <h2 className="text-lg font-semibold text-slate-900">Payroll runs</h2>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No payroll runs yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {runs.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/payroll/${run.id}`)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span>
                      <span className="font-medium text-slate-900">
                        {mdy(run.startDate)} – {mdy(run.endDate)}
                      </span>
                      <span className="ml-2 text-sm text-slate-500">
                        {PAY_CYCLE_LABELS[run.cycle as PayCycle] ?? run.cycle} · Pay {mdy(run.payDate)}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-semibold uppercase ${
                        run.status === 'processed' ? 'text-emerald-700' : 'text-violet-700'
                      }`}
                    >
                      {run.status === 'processed' ? 'Approved' : 'Draft'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
