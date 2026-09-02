'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type StaffOption = { id: string; name: string; status: string }

type Winner = {
  id: string
  winnerName: string
  prizeNotes: string
  staffId: string | null
  staff: { id: string; name: string } | null
}

type Entry = {
  id: string
  entrantName: string
  staffId: string | null
  staff: { id: string; name: string } | null
}

type Draw = {
  id: string
  drawDate: string
  notes: string
  winners: Winner[]
  entries: Entry[]
}

type Promotion = {
  id: string
  slug: string
  name: string
  details: string
  drawDetails: string
  status: string
  draws: Draw[]
}

type TallyRow = {
  key: string
  staffId: string | null
  name: string
  entryCount: number
  drawDates: string[]
}

type TallyData = {
  year: string
  drawCount: number
  totalEntries: number
  uniqueEntrants: number
  ranking: TallyRow[]
}

type ImportResult = {
  created: number
  drawsCreated?: number
  skippedDuplicate: number
  skippedNoDate?: number
  errors: string[]
  columnNames?: string[]
}

const fieldClass =
  'min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:min-h-0 sm:text-sm'
const btnPrimary =
  'min-h-[44px] w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:w-auto sm:min-h-0'
const btnSecondary =
  'min-h-[44px] w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 sm:w-auto sm:min-h-0'
const btnQuiet =
  'min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:min-h-0'

function formatDrawDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export default function PromotionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : ''

  const [tab, setTab] = useState<'draws' | 'tally'>('draws')
  const [promotion, setPromotion] = useState<Promotion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const [name, setName] = useState('')
  const [details, setDetails] = useState('')
  const [drawDetails, setDrawDetails] = useState('')
  const [status, setStatus] = useState('active')

  const [newDrawDate, setNewDrawDate] = useState('')
  const [newDrawNotes, setNewDrawNotes] = useState('')
  const [addingDraw, setAddingDraw] = useState(false)

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [winnerDrafts, setWinnerDrafts] = useState<
    Record<string, { staffId: string; winnerName: string; prizeNotes: string }>
  >({})
  const [entryDrafts, setEntryDrafts] = useState<
    Record<string, { staffId: string; entrantName: string }>
  >({})
  const [importingDrawId, setImportingDrawId] = useState<string | null>(null)
  const [drawImportResult, setDrawImportResult] = useState<Record<string, ImportResult | null>>(
    {}
  )
  const drawFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [tallyYear, setTallyYear] = useState(String(new Date().getFullYear()))
  const [tally, setTally] = useState<TallyData | null>(null)
  const [tallyLoading, setTallyLoading] = useState(false)
  const [bulkDrawDate, setBulkDrawDate] = useState('')
  const [bulkImporting, setBulkImporting] = useState(false)
  const [bulkResult, setBulkResult] = useState<ImportResult | null>(null)
  const bulkFileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/promotions/${id}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load')
        setPromotion(data)
        setName(data.name)
        setDetails(data.details ?? '')
        setDrawDetails(data.drawDetails ?? '')
        setStatus(data.status)
        setError(null)
      })
      .catch((err) => {
        setPromotion(null)
        setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => setLoading(false))
  }, [id])

  const loadTally = useCallback(() => {
    if (!id) return
    setTallyLoading(true)
    fetch(`/api/promotions/${id}/tally?year=${encodeURIComponent(tallyYear)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load tally')
        setTally(data)
      })
      .catch((err) => {
        setTally(null)
        setError(err instanceof Error ? err.message : 'Failed to load tally')
      })
      .finally(() => setTallyLoading(false))
  }, [id, tallyYear])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (tab === 'tally') loadTally()
  }, [tab, loadTally])

  useEffect(() => {
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setStaffOptions(
          list
            .filter((s: StaffOption) => s.status === 'active')
            .map((s: StaffOption) => ({ id: s.id, name: s.name, status: s.status }))
            .sort((a: StaffOption, b: StaffOption) => a.name.localeCompare(b.name))
        )
      })
      .catch(() => setStaffOptions([]))
  }, [])

  const savePromotion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/promotions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          details: details.trim(),
          drawDetails: drawDetails.trim(),
          status
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setPromotion(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const addDraw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !newDrawDate) return
    setAddingDraw(true)
    try {
      const res = await fetch(`/api/promotions/${id}/draws`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawDate: newDrawDate, notes: newDrawNotes.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add draw')
      setNewDrawDate('')
      setNewDrawNotes('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add draw')
    } finally {
      setAddingDraw(false)
    }
  }

  const deleteDraw = async (drawId: string) => {
    if (!id || !confirm('Delete this draw, its winners, and its entries?')) return
    try {
      const res = await fetch(`/api/promotions/${id}/draws/${drawId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete draw')
      load()
      if (tab === 'tally') loadTally()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete draw')
    }
  }

  const getWinnerDraft = (drawId: string) =>
    winnerDrafts[drawId] ?? { staffId: '', winnerName: '', prizeNotes: '' }

  const setWinnerDraft = (
    drawId: string,
    patch: Partial<{ staffId: string; winnerName: string; prizeNotes: string }>
  ) => {
    setWinnerDrafts((prev) => ({
      ...prev,
      [drawId]: { ...getWinnerDraft(drawId), ...patch }
    }))
  }

  const getEntryDraft = (drawId: string) =>
    entryDrafts[drawId] ?? { staffId: '', entrantName: '' }

  const setEntryDraft = (
    drawId: string,
    patch: Partial<{ staffId: string; entrantName: string }>
  ) => {
    setEntryDrafts((prev) => ({
      ...prev,
      [drawId]: { ...getEntryDraft(drawId), ...patch }
    }))
  }

  const addWinner = async (drawId: string) => {
    if (!id) return
    const draft = getWinnerDraft(drawId)
    if (!draft.staffId && !draft.winnerName.trim()) return
    try {
      const res = await fetch(`/api/promotions/${id}/draws/${drawId}/winners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: draft.staffId || undefined,
          winnerName: draft.winnerName.trim() || undefined,
          prizeNotes: draft.prizeNotes.trim()
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add winner')
      setWinnerDrafts((prev) => ({
        ...prev,
        [drawId]: { staffId: '', winnerName: '', prizeNotes: '' }
      }))
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add winner')
    }
  }

  const removeWinner = async (drawId: string, winnerId: string) => {
    if (!id) return
    try {
      const res = await fetch(`/api/promotions/${id}/draws/${drawId}/winners/${winnerId}`, {
        method: 'DELETE'
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to remove winner')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove winner')
    }
  }

  const addEntry = async (drawId: string) => {
    if (!id) return
    const draft = getEntryDraft(drawId)
    if (!draft.staffId && !draft.entrantName.trim()) return
    try {
      const res = await fetch(`/api/promotions/${id}/draws/${drawId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: draft.staffId || undefined,
          entrantName: draft.entrantName.trim() || undefined
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add entry')
      setEntryDrafts((prev) => ({
        ...prev,
        [drawId]: { staffId: '', entrantName: '' }
      }))
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry')
    }
  }

  const removeEntry = async (drawId: string, entryId: string) => {
    if (!id) return
    try {
      const res = await fetch(`/api/promotions/${id}/draws/${drawId}/entries/${entryId}`, {
        method: 'DELETE'
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to remove entry')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove entry')
    }
  }

  const importDrawFile = async (drawId: string, file: File) => {
    if (!id) return
    setImportingDrawId(drawId)
    setDrawImportResult((prev) => ({ ...prev, [drawId]: null }))
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/promotions/${id}/draws/${drawId}/entries/import`, {
        method: 'POST',
        body: form
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setDrawImportResult((prev) => ({ ...prev, [drawId]: data }))
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportingDrawId(null)
    }
  }

  const importBulkFile = async (file: File) => {
    if (!id) return
    setBulkImporting(true)
    setBulkResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (bulkDrawDate) form.append('drawDate', bulkDrawDate)
      const res = await fetch(`/api/promotions/${id}/entries/import`, {
        method: 'POST',
        body: form
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setBulkResult(data)
      load()
      loadTally()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBulkImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-full bg-gray-50 px-4 py-4 sm:p-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    )
  }

  if (!promotion) {
    return (
      <div className="min-h-full bg-gray-50 px-4 py-4 sm:p-6">
        <p className="text-sm text-red-700">{error || 'Promotion not found'}</p>
        <button
          type="button"
          onClick={() => router.push('/promotions')}
          className="mt-3 min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Back to Promotions
        </button>
      </div>
    )
  }

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  return (
    <div className="min-h-full bg-gray-50 px-4 py-4 pb-10 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/promotions"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-blue-600 hover:text-blue-800 sm:min-h-0"
        >
          ← Promotions
        </Link>

        <div className="mt-2 mb-4 flex flex-wrap items-center gap-2 sm:mb-6 sm:gap-3">
          <h1 className="text-xl font-bold text-blue-950 sm:text-2xl">{promotion.name}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
              promotion.status === 'active'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {promotion.status === 'active' ? 'Active' : 'Completed'}
          </span>
        </div>

        {promotion.drawDetails ? (
          <p className="mb-4 text-sm text-slate-600 sm:mb-6">{promotion.drawDetails}</p>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm sm:mb-8">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-3 text-left sm:hidden"
            aria-expanded={detailsOpen}
          >
            <span className="text-sm font-semibold text-slate-800">Promotion details</span>
            <svg
              className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <form
            onSubmit={savePromotion}
            className={`border-t border-slate-100 p-4 sm:border-0 ${detailsOpen ? 'block' : 'hidden'} sm:block`}
          >
            <h2 className="mb-3 hidden text-sm font-semibold text-slate-800 sm:block">
              Promotion details
            </h2>
            <div className="grid gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Details</span>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Draw date details</span>
                <input
                  value={drawDetails}
                  onChange={(e) => setDrawDetails(e.target.value)}
                  placeholder="e.g. Every other week"
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
            <div className="mt-4">
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>

        <div className="mb-4 flex gap-1 border-b border-gray-200">
          {(
            [
              { id: 'draws' as const, label: 'Draws & entries' },
              { id: 'tally' as const, label: 'Regularity tally' }
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'draws' ? (
          <section className="mb-8">
            <form
              onSubmit={addDraw}
              className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:flex-wrap sm:items-end"
            >
              <label className="block text-sm sm:w-auto">
                <span className="mb-1 block font-medium text-slate-700">Draw date</span>
                <input
                  type="date"
                  value={newDrawDate}
                  onChange={(e) => setNewDrawDate(e.target.value)}
                  className={fieldClass}
                  required
                />
              </label>
              <label className="block text-sm sm:min-w-[12rem] sm:flex-1">
                <span className="mb-1 block font-medium text-slate-700">Notes</span>
                <input
                  value={newDrawNotes}
                  onChange={(e) => setNewDrawNotes(e.target.value)}
                  className={fieldClass}
                  placeholder="Optional"
                />
              </label>
              <button type="submit" disabled={addingDraw || !newDrawDate} className={btnPrimary}>
                {addingDraw ? 'Adding…' : 'Add draw'}
              </button>
            </form>

            {promotion.draws.length === 0 ? (
              <p className="text-sm text-gray-500">No draws recorded yet.</p>
            ) : (
              <ul className="space-y-3 sm:space-y-4">
                {promotion.draws.map((draw) => {
                  const winnerDraft = getWinnerDraft(draw.id)
                  const entryDraft = getEntryDraft(draw.id)
                  const importInfo = drawImportResult[draw.id]
                  return (
                    <li
                      key={draw.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {formatDrawDate(draw.drawDate)}
                          </p>
                          {draw.notes ? (
                            <p className="mt-0.5 text-sm text-slate-600">{draw.notes}</p>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-500">
                            {draw.entries.length} entrant{draw.entries.length === 1 ? '' : 's'}
                            {' · '}
                            {draw.winners.length} winner{draw.winners.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteDraw(draw.id)}
                          className="min-h-[44px] shrink-0 px-1 text-sm font-medium text-red-600 hover:text-red-800 sm:min-h-0 sm:text-xs"
                        >
                          Delete
                        </button>
                      </div>

                      {/* Entries */}
                      <div className="mb-4">
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Entrants
                        </p>
                        {draw.entries.length === 0 ? (
                          <p className="text-sm text-slate-500">No entrants yet.</p>
                        ) : (
                          <ul className="mb-3 max-h-48 space-y-1.5 overflow-y-auto sm:max-h-64">
                            {draw.entries.map((e) => (
                              <li
                                key={e.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                              >
                                <span className="min-w-0 text-sm font-medium text-slate-900">
                                  {e.entrantName}
                                  {!e.staffId ? (
                                    <span className="ml-1.5 text-xs font-normal text-amber-700">
                                      (not linked)
                                    </span>
                                  ) : null}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeEntry(draw.id, e.id)}
                                  className="min-h-[44px] shrink-0 px-1 text-sm font-medium text-red-600 hover:text-red-800 sm:min-h-0 sm:text-xs"
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1fr_auto]">
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                              Staff
                            </span>
                            <select
                              value={entryDraft.staffId}
                              onChange={(e) => {
                                const staffId = e.target.value
                                const staff = staffOptions.find((s) => s.id === staffId)
                                setEntryDraft(draw.id, {
                                  staffId,
                                  entrantName: staff?.name ?? entryDraft.entrantName
                                })
                              }}
                              className={fieldClass}
                            >
                              <option value="">— Select or type name —</option>
                              {staffOptions.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                              Name
                            </span>
                            <input
                              value={entryDraft.entrantName}
                              onChange={(e) =>
                                setEntryDraft(draw.id, {
                                  entrantName: e.target.value,
                                  staffId: entryDraft.staffId
                                })
                              }
                              className={fieldClass}
                              placeholder="Entrant name"
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => addEntry(draw.id)}
                              disabled={!entryDraft.staffId && !entryDraft.entrantName.trim()}
                              className={btnSecondary}
                            >
                              Add entrant
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            ref={(el) => {
                              drawFileRefs.current[draw.id] = el
                            }}
                            type="file"
                            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              if (file) importDrawFile(draw.id, file)
                            }}
                          />
                          <button
                            type="button"
                            disabled={importingDrawId === draw.id}
                            onClick={() => drawFileRefs.current[draw.id]?.click()}
                            className={btnQuiet}
                          >
                            {importingDrawId === draw.id
                              ? 'Uploading…'
                              : 'Upload CSV / Excel for this draw'}
                          </button>
                          <p className="text-xs text-slate-500">
                            Columns: Name (or Driver / Staff). Duplicates skipped.
                          </p>
                        </div>
                        {importInfo ? (
                          <p className="mt-2 text-xs text-slate-600">
                            Imported {importInfo.created}
                            {importInfo.skippedDuplicate
                              ? ` · ${importInfo.skippedDuplicate} duplicate(s) skipped`
                              : ''}
                            {importInfo.errors?.length
                              ? ` · ${importInfo.errors.length} row issue(s)`
                              : ''}
                          </p>
                        ) : null}
                      </div>

                      {/* Winners */}
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Winners
                        </p>
                        {draw.winners.length === 0 ? (
                          <p className="text-sm text-slate-500">No winners yet.</p>
                        ) : (
                          <ul className="mb-3 space-y-2">
                            {draw.winners.map((w) => (
                              <li
                                key={w.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2.5"
                              >
                                <span className="min-w-0 text-sm">
                                  <span className="font-medium text-slate-900">{w.winnerName}</span>
                                  {w.prizeNotes ? (
                                    <span className="mt-0.5 block text-slate-500 sm:mt-0 sm:inline">
                                      <span className="hidden sm:inline"> — </span>
                                      {w.prizeNotes}
                                    </span>
                                  ) : null}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeWinner(draw.id, w.id)}
                                  className="min-h-[44px] shrink-0 px-1 text-sm font-medium text-red-600 hover:text-red-800 sm:min-h-0 sm:text-xs"
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="grid gap-3 border-t border-slate-100 pt-3 sm:flex sm:flex-wrap sm:items-end sm:gap-2">
                          <label className="block text-sm sm:min-w-[10rem] sm:flex-1">
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                              Staff
                            </span>
                            <select
                              value={winnerDraft.staffId}
                              onChange={(e) => {
                                const staffId = e.target.value
                                const staff = staffOptions.find((s) => s.id === staffId)
                                setWinnerDraft(draw.id, {
                                  staffId,
                                  winnerName: staff?.name ?? winnerDraft.winnerName
                                })
                              }}
                              className={fieldClass}
                            >
                              <option value="">— Select or type name —</option>
                              {staffOptions.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm sm:min-w-[8rem] sm:flex-1">
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                              Name
                            </span>
                            <input
                              value={winnerDraft.winnerName}
                              onChange={(e) =>
                                setWinnerDraft(draw.id, {
                                  winnerName: e.target.value,
                                  staffId: winnerDraft.staffId
                                })
                              }
                              className={fieldClass}
                              placeholder="Winner name"
                            />
                          </label>
                          <label className="block text-sm sm:min-w-[8rem] sm:flex-1">
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                              Prize notes
                            </span>
                            <input
                              value={winnerDraft.prizeNotes}
                              onChange={(e) =>
                                setWinnerDraft(draw.id, { prizeNotes: e.target.value })
                              }
                              className={fieldClass}
                              placeholder="Optional"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => addWinner(draw.id)}
                            disabled={!winnerDraft.staffId && !winnerDraft.winnerName.trim()}
                            className={btnSecondary}
                          >
                            Add winner
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ) : (
          <section className="mb-8 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Upload spreadsheet</h2>
              <p className="mt-1 text-sm text-slate-600">
                CSV or Excel. Include a <strong>Name</strong> column. Optional{' '}
                <strong>Date</strong> / <strong>Draw Date</strong> column — missing dates use the
                draw date below (or creates draws from dates in the file).
              </p>
              <div className="mt-3 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
                <label className="block text-sm sm:w-auto">
                  <span className="mb-1 block font-medium text-slate-700">
                    Default draw date (if sheet has no dates)
                  </span>
                  <input
                    type="date"
                    value={bulkDrawDate}
                    onChange={(e) => setBulkDrawDate(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <input
                  ref={bulkFileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) importBulkFile(file)
                  }}
                />
                <button
                  type="button"
                  disabled={bulkImporting}
                  onClick={() => bulkFileRef.current?.click()}
                  className={btnPrimary}
                >
                  {bulkImporting ? 'Uploading…' : 'Upload CSV / Excel'}
                </button>
              </div>
              {bulkResult ? (
                <p className="mt-3 text-sm text-slate-700">
                  Added {bulkResult.created} entrant{bulkResult.created === 1 ? '' : 's'}
                  {bulkResult.drawsCreated
                    ? ` · created ${bulkResult.drawsCreated} draw(s)`
                    : ''}
                  {bulkResult.skippedDuplicate
                    ? ` · ${bulkResult.skippedDuplicate} duplicate(s) skipped`
                    : ''}
                  {bulkResult.skippedNoDate
                    ? ` · ${bulkResult.skippedNoDate} missing date`
                    : ''}
                  {bulkResult.errors?.length ? ` · ${bulkResult.errors.length} issue(s)` : ''}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Year ranking</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Most regular entrants — one count per draw they entered.
                  </p>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Year</span>
                  <select
                    value={tallyYear}
                    onChange={(e) => setTallyYear(e.target.value)}
                    className={fieldClass}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {tallyLoading ? (
                <p className="text-sm text-gray-500">Loading tally…</p>
              ) : !tally || tally.ranking.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No entries for {tallyYear} yet. Add entrants on draws or upload a spreadsheet.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-slate-600">
                    {tally.uniqueEntrants} people · {tally.drawCount} draws · {tally.totalEntries}{' '}
                    total entries
                  </p>

                  {/* Mobile cards */}
                  <div className="space-y-2 md:hidden">
                    {tally.ranking.map((row, idx) => (
                      <div
                        key={row.key}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            <span className="mr-2 text-slate-400">#{idx + 1}</span>
                            {row.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {row.entryCount} draw{row.entryCount === 1 ? '' : 's'} entered
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-sm font-bold text-blue-800">
                          {row.entryCount}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden overflow-hidden rounded-lg border border-slate-200 md:block">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">#</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-500">Name</th>
                          <th className="px-4 py-2 text-right font-medium text-slate-500">
                            Draws entered
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {tally.ranking.map((row, idx) => (
                          <tr key={row.key}>
                            <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-900">
                              {row.entryCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
