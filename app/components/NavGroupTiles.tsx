'use client'

import Link from 'next/link'
import HomeShortcutIcon from './HomeShortcutIcon'
import type { NavTile } from '@/lib/app-nav'
import type { HomeShortcutId } from '@/lib/home-shortcuts'

function TileIcon({ tile }: { tile: NavTile }) {
  if (tile.href === '/dashboard') {
    return (
      <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  }
  return <HomeShortcutIcon id={tile.shortcutId as HomeShortcutId} className="h-8 w-8 text-white" />
}

export default function NavGroupTiles({
  tiles,
  onNavigate,
  compact = false
}: {
  tiles: NavTile[]
  onNavigate?: () => void
  compact?: boolean
}) {
  const sizeClass = compact
    ? 'h-[6.5rem] w-[6.5rem] text-[12px]'
    : 'h-[7.5rem] w-[7.5rem] text-[13px]'

  return (
    <div className={`flex flex-wrap gap-3 ${compact ? '' : 'sm:gap-4'}`}>
      {tiles.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          prefetch={false}
          onClick={onNavigate}
          className={`relative flex shrink-0 flex-col items-center rounded-2xl ${tile.tileClass} text-white hover:brightness-110 ${sizeClass}`}
        >
          <span className="mt-6 flex h-9 items-center justify-center">
            <TileIcon tile={tile} />
          </span>
          <span className="mt-auto mb-2.5 px-2 text-center font-semibold leading-tight">{tile.label}</span>
        </Link>
      ))}
    </div>
  )
}
