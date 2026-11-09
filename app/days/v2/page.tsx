'use client'

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { depositComparisonsPath, parseFocusDate } from '@/lib/daily-close-path'
import { slipTasksForDay } from '@/lib/day-slip-tasks'
import DaySlipTasks, { CollapsedSlipIcons } from '../DaySlipTasks'
import DepositBreakdownModal from '../DepositBreakdownModal'
import OtherItemsBreakdownModal from '../OtherItemsBreakdownModal'
import { useScanEmail } from '../ScanEmailModal'
import { businessTodayYmd } from '@/lib/datetime-policy'
import {
  formatLitres,
  formatMoney,
  type CollectedLine,
  type DayVerdict,
  type DepositCheck,
  type ReconcileLine
} from '@/lib/day-reconcile'
import type { DayReportV2 } from '@/lib/day-reports-v2'
import type { DayTankCheck, TankCheckGrade } from '@/lib/tank-check'
import { useRouter, useSearchParams } from 'next/navigation'

function monthRange(yyyyMm: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}` }
}

function weekdayLabel(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

const VERDICT_STYLE: Record<DayVerdict, { dot: string; text: string }> = {
  reconciled: { dot: 'bg-green-600', text: 'text-green-800' },
  differs: { dot: 'bg-red-600', text: 'text-red-700' },
  waiting: { dot: 'bg-gray-400', text: 'text-gray-600' }
}

function Dot({ status }: { status: ReconcileLine['status'] }) {
  if (status === 'none') return <span className="mr-2 inline-block h-2.5 w-2.5 align-middle" />
  if (status === 'pending') {
    return <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-gray-400 align-middle" />
  }
  return (
    <span
      className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${
        status === 'match' ? 'bg-green-600' : 'bg-red-600'
      }`}
    />
  )
}

