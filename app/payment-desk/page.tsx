'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FuelMakePaymentModal } from '@/app/fuel-payments/components/FuelMakePaymentModal'
import { VendorMakePaymentModal } from '@/app/vendor-payments/components/VendorMakePaymentModal'
import { FuelRevertPaymentModal } from '@/app/fuel-payments/components/FuelRevertPaymentModal'
import { VendorRevertPaymentModal } from '@/app/vendor-payments/components/VendorRevertPaymentModal'
import { FuelTankInventoryCard } from '@/app/fuel-payments/components/FuelTankInventoryCard'
import { FuelVolumeFields, litresPayload } from '@/app/components/FuelVolumeFields'
import { OperatingBalanceCard, type OperatingBalance } from '@/app/components/OperatingBalanceCard'
import { formatAccountingDate } from '@/lib/accounting-date-format'
import { formatAmount } from '@/lib/fuelPayments'
import type { AccountingBooks, OpenBill, PaidBill } from '@/lib/accounting-types'
import { isOverheadCashbookCategory } from '@/lib/overhead-categories'

type Kind = OpenBill['kind']
type MonthFilter = 'all' | 'this' | 'last' | 'custom'
type VendorChoice = { id: string; name: string }
type Category = { id: string; name: string; code: string | null; type: string }
type FuelBatch = { id: string; paymentDate: string; bankRef: string; totalAmount: number; _count?: { invoices: number } }
type VendorBatch = { id: string; vendorId: string; vendorName: string; paymentDate: string; paymentMethod: string; bankRef: string; totalAmount: number; invoiceCount: number }
type Batch = { id: string; kind: 'fuel' | 'vendor'; vendorId?: string; name: string; date: string; ref: string; amount: number; invoiceCount: number; method?: string }

const FUEL_TYPES = ['Fuel', 'LPG', 'Lubricants', 'Uniforms', 'Loyalty', 'Balance Payment']
const EMPTY_OPEN: OpenBill[] = []
const EMPTY_PAID: PaidBill[] = []

