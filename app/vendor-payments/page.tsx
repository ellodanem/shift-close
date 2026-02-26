'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function VendorPaymentsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/vendor-payments/vendors')
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
      <p className="text-gray-600">Redirecting...</p>
    </div>
  )
}
