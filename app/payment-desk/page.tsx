'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FuelMakePaymentModal } from '@/app/fuel-payments/components/FuelMakePaymentModal'
import { VendorMakePaymentModal } from '@/app/vendor-payments/components/VendorMakePaymentModal'
import { formatInvoiceDate, getDueDateStatus } from '@/lib/invoiceHelpers'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatAmount } from '@/lib/fuelPayments'

type FuelInvoice = {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  status: string
}

type VendorInvoice = {
  id: string
  vendorId: string
  invoiceNumber: string
  amount: number
  vat: number | null
  invoiceDate: string
  dueDate: string | null
  status: string
  vendor: { id: string; name: string }
}

type InvoiceKind = 'fuel' | 'vendor'

type DeskInvoice = {
  id: string
  key: string
  kind: InvoiceKind
  groupKey: string
  groupName: string
  number: string
  amount: number
  invoiceDate: string
  dueDate: string | null
  detail: string
  vendorId?: string
}

type PaymentGroup = {
  key: string
  kind: InvoiceKind
  name: string
  rows: DeskInvoice[]
  amount: number
}

function addDays(ymd: string, days: number) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

function dueTone(due: string | null) {
  if (!due) return { label: 'No due date', className: 'bg-slate-100 text-slate-600' }
  const status = getDueDateStatus(due)
  const label = status.status === 'overdue' ? `${Math.abs(status.daysUntil)}d overdue` : status.status === 'due' ? 'Due today' : status.status === 'warning' ? 'Due tomorrow' : `Due ${formatInvoiceDate(due)}`
  return { label, className: status.className }
}

function kindStyle(kind: InvoiceKind) {
  return kind === 'fuel'
    ? { label: 'Fuel', className: 'bg-sky-100 text-sky-800 ring-sky-200' }
    : { label: 'Vendor', className: 'bg-violet-100 text-violet-800 ring-violet-200' }
}

