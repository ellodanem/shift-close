'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewBatchPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/fuel-payments/batches')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
      <p className="max-w-md text-center text-sm text-gray-600 sm:text-base">
        Redirecting to batches… Payment batches are created automatically when you mark
        invoices as paid.
      </p>
    </div>
  )
}
