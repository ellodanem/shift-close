'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { businessTodayYmd, formatDateOnlyForDisplay } from '@/lib/datetime-policy'
import { DIESEL_UNUSABLE_LITRES, UNLEADED_UNUSABLE_LITRES, formatLitres } from '@/lib/fuel-inventory'

type GradeState = {
  enough: boolean
  shortBy: number
}

type BaselineConflict = {
  date: string
  nextDate: string
  sold: { unleaded: number; diesel: number }
  delivered: { unleaded: number; diesel: number }
}

type ExpectancyPayload = {
  canManage: boolean
  asOfDate: string
  weekdayName: string
  book: {
    opening: { date: string }
    onHand: { unleaded: number; diesel: number }
    usable: { unleaded: number; diesel: number }
  } | null
  horizons: Array<{
    id: string
    typical: {
      unleaded: GradeState
      diesel: GradeState
    }
  }>
}

export function FuelTankInventoryCard() {
  const [data, setData] = useState<ExpectancyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'opening' | 'dip' | null>(null)
  const [date, setDate] = useState(businessTodayYmd())
  const [unleaded, setUnleaded] = useState('')
  const [diesel, setDiesel] = useState('')
  const [notes, setNotes] = useState('')
  const [baselineConflict, setBaselineConflict] = useState<BaselineConflict | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/insights/fuel-expectancy', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load tank inventory')
      const json = (await res.json()) as ExpectancyPayload
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tank inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openForm = (next: 'opening' | 'dip') => {
    setMode(next)
    setDate(businessTodayYmd())
    setUnleaded('')
    setDiesel('')
    setNotes('')
    setBaselineConflict(null)
  }

  const saveReading = async (input: {
    kind: 'opening' | 'dip'
    date: string
    unleadedLitres: number
    dieselLitres: number
    notes: string
    confirmSameDay?: boolean
  }) => {
    setSaving(true)
    try {
      const res = await fetch('/api/fuel-inventory/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && (body as { code?: string }).code === 'same_day_activity') {
        const conflict = body as BaselineConflict
        setBaselineConflict(conflict)
        setDate(conflict.date)
        return
      }
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || 'Failed to save reading')
      }
      setBaselineConflict(null)
      setMode(null)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save reading')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!mode) return
    const unleadedLitres = Number(unleaded)
    const dieselLitres = Number(diesel)
    if (!Number.isFinite(unleadedLitres) || unleadedLitres < 0 || !Number.isFinite(dieselLitres) || dieselLitres < 0) {
      alert('Enter unleaded and diesel litres (0 or more).')
      return
    }
    setBaselineConflict(null)
    await saveReading({ kind: mode, date, unleadedLitres, dieselLitres, notes })
  }

  const rest = data?.horizons.find((h) => h.id === 'restOfToday')
  const todayLabel = data ? `${data.weekdayName} ${data.asOfDate}` : ''

  return (
    <div className="mb-6 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Tank inventory</h2>
          <p className="mt-1 text-sm text-gray-600">
            Opening is the start of that date. Shift sales and fuel invoices from earlier dates stay
            behind it. Same-day invoices add and same-day shift sales subtract, so a stick taken after
            those sales (last night’s close) belongs on the next morning. Forecasts use usable litres
            (unleaded − {formatLitres(UNLEADED_UNUSABLE_LITRES)} L, diesel −{' '}
            {formatLitres(DIESEL_UNUSABLE_LITRES)} L).
          </p>
        </div>
        <Link
          href="/insights/fuel-expectancy"
          className="text-sm font-medium text-emerald-800 hover:text-emerald-950"
        >
          Full expectancy →
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading tank levels…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-700">{error}</p>
      ) : !data?.book ? (
        <p className="mt-4 text-sm text-amber-800">
          No opening reading yet. Set one from this morning’s dip (or last night’s close) to start the
          book.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <GradeCard
            label="Unleaded"
            onHand={data.book.onHand.unleaded}
            usable={data.book.usable.unleaded}
            enough={rest?.typical.unleaded.enough ?? false}
            shortBy={rest?.typical.unleaded.shortBy ?? 0}
            todayLabel={todayLabel}
          />
          <GradeCard
            label="Diesel"
            onHand={data.book.onHand.diesel}
            usable={data.book.usable.diesel}
            enough={rest?.typical.diesel.enough ?? false}
            shortBy={rest?.typical.diesel.shortBy ?? 0}
            todayLabel={todayLabel}
          />
        </div>
      )}

      {data?.canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openForm('opening')}
            className="min-h-[44px] rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 sm:min-h-0"
          >
            Set opening reading
          </button>
          <button
            type="button"
            onClick={() => openForm('dip')}
            disabled={!data.book}
            className="min-h-[44px] rounded border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 sm:min-h-0"
          >
            Match tanks to dip
          </button>
        </div>
      ) : null}

      {mode && data?.canManage ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-800">
            {mode === 'opening'
              ? 'Opening stock at the start of this date'
              : 'Dip correction — we store the difference from the current book, without rewriting invoices or shifts'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setBaselineConflict(null)
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Unleaded L
              </label>
              <input
                type="number"
                required
                min="0"
                step="1"
                value={unleaded}
                onChange={(e) => setUnleaded(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Diesel L
              </label>
              <input
                type="number"
                required
                min="0"
                step="1"
                value={diesel}
                onChange={(e) => setDiesel(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={mode === 'dip' ? 'e.g. afternoon stick reading' : 'e.g. morning opening'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {baselineConflict && mode === 'opening' ? (
            <BaselineConflictNotice
              conflict={baselineConflict}
              saving={saving}
              onUseNextMorning={() =>
                void saveReading({
                  kind: 'opening',
                  date: baselineConflict.nextDate,
                  unleadedLitres: Number(unleaded),
                  dieselLitres: Number(diesel),
                  notes
                })
              }
              onApplySameDay={() =>
                void saveReading({
                  kind: 'opening',
                  date: baselineConflict.date,
                  unleadedLitres: Number(unleaded),
                  dieselLitres: Number(diesel),
                  notes,
                  confirmSameDay: true
                })
              }
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {baselineConflict && mode === 'opening' ? null : (
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => setMode(null)}
              className="rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function movementPhrase(conflict: BaselineConflict): string {
  const parts: string[] = []
  if (conflict.sold.unleaded > 0 || conflict.sold.diesel > 0) {
    parts.push(
      `${formatLitres(conflict.sold.unleaded)} L unleaded and ${formatLitres(conflict.sold.diesel)} L diesel in shift sales`
    )
  }
  if (conflict.delivered.unleaded > 0 || conflict.delivered.diesel > 0) {
    parts.push(
      `${formatLitres(conflict.delivered.unleaded)} L unleaded and ${formatLitres(conflict.delivered.diesel)} L diesel on fuel invoices`
    )
  }
  return parts.join(', and ')
}

function BaselineConflictNotice({
  conflict,
  saving,
  onUseNextMorning,
  onApplySameDay
}: {
  conflict: BaselineConflict
  saving: boolean
  onUseNextMorning: () => void
  onApplySameDay: () => void
}) {
  const thisDate = formatDateOnlyForDisplay(conflict.date)
  const nextDate = formatDateOnlyForDisplay(conflict.nextDate)
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p>
        {thisDate} already has {movementPhrase(conflict)}. An opening is the start of that date, so
        those litres would come off this stick. Dates before the opening never change it. If this
        reading was taken after those sales or deliveries, save it as the start of {nextDate}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onUseNextMorning}
          className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Save as start of {nextDate}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onApplySameDay}
          className="rounded border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
        >
          Apply this date on top of the stick
        </button>
      </div>
    </div>
  )
}

function GradeCard({
  label,
  onHand,
  usable,
  enough,
  shortBy,
  todayLabel
}: {
  label: string
  onHand: number
  usable: number
  enough: boolean
  shortBy: number
  todayLabel: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold text-gray-900">{formatLitres(onHand)} L</div>
      <div className="text-sm text-gray-600">Usable {formatLitres(usable)} L</div>
      <div className={`mt-2 text-sm font-medium ${enough ? 'text-emerald-800' : 'text-red-700'}`}>
        {enough
          ? `Enough for a typical ${todayLabel}`
          : `Short ${formatLitres(shortBy)} L vs a typical ${todayLabel}`}
      </div>
    </div>
  )
}
