'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AttendanceSettingsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/attendance?tab=settings')
  }, [router])

  return null
}
