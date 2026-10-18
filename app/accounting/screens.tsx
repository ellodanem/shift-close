'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatAmount } from '@/lib/fuelPayments'
import { formatAccountingDate } from '@/lib/accounting-date-format'
import { isOverheadCashbookCategory } from '@/lib/overhead-categories'
import { isFullAccessRole } from '@/lib/roles'
import type { AccountingBooks, PaidBill } from '@/lib/accounting-types'
import { useAuth } from '@/app/components/AuthContext'
import { useAccountingBooks } from './books-context'
import { PayBillsModal, type PayBillsInput } from './pay-bills-modal'
import { PaymentBatchModal } from './payment-batch-modal'

export function money(amount: number): string {
  return formatAmount(amount)
}

function journalDateLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[Number(match[2]) - 1]
  if (!month) return ''
  return `${Number(match[3])} ${month} ${match[1]}`
}

function BooksBackLink() {
  return (
    <Link href="/accounting" className="mb-3 inline-block text-sm text-indigo-700 hover:underline">
      ← Back
    </Link>
  )
}

export function PageTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {note ? <p className="mt-1 text-sm text-gray-600">{note}</p> : null}
    </div>
  )
}

export function StatStrip({
  items
}: {
  items: Array<{ label: string; value: string; tone?: 'good' | 'bad' | 'warn' }>
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-6">
      {items.map((item) => (
        <div key={item.label}>
          <p
            className={`text-lg font-semibold tabular-nums ${
              item.tone === 'good' ? 'text-green-700' : item.tone === 'bad' ? 'text-red-700' : item.tone === 'warn' ? 'text-amber-700' : 'text-gray-900'
            }`}
          >
            {item.value}
          </p>
          <p className="text-xs text-gray-500">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

export function DataTable({
  headers,
  rows,
  align
}: {
  headers: string[]
  rows: Array<Array<string | number>>
  align?: Array<'left' | 'right'>
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            {headers.map((header, index) => (
              <th key={header} className={`px-3 py-2 ${align?.[index] === 'right' ? 'text-right' : ''}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-gray-500">
                Nothing to show.
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-gray-100">
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={`px-3 py-2 text-gray-800 ${align?.[index] === 'right' ? 'text-right tabular-nums' : ''}`}
                  >
                    {cell === '' ? '—' : cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function useBooks(): AccountingBooks {
  const { books } = useAccountingBooks()
  if (!books) throw new Error('Books are not loaded')
  return books
}

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'eft', label: 'EFT' },
  { value: 'direct_debit', label: 'Direct debit' },
  { value: 'debit_credit', label: 'Debit/Credit' }
]

export function OverviewScreen() {
  const books = useBooks()
  const { user } = useAuth()
  const role = user?.role ?? ''
  const assets = books.westlineOnFile + books.serviceStationOnFile + books.accountsReceivable
  const liabilities = books.accountsPayableFuel + books.accountsPayableVendors + books.payrollPayable
  const asOfLabel = journalDateLabel(books.asOf) || books.asOf
  // Keep customers who paid their balance in the selected month visible too.
  // They are useful collection records even when their month-end balance is zero.
  const receivables = books.customers.filter((customer) => customer.closing !== 0 || customer.payments !== 0)
  const receivableTotals = receivables.reduce(
    (totals, customer) => ({
      payments: totals.payments + customer.payments,
      closing: totals.closing + customer.closing
    }),
    { payments: 0, closing: 0 }
  )
  const fuelHref = isFullAccessRole(role) ? '/fuel-payments/invoices' : '/accounting/bills'
  const vendorHref = isFullAccessRole(role) ? '/vendor-payments/invoices' : '/accounting/vendors'
  const payrollHref = '/payroll'
  const balanceRows: Array<{ account: string; debit: number | null; credit: number | null; total?: boolean }> = [
    { account: '101 · Westline chequing', debit: books.westlineOnFile, credit: null },
    { account: '102 · Service Station chequing', debit: books.serviceStationOnFile, credit: null },
    { account: '104 · Accounts receivable', debit: books.accountsReceivable, credit: null },
    { account: 'Total assets', debit: assets, credit: null, total: true },
    { account: '201 · Accounts payable, fuel', debit: null, credit: books.accountsPayableFuel },
    { account: '202 · Accounts payable, vendors', debit: null, credit: books.accountsPayableVendors },
    { account: '204 · Payroll payable', debit: null, credit: books.payrollPayable },
    { account: 'Total liabilities', debit: null, credit: liabilities, total: true }
  ]

  return (
    <div>
      <PageTitle title="Accounting overview" note="What would you like to do today?" />
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href="/accounting/bills" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">
          Enter & pay bills
        </Link>
        <Link href="/accounting/journal" className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
          Journal entry
        </Link>
        <Link href="/accounting/reconcile" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">
          Reconcile
        </Link>
        <Link href="/payroll" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">
          Pay runs
        </Link>
        <Link href="/customer-accounts" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">
          Customer Accounts
        </Link>
        <Link href="/accounting/vendors" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">
          Vendors
        </Link>
      </div>
      <p className="mb-6 text-sm text-gray-600">
        Deposits and card totals already arrive from closed shifts. House-account charges already arrive from the close. This overview reads those balances.
      </p>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">Outstanding payables</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <PayableLink
          href={fuelHref}
          title="Fuel"
          amount={books.accountsPayableFuel}
          note={books.accountsPayableFuelForecast > 0 ? `Posted unpaid · ${money(books.accountsPayableFuelForecast)} forecast` : 'Posted unpaid invoices'}
          link={fuelHref.startsWith('/accounting') ? 'Enter & pay bills' : 'Open fuel invoices'}
        />
        <PayableLink
          href={vendorHref}
          title="Vendors"
          amount={books.accountsPayableVendors}
          note="Pending vendor and overhead bills"
          link={vendorHref.startsWith('/accounting') ? 'Open vendors' : 'Open vendor bills'}
        />
        <PayableLink
          href={payrollHref}
          title="Payroll"
          amount={books.payrollPayable}
          note="Approved runs whose pay date is still ahead"
          link="Open pay runs"
        />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">Account balances as of {asOfLabel}</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left text-xs font-semibold text-gray-600">
            <tr>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {balanceRows.map((row) => (
              <tr key={row.account} className={row.total ? 'bg-gray-100 font-semibold' : 'border-t border-gray-100'}>
                <td className="px-3 py-2">{row.account}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.debit == null ? '' : money(row.debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.credit == null ? '' : money(row.credit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-gray-600">
        Westline and Service Station are the latest balances on file. Receivable and payable balances include posted items outstanding as of this date; simulated invoices are shown only as forecasts.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Receivables for {books.month}</h2>
          <p className="mb-2 text-sm text-gray-600">
            Payments received during the selected month and the balance remaining at month-end.
          </p>
          <DataTable
            headers={['Customer', 'Payments this month', 'Closing balance']}
            align={['left', 'right', 'right']}
            rows={[
              ...receivables.map((customer) => [customer.name, money(customer.payments), money(customer.closing)]),
              ['Total', money(receivableTotals.payments), money(receivableTotals.closing)]
            ]}
          />
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Bills paid this month</h2>
          <DataTable
            headers={['Date', 'Payee', 'Amount']}
            align={['left', 'left', 'right']}
            rows={books.paidBills.map((bill) => [
              journalDateLabel(bill.date) || bill.date,
              bill.ref ? `${bill.name} · ${bill.ref}` : bill.name,
              money(bill.amount)
            ])}
          />
        </div>
      </div>
      <h2 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Pay runs in this month</h2>
      <DataTable
        headers={['Period', 'Pay date', 'Status', 'Net']}
        align={['left', 'left', 'left', 'right']}
        rows={books.payRuns.map((run) => [run.period, run.payDate, run.status, money(run.net)])}
      />
    </div>
  )
}

function PayableLink({
  href,
  title,
  amount,
  note,
  link
}: {
  href: string
  title: string
  amount: number
  note: string
  link: string
}) {
  return (
    <Link href={href} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-indigo-300">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{money(amount)}</p>
      <p className="mt-1 text-xs text-gray-500">{note}</p>
      <p className="mt-3 text-sm font-semibold text-indigo-600">{link}</p>
    </Link>
  )
}

export function LedgerScreen() {
  const books = useBooks()
  return (
    <div>
      <PageTitle
        title="General ledger · 101 Westline"
        note="Money in is a debit. A check or charge is a credit. The running balance is this month’s movement, starting at zero."
      />
      <StatStrip
        items={[
          { label: 'Debits (money in)', value: money(books.monthIncome) },
          { label: 'Credits (money out)', value: money(books.monthExpense) },
          { label: 'Movement', value: money(books.monthNet), tone: books.monthNet >= 0 ? 'good' : 'bad' }
        ]}
      />
      <DataTable
        headers={['Date', 'Description', 'Account', 'Debit', 'Credit', 'Balance', 'Source']}
        align={['left', 'left', 'left', 'right', 'right', 'right', 'left']}
        rows={books.ledger.map((row) => [
          row.date,
          row.description,
          row.category,
          row.debit ? money(row.debit) : '',
          row.credit ? money(row.credit) : '',
          money(row.balance),
          row.source
        ])}
      />
      <p className="mt-3 text-sm text-gray-600">
        Rows from a shift stay the shift’s numbers. This ledger does not change the close.
      </p>
    </div>
  )
}

export function CustomersScreen() {
  const books = useBooks()
  return (
    <div>
      <BooksBackLink />
      <PageTitle
        title="Customers"
        note="Monthly account activity. Charges come from the customer accounts already imported. A payment still posts as a deposit."
      />
      <DataTable
        headers={['Customer', 'Opening', 'Charges', 'Payments', 'Closing', 'Last payment']}
        align={['left', 'right', 'right', 'right', 'right', 'left']}
        rows={books.customers.map((row) => [
          row.name,
          money(row.opening),
          money(row.charges),
          money(row.payments),
          money(row.closing),
          row.lastPayment ?? ''
        ])}
      />
    </div>
  )
}

export function AgingScreen() {
  const books = useBooks()
  const totals = books.aging.reduce(
    (sum, row) => ({
      total: sum.total + row.total,
      d0_30: sum.d0_30 + row.d0_30,
      d31_60: sum.d31_60 + row.d31_60,
      d61_90: sum.d61_90 + row.d61_90,
      d90: sum.d90 + row.d90,
      unaged: sum.unaged + row.unaged
    }),
    { total: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90: 0, unaged: 0 }
  )
  return (
    <div>
      <PageTitle
        title="Accounts receivable aging"
        note={`As of ${books.endDate}. Oldest charges are cleared first. A balance with no ledger lines sits in Unaged.`}
      />
      <StatStrip items={[{ label: 'Total receivable', value: money(totals.total) }, { label: '90+ days', value: money(totals.d90), tone: totals.d90 > 0 ? 'warn' : undefined }]} />
      <DataTable
        headers={['Customer', 'Total', '0–30', '31–60', '61–90', '90+', 'Unaged']}
        align={['left', 'right', 'right', 'right', 'right', 'right', 'right']}
        rows={[
          ...books.aging.map((row) => [
            row.name,
            money(row.total),
            money(row.d0_30),
            money(row.d31_60),
            money(row.d61_90),
            money(row.d90),
            row.unaged ? money(row.unaged) : ''
          ]),
          ['Total', money(totals.total), money(totals.d0_30), money(totals.d31_60), money(totals.d61_90), money(totals.d90), totals.unaged ? money(totals.unaged) : '']
        ]}
      />
    </div>
  )
}

const FUEL_BILL_TYPES = ['Fuel', 'LPG', 'Lubricants', 'Uniforms', 'Loyalty', 'Balance Payment']
const OTHER_OVERHEAD_ITEM = '__other__'

type OverheadCategory = {
  id: string
  name: string
  code: string | null
  type: string
}

function overheadCategoryLabel(category: OverheadCategory): string {
  return category.code ? `${category.code} · ${category.name}` : category.name
}

function billGroup(bill: { kind: string; vendorId: string | null }): string | null {
  if (bill.kind === 'fuel') return 'fuel'
  return bill.vendorId ? `vendor:${bill.vendorId}` : null
}

function billKindStyle(kind: 'fuel' | 'vendor' | 'overhead') {
  if (kind === 'fuel') return { label: 'Fuel', className: 'bg-sky-100 text-sky-800 ring-sky-200' }
  if (kind === 'overhead') return { label: 'Overhead', className: 'bg-amber-100 text-amber-800 ring-amber-200' }
  return { label: 'Vendor', className: 'bg-violet-100 text-violet-800 ring-violet-200' }
}

function dueStyle(due: string | null, asOf: string): { label: string; className: string } | null {
  if (!due) return null
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000)
  if (Number.isNaN(days)) return null
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, className: 'bg-red-50 text-red-700 ring-red-200' }
  if (days === 0) return { label: 'Due today', className: 'bg-red-50 text-red-700 ring-red-200' }
  if (days <= 2) return { label: `Due in ${days}d`, className: 'bg-orange-50 text-orange-700 ring-orange-200' }
  return { label: formatAccountingDate(due), className: 'bg-slate-100 text-slate-600 ring-slate-200' }
}

function BillSummary({ label, value, detail, className }: { label: string; value: string; detail: string; className: string }) {
  return <div className={`rounded-xl border p-4 ${className}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-sm opacity-80">{detail}</p></div>
}

export function BillsScreen() {
  const books = useBooks()
  const { reload } = useAccountingBooks()
  const [selected, setSelected] = useState<string[]>([])
  const [paying, setPaying] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [entering, setEntering] = useState(false)
  const [showEnter, setShowEnter] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [billKind, setBillKind] = useState<'vendor' | 'fuel' | 'overhead'>('vendor')
  const [vendorId, setVendorId] = useState('')
  const [fuelType, setFuelType] = useState('Fuel')
  const [categoryId, setCategoryId] = useState('')
  const [overheadItemId, setOverheadItemId] = useState('')
  const [overheadPayee, setOverheadPayee] = useState('')
  const [categories, setCategories] = useState<OverheadCategory[]>([])
  const [categoriesReady, setCategoriesReady] = useState(false)
  const [billNumber, setBillNumber] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billDate, setBillDate] = useState(books.asOf)
  const [billDue, setBillDue] = useState('')
  const [billTab, setBillTab] = useState<'unpaid' | 'paid'>('unpaid')
  const [paidSearch, setPaidSearch] = useState('')
  const [paidKindFilter, setPaidKindFilter] = useState<'all' | 'fuel' | 'vendor' | 'overhead'>('all')
  const [kindFilter, setKindFilter] = useState<'all' | 'fuel' | 'vendor' | 'overhead'>('all')
  const [vendorFilter, setVendorFilter] = useState('')
  const [unpaidSearch, setUnpaidSearch] = useState('')
  const [viewingBatch, setViewingBatch] = useState<PaidBill | null>(null)

  const payable = books.openBills.filter((bill) => bill.status === 'pending')
  const chosen = payable.filter((bill) => selected.includes(`${bill.kind}:${bill.id}`))
  const kinds = new Set(chosen.map((bill) => bill.kind))
  const vendorIds = new Set(chosen.map((bill) => bill.vendorId).filter(Boolean))
  const vendorPayee =
    chosen.length > 0 && chosen.every((bill) => bill.kind === 'vendor' || bill.kind === 'overhead') && vendorIds.size === 1
  const fuelPayee = chosen.length > 0 && kinds.size === 1 && kinds.has('fuel')
  const onePayee = vendorPayee || fuelPayee
  const payTotal = chosen.reduce((sum, bill) => sum + bill.amount, 0)
  const payeeName = chosen[0]?.kind === 'fuel' ? 'Fuel' : chosen[0]?.name ?? ''
  const vendorChoices = books.vendors.filter((vendor) => vendor.id && !vendor.overheadPayee)
  const needsPayee = billKind === 'vendor'
  const overheadOther = billKind === 'overhead' && overheadItemId === OTHER_OVERHEAD_ITEM
  const overheadCategoryId = billKind === 'overhead' ? (overheadOther ? categoryId : overheadItemId) : ''
  const overheadCategory = categories.find((category) => category.id === overheadCategoryId)

  useEffect(() => {
    if (!showEnter) return
    let cancelled = false
    setCategoriesReady(false)
    void fetch('/api/financial/cashbook/categories')
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !Array.isArray(data)) return
        setCategories((data as OverheadCategory[]).filter((category) => isOverheadCashbookCategory(category)))
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
      .finally(() => {
        if (!cancelled) setCategoriesReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [showEnter])
  const paidQuery = paidSearch.trim().toLowerCase()
  const visiblePaid = books.paidBills.filter((bill) => {
    if (paidKindFilter !== 'all' && bill.kind !== paidKindFilter) return false
    if (!paidQuery) return true
    return [bill.date, bill.name, bill.ref, bill.account].some((value) => value.toLowerCase().includes(paidQuery))
  })
  const paidKindCounts = {
    all: books.paidBills.length,
    fuel: books.paidBills.filter((bill) => bill.kind === 'fuel').length,
    vendor: books.paidBills.filter((bill) => bill.kind === 'vendor').length,
    overhead: books.paidBills.filter((bill) => bill.kind === 'overhead').length
  }
  const kindCounts = {
    all: books.openBills.length,
    fuel: books.openBills.filter((bill) => bill.kind === 'fuel').length,
    vendor: books.openBills.filter((bill) => bill.kind === 'vendor').length,
    overhead: books.openBills.filter((bill) => bill.kind === 'overhead').length
  }
  const payableTotal = payable.reduce((sum, bill) => sum + bill.amount, 0)
  const dueSoon = payable.filter((bill) => bill.due && bill.due >= books.asOf && bill.due <= new Date(Date.parse(`${books.asOf}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10))
  const overdue = payable.filter((bill) => bill.due && bill.due < books.asOf)
  const openVendors = (() => {
    const byId = new Map<string, { id: string; name: string; count: number }>()
    for (const bill of books.openBills) {
      if (bill.kind !== 'vendor' || !bill.vendorId) continue
      const row = byId.get(bill.vendorId)
      if (row) row.count += 1
      else byId.set(bill.vendorId, { id: bill.vendorId, name: bill.name, count: 1 })
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  })()
  const activeVendorId = kindFilter === 'vendor' && openVendors.some((vendor) => vendor.id === vendorFilter) ? vendorFilter : ''
  const unpaidQuery = unpaidSearch.trim().toLowerCase()
  const visibleOpen = books.openBills.filter((bill) => {
    if (kindFilter !== 'all' && bill.kind !== kindFilter) return false
    if (activeVendorId && bill.vendorId !== activeVendorId) return false
    if (!unpaidQuery) return true
    return [bill.name, bill.number, bill.account].some((value) => value.toLowerCase().includes(unpaidQuery))
  })
  const selectableVisibleBills = visibleOpen.filter((bill) => bill.status === 'pending')
  const visiblePaymentGroups = new Set(
    selectableVisibleBills.map((bill) =>
      bill.kind === 'fuel' ? 'fuel' : bill.vendorId ? `vendor:${bill.vendorId}` : ''
    )
  )
  const canSelectAllVisible =
    selectableVisibleBills.length > 0 &&
    visiblePaymentGroups.size === 1 &&
    !visiblePaymentGroups.has('')
  const allVisibleSelected =
    canSelectAllVisible &&
    selectableVisibleBills.every((bill) => selected.includes(`${bill.kind}:${bill.id}`))
  const kindChips: Array<{ id: 'all' | 'fuel' | 'vendor' | 'overhead'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'fuel', label: 'Fuel' },
    { id: 'vendor', label: 'Vendor' },
    { id: 'overhead', label: 'Overhead' }
  ]

  function toggle(key: string) {
    const bill = payable.find((item) => `${item.kind}:${item.id}` === key)
    if (!bill) return
    setSelected((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key)
      const currentGroups = new Set(payable.filter((item) => current.includes(`${item.kind}:${item.id}`)).map(billGroup).filter(Boolean))
      return currentGroups.size === 0 || currentGroups.has(billGroup(bill)) ? [...current, key] : [key]
    })
    setError(null)
    setMessage(selected.length > 0 && !selected.includes(key) ? 'Selection switched to this payment group.' : null)
  }

  function toggleAllVisible() {
    if (!canSelectAllVisible) return
    setSelected(
      allVisibleSelected
        ? (current) =>
            current.filter(
              (key) => !selectableVisibleBills.some((bill) => `${bill.kind}:${bill.id}` === key)
            )
        : selectableVisibleBills.map((bill) => `${bill.kind}:${bill.id}`)
    )
    setError(null)
    setMessage(null)
  }

  async function pay(input: PayBillsInput) {
    if (!onePayee || !input.bankRef || !input.paymentDate) return
    setPaying(true)
    setError(null)
    setMessage(null)
    try {
      const ids = chosen.map((bill) => bill.id)
      const res =
        chosen[0].kind === 'fuel'
          ? await fetch('/api/fuel-payments/make-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentDate: input.paymentDate,
                bankRef: input.bankRef,
                selectedInvoiceIds: ids,
                addToCashbook: input.addToCashbook
              })
            })
          : await fetch('/api/vendor-payments/make-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vendorId: chosen[0].vendorId,
                paymentDate: input.paymentDate,
                paymentMethod: input.paymentMethod,
                bankRef: input.bankRef,
                selectedInvoiceIds: ids,
                addToCashbook: input.addToCashbook
              })
            })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Payment failed')
      setSelected([])
      setShowPay(false)
      setMessage(`Paid ${payeeName} ${money(payTotal)}. The cashbook and the bank balance are updated.`)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  async function enterBill() {
    const amount = Number(billAmount)
    if (!billNumber.trim() || !Number.isFinite(amount) || amount <= 0 || !billDate) {
      setError('Number, date, and amount are required.')
      return
    }
    if (billKind === 'overhead' && overheadOther && !overheadPayee.trim()) {
      setError('Enter the payee for this bill.')
      return
    }
    if (billKind === 'overhead' && !overheadCategoryId) {
      setError(overheadOther ? 'Choose the cashbook account for this bill.' : 'Choose the item for this bill.')
      return
    }
    setEntering(true)
    setError(null)
    setMessage(null)
    try {
      const res =
        billKind === 'fuel'
          ? await fetch('/api/fuel-payments/invoices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ invoiceNumber: billNumber.trim(), amount, type: fuelType, invoiceDate: billDate })
            })
          : billKind === 'overhead'
            ? await fetch('/api/vendor-payments/overhead-bills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  invoiceNumber: billNumber.trim(),
                  amount,
                  invoiceDate: billDate,
                  dueDate: billDue || null,
                  categoryId: overheadCategoryId,
                  ...(overheadOther ? { payeeName: overheadPayee.trim() } : {})
                })
              })
            : await fetch(`/api/vendor-payments/vendors/${vendorId}/invoices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  invoiceNumber: billNumber.trim(),
                  amount,
                  invoiceDate: billDate,
                  dueDate: billDue || null
                })
              })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not enter the bill')
      setBillNumber('')
      setBillAmount('')
      setBillDue('')
      setShowEnter(false)
      setMessage('Bill entered. It is open until you pay it.')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enter the bill')
    } finally {
      setEntering(false)
    }
  }

  return (
    <div>
      <BooksBackLink />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Enter and pay bills" note="One payables desk for fuel, vendors, and overhead. Select one payment group at a time." />
        <button
          type="button"
          onClick={() => setShowEnter((open) => !open)}
          className="min-h-[44px] shrink-0 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          {showEnter ? 'Close entry' : '+ Enter a bill'}
        </button>
      </div>
      {billTab === 'unpaid' && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <BillSummary label="Open bills" value={`${payable.length}`} detail={money(payableTotal)} className="border-slate-200 bg-white text-slate-900" />
          <BillSummary label="Due soon" value={`${dueSoon.length}`} detail={dueSoon.length ? money(dueSoon.reduce((sum, bill) => sum + bill.amount, 0)) : 'Nothing urgent'} className="border-orange-200 bg-orange-50 text-orange-900" />
          <BillSummary label="Overdue" value={`${overdue.length}`} detail={overdue.length ? money(overdue.reduce((sum, bill) => sum + bill.amount, 0)) : 'All clear'} className="border-red-200 bg-red-50 text-red-900" />
          <BillSummary label="Ready to pay" value={chosen.length ? money(payTotal) : '—'} detail={chosen.length ? `${chosen.length} selected for ${payeeName}` : 'Choose a payment group'} className="border-indigo-200 bg-indigo-50 text-indigo-900" />
        </div>
      )}
      {showEnter && (
        <div className="mb-5 max-w-3xl space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div><h2 className="font-semibold text-gray-900">Enter a bill</h2><p className="mt-1 text-sm text-gray-500">Choose its type first; the form keeps the appropriate accounting details in view.</p></div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setBillKind('vendor')} className={`min-h-[54px] rounded-lg border px-3 py-2 text-sm font-semibold ${billKind === 'vendor' ? 'border-violet-600 bg-violet-600 text-white' : 'border-violet-200 bg-violet-50 text-violet-800'}`}>Vendor</button>
            <button type="button" onClick={() => setBillKind('fuel')} className={`min-h-[54px] rounded-lg border px-3 py-2 text-sm font-semibold ${billKind === 'fuel' ? 'border-sky-600 bg-sky-600 text-white' : 'border-sky-200 bg-sky-50 text-sky-800'}`}>Fuel</button>
            <button type="button" onClick={() => setBillKind('overhead')} className={`min-h-[54px] rounded-lg border px-3 py-2 text-sm font-semibold ${billKind === 'overhead' ? 'border-amber-600 bg-amber-500 text-white' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>Overhead</button>
          </div>
          {billKind === 'overhead' ? (
            <>
              <label className="block text-sm">
                <span className="text-gray-600">Item</span>
                <select
                  value={overheadItemId}
                  onChange={(e) => {
                    setOverheadItemId(e.target.value)
                    if (e.target.value !== OTHER_OVERHEAD_ITEM) setCategoryId('')
                  }}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">Select…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{overheadCategoryLabel(category)}</option>
                  ))}
                  <option value={OTHER_OVERHEAD_ITEM}>Other</option>
                </select>
                {categoriesReady && categories.length === 0 && (
                  <span className="mt-1 block text-xs text-gray-500">Add the account in Cashbook first. Rec. Gen and Rec. Gas stay on Vendor and Fuel.</span>
                )}
                {overheadCategory && !overheadOther && (
                  <span className="mt-1 block text-xs text-gray-500">Posts to {overheadCategoryLabel(overheadCategory)}. Bills for this item pay together.</span>
                )}
              </label>
              {overheadOther && (
                <>
                  <label className="block text-sm">
                    <span className="text-gray-600">Payee</span>
                    <input value={overheadPayee} onChange={(e) => setOverheadPayee(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
                  </label>
                  <label className="block text-sm">
                    <span className="text-gray-600">Account</span>
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1">
                      <option value="">Select…</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{overheadCategoryLabel(category)}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </>
          ) : needsPayee ? (
            <label className="block text-sm">
              <span className="text-gray-600">Vendor</span>
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1">
                <option value="">Select…</option>
                {vendorChoices.map((vendor) => (
                  <option key={vendor.id} value={vendor.id ?? ''}>{vendor.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-600">Type</span>
              <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1">
                {FUEL_BILL_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            <span className="text-gray-600">Invoice Number</span>
            <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Amount</span>
            <input value={billAmount} onChange={(e) => setBillAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Date</span>
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          {billKind !== 'fuel' && (
            <label className="block text-sm">
              <span className="text-gray-600">Due</span>
              <input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
            </label>
          )}
          <button
            type="button"
            disabled={entering || (needsPayee && !vendorId) || (billKind === 'overhead' && (!overheadCategoryId || (overheadOther && !overheadPayee.trim())))}
            onClick={() => void enterBill()}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {entering ? 'Saving…' : 'Save bill'}
          </button>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-3 md:flex-row md:items-end md:justify-between">
        <div className="flex gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setBillTab('unpaid')}
            className={`min-h-[44px] border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
              billTab === 'unpaid'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Unpaid ({books.openBills.length})
          </button>
          <button
            type="button"
            onClick={() => setBillTab('paid')}
            className={`min-h-[44px] border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
              billTab === 'paid'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Paid ({books.paidBills.length})
          </button>
        </div>
      </div>
      {billTab === 'unpaid' && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {kindChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setKindFilter(chip.id)
                  setSelected([])
                }}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  kindFilter === chip.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
                }`}
              >
                {chip.label} ({kindCounts[chip.id]})
              </button>
            ))}
          </div>
          {kindFilter === 'vendor' && (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Vendor</span>
              <select
                value={activeVendorId}
                onChange={(e) => {
                  setVendorFilter(e.target.value)
                  setSelected([])
                }}
                className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm sm:min-h-0 sm:w-64"
              >
                <option value="">All vendors</option>
                {openVendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name} ({vendor.count})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="w-full sm:w-64">
            <label className="sr-only" htmlFor="unpaid-bill-search">
              Search unpaid bills
            </label>
            <input
              id="unpaid-bill-search"
              type="text"
              value={unpaidSearch}
              onChange={(e) => setUnpaidSearch(e.target.value)}
              placeholder="Payee, number, or account"
              className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:py-1.5"
            />
          </div>
        </div>
      )}
      {billTab === 'paid' && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {kindChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setPaidKindFilter(chip.id)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  paidKindFilter === chip.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
                }`}
              >
                {chip.label} ({paidKindCounts[chip.id]})
              </button>
            ))}
          </div>
          <div className="w-full sm:w-64">
            <label className="sr-only" htmlFor="paid-bill-search">
              Search paid bills
            </label>
            <input
              id="paid-bill-search"
              type="text"
              value={paidSearch}
              onChange={(e) => setPaidSearch(e.target.value)}
              placeholder="Payee, ref, or account"
              className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:py-1.5"
            />
          </div>
        </div>
      )}
      {billTab === 'unpaid' && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!onePayee}
            onClick={() => {
              setError(null)
              setShowPay(true)
            }}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {onePayee ? `Pay ${payeeName} ${money(payTotal)}` : 'Pay selected'}
          </button>
          <button
            type="button"
            disabled={!canSelectAllVisible}
            onClick={toggleAllVisible}
            title={
              canSelectAllVisible
                ? 'Select every bill in the current payment group'
                : 'Filter to one vendor or Fuel to select all'
            }
            className="rounded border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
          >
            {allVisibleSelected ? 'Deselect all' : 'Select all'}
          </button>
          <p className="text-sm text-gray-600">
            {chosen.length === 0
              ? 'Select pending bills for one payee.'
              : onePayee
                ? `${chosen.length} bill${chosen.length === 1 ? '' : 's'} for ${payeeName}.`
                : 'Fuel bills pay as one group. A vendor’s bills pay together. Overhead bills for the same item pay together.'}
          </p>
        </div>
      )}
      <PayBillsModal
        open={showPay && onePayee}
        payeeName={payeeName}
        fuel={chosen[0]?.kind === 'fuel'}
        bills={chosen.map((bill) => ({ number: bill.number, date: bill.date, amount: bill.amount }))}
        paying={paying}
        error={showPay ? error : null}
        defaultDate={books.asOf}
        onClose={() => {
          if (paying) return
          setShowPay(false)
          setError(null)
        }}
        onPay={(input) => void pay(input)}
      />
      {error && !showPay ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-green-700">{message}</p> : null}
      {billTab === 'unpaid' ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Payee</th>
                <th className="px-3 py-2">Invoice Number</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {books.openBills.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">No open bills.</td>
                </tr>
              ) : visibleOpen.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">No bills match this filter.</td>
                </tr>
              ) : (
                visibleOpen.map((bill) => {
                  const key = `${bill.kind}:${bill.id}`
                  const canPay = bill.status === 'pending'
                  return (
                    <tr key={key} className="border-t border-gray-100 transition-colors hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.includes(key)} disabled={!canPay} onChange={() => toggle(key)} aria-label={`Select ${bill.name} ${bill.number}`} />
                      </td>
                      <td className="px-3 py-3"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-gray-900">{bill.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${billKindStyle(bill.kind).className}`}>{billKindStyle(bill.kind).label}</span>{!canPay ? <span className="text-xs text-amber-700">{bill.status}</span> : null}</div></td>
                      <td className="px-3 py-3 font-mono text-gray-700">{bill.number}</td>
                      <td className="px-3 py-3">{formatAccountingDate(bill.date)}</td>
                      <td className="px-3 py-3">{dueStyle(bill.due, books.asOf) ? <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${dueStyle(bill.due, books.asOf)!.className}`}>{dueStyle(bill.due, books.asOf)!.label}</span> : <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-3 text-gray-600">{bill.account}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">{money(bill.amount)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-gray-600">Payments recorded in the month selected above.</p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th><th className="px-3 py-2">Payee</th>
                  <th className="px-3 py-2">Ref</th><th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visiblePaid.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No payments to show.</td></tr>
                ) : visiblePaid.map((bill) => (
                  <tr key={`${bill.kind}:${bill.id}`} className="border-t border-gray-100">
                    <td className="px-3 py-2">{formatAccountingDate(bill.date)}</td>
                    <td className="px-3 py-2">{bill.name}</td><td className="px-3 py-2">{bill.ref}</td>
                    <td className="px-3 py-2">{bill.account}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(bill.amount)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setViewingBatch(bill)} className="font-semibold text-indigo-700 hover:underline">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaymentBatchModal batch={viewingBatch} onClose={() => setViewingBatch(null)} />
        </>
      )}
    </div>
  )
}

type DirectoryVendor = {
  id: string
  name: string
  isVatRegistered?: boolean
}

export function VendorsScreen() {
  const books = useBooks()
  const { reload } = useAccountingBooks()
  const [directory, setDirectory] = useState<DirectoryVendor[] | null>(null)
  const [directoryTick, setDirectoryTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [vatRegistered, setVatRegistered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/vendor-payments/vendors', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok || !Array.isArray(data) || cancelled) return
        setDirectory(data as DirectoryVendor[])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [directoryTick])

  const bookById = new Map(books.vendors.filter((vendor) => vendor.id).map((vendor) => [vendor.id as string, vendor]))
  const rows = (directory ?? books.vendors.filter((vendor) => vendor.id && !vendor.overheadPayee).map((vendor) => ({ id: vendor.id as string, name: vendor.name }))).map(
    (vendor) => ({
      id: vendor.id,
      name: vendor.name,
      vat: 'isVatRegistered' in vendor ? Boolean(vendor.isVatRegistered) : null,
      openAmount: bookById.get(vendor.id)?.openAmount ?? 0,
      lastPayment: bookById.get(vendor.id)?.lastPayment ?? null
    })
  )

  async function addVendor() {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/vendor-payments/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          notificationEmail: email.trim(),
          isVatRegistered: vatRegistered
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not add vendor')
      setName('')
      setEmail('')
      setVatRegistered(false)
      setShowAdd(false)
      setDirectoryTick((tick) => tick + 1)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add vendor')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <PageTitle
        title="Vendors"
        note="Open each vendor for their bills, VAT, and payments. This is the same vendor record the station uses."
      />
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowAdd((open) => !open)}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
        >
          {showAdd ? 'Close' : 'Add vendor'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-4 max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <label className="block text-sm">
            <span className="text-gray-600">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={vatRegistered} onChange={(e) => setVatRegistered(e.target.checked)} />
            VAT registered
          </label>
          <button type="button" disabled={adding} onClick={() => void addVendor()} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {adding ? 'Saving…' : 'Save vendor'}
          </button>
        </div>
      )}
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">VAT</th>
              <th className="px-3 py-2 text-right">Open bills</th>
              <th className="px-3 py-2">Last payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">No vendors yet.</td>
              </tr>
            ) : (
              rows.map((vendor) => (
                <tr key={vendor.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <Link href={`/accounting/vendors/${vendor.id}`} className="font-medium text-indigo-700 hover:underline">
                      {vendor.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{vendor.vat == null ? '—' : vendor.vat ? 'Registered' : 'No'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(vendor.openAmount)}</td>
                  <td className="px-3 py-2">{vendor.lastPayment ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function JournalScreen() {
  const { reload, books } = useAccountingBooks()
  const [date, setDate] = useState(books?.endDate ?? '')
  const [description, setDescription] = useState('')
  const [ref, setRef] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('direct_debit')
  const [amount, setAmount] = useState('')
  const [categories, setCategories] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/financial/cashbook/categories')
      .then((res) => res.json())
      .then((rows: Array<{ id: string; name: string; type: string }>) => {
        if (!cancelled && Array.isArray(rows)) setCategories(rows.filter((row) => row.type !== 'income'))
      })
      .catch(() => {
        if (!cancelled) setError('Could not load accounts')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const parsed = Number(amount)
  const balanced = Number.isFinite(parsed) && parsed > 0
  const accountName = categories.find((category) => category.id === categoryId)?.name ?? 'Expense account'
  const line = description.trim()
  const entryDate = journalDateLabel(date)
  const automaticEntries = (books?.ledger ?? []).filter((entry) => entry.source !== 'Entered here')

  async function save() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/accounting/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          description,
          ref,
          categoryId,
          paymentMethod,
          amount: parsed
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to post')
      setDescription('')
      setRef('')
      setAmount('')
      setMessage('Manual adjustment posted. Westline is credited and the expense account is debited.')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <BooksBackLink />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manual journal adjustment</h1>
          <p className="mt-1 text-sm text-gray-600">
            Payments, customer receipts, and shift activity post automatically. Use this form only for a direct expense or an accounting adjustment that did not originate elsewhere.
          </p>
        </div>
        <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700">Debits and credits</span>
      </div>
      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-950">
        <p className="font-semibold">Automatic postings</p>
        <p className="mt-1">
          A posted customer payment, fuel payment, vendor payment, or shift deposit creates its own linked cashbook entry. Review those entries below or in the{' '}
          <Link href="/accounting/ledger" className="font-semibold underline">
            general ledger
          </Link>
          ; do not enter them again here. Correct an automatic entry from its original payment or shift.
        </p>
      </div>
      <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="font-semibold text-gray-900">Automatic postings this month</h2>
            <p className="text-xs text-gray-500">Generated from the source transaction; not editable here.</p>
          </div>
          <span className="text-sm font-semibold tabular-nums text-gray-700">{automaticEntries.length}</span>
        </div>
        <div className="max-h-64 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2 text-right">In</th>
                <th className="px-4 py-2 text-right">Out</th>
              </tr>
            </thead>
            <tbody>
              {automaticEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-5 text-center text-gray-500">No automatic postings for this month.</td>
                </tr>
              ) : (
                automaticEntries.map((entry, index) => (
                  <tr key={`${entry.date}-${entry.description}-${index}`} className="border-t border-gray-100">
                    <td className="px-4 py-2 whitespace-nowrap">{journalDateLabel(entry.date)}</td>
                    <td className="px-4 py-2">{entry.description}</td>
                    <td className="px-4 py-2 text-gray-600">{entry.source}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{entry.debit ? money(entry.debit) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{entry.credit ? money(entry.credit) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-600">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Amount</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-gray-600">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Ref</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">How paid</span>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1">
            {PAYMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-gray-600">Expense account</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1">
            <option value="">Select…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm text-gray-700">
          <span className="font-semibold text-gray-900">{entryDate || 'Date'}</span>
          {line ? <span className="ml-3">{line}</span> : null}
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500">
              <tr>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Line</th>
                <th className="py-2 pr-3 text-right">Debit</th>
                <th className="py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-3">{accountName}</td>
                <td className="py-2 pr-3">{line || '—'}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{balanced ? money(parsed) : ''}</td>
                <td className="py-2" />
              </tr>
              <tr>
                <td className="py-2 pr-3">101 · Westline</td>
                <td className="py-2 pr-3">{line || '—'}</td>
                <td className="py-2 pr-3" />
                <td className="py-2 text-right tabular-nums">{balanced ? money(parsed) : ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-8 border-t border-gray-100 pt-4">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{balanced ? money(parsed) : '—'}</p>
            <p className="text-xs text-gray-500">Total debits</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{balanced ? money(parsed) : '—'}</p>
            <p className="text-xs text-gray-500">Total credits</p>
          </div>
          <div>
            <p className={`text-2xl font-semibold tabular-nums ${balanced ? 'text-green-600' : 'text-gray-400'}`}>{balanced ? money(0) : '—'}</p>
            <p className="text-xs text-gray-500">Difference</p>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}
        <button
          type="button"
          disabled={saving || !balanced || !description.trim() || !categoryId || !date}
          onClick={() => void save()}
          className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Posting…' : 'Post entry'}
        </button>
      </div>
    </div>
  )
}

export function ReceiptsScreen() {
  const books = useBooks()
  return (
    <div>
      <PageTitle title="Receipts and documents" note="Deposit and card slips already stored on the close." />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Document</th>
              <th className="px-3 py-2">Linked to</th>
            </tr>
          </thead>
          <tbody>
            {books.receipts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                  No slips in this month.
                </td>
              </tr>
            ) : (
              books.receipts.map((row, index) => (
                <tr key={`${row.date}-${row.linked}-${index}`} className="border-t border-gray-100">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">
                    {row.href ? (
                      <a href={row.href} className="text-indigo-700 underline" target="_blank" rel="noreferrer">
                        {row.label}
                      </a>
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className="px-3 py-2">{row.linked}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function BalanceSheetScreen() {
  const books = useBooks()
  const assets = books.westlineOnFile + books.serviceStationOnFile + books.accountsReceivable
  const liabilities = books.accountsPayableFuel + books.accountsPayableVendors + books.payrollPayable
  return (
    <div>
      <PageTitle
        title="Balance sheet"
        note={`Assets and liabilities as of ${books.asOf}. Income and expense are ${books.month}. Owner's equity is not kept as its own account.`}
      />
      <DataTable
        headers={['Account', 'Amount']}
        align={['left', 'right']}
        rows={[
          ['101 · Westline chequing', money(books.westlineOnFile)],
          ['102 · Service Station chequing', money(books.serviceStationOnFile)],
          ['104 · Accounts receivable', money(books.accountsReceivable)],
          ['Assets shown', money(assets)],
          ['201 · Accounts payable, fuel', money(books.accountsPayableFuel)],
          ['202 · Accounts payable, vendors', money(books.accountsPayableVendors)],
          ['204 · Payroll payable', money(books.payrollPayable)],
          ['Liabilities shown', money(liabilities)],
          ['Assets minus liabilities', money(assets - liabilities)]
        ]}
      />
      <h2 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Profit and loss · {books.month}</h2>
      <DataTable
        headers={['Account', 'Type', 'Amount']}
        align={['left', 'left', 'right']}
        rows={[
          ...books.categories.map((row) => [row.name, row.type, money(row.amount)]),
          ['Net', '', money(books.monthNet)]
        ]}
      />
    </div>
  )
}
