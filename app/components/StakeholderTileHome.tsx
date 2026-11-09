'use client'

import Link from 'next/link'
import HomeShortcutIcon from './HomeShortcutIcon'
import type { HomeShortcutId } from '@/lib/home-shortcuts'
import { tileBackgroundColor } from '@/lib/tile-colors'

/**
 * Simplified stakeholder home: categorized tiles only, End of Day first.
 * Tile look matches HomeShortcutStrip. Revert point: git tag pre-stakeholder-tile-dashboard.
 */
type StakeholderTile = {
  label: string
  href: string
  /** Icon to draw. */
  iconId: HomeShortcutId
  /** Shortcut whose color the tile uses (defaults to iconId). */
  colorId?: HomeShortcutId
}

type StakeholderCategory = {
  title: string
  tiles: StakeholderTile[]
}

const CATEGORIES: StakeholderCategory[] = [
  {
    title: 'End of Day',
    tiles: [{ label: 'End of Day', href: '/days', iconId: 'end-of-day' }]
  },
  {
    title: 'Operations',
    tiles: [
      { label: 'Roster', href: '/roster', iconId: 'roster' },
      { label: 'Attendance', href: '/attendance', iconId: 'attendance' },
      { label: 'Time Off', href: '/time-off', iconId: 'time-off' }
    ]
  },
  {
    title: 'Insights',
    tiles: [
      { label: 'Fuel expectancy', href: '/insights/fuel-expectancy', iconId: 'fuel-expectancy' },
      { label: 'Expected revenue', href: '/insights/expected-revenue', iconId: 'expected-revenue' },
      { label: 'Deposit & debit scans', href: '/insights/deposit-debit-scans', iconId: 'deposit-scans' },
      { label: 'Deposit comparisons', href: '/financial/deposit-comparisons', iconId: 'deposit-comparisons' },
      { label: 'Fuel comparison', href: '/reports/fuel-comparison', iconId: 'report-fuel-comparison' }
    ]
  },
  {
    title: 'People',
    tiles: [
      { label: 'Staff', href: '/staff', iconId: 'staff' },
      { label: 'Payroll', href: '/payroll', iconId: 'pay-run' },
      { label: 'Applications', href: '/applications', iconId: 'applications' }
    ]
  },
  {
    title: 'Financial',
    tiles: [
      { label: 'Cashbook', href: '/financial/cashbook', iconId: 'cashbook' },
      { label: 'Customer accounts', href: '/customer-accounts', iconId: 'customer-accounts' },
      { label: 'Accounting', href: '/accounting', iconId: 'financial-report', colorId: 'cashbook' }
    ]
  }
]

function TileLink({ tile }: { tile: StakeholderTile }) {
  return (
    <Link
      href={tile.href}
      prefetch={false}
      style={{ backgroundColor: tileBackgroundColor(tile.href, tile.colorId ?? tile.iconId) }}
      className="flex h-[6.25rem] w-[6.25rem] shrink-0 flex-col items-center rounded-2xl text-white hover:brightness-110 sm:h-[7.5rem] sm:w-[7.5rem]"
    >
      <span className="mt-5 flex h-9 items-center justify-center sm:mt-7">
        <HomeShortcutIcon id={tile.iconId} className="h-8 w-8 text-white" />
      </span>
      <span className="mt-auto mb-2.5 px-2 text-center text-[13px] font-semibold leading-tight">
        {tile.label}
      </span>
    </Link>
  )
}

export default function StakeholderTileHome() {
  return (
    <div className="space-y-6 sm:space-y-7">
      {CATEGORIES.map((category) => (
        <section key={category.title}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {category.title}
          </h2>
          <div className="flex flex-wrap gap-3">
            {category.tiles.map((tile) => (
              <TileLink key={tile.href} tile={tile} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
