'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { payPeriodCycleNumber } from '@/lib/pay-cycle'
import { formatCurrency } from '@/lib/format'
import {
  PAYROLL_MONTHS,
  activePayrollYear,
  filterPayRuns,
  payRunListTitle,
  payRunTotals,
  payrollCycleOptions,
  payrollStatusCounts,
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
  lines?: Array<{ grossPay?: unknown; netPay?: unknown }>
}

type StatusFilter = 'all' | 'draft' | 'processed' | 'void'

const STATUS_CHIPS: Array<{
  id: Exclude<StatusFilter, 'all'>
  label: string
  dot: string
  active: string
}> = [
  { id: 'draft', label: 'Draft', dot: 'bg-violet-600', active: 'border-violet-200 bg-violet-50 text-violet-900' },
  {
    id: 'processed',
    label: 'Approved',
    dot: 'bg-emerald-500',
    active: 'border-emerald-200 bg-emerald-50 text-emerald-900'
  },
  { id: 'void', label: 'Voided', dot: 'bg-red-500', active: 'border-red-200 bg-red-50 text-red-900' }
]

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${Number(m)}/${Number(d)}/${y}`
}

function statusLabel(status: string): string {
  if (status === 'processed') return 'Approved'
  if (status === 'void') return 'Voided'
  return 'Draft'
}

export default function PayrollStartPage() {
  const router = useRouter()
  const [periods, setPeriods] = useState<SavedPeriod[]>([])
  const [runs, setRuns] = useState<RunListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [periodId, setPeriodId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [payDate, setPayDate] = useState('')
  const [cycleNumber, setCycleNumber] = useState('')
  const [cycleTouched, setCycleTouched] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
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

  const openRun = (runId: string) => {
    router.push(`/payroll/${runId}`)
  }

  const yearOptions = useMemo(() => payrollYears(runs), [runs])
  const cycleOptions = useMemo(() => {
    const source =
      statusFilter === 'all'
        ? runs.filter((run) => run.status !== 'void')
        : runs.filter((run) => run.status === statusFilter)
    const present = payrollCycleOptions(source, year, month)
    if (cycle !== 'all' && !present.includes(cycle)) return [...present, cycle].sort((a, b) => a - b)
    return present
  }, [runs, year, month, cycle, statusFilter])
  const periodRuns = useMemo(
    () => filterPayRuns(runs, { year, month, cycle, hideVoided: false, sort }),
    [runs, year, month, cycle, sort]
  )
  const counts = useMemo(() => payrollStatusCounts(periodRuns), [periodRuns])
  const visibleRuns =
    statusFilter === 'all' ? periodRuns.filter((run) => run.status !== 'void') : periodRuns.filter((run) => run.status === statusFilter)
  const filtersActive = month !== 'all' || cycle !== 'all' || sort !== 'latest'
  const listMessage =
    runs.length === 0
      ? 'No payroll runs yet.'
      : statusFilter === 'draft'
        ? 'No drafts.'
        : statusFilter === 'processed'
          ? 'No approved payroll runs.'
          : statusFilter === 'void'
            ? 'No voided payroll runs.'
            : periodRuns.length > 0 && visibleRuns.length === 0
              ? 'All payroll runs are voided.'
              : year !== 'all' && month === 'all' && cycle === 'all'
                ? `No payroll runs in ${year}.`
                : 'No payroll runs match these filters.'

  const toggleStatus = (next: Exclude<StatusFilter, 'all'>) => {
    setStatusFilter((current) => (current === next ? 'all' : next))
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-slate-900">Payroll</h1>
          <div className="flex items-center gap-2">
            <PayrollSettingsButton labeled />
            <button
              type="button"
              onClick={() => {
                setError(null)
                setCreateOpen(true)
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              Create pay run
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_CHIPS.map((chip) => {
              const selected = statusFilter === chip.id
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleStatus(chip.id)}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${
                    selected ? chip.active : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${chip.dot}`} aria-hidden="true" />
                  {chip.label} {counts[chip.id]}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              className={`inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium ${
                filtersActive
                  ? 'border-violet-200 text-violet-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Filters
              {filtersActive ? <span className="h-2 w-2 rounded-full bg-violet-600" aria-hidden="true" /> : null}
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Year
              <select
                value={year === 'all' ? 'all' : String(year)}
                onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-900"
              >
                {yearOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value="all">All years</option>
              </select>
            </label>
          </div>
        </div>

        {filtersOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
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
          </div>
        ) : null}

        {error && !createOpen ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : visibleRuns.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">{listMessage}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Pay run</th>
                  <th className="px-4 py-3 font-medium">Cycle</th>
                  <th className="px-4 py-3 font-medium">Pay date</th>
                  <th className="px-4 py-3 text-right font-medium">Gross</th>
                  <th className="px-4 py-3 text-right font-medium">Net</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="w-12 px-2 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map((run) => {
                  const totals = payRunTotals(run.lines)
                  const cycleNo = shownCycleNumber(run.cycleNumber, run.endDate)
                  const draft = run.status !== 'processed' && run.status !== 'void'
                  return (
                    <tr
                      key={run.id}
                      onClick={() => openRun(run.id)}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            openRun(run.id)
                          }}
                          className={`text-left font-medium hover:text-violet-800 ${
                            run.status === 'void' ? 'text-slate-500' : 'text-slate-900'
                          }`}
                        >
                          {payRunListTitle(run.cycleNumber, run.startDate, run.endDate)}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {cycleNo > 0 ? `Cycle ${cycleNo}` : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{mdy(run.payDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-800">
                        {formatCurrency(totals.gross)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                        {formatCurrency(totals.net)}
                      </td>
                      <td className="px-4 py-3">
                        {draft ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openRun(run.id)
                            }}
                            className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800"
                          >
                            Continue
                          </button>
                        ) : (
                          <span
                            className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${
                              run.status === 'void' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {statusLabel(run.status)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                        <RunMenu
                          disabled={busy}
                          canDelete={run.status === 'draft'}
                          onOpen={() => openRun(run.id)}
                          onDelete={() => void deleteDraft(run.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen ? (
        <CreatePayRunDialog
          periods={periods}
          periodId={periodId}
          startDate={startDate}
          endDate={endDate}
          payDate={payDate}
          cycleNumber={cycleNumber}
          busy={busy}
          loading={loading}
          error={error}
          onClose={() => {
            if (!busy) setCreateOpen(false)
          }}
          onChoosePeriod={choosePeriod}
          onStartDate={setStartDate}
          onEndDate={(value) => applyEndDate(value, false)}
          onPayDate={setPayDate}
          onCycleNumber={(value) => {
            setCycleTouched(true)
            setCycleNumber(value)
          }}
          onSubmit={() => void enterPayroll()}
        />
      ) : null}
    </div>
  )
}

function RunMenu({
  disabled,
  canDelete,
  onOpen,
  onDelete
}: {
  disabled: boolean
  canDelete: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Pay run actions"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          const rect = buttonRef.current?.getBoundingClientRect()
          if (!rect) return
          setPosition({ top: rect.bottom + 4, left: rect.right })
          setOpen(true)
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
      >
        ···
      </button>
      {open && position ? (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: position.top, left: position.left }}
          className="fixed z-30 w-36 -translate-x-full rounded-md border border-slate-200 bg-white py-1 text-left shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpen()
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Open
          </button>
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
              className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function CreatePayRunDialog({
  periods,
  periodId,
  startDate,
  endDate,
  payDate,
  cycleNumber,
  busy,
  loading,
  error,
  onClose,
  onChoosePeriod,
  onStartDate,
  onEndDate,
  onPayDate,
  onCycleNumber,
  onSubmit
}: {
  periods: SavedPeriod[]
  periodId: string
  startDate: string
  endDate: string
  payDate: string
  cycleNumber: string
  busy: boolean
  loading: boolean
  error: string | null
  onClose: () => void
  onChoosePeriod: (id: string) => void
  onStartDate: (value: string) => void
  onEndDate: (value: string) => void
  onPayDate: (value: string) => void
  onCycleNumber: (value: string) => void
  onSubmit: () => void
}) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          Create pay run
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose the pay range and pay date. Hours come from the attendance extract.
        </p>
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-slate-800">Hours from attendance</span>
              <select
                value={periodId}
                onChange={(e) => onChoosePeriod(e.target.value)}
                autoFocus
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
                onChange={(e) => onStartDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-800">Pay range end</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDate(e.target.value)}
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
                onChange={(e) => onCycleNumber(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-800">Pay date</span>
              <input
                type="date"
                value={payDate}
                onChange={(e) => onPayDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            People are included from the pay frequency on their staff record. A 1st–15th or 16th–end range pays
            semi-monthly staff.
          </p>
          {error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || loading || !periodId}
              className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {busy ? 'Opening…' : 'Enter payroll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
