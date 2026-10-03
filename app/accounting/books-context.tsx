'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { businessTodayYmd } from '@/lib/datetime-policy'
import type { AccountingBooks } from '@/lib/accounting-types'

type BooksContextValue = {
  month: string
  setMonth: (month: string) => void
  books: AccountingBooks | null
  loading: boolean
  error: string | null
  reload: () => void
}

const BooksContext = createContext<BooksContextValue | null>(null)

export function useAccountingBooks(): BooksContextValue {
  const value = useContext(BooksContext)
  if (!value) throw new Error('useAccountingBooks must be used inside AccountingShell')
  return value
}

export function AccountingShell({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(() => businessTodayYmd().slice(0, 7))
  const [books, setBooks] = useState<AccountingBooks | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('month')
    if (requested && /^\d{4}-\d{2}$/.test(requested)) setMonth(requested)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetch(`/api/accounting/books?month=${encodeURIComponent(month)}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load books')
        if (!cancelled) setBooks(data as AccountingBooks)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBooks(null)
          setError(err instanceof Error ? err.message : 'Failed to load books')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [month, tick])

  return (
    <BooksContext.Provider value={{ month, setMonth, books, loading, error, reload }}>
      <div className="min-h-screen bg-gray-50 px-4 py-4 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">Westline and the station books, from the records already kept.</p>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              Month
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
          </div>
          {loading && <p className="text-gray-600">Loading books…</p>}
          {error && (
            <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {!loading && books ? children : null}
        </div>
      </div>
    </BooksContext.Provider>
  )
}
