'use client'

import { useAuth } from './AuthContext'
import NavGroupTiles from './NavGroupTiles'
import {
  buildFilteredNavGroups,
  navGroupByLabel,
  navTilesForGroup
} from '@/lib/app-nav'

export default function NavPickerPanel({
  pickerGroup,
  onClose
}: {
  pickerGroup: string | null
  onClose: () => void
}) {
  const { user } = useAuth()
  const role = user?.role ?? ''

  if (!pickerGroup) return null

  const groups = buildFilteredNavGroups(role)
  const group = navGroupByLabel(groups, pickerGroup)
  if (!group) return null

  const tiles = navTilesForGroup(group)

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={onClose}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Menu
        </button>
        <h1 className="mb-5 text-2xl font-bold text-blue-950">{group.label}</h1>
        <NavGroupTiles tiles={tiles} onNavigate={onClose} />
      </div>
    </div>
  )
}
