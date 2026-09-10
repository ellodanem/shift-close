'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Dup = {
  id: string
  name: string
  cstoreName: string | null
  invoices: number
}

type Row = {
  id: string
  name: string
  cstoreName: string | null
  _count: { invoices: number }
  mapped: boolean
  nameEqualsCstore: boolean
  possibleDuplicates: Dup[]
}

export default function VendorCstoreMappingPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unmapped' | 'mismatch'>('all')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/vendor-payments/vendors/cstore-mapping')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      const list = (data.vendors || []) as Row[]
      setRows(list)
      const next: Record<string, string> = {}
      for (const v of list) next[v.id] = v.cstoreName || ''
      setDrafts(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'unmapped') return !r.mapped
      if (filter === 'mismatch') {
        return (
          r.possibleDuplicates.length > 0 ||
          (r.mapped && !r.nameEqualsCstore) ||
          (!r.mapped && r.possibleDuplicates.length > 0)
        )
      }
      return true
    })
  }, [rows, filter])

  const dirty = useMemo(() => {
    return rows.filter((r) => (drafts[r.id] ?? '') !== (r.cstoreName || ''))
  }, [rows, drafts])

  const save = async () => {
    if (dirty.length === 0) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/vendor-payments/vendors/cstore-mapping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: dirty.map((r) => ({
            id: r.id,
            cstoreName: drafts[r.id] ?? ''
          }))
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSuccess(`Saved ${data.saved} mapping(s).`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Cstore vendor names
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Shift Close keeps the correct spelling in <strong>Name</strong>. Put the
              exact Cstore label in <strong>Cstore name</strong> so harvest imports land
              on the right vendor without changing anything in Cstore.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/vendor-payments/vendors')}
            className="min-h-[44px] rounded bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 sm:min-h-0"
          >
            ← Vendors
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(
            [
              ['all', 'All'],
              ['unmapped', 'Unmapped'],
              ['mismatch', 'Likely mismatches']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded px-3 py-1.5 text-sm font-semibold ${
                filter === id
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={saving || dirty.length === 0}
            onClick={save}
            className="ml-auto rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save ${dirty.length || ''} mapping(s)`}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {success}
          </div>
        )}

        {loading ? (
          <p className="text-gray-600">Loading…</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Shift Close name</th>
                  <th className="px-4 py-3">Cstore name</th>
                  <th className="px-4 py-3">Invoices</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <button
                        type="button"
                        className="mt-1 text-xs text-blue-600 hover:underline"
                        onClick={() => router.push(`/vendor-payments/vendors/${r.id}`)}
                      >
                        Open
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                        value={drafts[r.id] ?? ''}
                        placeholder="Exact Cstore vendor label"
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r._count.invoices}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {!r.mapped && <div className="text-amber-700">No Cstore mapping</div>}
                      {r.mapped && !r.nameEqualsCstore && (
                        <div className="text-green-700">Mapped (names differ — good)</div>
                      )}
                      {r.possibleDuplicates.length > 0 && (
                        <div className="mt-1 text-amber-800">
                          Possible duplicate:{' '}
                          {r.possibleDuplicates
                            .map((d) => `${d.name} (${d.invoices})`)
                            .join(', ')}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No vendors in this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
