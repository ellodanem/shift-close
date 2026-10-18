'use client'

import { useState } from 'react'
import { PaymentBatchModal } from '@/app/accounting/payment-batch-modal'
import type { PaidBill } from '@/lib/accounting-types'

type Batch = {
  id: string
  kind: 'fuel' | 'vendor'
  vendorId?: string
  name: string
  date: string
  ref: string
  amount: number
}

export function PaymentDeskBatchActions({
  batch,
  onRevert
}: {
  batch: Batch
  onRevert: (value: { kind: 'fuel' | 'vendor'; vendorId?: string }) => void
}) {
  const [viewing, setViewing] = useState(false)
  const modalBatch: PaidBill | null = viewing
    ? { id: batch.id, kind: batch.kind, date: batch.date, name: batch.name, ref: batch.ref, amount: batch.amount, account: 'Payment' }
    : null

  return (
    <>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setViewing(true)} className="rounded border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700">View</button>
        <button type="button" onClick={() => onRevert({ kind: batch.kind, vendorId: batch.vendorId })} className="rounded border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">Revert</button>
      </div>
      <PaymentBatchModal batch={modalBatch} onClose={() => setViewing(false)} />
    </>
  )
}
