'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatAccountingDate } from '@/lib/accounting-date-format'
import { formatAmount } from '@/lib/fuelPayments'

type Vendor = { id: string; name: string }
type Statement = { vendor: { id: string; name: string; notificationEmail: string }; startDate: string; endDate: string; opening: number; rows: Array<{ date: string; description: string; reference: string; charge: number; payment: number }>; totals: { charges: number; payments: number; closing: number } }
const today = () => new Date().toISOString().slice(0, 10)

export default function VendorStatementsPage() {
  const searchParams = useSearchParams()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorId, setVendorId] = useState(searchParams.get('vendorId') || '')
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || `${today().slice(0, 7)}-01`)
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || today())
  const [statement, setStatement] = useState<Statement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void fetch('/api/vendor-payments/statements?list=vendors').then((res) => res.json()).then(setVendors) }, [])
  const generate = async () => {
    if (!vendorId) return setError('Choose a vendor.')
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ vendorId, startDate, endDate })
      const res = await fetch(`/api/vendor-payments/statements?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not generate statement')
      setStatement(data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate statement') } finally { setLoading(false) }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-5 sm:p-8"><div className="mx-auto max-w-5xl"><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Vendor statements</h1><p className="mt-1 text-sm text-slate-600">Invoices, payments, and the running payable balance for one vendor.</p></div>{statement ? <button type="button" onClick={() => window.print()} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Print</button> : null}</div><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden"><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-medium">Vendor<select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3"><option value="">Choose vendor…</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label className="text-sm font-medium">From<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3" /></label><label className="text-sm font-medium">To<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3" /></label></div><button type="button" disabled={loading} onClick={() => void generate()} className="mt-4 min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Generating…' : 'Generate statement'}</button></section>{error ? <p className="mt-4 rounded bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}{statement ? <section className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="text-xl font-bold">{statement.vendor.name}</h2><p className="mt-1 text-sm text-slate-600">Statement period {formatAccountingDate(statement.startDate)} – {formatAccountingDate(statement.endDate)}</p></div><div className="grid gap-3 border-b p-4 sm:grid-cols-4"><Total label="Opening" value={statement.opening} /><Total label="Invoices" value={statement.totals.charges} /><Total label="Payments" value={statement.totals.payments} /><Total label="Closing" value={statement.totals.closing} /></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Invoice</th><th className="px-4 py-3 text-right">Payment</th></tr></thead><tbody>{statement.rows.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">No activity in this period.</td></tr> : statement.rows.map((row, index) => <tr key={`${row.date}:${row.reference}:${index}`} className="border-t"><td className="px-4 py-3">{formatAccountingDate(row.date)}</td><td className="px-4 py-3">{row.description}</td><td className="px-4 py-3 font-mono">{row.reference}</td><td className="px-4 py-3 text-right">{row.charge ? formatAmount(row.charge) : '—'}</td><td className="px-4 py-3 text-right">{row.payment ? formatAmount(row.payment) : '—'}</td></tr>)}</tbody></table></div></section> : null}</div></main>
}

function Total({ label, value }: { label: string; value: number }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{formatAmount(value)}</p></div> }
