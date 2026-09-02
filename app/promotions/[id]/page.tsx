'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type StaffOption = { id: string; name: string; status: string }

type Winner = {
  id: string
  winnerName: string
  prizeNotes: string
  staffId: string | null
  staff: { id: string; name: string } | null
}

type Draw = {
  id: string
  drawDate: string
  notes: string
  winners: Winner[]
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

const fieldClass =
  'min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:min-h-0 sm:text-sm'
const btnPrimary =
  'min-h-[44px] w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:w-auto sm:min-h-0'
const btnSecondary =
  'min-h-[44px] w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 sm:w-auto sm:min-h-0'

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

  useEffect(() => {
    load()
  }, [load])

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
    if (!id || !confirm('Delete this draw and its winners?')) return
    try {
      const res = await fetch(`/api/promotions/${id}/draws/${drawId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete draw')
      load()
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

        {/* Details: collapsed by default on mobile so draws come first */}
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

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Draws & winners</h2>

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
                const draft = getWinnerDraft(draw.id)
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
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteDraw(draw.id)}
                        className="min-h-[44px] shrink-0 px-1 text-sm font-medium text-red-600 hover:text-red-800 sm:min-h-0 sm:text-xs"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="mb-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Winners
                      </p>
                      {draw.winners.length === 0 ? (
                        <p className="text-sm text-slate-500">No winners yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {draw.winners.map((w) => (
                            <li
                              key={w.id}
                              className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5"
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
                    </div>

                    <div className="grid gap-3 border-t border-slate-100 pt-3 sm:flex sm:flex-wrap sm:items-end sm:gap-2">
                      <label className="block text-sm sm:min-w-[10rem] sm:flex-1">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Staff</span>
                        <select
                          value={draft.staffId}
                          onChange={(e) => {
                            const staffId = e.target.value
                            const staff = staffOptions.find((s) => s.id === staffId)
                            setWinnerDraft(draw.id, {
                              staffId,
                              winnerName: staff?.name ?? draft.winnerName
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
                        <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                        <input
                          value={draft.winnerName}
                          onChange={(e) =>
                            setWinnerDraft(draw.id, {
                              winnerName: e.target.value,
                              staffId: draft.staffId
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
                          value={draft.prizeNotes}
                          onChange={(e) => setWinnerDraft(draw.id, { prizeNotes: e.target.value })}
                          className={fieldClass}
                          placeholder="Optional"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => addWinner(draw.id)}
                        disabled={!draft.staffId && !draft.winnerName.trim()}
                        className={btnSecondary}
                      >
                        Add winner
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
