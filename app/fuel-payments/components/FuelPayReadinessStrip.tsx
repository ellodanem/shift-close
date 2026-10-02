'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { ExpectedRevenueShareCard } from '@/app/insights/expected-revenue/ExpectedRevenueShareCard'
import { businessTodayYmd, formatDateOnlyForDisplay, isYmd } from '@/lib/datetime-policy'
import { formatAmount } from '@/lib/fuelPayments'
import type { DaysOfCover } from '@/lib/fuel-inventory'
import type { ExpectedRevenueShareInput } from '@/lib/expected-revenue-share'

/**
 * Decision row on Fuel Invoices. Revert to the previous layout from
 * backup/fuel-invoices-before-readiness-strip (d24f376): remove this file
 * and the <FuelPayReadinessStrip /> line in invoices/page.tsx.
 */

const INCOMING_STORAGE_KEY = 'shift-close.fuel-pay-incoming'
const CHECKS_SHOWN = 3

type CoverPayload = {
  book: { onHand: { unleaded: number; diesel: number } } | null
  daysOfCoverTypical: { unleaded: DaysOfCover; diesel: DaysOfCover }
  daysOfCoverBusy: { unleaded: DaysOfCover; diesel: DaysOfCover }
}

type RevenuePayload = ExpectedRevenueShareInput

type CheckRow = {
  id: string
  payee: string
  paymentDate: string
  totalAmount: number
}

type SavedIncoming = {
  startDate: string
  endDate: string
  depositsAndCardOnly: boolean
}

function formatCoverDays(days: number): string {
  if (days <= 0) return '0'
  return days >= 10 ? days.toFixed(0) : days.toFixed(1)
}

function coverTone(days: number): string {
  if (days <= 0) return 'text-red-700'
  if (days < 2) return 'text-amber-700'
  return 'text-emerald-800'
}

function coverLine(cover: DaysOfCover): { daysLabel: string; when: string } {
  if (cover.days <= 0) {
    return {
      daysLabel: 'Empty today',
      when: cover.runsOutOn ? formatDateOnlyForDisplay(cover.runsOutOn) : ''
    }
  }
  const days = formatCoverDays(cover.days)
  if (!cover.runsOutOn) return { daysLabel: `${days} days+`, when: '' }
  return { daysLabel: `${days} days`, when: `runs out ${formatDateOnlyForDisplay(cover.runsOutOn)}` }
}

