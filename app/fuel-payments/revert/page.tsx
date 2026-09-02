'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RevertPaymentPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/fuel-payments/invoices')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
      <p className="text-gray-600">Redirecting...</p>
    </div>
  )
}
