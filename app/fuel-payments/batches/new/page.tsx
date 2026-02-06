'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewBatchPage() {
  const router = useRouter()

  useEffect(() => {
    // Batches are created automatically when invoices are marked as paid.
    // Redirect users back to the main batches list.
    router.replace('/fuel-payments/batches')
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
      <p className="text-gray-600">
        Redirecting to batches... Payment batches are created automatically when you mark
        invoices as paid.
      </p>
    </div>
  )
}