function cell(line: ReconcileLine, side: 'cstore' | 'shiftClose' | 'diff'): string {
  const v = line[side]
  if (v === null) return ''
  if (line.unit === 'litres') {
    if (side === 'diff') return Math.abs(v) < 0.1 ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)} L`
    return side === 'shiftClose'
      ? `${v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L`
      : formatLitres(v)
  }
  if (side === 'diff') return Math.abs(v) < 0.005 ? '-' : formatMoney(v, true)
  return formatMoney(v)
}

/** Sales as Cstore reports them: one amount column, nothing to compare. */
function SalesTable({
  title = 'Sales',
  lines,
  totalSales = null
}: {
  title?: string
  lines: ReconcileLine[]
  totalSales?: number | null
}) {
  return (
    <div>
      <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-2 py-1 text-left font-normal">Type</th>
              <th className="px-2 py-1 text-right font-normal">Cstore</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {lines.map((l) => (
              <tr key={l.key} className="border-b border-gray-100">
                <td className="px-2 py-1.5 text-left">{l.label}</td>
                <td className="px-2 py-1.5 text-right">{cell(l, 'cstore')}</td>
              </tr>
            ))}
            {totalSales !== null ? (
              <tr className="border-b border-gray-100 font-semibold">
                <td className="px-2 py-1.5 text-left">Total sales</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(totalSales)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Collected: the shifts' System column against their Count column, like the End of Shift screen. */
function CollectedTable({ lines, deposit }: { lines: CollectedLine[]; deposit: DepositCheck }) {
  return (
    <div>
      <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">Collected</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-2 py-1 text-left font-normal">Type</th>
              <th className="px-2 py-1 text-right font-normal">System</th>
              <th className="px-2 py-1 text-right font-normal">Count</th>
              <th className="px-2 py-1 text-right font-normal">Over/Short</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {lines.map((l) => (
              <tr key={l.key} className={`border-b border-gray-100 ${l.key === 'cashChecks' ? 'font-semibold' : ''}`}>
                <td className="px-2 py-1.5 text-left">
                  <Dot status={l.status} />
                  {l.label}
                </td>
                <td className="px-2 py-1.5 text-right">{formatMoney(l.system)}</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(l.count)}</td>
                <td className="px-2 py-1.5 text-right">
                  {Math.abs(l.overShort) < 0.005 ? '-' : formatMoney(l.overShort, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Over/Short is Count minus System, added up over the day&apos;s shifts as on the shift screen. Cash + Checks is the
        one that matters.
      </p>

      <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">Deposit</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-2 py-1 text-left font-normal">Type</th>
              <th className="px-2 py-1 text-right font-normal">Counted (Cash + Checks)</th>
              <th className="px-2 py-1 text-right font-normal">Deposited</th>
              <th className="px-2 py-1 text-right font-normal">Difference</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-b border-gray-100 font-semibold">
              <td className="px-2 py-1.5 text-left">
                <Dot status={deposit.status} />
                Deposit
              </td>
              <td className="px-2 py-1.5 text-right">{formatMoney(deposit.counted)}</td>
              <td className="px-2 py-1.5 text-right">{formatMoney(deposit.deposited)}</td>
              <td className="px-2 py-1.5 text-right">
                {Math.abs(deposit.diff) < 0.005 ? '-' : formatMoney(deposit.diff, true)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function litresFigure(n: number | null): string {
  return n === null ? '' : n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function TankTable({ tank }: { tank: DayTankCheck }) {
  const [open, setOpen] = useState(false)
  const [unleaded, diesel] = tank.grades
  const row = (label: string, pick: (g: TankCheckGrade) => string, options?: { bold?: boolean }) => {
    const a = pick(unleaded)
    const b = pick(diesel)
    if (!a && !b) return null
    return (
      <tr className={`border-b border-gray-100 ${options?.bold ? 'font-semibold' : ''}`}>
        <td className="px-2 py-1.5 text-left">{label}</td>
        <td className="px-2 py-1.5 text-right">{a}</td>
        <td className="px-2 py-1.5 text-right">{b}</td>
      </tr>
    )
  }
  const diff = (g: TankCheckGrade) => {
    if (g.diff === null) return ''
    if (Math.abs(g.diff) < 0.05) return '-'
    return `${g.diff > 0 ? '+' : ''}${litresFigure(g.diff)} L${g.rounding ? ' (rounding)' : ''}`
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-1 mt-5 flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700"
      >
        <svg
          viewBox="0 0 20 20"
          className={`h-3 w-3 shrink-0 fill-current text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <path d="M7 4l7 6-7 6z" />
        </svg>
        Tanks (litres)
        {!open ? (
          <span className="flex items-center gap-3 text-xs font-normal text-gray-600">
            {[unleaded, diesel].map((g, i) =>
              g.status === 'match' || g.status === 'differs' ? (
                <span key={i}>
                  <Dot status={g.status} />
                  {i === 0 ? 'Unleaded' : 'Diesel'}
                </span>
              ) : null
            )}
          </span>
        ) : null}
      </button>
      {open ? (
      <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-2 py-1 text-left font-normal">Type</th>
              <th className="px-2 py-1 text-right font-normal">Unleaded</th>
              <th className="px-2 py-1 text-right font-normal">Diesel</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {row('Cstore opening', (g) => litresFigure(g.cstoreOpening))}
            {row('Cstore delivered', (g) => litresFigure(g.cstorePurchase))}
            {row('Cstore sold', (g) => litresFigure(g.cstoreSold))}
            {row('Cstore closing (book)', (g) => litresFigure(g.cstoreClosing))}
            {row('Shift Close reading', (g) => litresFigure(g.reading), { bold: true })}
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1.5 text-left">Reading minus Cstore stick</td>
              <td className="px-2 py-1.5 text-right">
                <Dot status={unleaded.status} />
                {diff(unleaded)}
              </td>
              <td className="px-2 py-1.5 text-right">
                <Dot status={diesel.status} />
                {diff(diesel)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Shift Close reading is the tank reading saved for the start of {tank.readingDate}, which is the end of this
        day. A gap of 1 L or less is rounding.
      </p>
      </>
      ) : null}
    </div>
  )
}

