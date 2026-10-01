'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAccountingBooks } from '../../books-context'
import { money, PageTitle, StatStrip } from '../../screens'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

type PaidBatch = {
  paymentDate: string
  paymentMethod: string
  bankRef: string
  clearedAt?: string | null
}

type VendorInvoice = {
  id: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string | null
  vat: number | null
  status: string
  paidInvoice?: { batch: PaidBatch } | null
}

type VendorBatch = {
  id: string
  paymentDate: string
  paymentMethod: string
  bankRef: string
  totalAmount: number
  clearedAt: string | null
}

type VendorAccount = {
  id: string
  name: string
  notificationEmail: string
  notes: string
  isVatRegistered: boolean
  vatRate: number
  invoices: VendorInvoice[]
  batches: VendorBatch[]
}

function invoiceTotal(amount: number, vat: number | null): number {
  return Math.round((amount + (vat ?? 0)) * 100) / 100
}

function showDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatInvoiceDate(value)
}

function methodLabel(method: string): string {
  return method === 'check' ? 'Check' : 'EFT'
}

function batchStatus(batch: { paymentMethod: string; clearedAt: string | null }): string {
  return batch.paymentMethod === 'check' && !batch.clearedAt ? 'Uncashed' : 'Cleared'
}

export default function AccountantVendorPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { reload } = useAccountingBooks()
  const [vendor, setVendor] = useState<VendorAccount | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [paying, setPaying] = useState(false)
  const [payDate, setPayDate] = useState(businessTodayYmd())
  const [bankRef, setBankRef] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'check' | 'eft'>('check')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [billNumber, setBillNumber] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billVat, setBillVat] = useState('')
  const [vatTouched, setVatTouched] = useState(false)
  const [billDate, setBillDate] = useState(businessTodayYmd())
  const [billDue, setBillDue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editVat, setEditVat] = useState('')
  const [editDue, setEditDue] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/vendor-payments/vendors/${id}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Could not load vendor')
    setVendor(data as VendorAccount)
  }, [id])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    void load().catch((err: unknown) => {
      if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load vendor')
    })
    return () => {
      cancelled = true
    }
  }, [load])

  if (loadError) {
    return (
      <div>
        <PageTitle title="Vendor" />
        <p className="text-sm text-red-700">{loadError}</p>
        <Link href="/accounting/vendors" className="mt-3 inline-block text-sm text-indigo-700 hover:underline">
          Back to vendors
        </Link>
      </div>
    )
  }

  if (!vendor) {
    return <p className="text-gray-600">Loading vendor…</p>
  }

  const account = vendor
  const pending = account.invoices.filter((invoice) => invoice.status === 'pending')
  const paid = account.invoices.filter((invoice) => invoice.status === 'paid')
  const chosen = pending.filter((invoice) => selected.includes(invoice.id))
  const payTotal = chosen.reduce((sum, invoice) => sum + invoiceTotal(invoice.amount, invoice.vat), 0)
  const openTotal = pending.reduce((sum, invoice) => sum + invoiceTotal(invoice.amount, invoice.vat), 0)
  const allPendingSelected = pending.length > 0 && pending.every((invoice) => selected.includes(invoice.id))

  function toggle(invoiceId: string) {
    setSelected((current) => (current.includes(invoiceId) ? current.filter((item) => item !== invoiceId) : [...current, invoiceId]))
    setError(null)
    setMessage(null)
  }

  function onBillAmount(value: string) {
    setBillAmount(value)
    if (!account.isVatRegistered || vatTouched) return
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount <= 0) {
      setBillVat('')
      return
    }
    setBillVat(String(Math.round(amount * account.vatRate * 100) / 100))
  }

  async function pay() {
    if (chosen.length === 0 || !payDate || !bankRef.trim()) return
    setPaying(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/vendor-payments/make-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: account.id,
          paymentDate: payDate,
          paymentMethod,
          bankRef: bankRef.trim(),
          selectedInvoiceIds: chosen.map((invoice) => invoice.id),
          addToCashbook: true
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Payment failed')
      setSelected([])
      setBankRef('')
      setMessage(`Paid ${account.name} ${money(payTotal)}. The cashbook and the bank balance are updated.`)
      await load()
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  async function addBill() {
    const amount = Number(billAmount)
    if (!billNumber.trim() || !Number.isFinite(amount) || amount <= 0 || !billDate) {
      setError('Number, date, and amount are required.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const vat = billVat.trim() === '' ? 0 : Number(billVat)
      const res = await fetch(`/api/vendor-payments/vendors/${account.id}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: billNumber.trim(),
          amount,
          vat: Number.isFinite(vat) ? vat : 0,
          invoiceDate: billDate,
          dueDate: billDue || null
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not enter the bill')
      setBillNumber('')
      setBillAmount('')
      setBillVat('')
      setVatTouched(false)
      setBillDue('')
      setShowAdd(false)
      setMessage('Bill entered. It stays open until you pay it.')
      await load()
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enter the bill')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(invoice: VendorInvoice) {
    setEditingId(invoice.id)
    setEditAmount(String(invoice.amount))
    setEditVat(invoice.vat == null ? '' : String(invoice.vat))
    setEditDue(invoice.dueDate ? invoice.dueDate.slice(0, 10) : '')
  }

  async function saveEdit(invoice: VendorInvoice) {
    const amount = Number(editAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const vat = editVat.trim() === '' ? 0 : Number(editVat)
      const res = await fetch(`/api/vendor-payments/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          vat: Number.isFinite(vat) ? vat : 0,
          dueDate: editDue || null
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update the bill')
      setEditingId(null)
      setMessage('Open bill updated.')
      await load()
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the bill')
    } finally {
      setSaving(false)
    }
  }

  const rateLabel = `${(account.vatRate * 100).toFixed(2).replace(/\.?0+$/, '')}%`

  return (
    <div>
      <Link href="/accounting/vendors" className="mb-3 inline-block text-sm text-indigo-700 hover:underline">
        Vendors
      </Link>
      <PageTitle
        title={account.name}
        note="Open bills, VAT, and payments on the same vendor record the station uses. Paying here updates the check, the bank balance, and the cashbook."
      />
      <StatStrip items={[{ label: 'Open bills', value: money(openTotal), tone: openTotal > 0 ? 'warn' : 'good' }]} />
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <p>
          <span className="text-gray-500">VAT </span>
          {account.isVatRegistered ? `Registered (${rateLabel} station rate)` : 'Not registered'}
        </p>
        <p className="mt-1">
          <span className="text-gray-500">Email </span>
          {account.notificationEmail}
        </p>
        {account.notes ? <p className="mt-1 text-gray-700">{account.notes}</p> : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAdd((open) => !open)}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
        >
          {showAdd ? 'Close' : 'Enter a bill'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-4 max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <label className="block text-sm">
            <span className="text-gray-600">Number</span>
            <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Amount</span>
            <input value={billAmount} onChange={(e) => onBillAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          {account.isVatRegistered && (
            <label className="block text-sm">
              <span className="text-gray-600">VAT ({rateLabel})</span>
              <input
                value={billVat}
                onChange={(e) => {
                  setVatTouched(true)
                  setBillVat(e.target.value)
                }}
                inputMode="decimal"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="text-gray-600">Date</span>
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Due</span>
            <input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <button type="button" disabled={saving} onClick={() => void addBill()} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save bill'}
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
        <label className="text-sm">
          <span className="text-gray-600">How paid</span>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value === 'eft' ? 'eft' : 'check')} className="mt-1 block rounded border border-gray-300 px-2 py-1">
            <option value="check">Check</option>
            <option value="eft">EFT</option>
          </select>
        </label>
        <button
          type="button"
          disabled={paying || chosen.length === 0 || !payDate || !bankRef.trim()}
          onClick={() => void pay()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {paying ? 'Paying…' : chosen.length > 0 ? `Pay ${money(payTotal)}` : 'Pay selected'}
        </button>
        <p className="text-sm text-gray-600">
          {chosen.length === 0 ? 'Select pending bills.' : `${chosen.length} bill${chosen.length === 1 ? '' : 's'} selected.`}
        </p>
      </div>
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-green-700">{message}</p> : null}

      <h2 className="mb-2 text-lg font-semibold text-gray-900">Open bills</h2>
      <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allPendingSelected}
                  disabled={pending.length === 0}
                  onChange={() => setSelected(allPendingSelected ? [] : pending.map((invoice) => invoice.id))}
                  aria-label="Select all open bills"
                />
              </th>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">VAT</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  No open bills.
                </td>
              </tr>
            ) : (
              pending.map((invoice) => (
                <tr key={invoice.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.includes(invoice.id)} onChange={() => toggle(invoice.id)} aria-label={`Select ${invoice.invoiceNumber}`} />
                  </td>
                  <td className="px-3 py-2 font-medium">{invoice.invoiceNumber}</td>
                  <td className="px-3 py-2">{showDate(invoice.invoiceDate)}</td>
                  <td className="px-3 py-2">
                    {editingId === invoice.id ? (
                      <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
                    ) : (
                      showDate(invoice.dueDate)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editingId === invoice.id ? (
                      <input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} inputMode="decimal" className="w-24 rounded border border-gray-300 px-2 py-1 text-right" />
                    ) : (
                      money(invoice.amount)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editingId === invoice.id ? (
                      <input value={editVat} onChange={(e) => setEditVat(e.target.value)} inputMode="decimal" className="w-24 rounded border border-gray-300 px-2 py-1 text-right" />
                    ) : (
                      money(invoice.vat ?? 0)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editingId === invoice.id ? money(invoiceTotal(Number(editAmount) || 0, Number(editVat) || 0)) : money(invoiceTotal(invoice.amount, invoice.vat))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editingId === invoice.id ? (
                      <button type="button" disabled={saving} onClick={() => void saveEdit(invoice)} className="text-sm font-semibold text-indigo-700">
                        Save
                      </button>
                    ) : (
                      <button type="button" onClick={() => startEdit(invoice)} className="text-sm font-semibold text-indigo-700">
                        Correct
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-gray-900">Recent payments</h2>
      <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">How paid</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {account.batches.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No payments yet.
                </td>
              </tr>
            ) : (
              account.batches.map((batch) => (
                <tr key={batch.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{showDate(batch.paymentDate)}</td>
                  <td className="px-3 py-2">{methodLabel(batch.paymentMethod)}</td>
                  <td className="px-3 py-2">{batch.bankRef}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(batch.totalAmount)}</td>
                  <td className="px-3 py-2">{batchStatus(batch)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-gray-900">Paid bills</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Bill date</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Paid</th>
              <th className="px-3 py-2">How paid</th>
              <th className="px-3 py-2">Reference</th>
            </tr>
          </thead>
          <tbody>
            {paid.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No paid bills.
                </td>
              </tr>
            ) : (
              paid.map((invoice) => (
                <tr key={invoice.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{invoice.invoiceNumber}</td>
                  <td className="px-3 py-2">{showDate(invoice.invoiceDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(invoiceTotal(invoice.amount, invoice.vat))}</td>
                  <td className="px-3 py-2">{showDate(invoice.paidInvoice?.batch.paymentDate)}</td>
                  <td className="px-3 py-2">{invoice.paidInvoice ? methodLabel(invoice.paidInvoice.batch.paymentMethod) : '—'}</td>
                  <td className="px-3 py-2">{invoice.paidInvoice?.batch.bankRef ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
