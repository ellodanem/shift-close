'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/app/components/AuthContext'
import { businessTodayYmd } from '@/lib/datetime-policy'
import {
  DIESEL_UNUSABLE_LITRES,
  UNLEADED_UNUSABLE_LITRES,
  formatLitres,
  type DaysOfCover,
  type FuelExpectancyComputed,
  type FuelHorizon,
  type WeekdayAverages
} from '@/lib/fuel-inventory'

type Payload = FuelExpectancyComputed & {
  canManage: boolean
  recentReadings: Array<{
    id: string
    date: string
    kind: string
    unleadedLitres: number
    dieselLitres: number
    unleadedDelta: number
    dieselDelta: number
    notes: string
    createdBy: string
    createdAt: string
  }>
}

function coverLabel(cover: DaysOfCover): string {
  if (cover.days <= 0) return cover.runsOutOn ? `Empty today (${cover.runsOutOn})` : 'Empty'
  const days = cover.days >= 10 ? cover.days.toFixed(0) : cover.days.toFixed(1)
  if (!cover.runsOutOn) return `${days} days+`
  return `${days} days (runs out ${cover.runsOutOn})`
}

function enoughClass(enough: boolean): string {
  return enough ? 'text-emerald-800' : 'text-red-700'
}

export default function FuelExpectancyPage() {
  const { isFullAccess } = useAuth()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/insights/fuel-expectancy', { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to load')
      }
      setData((await res.json()) as Payload)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100/90 to-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-900">
            Fuel expectancy
          </span>
          <Link
            href="/insights/expected-revenue"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
          >
            Expected revenue
          </Link>
          {isFullAccess ? (
            <Link
              href="/fuel-payments/invoices"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
            >
              Fuel invoices
            </Link>
          ) : null}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Fuel expectancy</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
          On-hand litres come from the opening reading, plus Fuel invoice volumes, minus shift-close
          sales. The true tank figure is shown; “will we last?” uses usable litres (unleaded −{' '}
          {formatLitres(UNLEADED_UNUSABLE_LITRES)} L, diesel − {formatLitres(DIESEL_UNUSABLE_LITRES)} L).
          Typical is the last 12 of that weekday; busy is a high day in that same window. Forecasts
          assume no more trucks.
        </p>

        {loading ? <p className="mt-6 text-sm text-gray-500">Loading…</p> : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {data && !data.book ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            No opening tank reading yet.
            {isFullAccess ? (
              <>
                {' '}
                Set one on{' '}
                <Link href="/fuel-payments/invoices" className="font-semibold underline">
                  Fuel invoices
                </Link>
                , then enter unleaded and diesel litres on new Fuel invoices.
              </>
            ) : (
              ' Ask a manager to set an opening reading and enter invoice litres.'
            )}
          </div>
        ) : null}

        {data?.book ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <OnHandCard
                title="Unleaded"
                accent="border-green-200 bg-green-50/80"
                onHand={data.book.onHand.unleaded}
                usable={data.book.usable.unleaded}
                reserve={UNLEADED_UNUSABLE_LITRES}
                cover={data.daysOfCoverTypical.unleaded}
                busyCover={data.daysOfCoverBusy.unleaded}
              />
              <OnHandCard
                title="Diesel"
                accent="border-green-800/30 bg-emerald-50/80"
                onHand={data.book.onHand.diesel}
                usable={data.book.usable.diesel}
                reserve={DIESEL_UNUSABLE_LITRES}
                cover={data.daysOfCoverTypical.diesel}
                busyCover={data.daysOfCoverBusy.diesel}
              />
            </div>

            <p className="text-xs text-gray-500">
              Opening {data.book.opening.date}. {data.weekdayName} {data.asOfDate}. Sold today{' '}
              {formatLitres(data.soldToday.unleaded)} L unleaded / {formatLitres(data.soldToday.diesel)} L
              diesel. Typical remaining today {formatLitres(data.remainingTodayTypical.unleaded)} /{' '}
              {formatLitres(data.remainingTodayTypical.diesel)} L.
            </p>

            <HorizonTable horizons={data.horizons} />
          </div>
        ) : null}

        {data ? (
          <div className="mt-6">
            <WeekdayTable rows={data.weekdayAverages} today={data.weekday} />
          </div>
        ) : null}

        {!loading && !error && !data ? (
          <p className="mt-6 text-sm text-gray-500">No data.</p>
        ) : null}
      </div>
    </div>
  )
}

