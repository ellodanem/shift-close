'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import HomeShortcutIcon from '@/app/components/HomeShortcutIcon'
import { tileBackgroundColor } from '@/lib/tile-colors'

type PromotionListItem = {
  id: string
  slug: string
  name: string
  details: string
  drawDetails: string
  status: string
  drawCount: number
  latestDrawDate: string | null
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<PromotionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDetails, setNewDetails] = useState('')
  const [newDrawDetails, setNewDrawDetails] = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/promotions')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load')
        setPromotions(Array.isArray(data) ? data : [])
        setError(null)
      })
      .catch((err) => {
        setPromotions([])
        setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          details: newDetails.trim(),
          drawDetails: newDrawDetails.trim()
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create')
      setNewName('')
      setNewDetails('')
      setNewDrawDetails('')
      setShowAdd(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Promotions</h1>
            <p className="mt-1 text-sm text-gray-600">
              Staff giveaways and draws. Open a promotion to manage draw dates and winners.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            {showAdd ? 'Cancel' : 'Add promotion'}
          </button>
        </div>

        {showAdd ? (
          <form
            onSubmit={handleAdd}
            className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="mb-3 text-sm font-semibold text-slate-800">New promotion</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Name</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Details</span>
                <textarea
                  value={newDetails}
                  onChange={(e) => setNewDetails(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Draw date details</span>
                <input
                  value={newDrawDetails}
                  onChange={(e) => setNewDrawDetails(e.target.value)}
                  placeholder="e.g. Every other week"
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-3">
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Create'}
              </button>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : promotions.length === 0 ? (
          <p className="text-sm text-gray-500">No promotions yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {promotions.map((promo) => (
              <Link
                key={promo.id}
                href={`/promotions/${promo.id}`}
                prefetch={false}
                style={{ backgroundColor: tileBackgroundColor('/promotions', 'promotions') }}
                className="relative flex h-[7.5rem] w-full flex-col items-center rounded-2xl text-white shadow-md hover:brightness-110"
              >
                <span className="mt-6 flex h-9 items-center justify-center">
                  <HomeShortcutIcon id="promotions" className="h-8 w-8 text-white" />
                </span>
                <span className="mb-2.5 mt-auto px-2 text-center text-[13px] font-semibold leading-tight">
                  {promo.name}
                </span>
                <span
                  className={`absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    promo.status === 'active' ? 'bg-emerald-500/90' : 'bg-white/25'
                  }`}
                >
                  {promo.status === 'active' ? 'Active' : 'Done'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
