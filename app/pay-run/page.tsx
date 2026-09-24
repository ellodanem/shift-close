'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { payCycleLabel } from '@/lib/pay-cycle'
import { formatDateRange } from '@/lib/pay-period-excel'
import { formatMoney } from '@/lib/pay-run'

type PayRunListItem = {
  id: string
  cycle: string
  status: string
  startDate: string
  endDate: string
  payDate: string
  createdAt: string
  processedAt: string | null
  payPeriod?: { id: string; startDate: string; endDate: string }
  _count?: { lines: number }
  lines?: Array<{ extraLines: unknown; extraPay?: number; extraDeductions?: unknown; grossPay?: number; netPay?: number }>
}

type SavedPayPeriod = {
  id: string
  startDate: string
  endDate: string
}

function moneyTotal(run: PayRunListItem): number {
  return (run.lines ?? []).reduce((sum, line) => sum + (Number(line.netPay ?? line.grossPay) || 0), 0)
}

export default function PayRunListPage() {
  const router = useRouter()
  const [runs, setRuns] = useState<PayRunListItem[]>([])
  const [periods, setPeriods] = useState<SavedPayPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/pay-runs').then(async (res) => {
        if (!res.ok) throw new Error('Failed to load pay runs')
        return res.json()
      }),
      fetch('/api/attendance/pay-period').then(async (res) => {
        if (!res.ok) throw new Error('Failed to load pay periods')
        return res.json()
      })
    ])
      .then(([runList, periodList]) => {
        setRuns(Array.isArray(runList) ? runList : [])
        setPeriods(Array.isArray(periodList) ? periodList : [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pay runs'))
      .finally(() => setLoading(false))
  }, [])

  const openFromPeriod = async (payPeriodId: string) => {
    setOpeningId(payPeriodId)
    setError(null)
    try {
      const res = await fetch('/api/pay-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payPeriodId })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to open pay run')
      router.push(`/pay-run/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open pay run')
      setOpeningId(null)
    }
  }

  const usedPeriodIds = new Set(runs.map((run) => run.payPeriod?.id).filter(Boolean))
  const unusedPeriods = periods.filter((period) => !usedPeriodIds.has(period.id))

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pay run</h1>
            <p className="text-sm text-gray-600 mt-1">
              Station net after NIS, loan, medical, and shortage. PAYE stays in Pay+.
            </p>
          </div>
          <button
            onClick={() => router.push('/attendance/pay-period')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            ← Pay period
          </button>
        </div>

        {error ? (
          <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        ) : null}

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pay runs</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-gray-500">
              No pay runs yet. Open one from a saved pay period.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => router.push(`/pay-run/${run.id}`)}
                  className="w-full text-left flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <span className="font-medium flex flex-wrap items-center gap-2">
                    {formatDateRange(run.startDate, run.endDate)}
                    <span className="text-xs font-normal px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {payCycleLabel(run.cycle)}
                    </span>
                    <span
                      className={`text-xs font-normal px-2 py-0.5 rounded ${
                        run.status === 'processed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {run.status === 'processed' ? 'Processed' : 'Draft'}
                    </span>
                  </span>
                  <span className="text-sm text-gray-600 tabular-nums">
                    {run._count?.lines ?? run.lines?.length ?? 0} lines
                    {run.lines?.length ? ` · ${formatMoney(moneyTotal(run))}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Start from a saved pay period</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : unusedPeriods.length === 0 && periods.length === 0 ? (
            <p className="text-sm text-gray-500">Save a pay period first, then open a pay run from it.</p>
          ) : unusedPeriods.length === 0 ? (
            <p className="text-sm text-gray-500">Every saved pay period already has a pay run. Open one above.</p>
          ) : (
            <div className="space-y-2">
              {unusedPeriods.map((period) => (
                <div
                  key={period.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                >
                  <span className="font-medium">{formatDateRange(period.startDate, period.endDate)}</span>
                  <button
                    type="button"
                    disabled={openingId === period.id}
                    onClick={() => openFromPeriod(period.id)}
                    className="px-3 py-1 text-sm bg-teal-100 text-teal-800 rounded hover:bg-teal-200 disabled:opacity-60"
                  >
                    {openingId === period.id ? 'Opening…' : 'Pay run'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
