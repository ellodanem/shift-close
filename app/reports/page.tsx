'use client'

import { useAuth } from '@/app/components/AuthContext'
import NavGroupTiles from '@/app/components/NavGroupTiles'
import { buildReportsCenterTiles } from '@/lib/app-nav'

export default function ReportsPage() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const tiles = buildReportsCenterTiles(role)

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-5 text-2xl font-bold text-blue-950">Reports Center</h1>
        <NavGroupTiles tiles={tiles} />
      </div>
    </div>
  )
}