function readSavedIncoming(): SavedIncoming | null {
  try {
    const raw = localStorage.getItem(INCOMING_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedIncoming>
    if (!parsed.startDate || !parsed.endDate || !isYmd(parsed.startDate) || !isYmd(parsed.endDate)) {
      return null
    }
    if (parsed.startDate > parsed.endDate) return null
    return {
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      depositsAndCardOnly: parsed.depositsAndCardOnly !== false
    }
  } catch {
    return null
  }
}

function writeSavedIncoming(value: SavedIncoming) {
  try {
    localStorage.setItem(INCOMING_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // The strip still works if storage is blocked.
  }
}

function money(amount: number): string {
  return `XCD ${formatAmount(amount)}`
}

export function FuelPayReadinessStrip() {
  const today = businessTodayYmd()
  const [cover, setCover] = useState<CoverPayload | null>(null)
  const [coverLoading, setCoverLoading] = useState(true)
  const [coverError, setCoverError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [depositsAndCardOnly, setDepositsAndCardOnly] = useState(true)
  const [revenue, setRevenue] = useState<RevenuePayload | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [revenueError, setRevenueError] = useState<string | null>(null)

  const [checks, setChecks] = useState<CheckRow[] | null>(null)
  const [checksLoading, setChecksLoading] = useState(true)
  const [checksError, setChecksError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const shareCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const loadCover = async () => {
      setCoverLoading(true)
      try {
        const res = await fetch('/api/insights/fuel-expectancy', { cache: 'no-store' })
        if (!res.ok) throw new Error('Could not load cover')
        const data = (await res.json()) as CoverPayload
        if (!cancelled) {
          setCover(data)
          setCoverError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setCover(null)
          setCoverError(error instanceof Error ? error.message : 'Could not load cover')
        }
      } finally {
        if (!cancelled) setCoverLoading(false)
      }
    }
    void loadCover()
    return () => {
      cancelled = true
    }
  }, [])

  const calculateIncoming = useCallback(async (from: string, to: string) => {
    if (from > to) {
      setRevenue(null)
      setRevenueError('From must be on or before To.')
      return
    }
    setRevenueLoading(true)
    setRevenueError(null)
    try {
      const params = new URLSearchParams({ startDate: from, endDate: to })
      const res = await fetch(`/api/insights/expected-revenue?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Could not load incoming cash')
      }
      setRevenue((await res.json()) as RevenuePayload)
    } catch (error) {
      setRevenue(null)
      setRevenueError(error instanceof Error ? error.message : 'Could not load incoming cash')
    } finally {
      setRevenueLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    const saved = readSavedIncoming()
    if (!saved) return
    setStartDate(saved.startDate)
    setEndDate(saved.endDate)
    setDepositsAndCardOnly(saved.depositsAndCardOnly)
    void calculateIncoming(saved.startDate, saved.endDate)
  }, [calculateIncoming])

  useEffect(() => {
    let cancelled = false
    const loadChecks = async () => {
      setChecksLoading(true)
      try {
        const res = await fetch('/api/vendor-payments/uncashed-checks', { cache: 'no-store' })
        if (!res.ok) throw new Error('Could not load checks')
        const data = (await res.json()) as CheckRow[]
        if (!cancelled) {
          setChecks(Array.isArray(data) ? data : [])
          setChecksError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setChecks(null)
          setChecksError(error instanceof Error ? error.message : 'Could not load checks')
        }
      } finally {
        if (!cancelled) setChecksLoading(false)
      }
    }
    void loadChecks()
    return () => {
      cancelled = true
    }
  }, [])

  const shownChecks = (checks ?? [])
    .slice()
    .sort((a, b) => b.totalAmount - a.totalAmount || a.paymentDate.localeCompare(b.paymentDate))
  const checksTotal = shownChecks.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0)
  const visibleChecks = shownChecks.slice(0, CHECKS_SHOWN)
  const hiddenCheckCount = Math.max(0, shownChecks.length - visibleChecks.length)

  const incomingAmount =
    revenue == null
      ? null
      : depositsAndCardOnly
        ? revenue.totalDeposits + revenue.totalDebitAndCredit
        : revenue.grandTotal

  const onCalculate = () => {
    writeSavedIncoming({ startDate, endDate, depositsAndCardOnly })
    void calculateIncoming(startDate, endDate)
  }

  const copyIncoming = useCallback(async () => {
    if (!revenue || !shareCardRef.current || copying) return
    setCopyError(null)
    setCopying(true)
    try {
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Empty image')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
    } catch {
      setCopied(false)
      setCopyError('Could not copy the image.')
    } finally {
      setCopying(false)
    }
  }, [copying, revenue])

  return (
    <>
    <section className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white" aria-label="Can I pay?">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left ${
          open ? 'border-b border-gray-200' : ''
        }`}
      >
        <h2 className="text-sm font-semibold text-slate-800">Can I pay?</h2>
        <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
          {open ? 'Hide' : 'Show'}
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 border-b-2 border-r-2 border-gray-500 ${
              open ? '-translate-y-px rotate-[225deg]' : 'translate-y-px rotate-45'
            }`}
          />
        </span>
      </button>
      {open ? (
      <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x md:divide-gray-200">
        <div className="border-b border-gray-200 px-4 py-3 md:border-b-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cover</p>
          {coverLoading ? <p className="mt-2 text-sm text-gray-500">Loading cover…</p> : null}
          {coverError ? <p className="mt-2 text-sm text-red-700">{coverError}</p> : null}
          {!coverLoading && !coverError && !cover?.book ? (
            <p className="mt-2 text-sm text-amber-800">No opening reading yet.</p>
          ) : null}
          {!coverLoading && !coverError && cover?.book ? (
            <div className="mt-2 space-y-2">
              <CoverGrade label="Unleaded" cover={cover.daysOfCoverTypical.unleaded} />
              <CoverGrade label="Diesel" cover={cover.daysOfCoverTypical.diesel} />
              <p className="text-xs text-gray-500">
                Busy {formatCoverDays(cover.daysOfCoverBusy.unleaded.days)} /{' '}
                {formatCoverDays(cover.daysOfCoverBusy.diesel.days)} days
              </p>
            </div>
          ) : null}
          <Link
            href="/insights/fuel-expectancy"
            className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline"
          >
            Open expectancy
          </Link>
        </div>

        <div className="border-b border-gray-200 px-4 py-3 md:border-b-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Incoming</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-[9rem] flex-1">
              <span className="mb-1 block text-xs text-gray-500">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setRevenue(null)
                  setRevenueError(null)
                }}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:min-h-0"
              />
            </label>
            <label className="min-w-[9rem] flex-1">
              <span className="mb-1 block text-xs text-gray-500">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setRevenue(null)
                  setRevenueError(null)
                }}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:min-h-0"
              />
            </label>
            <button
              type="button"
              onClick={onCalculate}
              disabled={revenueLoading}
              className="min-h-[44px] rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:min-h-0"
            >
              {revenueLoading ? 'Calculating…' : 'Calculate'}
            </button>
          </div>
          {revenueError ? <p className="mt-2 text-sm text-red-700">{revenueError}</p> : null}
          {incomingAmount != null && !revenueError && revenue ? (
            <div className="mt-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xl font-bold tabular-nums text-gray-900">{money(incomingAmount)}</p>
                <p className="text-xs text-gray-500">
                  {depositsAndCardOnly ? 'Deposits + card' : 'Grand total'}
                  {` · ${revenue.shiftCount} shift${revenue.shiftCount === 1 ? '' : 's'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyIncoming()}
                disabled={copying}
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60 sm:min-h-0"
              >
                {copying ? 'Copying…' : copied ? 'Copied' : 'Copy image'}
              </button>
            </div>
          ) : null}
          {copyError ? <p className="mt-1 text-xs text-red-700">{copyError}</p> : null}
          {!revenue && !revenueLoading && !revenueError ? (
            <p className="mt-2 text-xs text-gray-500">Choose a range, then calculate. Not in the bank yet.</p>
          ) : null}
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={depositsAndCardOnly}
              onChange={(e) => {
                const next = e.target.checked
                setDepositsAndCardOnly(next)
                const saved = readSavedIncoming()
                if (saved) writeSavedIncoming({ ...saved, depositsAndCardOnly: next })
              }}
              className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-xs leading-snug text-gray-600">Exclude fleet & vouchers</span>
          </label>
          <Link
            href="/insights/expected-revenue"
            className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline"
          >
            Open expected revenue
          </Link>
        </div>

        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Checks</p>
          {checksLoading ? <p className="mt-2 text-sm text-gray-500">Loading checks…</p> : null}
          {checksError ? <p className="mt-2 text-sm text-red-700">{checksError}</p> : null}
          {!checksLoading && !checksError && checks ? (
            <>
              <p className="mt-2 text-sm text-gray-800">
                {checks.length === 0
                  ? 'No uncashed checks'
                  : `${checks.length} uncashed · ${money(checksTotal)}`}
              </p>
              {visibleChecks.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {visibleChecks.map((check) => (
                    <li key={check.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-gray-800" title={check.payee}>
                        {check.payee}
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-900">{formatAmount(check.totalAmount)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {hiddenCheckCount > 0 ? (
                <p className="mt-1 text-xs text-gray-500">{hiddenCheckCount} more</p>
              ) : null}
            </>
          ) : null}
          <Link
            href="/vendor-payments/uncashed-checks"
            className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline"
          >
            Open check management
          </Link>
        </div>
      </div>
      ) : null}
    </section>
    {revenue ? (
      <ExpectedRevenueShareCard
        ref={shareCardRef}
        data={revenue}
        depositsAndCardOnly={depositsAndCardOnly}
      />
    ) : null}
    </>
  )
}

function CoverGrade({ label, cover }: { label: string; cover: DaysOfCover }) {
  const line = coverLine(cover)
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-gray-700">{label}</span>
      <span className="text-right">
        <span className={`text-sm font-semibold tabular-nums ${coverTone(cover.days)}`}>{line.daysLabel}</span>
        {line.when ? <span className="mt-0.5 block text-xs text-gray-500">{line.when}</span> : null}
      </span>
    </div>
  )
}
