'use client'

import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import type { PaidBill } from '@/lib/accounting-types'
import { formatAccountingDate } from '@/lib/accounting-date-format'
import { formatAmount } from '@/lib/fuelPayments'

const money = formatAmount

type BatchLine = { number: string; date: string; type?: string; amount: number }
type BatchDetail = {
  payee: string
  date: string
  ref: string
  method?: string
  total: number
  balanceBefore?: string
  balanceAfter?: string
  lines: BatchLine[]
}

export function PaymentBatchModal({ batch, mode = 'view', onClose }: { batch: PaidBill | null; mode?: 'view' | 'share'; onClose: () => void }) {
  const [detail, setDetail] = useState<BatchDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'copy' | 'share' | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!batch) return
    let cancelled = false
    setDetail(null)
    setError('')
    const url = batch.kind === 'fuel' ? `/api/fuel-payments/batches/${batch.id}` : `/api/vendor-payments/batches/${batch.id}`
    void fetch(url).then(async (res) => {
      if (!res.ok) throw new Error('Could not load this payment batch.')
      const data = await res.json()
      if (cancelled) return
      if (batch.kind === 'fuel') {
        const summary = data.summary ?? data
        setDetail({
          payee: batch.name, date: summary.datePaid ?? data.paymentDate, ref: summary.referenceNumber ?? data.bankRef,
          total: Number(data.totalAmount ?? String(summary.totalPaid).replace(/[^0-9.-]/g, '')),
          balanceBefore: summary.balanceBefore, balanceAfter: summary.balanceAfter,
          lines: (summary.invoices ?? data.invoices ?? []).map((line: Record<string, unknown>) => ({
            number: String(line.invoiceNumber ?? ''), date: String(line.invoiceDate ?? ''), type: String(line.type ?? ''),
            amount: Number(String(line.amount ?? 0).replace(/[^0-9.-]/g, ''))
          }))
        })
      } else {
        setDetail({
          payee: data.vendor?.name ?? batch.name, date: data.paymentDate, ref: data.bankRef,
          method: data.paymentMethod, total: Number(data.totalAmount), balanceBefore: data.balanceBeforeFormatted,
          balanceAfter: data.balanceAfterFormatted,
          lines: (data.invoices ?? []).map((line: Record<string, unknown>) => ({
            number: String(line.invoiceNumber ?? ''), date: String(line.invoiceDate ?? ''),
            amount: Number(line.amount ?? 0) + Number(line.vat ?? 0)
          }))
        })
      }
    }).catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this payment batch.') })
    return () => { cancelled = true }
  }, [batch])

  useEffect(() => {
    if (!batch) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [batch, onClose])

  if (!batch) return null

  async function imageFile() {
    if (!summaryRef.current || !detail) throw new Error('The payment is still loading.')
    const canvas = await html2canvas(summaryRef.current, { backgroundColor: '#ffffff', scale: 2, logging: false })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Could not create the image.')
    return new File([blob], `payment-${detail.ref}.png`, { type: 'image/png' })
  }

  async function copyImage() {
    setBusy('copy')
    try {
      const file = await imageFile()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })])
      alert('Payment image copied to the clipboard.')
    } catch (err) { alert(err instanceof Error ? err.message : 'Could not copy the image.') }
    finally { setBusy(null) }
  }

  async function shareImage() {
    setBusy('share')
    try {
      const file = await imageFile()
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `Payment ${detail?.ref}`, files: [file] })
      } else {
        const url = URL.createObjectURL(file)
        const link = document.createElement('a'); link.href = url; link.download = file.name; link.click()
        URL.revokeObjectURL(url)
        alert('Sharing is not available in this browser, so the PNG was downloaded.')
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) alert(err instanceof Error ? err.message : 'Could not share the image.')
    } finally { setBusy(null) }
  }

  const displayDate = (value: string) => value?.includes('T') ? formatAccountingDate(value.slice(0, 10)) : formatAccountingDate(value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 print:static print:block print:bg-white print:p-0" role="dialog" aria-modal="true" aria-labelledby="batch-view-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 print:hidden">
          <div><h2 id="batch-view-title" className="text-xl font-bold text-gray-900">{mode === 'share' ? 'Share payment batch' : 'Payment batch'}</h2><p className="text-sm text-gray-500">{mode === 'share' ? 'Copy or share this payment summary without leaving the Payment Desk.' : 'View, print, copy, or share this payment.'}</p></div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-2xl leading-none text-gray-500 hover:bg-gray-100" aria-label="Close">×</button>
        </div>
        <div className="p-5 sm:p-6">
          {error ? <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p> : !detail ? <p className="py-10 text-center text-sm text-gray-500">Loading payment details…</p> : (
            <div ref={summaryRef} className="batch-print-area bg-white p-1 text-gray-900">
              <div className="mb-5 flex items-start justify-between gap-4 border-b-2 border-gray-900 pb-4">
                <div><p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Payment summary</p><h3 className="mt-1 text-2xl font-bold">{detail.payee}</h3></div>
                <div className="text-right text-sm"><p className="text-gray-500">Date paid</p><p className="font-semibold">{displayDate(detail.date)}</p></div>
              </div>
              <div className="mb-5 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-4">
                <div><p className="text-gray-500">Reference</p><p className="font-semibold">{detail.ref}</p></div>
                {detail.method ? <div><p className="text-gray-500">Method</p><p className="font-semibold capitalize">{detail.method.replace('_', ' ')}</p></div> : null}
                <div><p className="text-gray-500">Invoices</p><p className="font-semibold">{detail.lines.length}</p></div>
                <div><p className="text-gray-500">Total paid</p><p className="font-bold">{money(detail.total)}</p></div>
              </div>
              <table className="w-full text-sm"><thead><tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500"><th className="py-2">Invoice</th><th className="py-2">Date</th><th className="py-2">Type</th><th className="py-2 text-right">Amount</th></tr></thead>
                <tbody>{detail.lines.map((line, index) => <tr key={`${line.number}:${index}`} className="border-b border-gray-100"><td className="py-2 pr-2 font-medium">{line.number}</td><td className="py-2 pr-2">{displayDate(line.date)}</td><td className="py-2 pr-2">{line.type || '—'}</td><td className="py-2 text-right tabular-nums">{money(line.amount)}</td></tr>)}</tbody>
                <tfoot><tr className="font-bold"><td colSpan={3} className="pt-3 text-right">Total</td><td className="pt-3 text-right tabular-nums">{money(detail.total)}</td></tr></tfoot>
              </table>
              {(detail.balanceBefore || detail.balanceAfter) && <div className="mt-6 flex flex-wrap justify-end gap-x-8 gap-y-2 border-t border-gray-200 pt-3 text-xs text-gray-600"><span>Balance before: <strong className="text-gray-900">{detail.balanceBefore ?? '—'}</strong></span><span>Balance after: <strong className="text-gray-900">{detail.balanceAfter ?? '—'}</strong></span></div>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 print:hidden">
          <button type="button" onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Close</button>
          <button type="button" disabled={!detail} onClick={() => window.print()} className="rounded border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">Print</button>
          <button type="button" disabled={!detail || !!busy} onClick={() => void copyImage()} className="rounded border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">{busy === 'copy' ? 'Copying…' : 'Copy PNG'}</button>
          <button type="button" disabled={!detail || !!busy} onClick={() => void shareImage()} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'share' ? 'Sharing…' : 'Share'}</button>
        </div>
      </div>
      <style jsx global>{`@media print { body * { visibility: hidden !important; } .batch-print-area, .batch-print-area * { visibility: visible !important; } .batch-print-area { position: absolute; inset: 0; width: 100%; padding: 24px !important; } }`}</style>
    </div>
  )
}