function SummaryCard({ label, value, detail, tone = 'slate' }: { label: string; value: string; detail: string; tone?: 'slate' | 'orange' | 'red' | 'indigo' }) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-900',
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900'
  }
  return <div className={`rounded-xl border p-4 ${tones[tone]}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-sm opacity-80">{detail}</p></div>
}

export default function PaymentDeskPage() {
  const router = useRouter()
  const [rows, setRows] = useState<DeskInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<'all' | InvoiceKind>('all')
  const [query, setQuery] = useState('')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [fuelPayOpen, setFuelPayOpen] = useState(false)
  const [vendorPayOpen, setVendorPayOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [fuelResponse, vendorResponse] = await Promise.all([
        fetch('/api/fuel-payments/invoices?status=pending', { cache: 'no-store' }),
        fetch('/api/vendor-payments/invoices?status=pending', { cache: 'no-store' })
      ])
      if (!fuelResponse.ok || !vendorResponse.ok) throw new Error('Could not load pending invoices.')
      const [fuelData, vendorData] = await Promise.all([fuelResponse.json(), vendorResponse.json()])
      const fuelRows: DeskInvoice[] = (Array.isArray(fuelData) ? fuelData as FuelInvoice[] : []).map((invoice) => ({
        id: invoice.id,
        key: `fuel:${invoice.id}`,
        kind: 'fuel',
        groupKey: 'fuel',
        groupName: 'Total Auto Fuel',
        number: invoice.invoiceNumber,
        amount: Number(invoice.amount) || 0,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        detail: invoice.type
      }))
      const vendorRows: DeskInvoice[] = (Array.isArray(vendorData) ? vendorData as VendorInvoice[] : []).map((invoice) => ({
        id: invoice.id,
        key: `vendor:${invoice.id}`,
        kind: 'vendor',
        groupKey: `vendor:${invoice.vendorId}`,
        groupName: invoice.vendor?.name || 'Vendor',
        number: invoice.invoiceNumber,
        amount: (Number(invoice.amount) || 0) + (Number(invoice.vat) || 0),
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        detail: invoice.vat != null ? `Includes VAT ${formatAmount(Number(invoice.vat) || 0)}` : 'No VAT',
        vendorId: invoice.vendorId
      }))
      setRows([...fuelRows, ...vendorRows])
    } catch (cause) {
      setRows([])
      setError(cause instanceof Error ? cause.message : 'Could not load pending invoices.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const groups = useMemo(() => {
    const byKey = new Map<string, PaymentGroup>()
    for (const row of rows) {
      const group = byKey.get(row.groupKey) ?? { key: row.groupKey, kind: row.kind, name: row.groupName, rows: [], amount: 0 }
      group.rows.push(row)
      group.amount += row.amount
      byKey.set(row.groupKey, group)
    }
    return [...byKey.values()].sort((a, b) => {
      const aDue = a.rows.map((row) => row.dueDate || '9999-12-31').sort()[0]
      const bDue = b.rows.map((row) => row.dueDate || '9999-12-31').sort()[0]
      return aDue.localeCompare(bDue) || a.name.localeCompare(b.name)
    })
  }, [rows])
  const selectedGroup = groups.find((group) => group.key === selectedGroupKey) ?? null
  const q = query.trim().toLowerCase()
  const visibleGroups = groups.filter((group) => {
    if (kindFilter !== 'all' && group.kind !== kindFilter) return false
    if (!q) return true
    return group.name.toLowerCase().includes(q) || group.rows.some((row) => `${row.number} ${row.detail}`.toLowerCase().includes(q))
  })
  const today = businessTodayYmd()
  const dueSoon = rows.filter((row) => row.dueDate && row.dueDate >= today && row.dueDate <= addDays(today, 2))
  const overdue = rows.filter((row) => row.dueDate && row.dueDate < today)
  const pendingAmount = rows.reduce((sum, row) => sum + row.amount, 0)
  const fuelCount = rows.filter((row) => row.kind === 'fuel').length
  const vendorCount = rows.filter((row) => row.kind === 'vendor').length

  const openWorkspace = () => {
    if (!selectedGroup) return
    if (selectedGroup.kind === 'fuel') setFuelPayOpen(true)
    else setVendorPayOpen(true)
  }

  const afterPayment = (kind: InvoiceKind, batchId: string) => {
    void load()
    setSelectedGroupKey(null)
    router.push(kind === 'fuel' ? `/fuel-payments/make-payment/share/${batchId}` : `/vendor-payments/make-payment/share/${batchId}`)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Payment Desk</h1><p className="mt-1 text-sm text-slate-600">One operational queue for fuel and vendor payments. Prepare a group, then use its full payment workspace.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/fuel-payments/invoices" className="min-h-[44px] rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100">+ Fuel invoice</Link><Link href="/vendor-payments/invoices" className="min-h-[44px] rounded border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100">+ Vendor invoice</Link></div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Pending" value={`${rows.length} invoices`} detail={formatAmount(pendingAmount)} />
          <SummaryCard label="Due soon" value={`${dueSoon.length} invoices`} detail={dueSoon.length ? formatAmount(dueSoon.reduce((sum, row) => sum + row.amount, 0)) : 'Nothing urgent'} tone="orange" />
          <SummaryCard label="Overdue" value={`${overdue.length} invoices`} detail={overdue.length ? formatAmount(overdue.reduce((sum, row) => sum + row.amount, 0)) : 'All clear'} tone="red" />
          <SummaryCard label="Active group" value={selectedGroup ? formatAmount(selectedGroup.amount) : '—'} detail={selectedGroup ? `${selectedGroup.rows.length} invoices for ${selectedGroup.name}` : 'Select a payment group'} tone="indigo" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section>
            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {([['all', `All ${rows.length}`], ['fuel', `Fuel ${fuelCount}`], ['vendor', `Vendors ${vendorCount}`]] as const).map(([kind, label]) => <button key={kind} type="button" onClick={() => setKindFilter(kind)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${kindFilter === kind ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>)}
              </div>
              <label className="w-full sm:w-72"><span className="sr-only">Search invoices</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search payee or invoice number" className="min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:min-h-0" /></label>
            </div>

            {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">Try again</button></div> : null}
            {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading payment groups…</div> : null}
            {!loading && !error && visibleGroups.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No pending invoices match this view.</div> : null}
            <div className="space-y-3">
              {visibleGroups.map((group) => {
                const style = kindStyle(group.kind)
                const active = selectedGroup?.key === group.key
                const earliest = group.rows.slice().sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))[0]
                return <article key={group.key} className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow ${active ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => setSelectedGroupKey(group.key)} className="flex w-full items-start justify-between gap-3 p-4 text-left"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-950">{group.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style.className}`}>{style.label}</span></div><p className="mt-1 text-sm text-slate-600">{group.rows.length} invoice{group.rows.length === 1 ? '' : 's'} · {earliest ? dueTone(earliest.dueDate).label : ''}</p></div><span className="shrink-0 text-right font-semibold tabular-nums text-slate-950">{formatAmount(group.amount)}</span></button>
                  {active ? <div className="border-t border-slate-100 bg-slate-50 px-4 py-3"><div className="space-y-2">{group.rows.map((row) => { const due = dueTone(row.dueDate); return <div key={row.key} className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><span className="font-mono text-slate-800">{row.number}</span><span className="ml-2 text-slate-500">{row.detail}</span></div><div className="flex shrink-0 items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${due.className}`}>{due.label}</span><span className="font-semibold tabular-nums">{formatAmount(row.amount)}</span></div></div> })}</div></div> : null}
                </article>
              })}
            </div>
          </section>

          <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4">
            {!selectedGroup ? <><h2 className="font-semibold text-slate-950">Prepare a payment</h2><p className="mt-2 text-sm leading-6 text-slate-600">Select a fuel group or one vendor. Its specialized workspace opens with all pending invoices preselected.</p><div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Fuel keeps simulation, preview visibility, Hold Out, PDF, and WhatsApp. Vendors keep EFT/check, batches, VAT, and check management.</div></> : <><span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${kindStyle(selectedGroup.kind).className}`}>{kindStyle(selectedGroup.kind).label} payment</span><h2 className="mt-3 text-lg font-bold text-slate-950">{selectedGroup.name}</h2><p className="mt-1 text-sm text-slate-600">{selectedGroup.rows.length} invoices · {formatAmount(selectedGroup.amount)}</p><div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{selectedGroup.kind === 'fuel' ? 'Preview controls include “Other Unpaid,” Hide from preview, and Hold Out. Those actions do not mark invoices paid.' : 'Choose EFT or check, post to Cashbook if appropriate, or attach missed invoices to a prior payment.'}</div><button type="button" onClick={openWorkspace} className="mt-4 min-h-[44px] w-full rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Open payment workspace</button><button type="button" onClick={() => setSelectedGroupKey(null)} className="mt-2 min-h-[44px] w-full rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear selection</button></>}
          </aside>
        </div>
      </div>

      <FuelMakePaymentModal open={fuelPayOpen} initialSelectedCsv={selectedGroup?.kind === 'fuel' ? selectedGroup.rows.map((row) => row.id).join(',') : ''} onClose={() => setFuelPayOpen(false)} onSuccess={(batchId) => afterPayment('fuel', batchId)} />
      <VendorMakePaymentModal open={vendorPayOpen} initialVendorId={selectedGroup?.kind === 'vendor' ? selectedGroup.rows[0]?.vendorId || '' : ''} initialSelectedCsv={selectedGroup?.kind === 'vendor' ? selectedGroup.rows.map((row) => row.id).join(',') : ''} onClose={() => setVendorPayOpen(false)} onSuccess={(batchId) => afterPayment('vendor', batchId)} />
    </main>
  )
}
