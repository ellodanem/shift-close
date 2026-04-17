'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function VendorMakePaymentRedirectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const q = new URLSearchParams()
    q.set('pay', '1')
    const v = searchParams.get('vendorId')
    const s = searchParams.get('selected')
    if (v) q.set('vendorId', v)
    if (s) q.set('selected', s)
    router.replace(`/vendor-payments/invoices?${q.toString()}`)
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
      <p className="text-gray-600">Opening…</p>
    </div>
  )
}

export default function VendorMakePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <VendorMakePaymentRedirectInner />
    </Suspense>
  )
}
