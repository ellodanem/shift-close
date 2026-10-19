'use client'

import { VendorMakePaymentModal } from './VendorMakePaymentModal'

type OverheadMakePaymentModalProps = {
  open: boolean
  onClose: () => void
  initialPayeeId: string
  initialPayeeName: string
  initialSelectedCsv: string
  onSuccess: (batchId: string) => void
}

/** Dedicated payment entry point for bills posted to an overhead account. */
export function OverheadMakePaymentModal({
  open,
  onClose,
  initialPayeeId,
  initialPayeeName,
  initialSelectedCsv,
  onSuccess
}: OverheadMakePaymentModalProps) {
  return <VendorMakePaymentModal open={open} onClose={onClose} initialVendorId={initialPayeeId} initialPayeeName={initialPayeeName} initialSelectedCsv={initialSelectedCsv} paymentKind="overhead" onSuccess={onSuccess} />
}
