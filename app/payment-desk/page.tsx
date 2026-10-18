'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FuelMakePaymentModal } from '@/app/fuel-payments/components/FuelMakePaymentModal'
import { VendorMakePaymentModal } from '@/app/vendor-payments/components/VendorMakePaymentModal'
import { FuelTankInventoryCard } from '@/app/fuel-payments/components/FuelTankInventoryCard'
import { OperatingBalanceCard, type OperatingBalance } from '@/app/components/OperatingBalanceCard'
import { formatAccountingDate } from '@/lib/accounting-date-format'
import { formatAmount } from '@/lib/fuelPayments'
import type { AccountingBooks, OpenBill, PaidBill } from '@/lib/accounting-types'
import { isOverheadCashbookCategory } from '@/lib/overhead-categories'

type Kind = OpenBill['kind']
type MonthFilter = 'all' | 'this' | 'last' | 'custom'
type VendorChoice = { id: string; name: string }
type Category = { id: string; name: string; code: string | null; type: string }

const FUEL_TYPES = ['Fuel', 'LPG', 'Lubricants', 'Uniforms', 'Loyalty', 'Balance Payment']
const EMPTY_OPEN_BILLS: OpenBill[] = []
const EMPTY_PAID_BILLS: PaidBill[] = []

function groupKey(bill: OpenBill) {
  return bill.kind === 'fuel' ? 'fuel' : bill.vendorId ? `vendor:${bill.vendorId}` : ''
}

function kindStyle(kind: Kind) {
  if (kind === 'fuel') return { label: 'Fuel', className: 'bg-sky-100 text-sky-800 ring-sky-200' }
  if (kind === 'overhead') return { label: 'Overhead', className: 'bg-amber-100 text-amber-800 ring-amber-200' }
  return { label: 'Vendor', className: 'bg-violet-100 text-violet-800 ring-violet-200' }
}

function todayMonth() {
  return new Date().toISOString().slice(0, 7)
}

function lastMonth() {
  const current = new Date(`${todayMonth()}-01T12:00:00Z`)
  current.setUTCMonth(current.getUTCMonth() - 1)
  return current.toISOString().slice(0, 7)
}

