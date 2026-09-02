'use client'

import { useAuth } from '@/app/components/AuthContext'
import NavGroupTiles from '@/app/components/NavGroupTiles'
import { buildFilteredNavGroups, navGroupByLabel, navTilesForGroup } from '@/lib/app-nav'

export default function SettingsPage() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const setupGroup = navGroupByLabel(buildFilteredNavGroups(role), 'Setup')
  const tiles = setupGroup ? navTilesForGroup(setupGroup) : []

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-5 text-2xl font-bold text-blue-950">Settings</h1>
        <NavGroupTiles tiles={tiles} />
      </div>
    </div>
  )
}
