'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PayRunRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/payroll')
  }, [router])
  return <p className="p-6 text-sm text-slate-500">Opening payroll…</p>
}
