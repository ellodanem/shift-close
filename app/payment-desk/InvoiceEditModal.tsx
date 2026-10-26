'use client'

import { useEffect, useState } from 'react'
import type { OpenBill } from '@/lib/accounting-types'

type Form = { invoiceNumber: string; amount: string; invoiceDate: string; dueDate: string; type: string; vat: string; notSubmittedToAccounting: boolean }

export function InvoiceEditModal({ bill, onClose, onSaved }: { bill: OpenBill | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Form>({ invoiceNumber: '', amount: '', invoiceDate: '', dueDate: '', type: 'Fuel', vat: '', notSubmittedToAccounting: false })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fuel = bill?.kind === 'fuel'
  useEffect(() => {
    if (!bill) return
    let cancelled = false
    setLoading(true)
    const url = fuel ? `/api/fuel-payments/invoices/${bill.id}` : `/api/vendor-payments/invoices/${bill.id}`
    void fetch(url).then(async (res) => {
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load invoice')
      if (!cancelled) setForm({ invoiceNumber: data.invoiceNumber, amount: String(data.amount), invoiceDate: String(data.invoiceDate).slice(0, 10), dueDate: data.dueDate ? String(data.dueDate).slice(0, 10) : '', type: data.type || bill.name || 'Fuel', vat: data.vat != null ? String(data.vat) : '', notSubmittedToAccounting: data.submittedToAccounting === false })
    }).catch((error) => { if (!cancelled) alert(error instanceof Error ? error.message : 'Could not load invoice') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bill, fuel])
  if (!bill) return null
  const save = async () => {
    const amount = Number(form.amount)
    if (!form.invoiceNumber.trim() || !form.invoiceDate || !Number.isFinite(amount)) return alert('Invoice number, amount, and invoice date are required.')
    setSaving(true)
    try {
      const url = fuel ? `/api/fuel-payments/invoices/${bill.id}` : `/api/vendor-payments/invoices/${bill.id}`
      const payload = fuel ? { invoiceNumber: form.invoiceNumber.trim(), amount, invoiceDate: form.invoiceDate, type: form.type, submittedToAccounting: !form.notSubmittedToAccounting } : { invoiceNumber: form.invoiceNumber.trim(), amount, invoiceDate: form.invoiceDate, dueDate: form.dueDate || null, vat: form.vat === '' ? 0 : Number(form.vat), submittedToAccounting: !form.notSubmittedToAccounting }
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update invoice')
      onSaved()
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not update invoice') } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!window.confirm(`Delete unpaid invoice ${bill.number}? This cannot be undone.`)) return
    setSaving(true)
    try {
      const url = fuel ? `/api/fuel-payments/invoices/${bill.id}` : `/api/vendor-payments/invoices/${bill.id}`
      const res = await fetch(url, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not delete invoice')
      onSaved()
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not delete invoice') } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><h2 className="text-lg font-bold">Edit unpaid invoice</h2><p className="mt-1 text-sm text-slate-600">Correct it before it is added to a payment batch.</p>{loading ? <p className="py-8 text-center text-sm">Loading…</p> : <div className="mt-4 space-y-3"><label className="block text-sm font-medium">Invoice number<input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label><label className="block text-sm font-medium">Amount{!fuel && form.vat !== '' ? <span className="ml-1 font-normal text-slate-500">(before VAT)</span> : null}<input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label>{fuel ? <label className="block text-sm font-medium">Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3">{['Fuel', 'LPG', 'Lubricants', 'Uniforms', 'Loyalty', 'Balance Payment'].map((type) => <option key={type}>{type}</option>)}</select></label> : <label className="block text-sm font-medium">VAT<input inputMode="decimal" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label>}<div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium">Invoice date<input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label>{!fuel ? <label className="block text-sm font-medium">Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1 min-h-[44px] w-full rounded border px-3" /></label> : null}</div><label className="flex items-start gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={form.notSubmittedToAccounting} onChange={(e) => setForm({ ...form, notSubmittedToAccounting: e.target.checked })} className="mt-0.5 rounded border-amber-400" /><span><span className="font-semibold">Not submitted for accounting</span><span className="mt-0.5 block text-xs text-amber-800">The accountant cannot see this unpaid invoice. It is submitted automatically when paid.</span></span></label></div>}<div className="mt-6 flex flex-wrap justify-between gap-2"><button type="button" disabled={saving} onClick={() => void remove()} className="min-h-[44px] rounded border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Delete invoice</button><div className="flex gap-2"><button type="button" disabled={saving} onClick={onClose} className="min-h-[44px] rounded border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={saving || loading} onClick={() => void save()} className="min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">{saving ? 'Saving…' : 'Save changes'}</button></div></div></div></div>
}
