'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/app/components/AuthContext'
import { businessTodayYmd, formatDateOnlyForDisplay } from '@/lib/datetime-policy'
import {
  formatPricePerLitre,
  kindLabel,
  marginPerLitre,
  productLabel,
  type CurrentFuelPrices,
  type FuelPriceKind,
  type FuelPriceProduct,
  type FuelPriceRecord
} from '@/lib/fuel-prices'
import { canManageFuelPrices } from '@/lib/roles'

type Payload = {
  today: string
  current: CurrentFuelPrices
  history: FuelPriceRecord[]
}

const PRODUCTS: FuelPriceProduct[] = ['unleaded', 'diesel']
const KINDS: FuelPriceKind[] = ['selling', 'cost']

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500'

function PriceCard({
  product,
  pair
}: {
  product: FuelPriceProduct
  pair: CurrentFuelPrices['unleaded']
}) {
  const margin = marginPerLitre(pair.selling?.pricePerLitre, pair.cost?.pricePerLitre)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{productLabel(product)}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pump</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
            {formatPricePerLitre(pair.selling?.pricePerLitre)}
          </dd>
          <dd className="text-xs text-gray-500">
            {pair.selling ? `since ${formatDateOnlyForDisplay(pair.selling.effectiveFrom)}` : 'Not set'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cost</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
            {formatPricePerLitre(pair.cost?.pricePerLitre)}
          </dd>
          <dd className="text-xs text-gray-500">
            {pair.cost ? `since ${formatDateOnlyForDisplay(pair.cost.effectiveFrom)}` : 'Not set'}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-gray-600">
        Margin{' '}
        <span className="font-semibold tabular-nums text-gray-900">{formatPricePerLitre(margin)}</span>
        <span className="text-gray-500"> / litre</span>
      </p>
    </div>
  )
}

export default function FuelPricesSettingsPage() {
  const { loading: authLoading, user } = useAuth()
  const canManage = canManageFuelPrices(user?.role ?? '')
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [effectiveFrom, setEffectiveFrom] = useState(businessTodayYmd())
  const [effectiveTo, setEffectiveTo] = useState('')
  const [notes, setNotes] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    'unleaded:selling': '',
    'unleaded:cost': '',
    'diesel:selling': '',
    'diesel:cost': ''
  })

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/settings/fuel-prices', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
    setPayload(data as Payload)
  }, [])

  useEffect(() => {
    if (authLoading) return
    setLoading(true)
    void load()
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [authLoading, load])

  const history = payload?.history ?? []
  const current = payload?.current

  const filledCount = useMemo(
    () => Object.values(values).filter((value) => value.trim() !== '').length,
    [values]
  )

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!canManage) return
    const prices = PRODUCTS.flatMap((product) =>
      KINDS.flatMap((kind) => {
        const raw = values[`${product}:${kind}`]?.trim() ?? ''
        if (!raw) return []
        const pricePerLitre = Number(raw)
        return [{ product, kind, pricePerLitre }]
      })
    )
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/settings/fuel-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effectiveFrom,
          effectiveTo: effectiveTo.trim() || null,
          notes,
          prices
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
      setPayload(data as Payload)
      setSuccess(effectiveTo.trim() ? 'Saved past prices.' : 'Current prices updated.')
      setNotes('')
      setEffectiveFrom(businessTodayYmd())
      setEffectiveTo('')
      setValues({
        'unleaded:selling': '',
        'unleaded:cost': '',
        'diesel:selling': '',
        'diesel:cost': ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-gray-600">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Settings
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Fuel prices</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Current and past pump (selling) and cost prices per litre. Leave the end date empty to make
            a row current. Same-day corrections keep the old row in history.
          </p>
        </div>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
            {success}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {PRODUCTS.map((product) => (
              <PriceCard key={product} product={product} pair={current?.[product] ?? { selling: null, cost: null }} />
            ))}
          </div>
        )}

        {canManage ? (
          <form onSubmit={(e) => void save(e)} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900">Record prices</h2>
            <p className="mt-1 text-sm text-gray-500">
              Fill only the prices that changed. Empty fields are skipped.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                Effective from
                <input
                  type="date"
                  required
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Ended on <span className="font-normal text-gray-500">(optional, for past ranges)</span>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {PRODUCTS.map((product) => (
                <div key={product} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                  <p className="mb-2 text-sm font-semibold text-gray-800">{productLabel(product)}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {KINDS.map((kind) => (
                      <label key={kind} className="block text-xs font-medium text-gray-600">
                        {kindLabel(kind)} $ / L
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          inputMode="decimal"
                          placeholder="—"
                          value={values[`${product}:${kind}`]}
                          onChange={(e) =>
                            setValues((prev) => ({ ...prev, [`${product}:${kind}`]: e.target.value }))
                          }
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Notes
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional, e.g. government change"
                className={`${inputClass} mt-1`}
              />
            </label>
            <button
              type="submit"
              disabled={saving || filledCount === 0}
              className="mt-4 rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save prices'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500">You can view prices but not change them.</p>
        )}

        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">History</h2>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">No prices recorded yet.</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2">Kind</th>
                      <th className="px-4 py-2 text-right">Price / L</th>
                      <th className="px-4 py-2">From</th>
                      <th className="px-4 py-2">To</th>
                      <th className="px-4 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((row) => (
                      <tr key={row.id} className={row.supersededAt ? 'bg-gray-50 text-gray-400' : ''}>
                        <td className="px-4 py-2">{productLabel(row.product)}</td>
                        <td className="px-4 py-2">{kindLabel(row.kind)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatPricePerLitre(row.pricePerLitre)}
                        </td>
                        <td className="px-4 py-2">{formatDateOnlyForDisplay(row.effectiveFrom)}</td>
                        <td className="px-4 py-2">
                          {row.supersededAt
                            ? 'Superseded'
                            : row.effectiveTo
                              ? formatDateOnlyForDisplay(row.effectiveTo)
                              : 'Current'}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{row.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-gray-100 sm:hidden">
                {history.map((row) => (
                  <li key={row.id} className={`px-4 py-3 text-sm ${row.supersededAt ? 'text-gray-400' : ''}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium text-gray-900">
                        {productLabel(row.product)} {kindLabel(row.kind)}
                      </p>
                      <p className="tabular-nums font-semibold">
                        {formatPricePerLitre(row.pricePerLitre)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDateOnlyForDisplay(row.effectiveFrom)}
                      {' → '}
                      {row.supersededAt
                        ? 'superseded'
                        : row.effectiveTo
                          ? formatDateOnlyForDisplay(row.effectiveTo)
                          : 'current'}
                    </p>
                    {row.notes ? <p className="mt-1 text-xs text-gray-600">{row.notes}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
