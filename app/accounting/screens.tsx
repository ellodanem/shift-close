'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatAmount } from '@/lib/fuelPayments'
import type { AccountingBooks } from '@/lib/accounting-types'
import { useAccountingBooks } from './books-context'

export function money(amount: number): string {
  return formatAmount(amount)
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
  const assets = books.westlineOnFile + books.serviceStationOnFile + books.accountsReceivable
  const liabilities = books.accountsPayableFuel + books.accountsPayableVendors + books.payrollPayable
  return (
    <div>
      <PageTitle
        title="Accounting overview"
        note={`Balances on file as of ${books.asOf}. Month figures are ${books.startDate} to ${books.endDate}.`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/accounting/journal" className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
          Journal entry
        </Link>
        <Link href="/accounting/bills" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">
          Enter & pay bills
        </Link>
        <Link href="/accounting/reconcile" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">
          Reconcile
        </Link>
        <Link href="/payroll" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">
          Pay runs
        </Link>
      </div>
      <StatStrip
        items={[
          { label: 'Westline on file', value: money(books.westlineOnFile) },
          { label: 'Service Station on file', value: money(books.serviceStationOnFile) },
          { label: 'Accounts receivable', value: money(books.accountsReceivable) },
          { label: 'Month net', value: money(books.monthNet), tone: books.monthNet >= 0 ? 'good' : 'bad' }
        ]}
      />
      <DataTable
        headers={['Account', 'Amount']}
        align={['left', 'right']}
        rows={[
          ['101 · Westline chequing', money(books.westlineOnFile)],
          ['102 · Service Station chequing', money(books.serviceStationOnFile)],
          ['104 · Accounts receivable', money(books.accountsReceivable)],
          ['Total of these assets', money(assets)],
          ['201 · Accounts payable, fuel', money(books.accountsPayableFuel)],
          ['202 · Accounts payable, vendors', money(books.accountsPayableVendors)],
          ['204 · Payroll payable', money(books.payrollPayable)],
          ['Total of these liabilities', money(liabilities)]
        ]}
      />
      <p className="mt-3 text-sm text-gray-600">
        Westline and Service Station are the balances on file, not a sum of the ledger. Receivable, payable, and payroll come from open customer balances, open invoices, and approved pay runs whose pay date is still ahead.
      </p>
      <h2 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Pay runs in this month</h2>
      <DataTable
        headers={['Period', 'Pay date', 'Status', 'Net']}
        align={['left', 'left', 'left', 'right']}
        rows={books.payRuns.map((run) => [run.period, run.payDate, run.status, money(run.net)])}
      />
    </div>
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

const FUEL_BILL_TYPES = ['Fuel', 'LPG', 'Lubricants', 'Rent', 'Uniforms', 'Loyalty', 'Balance Payment']

export function BillsScreen() {
  const books = useBooks()
  const { reload } = useAccountingBooks()
  const [selected, setSelected] = useState<string[]>([])
  const [paying, setPaying] = useState(false)
  const [entering, setEntering] = useState(false)
  const [showEnter, setShowEnter] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [payDate, setPayDate] = useState(books.asOf)
  const [bankRef, setBankRef] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'check' | 'eft'>('check')
  const [billKind, setBillKind] = useState<'vendor' | 'fuel'>('vendor')
  const [vendorId, setVendorId] = useState('')
  const [fuelType, setFuelType] = useState('Fuel')
  const [billNumber, setBillNumber] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billDate, setBillDate] = useState(books.asOf)
  const [billDue, setBillDue] = useState('')

  const payable = books.openBills.filter((bill) => bill.status === 'pending')
  const chosen = payable.filter((bill) => selected.includes(`${bill.kind}:${bill.id}`))
  const kinds = new Set(chosen.map((bill) => bill.kind))
  const vendorIds = new Set(chosen.map((bill) => bill.vendorId).filter(Boolean))
  const onePayee = chosen.length > 0 && kinds.size === 1 && (kinds.has('fuel') || vendorIds.size === 1)
  const payTotal = chosen.reduce((sum, bill) => sum + bill.amount, 0)
  const payeeName = chosen[0]?.kind === 'fuel' ? 'Fuel' : chosen[0]?.name ?? ''
  const vendorChoices = books.vendors.filter((vendor) => vendor.id)

  function toggle(key: string) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
    setError(null)
    setMessage(null)
  }

  async function pay() {
    if (!onePayee) return
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
              body: JSON.stringify({ paymentDate: payDate, bankRef, selectedInvoiceIds: ids, addToCashbook: true })
            })
          : await fetch('/api/vendor-payments/make-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vendorId: chosen[0].vendorId,
                paymentDate: payDate,
                paymentMethod,
                bankRef,
                selectedInvoiceIds: ids,
                addToCashbook: true
              })
            })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Payment failed')
      setSelected([])
      setBankRef('')
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
      <PageTitle
        title="Enter and pay bills"
        note="Select open bills for one payee, then pay them. Fuel bills pay together. A vendor’s bills pay together. Payment uses the same check, balance, and cashbook path as the station."
      />
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowEnter((open) => !open)}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
        >
          {showEnter ? 'Close' : 'Enter a bill'}
        </button>
      </div>
      {showEnter && (
        <div className="mb-4 max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setBillKind('vendor')} className={`rounded px-3 py-1 text-sm ${billKind === 'vendor' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>Vendor</button>
            <button type="button" onClick={() => setBillKind('fuel')} className={`rounded px-3 py-1 text-sm ${billKind === 'fuel' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>Fuel</button>
          </div>
          {billKind === 'vendor' ? (
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
            <span className="text-gray-600">Number</span>
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
          {billKind === 'vendor' && (
            <label className="block text-sm">
              <span className="text-gray-600">Due</span>
              <input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
            </label>
          )}
          <button type="button" disabled={entering || (billKind === 'vendor' && !vendorId)} onClick={() => void enterBill()} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {entering ? 'Saving…' : 'Save bill'}
          </button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          <span className="text-gray-600">Payment date</span>
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 block rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">Check or reference</span>
          <input value={bankRef} onChange={(e) => setBankRef(e.target.value)} className="mt-1 block rounded border border-gray-300 px-2 py-1" />
        </label>
        {chosen[0]?.kind === 'vendor' && (
          <label className="text-sm">
            <span className="text-gray-600">How paid</span>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value === 'eft' ? 'eft' : 'check')} className="mt-1 block rounded border border-gray-300 px-2 py-1">
              <option value="check">Check</option>
              <option value="eft">EFT</option>
            </select>
          </label>
        )}
        <button type="button" disabled={paying || !onePayee || !payDate || !bankRef.trim()} onClick={() => void pay()} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {paying ? 'Paying…' : onePayee ? `Pay ${payeeName} ${money(payTotal)}` : 'Pay selected'}
        </button>
        <p className="text-sm text-gray-600">
          {chosen.length === 0 ? 'Select pending bills for one payee.' : onePayee ? `${chosen.length} bill${chosen.length === 1 ? '' : 's'} for ${payeeName}.` : 'Fuel bills pay as one group. Each vendor pays separately.'}
        </p>
      </div>
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-green-700">{message}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Payee</th>
              <th className="px-3 py-2">Number</th>
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
            ) : (
              books.openBills.map((bill) => {
                const key = `${bill.kind}:${bill.id}`
                const canPay = bill.status === 'pending'
                return (
                  <tr key={key} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.includes(key)} disabled={!canPay} onChange={() => toggle(key)} aria-label={`Select ${bill.name} ${bill.number}`} />
                    </td>
                    <td className="px-3 py-2">{bill.name}{!canPay ? <span className="ml-2 text-xs text-amber-700">{bill.status}</span> : null}</td>
                    <td className="px-3 py-2">{bill.number}</td>
                    <td className="px-3 py-2">{bill.date}</td>
                    <td className="px-3 py-2">{bill.due ?? '—'}</td>
                    <td className="px-3 py-2">{bill.account}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(bill.amount)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <h2 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Paid this month</h2>
      <DataTable
        headers={['Date', 'Payee', 'Ref', 'Account', 'Amount']}
        align={['left', 'left', 'left', 'left', 'right']}
        rows={books.paidBills.map((bill) => [bill.date, bill.name, bill.ref, bill.account, money(bill.amount)])}
      />
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
  const rows = (directory ?? books.vendors.filter((vendor) => vendor.id).map((vendor) => ({ id: vendor.id as string, name: vendor.name }))).map(
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
      setMessage('Posted to the cashbook. Westline is credited and the expense account is debited.')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageTitle
        title="Journal entry"
        note="Debit the expense. Credit 101 Westline. The difference is zero because both lines use the same amount. This does not change a shift."
      />
      <div className="max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="block text-sm">
          <span className="text-gray-600">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Ref</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
        <label className="block text-sm">
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
        <label className="block text-sm">
          <span className="text-gray-600">Amount</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
        <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-3 text-sm">
          <div>
            <p className="text-gray-500">Debit</p>
            <p className="font-semibold tabular-nums">{balanced ? money(parsed) : '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Credit 101</p>
            <p className="font-semibold tabular-nums">{balanced ? money(parsed) : '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Difference</p>
            <p className={`font-semibold ${balanced ? 'text-green-700' : 'text-gray-400'}`}>{balanced ? money(0) : '—'}</p>
          </div>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        <button
          type="button"
          disabled={saving || !balanced || !description.trim() || !categoryId || !date}
          onClick={() => void save()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Posting…' : 'Post entry'}
        </button>
      </div>
    </div>
  )
}

export function ReconcileScreen() {
  const books = useBooks()
  const { reload } = useAccountingBooks()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = books.reconcile.filter((row) => row.bankStatus !== 'cleared')
  const openTotal = open.reduce((sum, row) => sum + row.amount, 0)

  async function mark(row: (typeof books.reconcile)[number], bankStatus: 'cleared' | 'pending') {
    const key = `${row.shiftId}:${row.recordKind}:${row.lineIndex}`
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/financial/deposit-comparisons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId: row.shiftId,
          recordKind: row.recordKind,
          lineIndex: row.lineIndex,
          bankStatus
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageTitle
        title="Reconcile · 101 Westline"
        note="Tick a row when it is on the bank statement. The shift amount stays as it was counted."
      />
      <StatStrip
        items={[
          { label: 'Still to clear', value: money(openTotal), tone: openTotal > 0 ? 'warn' : 'good' },
          { label: 'Uncashed checks', value: String(books.uncashedChecks.length) }
        ]}
      />
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Statement</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {books.reconcile.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No closed-shift deposits in this month.
                </td>
              </tr>
            ) : (
              books.reconcile.map((row) => {
                const key = `${row.shiftId}:${row.recordKind}:${row.lineIndex}`
                return (
                  <tr key={key} className="border-t border-gray-100">
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">{row.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                    <td className="px-3 py-2 capitalize">{row.bankStatus}</td>
                    <td className="px-3 py-2 text-right">
                      {row.bankStatus === 'cleared' ? (
                        <button type="button" className="text-sm text-indigo-700" disabled={busy === key} onClick={() => void mark(row, 'pending')}>
                          Mark open
                        </button>
                      ) : (
                        <button type="button" className="text-sm text-indigo-700" disabled={busy === key} onClick={() => void mark(row, 'cleared')}>
                          Mark cleared
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <h2 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Uncashed checks</h2>
      <DataTable
        headers={['Date', 'Payee', 'Ref', 'Amount']}
        align={['left', 'left', 'left', 'right']}
        rows={books.uncashedChecks.map((check) => [check.date, check.payee, check.ref, money(check.amount)])}
      />
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