function DayStatement({ day, onRefresh }: { day: DayReportV2; onRefresh: () => void }) {
  const router = useRouter()
  const [showShifts, setShowShifts] = useState(false)
  const [depositModal, setDepositModal] = useState<{ missingSlip: boolean; scans: boolean } | null>(null)
  const [otherItemsOpen, setOtherItemsOpen] = useState(false)
  const { openEmail, modal: emailModal } = useScanEmail()
  const r = day.reconcile
  const notes = [...r.shiftWarnings, ...r.notes, ...day.tank.notes]
  const showTank =
    day.tank.hasReading || day.tank.grades.some((g) => g.cstoreOpening !== null || g.cstoreStick !== null)

  return (
    <div className="border-t border-gray-200 px-4 pb-5 pt-3 sm:px-6">
      {r.hasCstore ? (
        <>
          <p className="text-xs text-gray-500">
            Sales and fuel are what the Cstore daily report says.
          </p>

          <SalesTable lines={r.sales.lines.filter((l) => l.unit === 'usd')} totalSales={r.sales.totalSales} />
          <SalesTable title="Fuel sold (litres)" lines={r.sales.lines.filter((l) => l.unit === 'litres')} />
        </>
      ) : null}

      <CollectedTable lines={r.collected.lines} deposit={r.collected.deposit} />

      {showTank ? <TankTable tank={day.tank} /> : null}

      <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">Notes</h3>
      <div className="space-y-1 text-sm">
        {notes.map((n, i) => (
          <p key={i} className={i < r.shiftWarnings.length ? 'text-gray-900' : 'text-gray-600'}>
            {n}
          </p>
        ))}
        {!r.hasCstore ? (
          <p className="text-gray-600">Sales fill in once the Cstore daily report is in.</p>
        ) : null}
        {notes.length === 0 && r.hasCstore ? <p className="text-gray-600">Nothing to flag.</p> : null}
      </div>

      <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">Paper</h3>
      <div className="overflow-hidden rounded border border-gray-200">
        <DaySlipTasks
          showFacts={false}
          dayReport={day}
          onRefresh={onRefresh}
          onEmail={(kind) => {
            const urls =
              kind === 'deposit' ? day.depositScans : kind === 'debit' ? day.debitScans : day.securityScans ?? []
            openEmail(day.date, kind, urls)
          }}
          onMissingDepositSlip={() => setDepositModal({ missingSlip: true, scans: false })}
          onCompare={(kind) => {
            if (kind === 'deposit') setDepositModal({ missingSlip: false, scans: true })
            else setOtherItemsOpen(true)
          }}
          reviewHref={depositComparisonsPath(day.date)}
          onExport={() => undefined}
          onOpenShift={(shiftId) => router.push(`/shifts/${shiftId}`)}
        />
      </div>

      {showShifts ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="px-2 py-1 text-left font-normal">Shift</th>
                <th className="px-2 py-1 text-left font-normal">Supervisor</th>
                <th className="px-2 py-1 text-right font-normal">Fleet</th>
                <th className="px-2 py-1 text-right font-normal">In-house</th>
                <th className="px-2 py-1 text-right font-normal">Credit/Debit</th>
                <th className="px-2 py-1 text-right font-normal">Deposited</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.shifts.map((s) => (
                <tr key={s.shift} className="border-b border-gray-100">
                  <td className="px-2 py-1.5 text-left">
                    <span
                      className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${
                        s.missingPos ? 'bg-red-600' : 'bg-green-600'
                      }`}
                    />
                    {s.shift}
                  </td>
                  <td className="px-2 py-1.5 text-left">{s.supervisor}</td>
                  <td className="px-2 py-1.5 text-right">{formatMoney(s.fleet)}</td>
                  <td className="px-2 py-1.5 text-right">{formatMoney(s.inhouse)}</td>
                  <td className="px-2 py-1.5 text-right">{formatMoney(s.creditDebit)}</td>
                  <td className="px-2 py-1.5 text-right">{formatMoney(s.deposited)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowShifts((v) => !v)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
        >
          {showShifts ? 'Hide shifts' : 'Show shifts'}
        </button>
        <Link
          href={depositComparisonsPath(day.date)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
        >
          Review deposits
        </Link>
        {r.pulledAt ? (
          <span className="ml-auto text-xs text-gray-500">
            Cstore report pulled {new Date(r.pulledAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        ) : null}
      </div>

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
    </div>
  )
}

function DaysV2Page() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusDate = parseFocusDate(searchParams.get('date'))
  const [month, setMonth] = useState<string>(() => (focusDate ?? businessTodayYmd()).slice(0, 7))
  const [days, setDays] = useState<DayReportV2[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openDate, setOpenDate] = useState<string | null>(focusDate)

  const load = useCallback((silent = false) => {
    const range = monthRange(month)
    if (!range) return
    if (!silent) setLoading(true)
    setError(null)
    fetch(`/api/days/v2?from=${range.from}&to=${range.to}`, { cache: 'no-store' })
      .then(async (res) => {
        const data: unknown = await res.json()
        if (!res.ok || !Array.isArray(data)) {
          setError('Could not load End of Day.')
          setDays([])
          return
        }
        setDays(data as DayReportV2[])
      })
      .catch(() => {
        setError('Could not load End of Day.')
        setDays([])
      })
      .finally(() => setLoading(false))
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  const sorted = useMemo(() => [...days].sort((a, b) => (a.date > b.date ? -1 : 1)), [days])

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">End of Day</h1>
          <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
            V2 preview
          </span>
          <Link href="/days" className="ml-auto text-sm font-medium text-blue-700 hover:underline">
            Current End of Day
          </Link>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Each day is compared with the Cstore daily report. Upload the deposit, credit/debit and security slips under
          Paper on each day.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-700" htmlFor="eod-v2-month">
            Month
          </label>
          <input
            id="eod-v2-month"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value)
              setOpenDate(null)
              if (searchParams.get('date')) router.replace('/days/v2', { scroll: false })
            }}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : loading && sorted.length === 0 ? (
          <div className="rounded border border-gray-200 bg-white p-8 text-center text-gray-500">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="rounded border border-gray-200 bg-white p-8 text-center text-gray-500">
            No end of day records for this month.
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((day) => {
              const r = day.reconcile
              const open = openDate === day.date
              const style = VERDICT_STYLE[r.verdict]
              const tasks = slipTasksForDay(day)
              const slipsLeft = tasks.filter((t) => !t.done).length
              return (
                <Fragment key={day.date}>
                  <div
                    id={`eod-v2-day-${day.date}`}
                    className={`rounded border bg-white shadow-sm ${
                      focusDate === day.date ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenDate(open ? null : day.date)}
                      className="flex w-full flex-col gap-2 p-4 text-left hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      aria-expanded={open}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-lg font-bold text-gray-900">{day.date}</span>
                          <span className="text-sm text-gray-500">{weekdayLabel(day.date)}</span>
                          {day.status !== 'Complete' ? (
                            <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-900">
                              {day.status}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className={`font-semibold ${style.text}`}>
                            <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${style.dot}`} />
                            {r.verdictText}
                          </span>
                          <span className="text-gray-600">
                            Over/short{' '}
                            <span className="font-semibold text-gray-800">
                              {formatMoney(r.overShort.overShort, true)}
                            </span>
                          </span>
                          <span className="text-gray-600">
                            Deposits{' '}
                            <span className="font-semibold text-gray-800">
                              {formatMoney(day.totals.totalDeposits)}
                            </span>
                          </span>
                          {tasks.length > 0 ? (
                            <span className={slipsLeft === 0 ? 'text-gray-600' : 'font-medium text-amber-800'}>
                              {slipsLeft === 0
                                ? 'Slips filed'
                                : slipsLeft === 1
                                  ? '1 slip still needed'
                                  : `${slipsLeft} slips still needed`}
                            </span>
                          ) : null}
                          {r.shiftWarnings.length > 0 ? (
                            <span className="font-medium text-red-700">POS figures missing</span>
                          ) : null}
                        </div>
                      </div>
                      <span className="flex items-center gap-3">
                        {!open ? <CollapsedSlipIcons dayReport={day} /> : null}
                        <span className="text-gray-400">{open ? '▼' : '▶'}</span>
                      </span>
                    </button>
                    {open ? <DayStatement day={day} onRefresh={() => load(true)} /> : null}
                  </div>
                </Fragment>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function DaysV2PageRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-500">Loading…</div>}>
      <DaysV2Page />
    </Suspense>
  )
}