function OnHandCard({
  title,
  accent,
  onHand,
  usable,
  reserve,
  cover,
  busyCover
}: {
  title: string
  accent: string
  onHand: number
  usable: number
  reserve: number
  cover: DaysOfCover
  busyCover: DaysOfCover
}) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${accent}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">{title}</h2>
      <div className="mt-2 font-mono text-3xl font-bold text-gray-900">{formatLitres(onHand)} L</div>
      <div className="mt-1 text-sm text-gray-700">
        Usable {formatLitres(usable)} L
        <span className="text-gray-500"> (empty at {formatLitres(reserve)} L)</span>
      </div>
      <div className="mt-3 text-sm text-gray-800">Typical cover: {coverLabel(cover)}</div>
      <div className="text-sm text-gray-600">Busy-day cover: {coverLabel(busyCover)}</div>
    </div>
  )
}

function HorizonTable({ horizons }: { horizons: FuelHorizon[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Horizon</th>
            <th className="px-4 py-3">Unleaded typical</th>
            <th className="px-4 py-3">Unleaded busy</th>
            <th className="px-4 py-3">Diesel typical</th>
            <th className="px-4 py-3">Diesel busy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {horizons.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{row.label}</div>
                <div className="text-xs text-gray-500">Through {row.throughDate}</div>
              </td>
              <HorizonCell result={row.typical.unleaded} />
              <HorizonCell result={row.busy.unleaded} />
              <HorizonCell result={row.typical.diesel} />
              <HorizonCell result={row.busy.diesel} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HorizonCell({
  result
}: {
  result: FuelHorizon['typical']['unleaded']
}) {
  return (
    <td className={`px-4 py-3 ${enoughClass(result.enough)}`}>
      <div className="font-medium">{result.enough ? 'Enough' : `Short ${formatLitres(result.shortBy)} L`}</div>
      <div className="text-xs text-gray-500">
        Need {formatLitres(result.demand)} L · usable after {formatLitres(result.projectedUsable)} L
      </div>
    </td>
  )
}

function WeekdayTable({ rows, today }: { rows: WeekdayAverages[]; today: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Weekday</th>
            <th className="px-4 py-3">Samples</th>
            <th className="px-4 py-3">Typical unleaded</th>
            <th className="px-4 py-3">Busy unleaded</th>
            <th className="px-4 py-3">Typical diesel</th>
            <th className="px-4 py-3">Busy diesel</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.weekday} className={row.weekday === today ? 'bg-emerald-50/60' : ''}>
              <td className="px-4 py-3 font-medium text-gray-900">
                {row.weekdayName}
                {row.weekday === today ? ' (today)' : ''}
              </td>
              <td className="px-4 py-3 text-gray-600">{row.samples}</td>
              <td className="px-4 py-3 font-mono">{formatLitres(row.typical.unleaded)}</td>
              <td className="px-4 py-3 font-mono">{formatLitres(row.busy.unleaded)}</td>
              <td className="px-4 py-3 font-mono">{formatLitres(row.typical.diesel)}</td>
              <td className="px-4 py-3 font-mono">{formatLitres(row.busy.diesel)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-gray-500">
        Closed days (no fuel sold) are skipped. Averages exclude today. {businessTodayYmd()} is highlighted
        when it matches a row.
      </p>
    </div>
  )
}
