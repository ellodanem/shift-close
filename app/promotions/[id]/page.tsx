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
      <div className="min-h-full bg-gray-50 p-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    )
  }

  if (!promotion) {
    return (
      <div className="min-h-full bg-gray-50 p-6">
        <p className="text-sm text-red-700">{error || 'Promotion not found'}</p>
        <button
          type="button"
          onClick={() => router.push('/promotions')}
          className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Back to Promotions
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/promotions" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Promotions
        </Link>

        <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-blue-950">{promotion.name}</h1>
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

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form
          onSubmit={savePromotion}
          className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Promotion details</h2>
          <div className="grid gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Details</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Draw date details</span>
              <input
                value={drawDetails}
                onChange={(e) => setDrawDetails(e.target.value)}
                placeholder="e.g. Every other week"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 sm:max-w-xs"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>
          <div className="mt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Draws & winners</h2>

          <form
            onSubmit={addDraw}
            className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Draw date</span>
              <input
                type="date"
                value={newDrawDate}
                onChange={(e) => setNewDrawDate(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
                required
              />
            </label>
            <label className="block min-w-[12rem] flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">Notes</span>
              <input
                value={newDrawNotes}
                onChange={(e) => setNewDrawNotes(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Optional"
              />
            </label>
            <button
              type="submit"
              disabled={addingDraw || !newDrawDate}
              className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {addingDraw ? 'Adding…' : 'Add draw'}
            </button>
          </form>

          {promotion.draws.length === 0 ? (
            <p className="text-sm text-gray-500">No draws recorded yet.</p>
          ) : (
            <ul className="space-y-4">
              {promotion.draws.map((draw) => {
                const draft = getWinnerDraft(draw.id)
                return (
                  <li
                    key={draw.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
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
                        className="text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        Delete draw
                      </button>
                    </div>

                    <div className="mb-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Winners
                      </p>
                      {draw.winners.length === 0 ? (
                        <p className="text-sm text-slate-500">No winners yet.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {draw.winners.map((w) => (
                            <li
                              key={w.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm"
                            >
                              <span>
                                <span className="font-medium text-slate-900">{w.winnerName}</span>
                                {w.prizeNotes ? (
                                  <span className="text-slate-500"> — {w.prizeNotes}</span>
                                ) : null}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeWinner(draw.id, w.id)}
                                className="text-xs font-medium text-red-600 hover:text-red-800"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                      <label className="block min-w-[10rem] flex-1 text-sm">
                        <span className="mb-1 block text-xs font-medium text-slate-600">
                          Staff
                        </span>
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
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">— Select or type name —</option>
                          {staffOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block min-w-[8rem] flex-1 text-sm">
                        <span className="mb-1 block text-xs font-medium text-slate-600">
                          Name
                        </span>
                        <input
                          value={draft.winnerName}
                          onChange={(e) =>
                            setWinnerDraft(draw.id, {
                              winnerName: e.target.value,
                              staffId: draft.staffId
                            })
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                          placeholder="Winner name"
                        />
                      </label>
                      <label className="block min-w-[8rem] flex-1 text-sm">
                        <span className="mb-1 block text-xs font-medium text-slate-600">
                          Prize notes
                        </span>
                        <input
                          value={draft.prizeNotes}
                          onChange={(e) =>
                            setWinnerDraft(draw.id, { prizeNotes: e.target.value })
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                          placeholder="Optional"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => addWinner(draw.id)}
                        disabled={!draft.staffId && !draft.winnerName.trim()}
                        className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
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
