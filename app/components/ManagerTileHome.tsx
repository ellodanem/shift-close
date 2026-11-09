'use client'

import { useMemo } from 'react'
import { useAuth } from './AuthContext'
import { NavGroupSections } from './NavGroupTiles'
import { buildFilteredNavGroups, navTilesForGroup } from '@/lib/app-nav'

/**
 * Manager home: every menu group as a heading with its tiles (same tiles as the sidebar pickers).
 * Revert point: git tag pre-manager-tile-dashboard.
 */
export default function ManagerTileHome() {
  const { user } = useAuth()
  const role = user?.role ?? ''

  const groups = useMemo(
    () =>
      buildFilteredNavGroups(role)
        // Home is this page itself.
        .filter((group) => group.label !== 'Home')
        .map((group) => ({ label: group.label, tiles: navTilesForGroup(group) }))
        .filter((group) => group.tiles.length > 0),
    [role]
  )

  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {group.label}
          </h2>
          <NavGroupSections tiles={group.tiles} />
        </section>
      ))}
    </div>
  )
}