function todayMonth() { return new Date().toISOString().slice(0, 7) }
function lastMonth() { const d = new Date(`${todayMonth()}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) }
function groupKey(bill: OpenBill) { return bill.kind === 'fuel' ? 'fuel' : bill.vendorId ? `vendor:${bill.vendorId}` : '' }
function kindStyle(kind: Kind) {
  if (kind === 'fuel') return { label: 'Fuel', className: 'bg-sky-100 text-sky-800 ring-sky-200' }
  if (kind === 'overhead') return { label: 'Overhead', className: 'bg-amber-100 text-amber-800 ring-amber-200' }
  return { label: 'Vendor', className: 'bg-violet-100 text-violet-800 ring-violet-200' }
}
function dueStyle(due: string | null, asOf: string) {
  if (!due || !asOf) return null
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000)
  if (Number.isNaN(days)) return null
  if (days <= 0) return { label: days < 0 ? `${Math.abs(days)}d overdue` : 'Due today', className: 'bg-red-50 text-red-700 ring-red-200' }
  if (days <= 2) return { label: `Due in ${days}d`, className: 'bg-yellow-50 text-yellow-800 ring-yellow-200' }
  return { label: formatAccountingDate(due), className: 'bg-slate-100 text-slate-600 ring-slate-200' }
}
function Summary({ label, value, detail, tone = 'slate' }: { label: string; value: string; detail: string; tone?: 'slate' | 'amber' | 'red' | 'indigo' }) {
  const toneClasses = { slate: 'border-slate-200 bg-white', amber: 'border-amber-200 bg-amber-50', red: 'border-red-200 bg-red-50', indigo: 'border-indigo-200 bg-indigo-50' }
  return <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-sm text-slate-600">{detail}</p></div>
}

export default function PaymentDeskPage() {
  const [books, setBooks] = useState<AccountingBooks | null>(null)
  const [balance, setBalance] = useState<OperatingBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'unpaid' | 'paid'>('unpaid')
  const [kind, setKind] = useState<'all' | Kind>('all')
  const [paidKind, setPaidKind] = useState<'all' | Kind>('all')
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
  const [entry, setEntry] = useState({ vendorId: '', categoryId: '', payeeName: '', number: '', amount: '', date: new Date().toISOString().slice(0, 10), due: '', fuelType: 'Fuel', unleadedLitres: '', dieselLitres: '' })
  const [savingEntry, setSavingEntry] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [revert, setRevert] = useState<{ kind: 'fuel' | 'vendor'; vendorId?: string } | null>(null)

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
  const loadBatches = useCallback(async () => {
    setBatchesLoading(true)
    try {
      const [fuelResult, vendorResult] = await Promise.all([fetch(`/api/fuel-payments/batches?month=${month}`, { cache: 'no-store' }), fetch(`/api/vendor-payments/batches?month=${month}`, { cache: 'no-store' })])
      const fuel: FuelBatch[] = fuelResult.ok ? await fuelResult.json() : []
      const vendor: VendorBatch[] = vendorResult.ok ? await vendorResult.json() : []
      setBatches([...fuel.map((batch) => ({ id: batch.id, kind: 'fuel' as const, name: 'Fuel', date: batch.paymentDate, ref: batch.bankRef, amount: batch.totalAmount, invoiceCount: batch._count?.invoices ?? 0 })), ...vendor.map((batch) => ({ id: batch.id, kind: 'vendor' as const, vendorId: batch.vendorId, name: batch.vendorName, date: batch.paymentDate, ref: batch.bankRef, amount: batch.totalAmount, invoiceCount: batch.invoiceCount, method: batch.paymentMethod }))].sort((a, b) => b.date.localeCompare(a.date)))
    } finally { setBatchesLoading(false) }
  }, [month])
  useEffect(() => { void load(); void loadBatches() }, [load, loadBatches])
  useEffect(() => {
    if (!entryOpen) return
    void Promise.all([fetch('/api/vendor-payments/vendors'), fetch('/api/financial/cashbook/categories')]).then(async ([vendorResult, categoryResult]) => {
      if (vendorResult.ok) setVendors(await vendorResult.json())
      if (categoryResult.ok) setCategories((await categoryResult.json()).filter((category: Category) => isOverheadCashbookCategory(category)))
    })
  }, [entryOpen])

  const openBills = books?.openBills ?? EMPTY_OPEN
  const paidBills = books?.paidBills ?? EMPTY_PAID
  const query = search.trim().toLowerCase()
  const openVendors = useMemo(() => [...new Map(openBills.filter((bill) => bill.kind === 'vendor' && bill.vendorId).map((bill) => [bill.vendorId!, bill.name])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [openBills])
  const visibleOpen = openBills.filter((bill) => (kind === 'all' || bill.kind === kind) && (!vendorId || bill.vendorId === vendorId) && (!query || [bill.name, bill.number, bill.account].some((value) => value.toLowerCase().includes(query))))
  const visiblePaid = paidBills.filter((bill) => (paidKind === 'all' || bill.kind === paidKind) && (!query || [bill.name, bill.ref, bill.account].some((value) => value.toLowerCase().includes(query))))
  const selectedBills = openBills.filter((bill) => selected.includes(`${bill.kind}:${bill.id}`))
  const selectionGroup = selectedBills[0] ? groupKey(selectedBills[0]) : ''
  const selectionValid = selectedBills.length > 0 && selectedBills.every((bill) => groupKey(bill) === selectionGroup)
  const selectedTotal = selectedBills.reduce((sum, bill) => sum + bill.amount, 0)
  const asOf = books?.asOf || ''
  const dueSoonCutoff = asOf ? new Date(Date.parse(`${asOf}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10) : ''
  const dueSoon = openBills.filter((bill) => bill.due && bill.due >= asOf && bill.due <= dueSoonCutoff)
  const overdue = openBills.filter((bill) => bill.due && bill.due < asOf)

  const toggle = (bill: OpenBill) => setSelected((current) => {
    const key = `${bill.kind}:${bill.id}`
    if (current.includes(key)) return current.filter((item) => item !== key)
    const currentBills = openBills.filter((item) => current.includes(`${item.kind}:${item.id}`))
    return currentBills.length === 0 || currentBills.every((item) => groupKey(item) === groupKey(bill)) ? [...current, key] : [key]
  })
  const startPayment = () => { if (selectionValid) selectedBills[0].kind === 'fuel' ? setFuelPayOpen(true) : setVendorPayOpen(true) }
  const afterPayment = () => { setFuelPayOpen(false); setVendorPayOpen(false); setSelected([]); setNotice('Payment saved. The desk has been refreshed.'); void load(); void loadBatches() }
  const afterRevert = () => { setRevert(null); setNotice('Payment reverted. The desk has been refreshed.'); void load(); void loadBatches() }
  const saveEntry = async () => {
    const amount = Number(entry.amount)
    if (!entry.number.trim() || !entry.date || !Number.isFinite(amount) || amount <= 0) return setNotice('Invoice number, date, and amount are required.')
    if (entryKind === 'vendor' && !entry.vendorId) return setNotice('Choose a vendor.')
    if (entryKind === 'overhead' && !entry.categoryId) return setNotice('Choose an overhead account.')
    setSavingEntry(true); setNotice(null)
    try {
      const url = entryKind === 'fuel' ? '/api/fuel-payments/invoices' : entryKind === 'overhead' ? '/api/vendor-payments/overhead-bills' : `/api/vendor-payments/vendors/${entry.vendorId}/invoices`
      const payload = entryKind === 'fuel' ? { invoiceNumber: entry.number.trim(), amount, type: entry.fuelType, invoiceDate: entry.date, ...litresPayload(entry.unleadedLitres, entry.dieselLitres) } : entryKind === 'overhead' ? { invoiceNumber: entry.number.trim(), amount, invoiceDate: entry.date, dueDate: entry.due || null, categoryId: entry.categoryId, payeeName: entry.payeeName.trim() || undefined } : { invoiceNumber: entry.number.trim(), amount, invoiceDate: entry.date, dueDate: entry.due || null }
      const result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await result.json().catch(() => ({}))
      if (!result.ok) throw new Error(data.error || 'Could not save invoice.')
      setEntry((current) => ({ ...current, number: '', amount: '', due: '', unleadedLitres: '', dieselLitres: '' })); setEntryOpen(false); setNotice('Invoice added to the unpaid list.'); void load()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not save invoice.') } finally { setSavingEntry(false) }
  }

  const filterChips = (active: 'all' | Kind, setActive: (value: 'all' | Kind) => void, rows: Array<{ kind: Kind }>) => <div className="flex flex-wrap gap-2">{(['all', 'fuel', 'vendor', 'overhead'] as const).map((value) => <button key={value} type="button" onClick={() => setActive(value)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${active === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{value === 'all' ? `All (${rows.length})` : `${kindStyle(value).label} (${rows.filter((row) => row.kind === value).length})`}</button>)}</div>

  return <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Invoices &amp; Payment</h1><p className="mt-1 text-sm text-slate-600">Fuel, vendors, and overhead in one payment workspace.</p></div><a href="/vendor-payments/statements" className="min-h-[44px] rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Vendor statements</a></div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Open bills" value={`${openBills.length}`} detail={formatAmount(openBills.reduce((sum, bill) => sum + bill.amount, 0))} /><Summary label="Due soon" value={`${dueSoon.length}`} detail={dueSoon.length ? formatAmount(dueSoon.reduce((sum, bill) => sum + bill.amount, 0)) : 'Nothing urgent'} tone="amber" /><Summary label="Overdue" value={`${overdue.length}`} detail={overdue.length ? formatAmount(overdue.reduce((sum, bill) => sum + bill.amount, 0)) : 'All clear'} tone="red" /><Summary label="Ready to pay" value={selectedBills.length ? formatAmount(selectedTotal) : '—'} detail={selectedBills.length ? `${selectedBills.length} selected` : 'Choose a payment group'} tone="indigo" /></div>
    <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"><div className="space-y-4">{balance ? <OperatingBalanceCard balance={balance} note="Shared across fuel and vendor payments" /> : null}<FuelTankInventoryCard /></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-900">Payment tools</p><p className="mt-2 text-sm leading-6 text-slate-600">Fuel payments include simulation, Hide from preview, Hold Out, PNG, PDF, and WhatsApp. Vendor payments include EFT/check, VAT, existing batches, and check management.</p></div></div>
    {entryOpen ? <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 grid grid-cols-3 gap-2">{(['vendor', 'fuel', 'overhead'] as Kind[]).map((value) => <button key={value} type="button" onClick={() => setEntryKind(value)} className={`min-h-[44px] rounded border text-sm font-semibold ${entryKind === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{kindStyle(value).label}</button>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entryKind === 'vendor' ? <label className="text-sm"><span className="font-medium">Vendor</span><select value={entry.vendorId} onChange={(e) => setEntry({ ...entry, vendorId: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3"><option value="">Select…</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label> : null}{entryKind === 'fuel' ? <label className="text-sm"><span className="font-medium">Type</span><select value={entry.fuelType} onChange={(e) => setEntry({ ...entry, fuelType: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3">{FUEL_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label> : null}{entryKind === 'overhead' ? <><label className="text-sm"><span className="font-medium">Account</span><select value={entry.categoryId} onChange={(e) => setEntry({ ...entry, categoryId: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3"><option value="">Select…</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.code ? `${category.code} · ` : ''}{category.name}</option>)}</select></label><label className="text-sm"><span className="font-medium">Payee (optional)</span><input value={entry.payeeName} onChange={(e) => setEntry({ ...entry, payeeName: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label></> : null}<label className="text-sm"><span className="font-medium">Invoice number</span><input value={entry.number} onChange={(e) => setEntry({ ...entry, number: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label><label className="text-sm"><span className="font-medium">Amount</span><input inputMode="decimal" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label><label className="text-sm"><span className="font-medium">Invoice date</span><input type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label>{entryKind !== 'fuel' ? <label className="text-sm"><span className="font-medium">Due date</span><input type="date" value={entry.due} onChange={(e) => setEntry({ ...entry, due: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label> : null}</div>{entryKind === 'fuel' ? <div className="mt-3"><FuelVolumeFields type={entry.fuelType} unleadedLitres={entry.unleadedLitres} dieselLitres={entry.dieselLitres} onChange={({ unleadedLitres, dieselLitres }) => setEntry({ ...entry, unleadedLitres, dieselLitres })} /></div> : null}<button type="button" disabled={savingEntry} onClick={() => void saveEntry()} className="mt-4 min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingEntry ? 'Saving…' : 'Save bill'}</button></section> : null}
    <details className="mb-5 rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3"><span><span className="font-semibold text-slate-900">Payment batches</span><span className="ml-2 text-sm text-slate-600">History and batch-level corrections</span></span><span className="text-sm text-slate-600">{batches.length} batches</span></summary><div className="border-t border-slate-200"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Payee</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Invoices</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3" /></tr></thead><tbody>{batchesLoading ? <tr><td colSpan={7} className="p-6 text-center text-slate-500">Loading batches…</td></tr> : batches.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-slate-500">No payment batches in this month.</td></tr> : batches.map((batch) => <tr key={`${batch.kind}:${batch.id}`} className="border-t"><td className="px-4 py-3">{formatAccountingDate(batch.date)}</td><td className="px-4 py-3 font-medium">{batch.name}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${kindStyle(batch.kind).className}`}>{kindStyle(batch.kind).label}</span>{batch.method ? <span className="ml-2 text-xs text-slate-500">{batch.method}</span> : null}</td><td className="px-4 py-3 font-mono">{batch.ref}</td><td className="px-4 py-3">{batch.invoiceCount}</td><td className="px-4 py-3 text-right font-semibold">{formatAmount(batch.amount)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setRevert({ kind: batch.kind, vendorId: batch.vendorId })} className="rounded border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">Revert</button></td></tr>)}</tbody></table></div></div></details>
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 pt-3"><div className="flex items-start justify-between gap-4"><div className="flex gap-x-5"><button type="button" onClick={() => setTab('unpaid')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${tab === 'unpaid' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>Unpaid ({openBills.length})</button><button type="button" onClick={() => setTab('paid')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${tab === 'paid' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>Paid ({paidBills.length})</button></div><button type="button" onClick={() => setEntryOpen((open) => !open)} className="min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">{entryOpen ? 'Close entry' : '+ Enter a bill'}</button></div><div className="mt-3 flex flex-wrap gap-2 pb-3"><span className="self-center text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice month</span>{([['all', 'All'], ['this', 'This Month'], ['last', 'Last Month'], ['custom', 'Custom']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMonthFilter(value)} className={`rounded px-3 py-1.5 text-sm font-semibold ${monthFilter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>)}{monthFilter === 'custom' ? <input type="month" value={customMonth} onChange={(e) => setCustomMonth(e.target.value)} className="rounded border px-2 text-sm" /> : null}</div></div>
      {tab === 'unpaid' ? <><div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-end lg:justify-between"><div>{filterChips(kind, (value) => { setKind(value); setVendorId(''); setSelected([]) }, openBills)}</div><div className="flex gap-2">{kind === 'vendor' ? <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="min-h-[44px] rounded border px-3 text-sm"><option value="">All vendors</option>{openVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select> : null}<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payee, number, or account" className="min-h-[44px] rounded border px-3 text-sm" /></div></div><div className="flex flex-wrap items-center gap-3 border-b bg-slate-50 p-4"><button type="button" disabled={!selectionValid} onClick={startPayment} className="min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{selectionValid ? `Make payment ${formatAmount(selectedTotal)}` : 'Make payment'}</button><span className="text-sm text-slate-600">{selectedBills.length ? `${selectedBills.length} invoices selected for ${selectedBills[0].name}.` : 'Select unpaid bills for one fuel or vendor payment group.'}</span></div><BillTable bills={visibleOpen} loading={loading} selected={selected} onToggle={toggle} /></> : <><div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">{filterChips(paidKind, setPaidKind, paidBills)}<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Payee, reference, or account" className="min-h-[44px] rounded border px-3 text-sm" /></div><PaidTable bills={visiblePaid} onRevert={(bill) => setRevert({ kind: bill.kind === 'fuel' ? 'fuel' : 'vendor', vendorId: bill.vendorId ?? undefined })} /></>}</section>
    {notice ? <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}{error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
    <FuelMakePaymentModal open={fuelPayOpen} initialSelectedCsv={selectedBills[0]?.kind === 'fuel' ? selectedBills.map((bill) => bill.id).join(',') : ''} onClose={() => setFuelPayOpen(false)} onSuccess={afterPayment} />
    <VendorMakePaymentModal open={vendorPayOpen} initialVendorId={selectedBills[0]?.kind !== 'fuel' ? selectedBills[0]?.vendorId || '' : ''} initialSelectedCsv={selectedBills[0]?.kind !== 'fuel' ? selectedBills.map((bill) => bill.id).join(',') : ''} onClose={() => setVendorPayOpen(false)} onSuccess={afterPayment} />
    <FuelRevertPaymentModal open={revert?.kind === 'fuel'} onClose={() => setRevert(null)} onSuccess={afterRevert} />
    <VendorRevertPaymentModal open={revert?.kind === 'vendor'} vendorId={revert?.vendorId || ''} onClose={() => setRevert(null)} onSuccess={afterRevert} />
  </div></main>
}

function BillTable({ bills, loading, selected, onToggle }: { bills: OpenBill[]; loading: boolean; selected: string[]; onToggle: (bill: OpenBill) => void }) {
  const asOf = new Date().toISOString().slice(0, 10)
  return <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3" /><th className="px-4 py-3">Payee</th><th className="px-4 py-3">Invoice number</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading invoices…</td></tr> : bills.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">No unpaid bills match this view.</td></tr> : bills.map((bill) => { const style = kindStyle(bill.kind); const due = dueStyle(bill.due, asOf); return <tr key={`${bill.kind}:${bill.id}`} className="border-t"><td className="px-4 py-3"><input type="checkbox" checked={selected.includes(`${bill.kind}:${bill.id}`)} disabled={bill.status !== 'pending'} onChange={() => onToggle(bill)} /></td><td className="px-4 py-3"><span className="font-medium">{bill.name}</span><span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>{style.label}</span></td><td className="px-4 py-3 font-mono">{bill.number}</td><td className="px-4 py-3">{formatAccountingDate(bill.date)}</td><td className="px-4 py-3">{due ? <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${due.className}`}>{due.label}</span> : <span className="text-slate-400">—</span>}</td><td className="px-4 py-3 text-slate-600">{bill.account}</td><td className="px-4 py-3 text-right font-semibold">{formatAmount(bill.amount)}</td></tr> })}</tbody></table></div>
}
function PaidTable({ bills, onRevert: _onRevert }: { bills: PaidBill[]; onRevert: (bill: PaidBill) => void }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Payee</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{bills.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">No paid bills match this view.</td></tr> : bills.map((bill) => <tr key={`${bill.kind}:${bill.id}`} className="border-t"><td className="px-4 py-3">{formatAccountingDate(bill.date)}</td><td className="px-4 py-3"><span className="font-medium">{bill.name}</span><span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${kindStyle(bill.kind).className}`}>{kindStyle(bill.kind).label}</span></td><td className="px-4 py-3 font-mono">{bill.ref}</td><td className="px-4 py-3 text-slate-600">{bill.account}</td><td className="px-4 py-3 text-right font-semibold">{formatAmount(bill.amount)}</td></tr>)}</tbody></table></div>
}
