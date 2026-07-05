'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import { formatCstoreDisplayDate } from '@/lib/parse-customer-credit-report'
import {
  formatStatementDateRange,
  type AccountStatement,
  type StatementMode
} from '@/lib/customer-statement'
import ShareStatementModal from './ShareStatementModal'

function defaultStartDate(): string {
  const y = new Date().getFullYear()
  return `${y}-01-01`
}

function defaultEndDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function StatementParamSync({
  onParams
}: {
  onParams: (p: { account?: string; startDate?: string; endDate?: string; mode?: StatementMode }) => void
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const account = searchParams.get('account')?.trim() || undefined
    const startDate = searchParams.get('startDate')?.trim() || undefined
    const endDate = searchParams.get('endDate')?.trim() || undefined
    const modeRaw = searchParams.get('mode')
    const mode: StatementMode | undefined =
      modeRaw === 'detail' ? 'detail' : modeRaw === 'summary' ? 'summary' : undefined
    if (account || startDate || endDate || mode) {
      onParams({ account, startDate, endDate, mode })
    }
  }, [searchParams, onParams])

  return null
}

export default function AccountStatementPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<string[]>([])
  const [account, setAccount] = useState('')
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [mode, setMode] = useState<StatementMode>('summary')
  const [statement, setStatement] = useState<AccountStatement | null>(null)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [generated, setGenerated] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      const res = await fetch('/api/customer-accounts/statement?list=accounts')
      if (!res.ok) throw new Error('Failed to load accounts')
      const data = await res.json()
      setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    } catch {
      setAccounts([])
    } finally {
      setLoadingAccounts(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const applyUrlParams = useCallback(
    (p: { account?: string; startDate?: string; endDate?: string; mode?: StatementMode }) => {
      if (p.account) setAccount(p.account)
      if (p.startDate && /^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) setStartDate(p.startDate)
      if (p.endDate && /^\d{4}-\d{2}-\d{2}$/.test(p.endDate)) setEndDate(p.endDate)
      if (p.mode) setMode(p.mode)
    },
    []
  )

  const generateStatement = async () => {
    if (!account.trim()) {
      alert('Select a customer account.')
      return
    }
    if (startDate > endDate) {
      alert('Start date must be on or before end date.')
      return
    }
    setGenerating(true)
    setGenerated(false)
    try {
      const q = new URLSearchParams({
        account: account.trim(),
        startDate,
        endDate,
        mode
      })
      const res = await fetch(`/api/customer-accounts/statement?${q}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to generate statement')
      }
      const data: AccountStatement = await res.json()
      setStatement(data)
      setGenerated(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate statement')
      setStatement(null)
    } finally {
      setGenerating(false)
    }
  }

  const handlePrint = () => window.print()

  const downloadFile = async (kind: 'pdf' | 'excel') => {
    if (!account.trim()) return
    const base = `/api/customer-accounts/statement/${kind}`
    const q = new URLSearchParams({ account: account.trim(), startDate, endDate, mode })
    const res = await fetch(`${base}?${q}`)
    if (!res.ok) {
      alert('Download failed')
      return
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="([^"]+)"/)
    const filename = match?.[1] || `statement.${kind === 'excel' ? 'xlsx' : 'pdf'}`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const rangeLabel = formatStatementDateRange(startDate, endDate)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <Suspense fallback={null}>
        <StatementParamSync onParams={applyUrlParams} />
      </Suspense>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-content {
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6 no-print">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Account Statement</h1>
            <p className="text-sm text-gray-600 mt-1">
              Generate customer account summaries for any period.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/customer-accounts"
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold text-sm hover:bg-gray-700"
            >
              ← Customer Accounts
            </Link>
            {generated && (
              <>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-gray-100 text-gray-800 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-200"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => void downloadFile('pdf')}
                  className="px-4 py-2 bg-gray-100 text-gray-800 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-200"
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => void downloadFile('excel')}
                  className="px-4 py-2 bg-gray-100 text-gray-800 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-200"
                >
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => setShowShare(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded font-semibold text-sm hover:bg-green-700"
                >
                  Send to Mr. Elcock
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 no-print">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
              <select
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value)
                  setGenerated(false)
                }}
                disabled={loadingAccounts}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white"
              >
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setGenerated(false)
                }}
                className="px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setGenerated(false)
                }}
                className="px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">View</label>
              <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('summary')
                    setGenerated(false)
                  }}
                  className={`px-4 py-2 ${mode === 'summary' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  Summary
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('detail')
                    setGenerated(false)
                  }}
                  className={`px-4 py-2 border-l border-gray-300 ${mode === 'detail' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  Detail
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void generateStatement()}
              disabled={generating || !account}
              className="px-5 py-2 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate Statement'}
            </button>
          </div>
        </div>

        {!generated && !generating && (
          <p className="text-sm text-gray-500 no-print">
            Choose a customer and date range, then click Generate Statement.
          </p>
        )}

        {statement && generated && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 print-content">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">{statement.account}</h2>
              <p className="text-sm text-gray-600">{rangeLabel}</p>
              <p className="text-xs text-gray-500 mt-1">
                {statement.mode === 'summary'
                  ? 'Summary — monthly roll-forward'
                  : 'Detail — all transactions in period'}
              </p>
            </div>

            {statement.mode === 'summary' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Month</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">Opening</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">Charges</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">Payments</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">Closing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {statement.rows.map((row) => (
                      <tr key={`${row.year}-${row.month}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{row.monthLabel}</td>
                        <td className="px-4 py-2 text-right font-mono">{formatAmount(row.opening)}</td>
                        <td className="px-4 py-2 text-right font-mono">{formatAmount(row.charges)}</td>
                        <td className="px-4 py-2 text-right font-mono">{formatAmount(row.payments)}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">
                          {formatAmount(row.closing)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="px-4 py-2">Period totals</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatAmount(statement.totals.opening)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatAmount(statement.totals.charges)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatAmount(statement.totals.payments)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatAmount(statement.totals.closing)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-700">Charges</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-700">Payments</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-700">
                        Running total
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Memo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-gray-100">
                      <td colSpan={5} className="px-3 py-2 text-center font-medium text-gray-800">
                        Opening balance: {formatAmount(statement.opening)}
                      </td>
                    </tr>
                    {statement.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                          No transactions in this period. Import Cstore detail reports or record
                          payments on the Customer Accounts page.
                        </td>
                      </tr>
                    ) : (
                      statement.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 border-t border-gray-100">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatCstoreDisplayDate(row.date)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.charges > 0 ? formatAmount(row.charges) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.payments > 0 ? formatAmount(row.payments) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium">
                            {formatAmount(row.runningTotal)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{row.memo || '—'}</td>
                        </tr>
                      ))
                    )}
                    {statement.rows.length > 0 && (
                      <tr className="bg-gray-100 font-semibold">
                        <td className="px-3 py-2">Totals</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatAmount(statement.totals.charges)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatAmount(statement.totals.payments)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatAmount(statement.totals.closing)}
                        </td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 no-print">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/customer-accounts?month=${startDate.slice(0, 7)}`
                  )
                }
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Open {statement.account} ledger on Customer Accounts →
              </button>
            </div>
          </div>
        )}
      </div>

      <ShareStatementModal
        open={showShare}
        onClose={() => setShowShare(false)}
        account={account}
        startDate={startDate}
        endDate={endDate}
        mode={mode}
        statement={statement}
      />
    </div>
  )
}