function Summary({ label, value, detail, tone = 'slate' }: { label: string; value: string; detail: string; tone?: 'slate' | 'amber' | 'red' | 'indigo' }) {
  const tones = { slate: 'border-slate-200 bg-white text-slate-950', amber: 'border-amber-200 bg-amber-50 text-amber-950', red: 'border-red-200 bg-red-50 text-red-950', indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950' }
  return <div className={`rounded-xl border p-4 ${tones[tone]}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-65">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-sm opacity-75">{detail}</p></div>
}

export default function PaymentDeskPage() {
  const [books, setBooks] = useState<AccountingBooks | null>(null)
  const [balance, setBalance] = useState<OperatingBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'unpaid' | 'paid'>('unpaid')
  const [kind, setKind] = useState<'all' | Kind>('all')
  const [vendorId, setVendorId] = useState('')
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('all')
  const [customMonth, setCustomMonth] = useState(todayMonth())
  const [selected, setSelected] = useState<string[]>([])
  const [fuelPayOpen, setFuelPayOpen] = useState(false)
  const [vendorPayOpen, setVendorPayOpen] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [entryKind, setEntryKind] = useState<Kind>('vendor')
  const [vendors, setVendors] = useState<VendorChoice[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [entry, setEntry] = useState({ vendorId: '', categoryId: '', payeeName: '', number: '', amount: '', date: new Date().toISOString().slice(0, 10), due: '', fuelType: 'Fuel' })
  const [savingEntry, setSavingEntry] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const month = monthFilter === 'this' ? todayMonth() : monthFilter === 'last' ? lastMonth() : monthFilter === 'custom' ? customMonth : todayMonth()
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [bookResult, balanceResult] = await Promise.all([fetch(`/api/accounting/books?month=${month}`, { cache: 'no-store' }), fetch('/api/fuel-payments/balance', { cache: 'no-store' })])
      if (!bookResult.ok) throw new Error('Could not load invoices and payments.')
      setBooks(await bookResult.json())
      if (balanceResult.ok) setBalance(await balanceResult.json())
      setSelected([])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load invoices and payments.') } finally { setLoading(false) }
  }, [month])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!entryOpen) return
    void Promise.all([fetch('/api/vendor-payments/vendors'), fetch('/api/financial/cashbook/categories')]).then(async ([vendorResult, categoryResult]) => {
      if (vendorResult.ok) setVendors(await vendorResult.json())
      if (categoryResult.ok) setCategories((await categoryResult.json()).filter((category: Category) => isOverheadCashbookCategory(category)))
    })
  }, [entryOpen])

  const openBills = books?.openBills ?? EMPTY_OPEN_BILLS
  const paidBills = books?.paidBills ?? EMPTY_PAID_BILLS
  const openVendors = useMemo(() => {
    const seen = new Map<string, string>()
    openBills.forEach((bill) => { if (bill.kind === 'vendor' && bill.vendorId) seen.set(bill.vendorId, bill.name) })
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [openBills])
  const query = search.trim().toLowerCase()
  const visibleOpen = openBills.filter((bill) => (kind === 'all' || bill.kind === kind) && (!vendorId || bill.vendorId === vendorId) && (!query || [bill.name, bill.number, bill.account].some((value) => value.toLowerCase().includes(query))))
  const visiblePaid = paidBills.filter((bill) => !query || [bill.name, bill.ref, bill.account].some((value) => value.toLowerCase().includes(query)))
  const selectedBills = openBills.filter((bill) => selected.includes(`${bill.kind}:${bill.id}`))
  const selectionGroup = selectedBills[0] ? groupKey(selectedBills[0]) : ''
  const selectionValid = selectedBills.length > 0 && selectedBills.every((bill) => groupKey(bill) === selectionGroup)
  const selectedTotal = selectedBills.reduce((sum, bill) => sum + bill.amount, 0)
  const asOf = books?.asOf || ''
  const dueSoonCutoff = asOf ? new Date(Date.parse(`${asOf}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10) : ''
  const dueSoon = openBills.filter((bill) => bill.due && bill.due >= asOf && bill.due <= dueSoonCutoff)
  const overdue = openBills.filter((bill) => bill.due && bill.due < (books?.asOf || ''))

  const toggle = (bill: OpenBill) => {
    const key = `${bill.kind}:${bill.id}`
    setNotice(null)
    setSelected((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key)
      const group = groupKey(bill)
      const currentBills = openBills.filter((item) => current.includes(`${item.kind}:${item.id}`))
      return currentBills.length === 0 || currentBills.every((item) => groupKey(item) === group) ? [...current, key] : [key]
    })
  }
  const selectVisible = () => {
    const payable = visibleOpen.filter((bill) => bill.status === 'pending')
    const groups = new Set(payable.map(groupKey).filter(Boolean))
    if (groups.size !== 1) return
    setSelected(payable.map((bill) => `${bill.kind}:${bill.id}`))
  }
  const startPayment = () => {
    if (!selectionValid) return
    if (selectedBills[0].kind === 'fuel') setFuelPayOpen(true)
    else setVendorPayOpen(true)
  }
  const afterPayment = () => { setFuelPayOpen(false); setVendorPayOpen(false); setSelected([]); setNotice('Payment saved. The desk has been refreshed.'); void load() }
  const saveEntry = async () => {
    const amount = Number(entry.amount)
    if (!entry.number.trim() || !entry.date || !Number.isFinite(amount) || amount <= 0) { setNotice('Invoice number, date, and amount are required.'); return }
    if (entryKind === 'vendor' && !entry.vendorId) { setNotice('Choose a vendor.'); return }
    if (entryKind === 'overhead' && !entry.categoryId) { setNotice('Choose an overhead account.'); return }
    setSavingEntry(true); setNotice(null)
    try {
      const url = entryKind === 'fuel' ? '/api/fuel-payments/invoices' : entryKind === 'overhead' ? '/api/vendor-payments/overhead-bills' : `/api/vendor-payments/vendors/${entry.vendorId}/invoices`
      const payload = entryKind === 'fuel' ? { invoiceNumber: entry.number.trim(), amount, type: entry.fuelType, invoiceDate: entry.date } : entryKind === 'overhead' ? { invoiceNumber: entry.number.trim(), amount, invoiceDate: entry.date, dueDate: entry.due || null, categoryId: entry.categoryId, payeeName: entry.payeeName.trim() || undefined } : { invoiceNumber: entry.number.trim(), amount, invoiceDate: entry.date, dueDate: entry.due || null }
      const result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await result.json().catch(() => ({}))
      if (!result.ok) throw new Error(data.error || 'Could not save invoice.')
      setEntry((current) => ({ ...current, number: '', amount: '', due: '' })); setEntryOpen(false); setNotice('Invoice added to the unpaid list.'); void load()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not save invoice.') } finally { setSavingEntry(false) }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Invoices &amp; Payment</h1><p className="mt-1 text-sm text-slate-600">Fuel, vendors, and overhead in one payment workspace.</p></div><button type="button" onClick={() => setEntryOpen((open) => !open)} className="min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{entryOpen ? 'Close entry' : '+ Enter a bill'}</button></div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Open bills" value={`${openBills.length}`} detail={formatAmount(openBills.reduce((sum, bill) => sum + bill.amount, 0))} /><Summary label="Due soon" value={`${dueSoon.length}`} detail={dueSoon.length ? formatAmount(dueSoon.reduce((sum, bill) => sum + bill.amount, 0)) : 'Nothing urgent'} tone="amber" /><Summary label="Overdue" value={`${overdue.length}`} detail={overdue.length ? formatAmount(overdue.reduce((sum, bill) => sum + bill.amount, 0)) : 'All clear'} tone="red" /><Summary label="Ready to pay" value={selectedBills.length ? formatAmount(selectedTotal) : '—'} detail={selectedBills.length ? `${selectedBills.length} selected` : 'Choose a payment group'} tone="indigo" /></div>
    <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"><div className="space-y-4">{balance ? <OperatingBalanceCard balance={balance} note="Shared across fuel and vendor payments" /> : null}<FuelTankInventoryCard /></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-900">Payment tools</p><p className="mt-2 text-sm leading-6 text-slate-600">Fuel payments include simulation, Hide from preview, Hold Out, PNG, PDF, and WhatsApp. Vendor payments include EFT/check, VAT, existing batches, and check management.</p></div></div>
    {entryOpen ? <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 grid grid-cols-3 gap-2">{(['vendor', 'fuel', 'overhead'] as Kind[]).map((value) => <button key={value} type="button" onClick={() => setEntryKind(value)} className={`min-h-[44px] rounded border text-sm font-semibold ${entryKind === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{value === 'vendor' ? 'Vendor' : value === 'fuel' ? 'Fuel' : 'Overhead'}</button>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entryKind === 'vendor' ? <label className="text-sm"><span className="font-medium text-slate-700">Vendor</span><select value={entry.vendorId} onChange={(event) => setEntry({ ...entry, vendorId: event.target.value })} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3"><option value="">Select…</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label> : null}{entryKind === 'fuel' ? <label className="text-sm"><span className="font-medium text-slate-700">Type</span><select value={entry.fuelType} onChange={(event) => setEntry({ ...entry, fuelType: event.target.value })} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3">{FUEL_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label> : null}{entryKind === 'overhead' ? <><label className="text-sm"><span className="font-medium text-slate-700">Account</span><select value={entry.categoryId} onChange={(event) => setEntry({ ...entry, categoryId: event.target.value })} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3"><option value="">Select…</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.code ? `${category.code} · ` : ''}{category.name}</option>)}</select></label><label className="text-sm"><span className="font-medium text-slate-700">Payee (optional)</span><input value={entry.payeeName} onChange={(event) => setEntry({ ...entry, payeeName: event.target.value })} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3" /></label></> : null}<label className="text-sm"><span className="font-medium text-slate-700">Invoice number</span><input value={entry.number} onChange={(event) => setEntry({ ...entry, number: event.target.value })} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3" /></label><label className="text-sm"><span className="font-medium text-slate-700">Amount</span><input inputMode="decimal" value={entry.amount} onChange={(event) => setEntry({ ...entry, amount: event.target.value })} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3" /></label><label className="text-sm"><span className="font-medium text-slate-700">Invoice date</span><input type="date" value={entry.date} onChange={(event) => setEntry({ ...entry, date: event.target.value })} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3" /></label>{entryKind !== 'fuel' ? <label className="text-sm"><span className="font-medium text-slate-700">Due date</span><input type="date" value={entry.due} onChange={(event) => setEntry({ ...entry, due: event.target.value })} className="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3" /></label> : null}</div><button type="button" disabled={savingEntry} onClick={() => void saveEntry()} className="mt-4 min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingEntry ? 'Saving…' : 'Save bill'}</button></section> : null}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 pt-3"><div className="flex flex-wrap gap-x-5"><button type="button" onClick={() => setTab('unpaid')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${tab === 'unpaid' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>Unpaid ({openBills.length})</button><button type="button" onClick={() => setTab('paid')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${tab === 'paid' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>Paid ({paidBills.length})</button></div><div className="mt-3 flex flex-wrap gap-2 pb-3"><span className="mr-1 self-center text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice month</span>{([['all', 'All'], ['this', 'This Month'], ['last', 'Last Month'], ['custom', 'Custom']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMonthFilter(value)} className={`rounded px-3 py-1.5 text-sm font-semibold ${monthFilter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>)}{monthFilter === 'custom' ? <input type="month" value={customMonth} onChange={(event) => setCustomMonth(event.target.value)} className="rounded border border-slate-300 px-2 text-sm" /> : null}</div></div>
      {tab === 'unpaid' ? <><div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between"><div className="flex flex-wrap gap-2">{(['all', 'fuel', 'vendor', 'overhead'] as const).map((value) => <button key={value} type="button" onClick={() => { setKind(value); setVendorId(''); setSelected([]) }} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${kind === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{value === 'all' ? `All (${openBills.length})` : `${kindStyle(value).label} (${openBills.filter((bill) => bill.kind === value).length})`}</button>)}</div><div className="flex w-full gap-2 lg:w-auto">{kind === 'vendor' ? <select value={vendorId} onChange={(event) => { setVendorId(event.target.value); setSelected([]) }} className="min-h-[44px] min-w-0 flex-1 rounded border border-slate-300 px-3 text-sm lg:w-52"><option value="">All vendors</option>{openVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select> : null}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Payee, number, or account" className="min-h-[44px] min-w-0 flex-1 rounded border border-slate-300 px-3 text-sm lg:w-64" /></div></div><div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 p-4"><button type="button" disabled={!selectionValid} onClick={startPayment} className="min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{selectionValid ? `Make payment ${formatAmount(selectedTotal)}` : 'Make payment'}</button><button type="button" onClick={selectVisible} disabled={new Set(visibleOpen.map(groupKey).filter(Boolean)).size !== 1} className="min-h-[44px] rounded border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-40">Select all</button><span className="text-sm text-slate-600">{selectedBills.length ? `${selectedBills.length} invoice${selectedBills.length === 1 ? '' : 's'} selected for ${selectedBills[0].name}.` : 'Select unpaid bills for one fuel or vendor payment group.'}</span></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3" /><th className="px-4 py-3">Payee</th><th className="px-4 py-3">Invoice number</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading invoices…</td></tr> : visibleOpen.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">No unpaid bills match this view.</td></tr> : visibleOpen.map((bill) => { const style = kindStyle(bill.kind); return <tr key={`${bill.kind}:${bill.id}`} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-4 py-3"><input type="checkbox" checked={selected.includes(`${bill.kind}:${bill.id}`)} disabled={bill.status !== 'pending'} onChange={() => toggle(bill)} /></td><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="font-medium text-slate-900">{bill.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style.className}`}>{style.label}</span></div></td><td className="px-4 py-3 font-mono text-slate-700">{bill.number}</td><td className="px-4 py-3">{formatAccountingDate(bill.date)}</td><td className="px-4 py-3">{formatAccountingDate(bill.due)}</td><td className="px-4 py-3 text-slate-600">{bill.account}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatAmount(bill.amount)}</td></tr> })}</tbody></table></div></> : <><div className="flex justify-end p-4"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Payee, reference, or account" className="min-h-[44px] w-full rounded border border-slate-300 px-3 text-sm sm:w-72" /></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Payee</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{visiblePaid.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">No paid bills match this view.</td></tr> : visiblePaid.map((bill: PaidBill) => <tr key={`${bill.kind}:${bill.id}`} className="border-t border-slate-100"><td className="px-4 py-3">{formatAccountingDate(bill.date)}</td><td className="px-4 py-3 font-medium">{bill.name}</td><td className="px-4 py-3 font-mono">{bill.ref}</td><td className="px-4 py-3 text-slate-600">{bill.account}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatAmount(bill.amount)}</td></tr>)}</tbody></table></div></>}</section>
    {notice ? <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}{error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
    <FuelMakePaymentModal open={fuelPayOpen} initialSelectedCsv={selectedBills[0]?.kind === 'fuel' ? selectedBills.map((bill) => bill.id).join(',') : ''} onClose={() => setFuelPayOpen(false)} onSuccess={() => afterPayment()} />
    <VendorMakePaymentModal open={vendorPayOpen} initialVendorId={selectedBills[0]?.kind !== 'fuel' ? selectedBills[0]?.vendorId || '' : ''} initialSelectedCsv={selectedBills[0]?.kind !== 'fuel' ? selectedBills.map((bill) => bill.id).join(',') : ''} onClose={() => setVendorPayOpen(false)} onSuccess={() => afterPayment()} />
  </div></main>
}
