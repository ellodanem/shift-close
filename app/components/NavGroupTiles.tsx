'use client'

import Link from 'next/link'
import HomeShortcutIcon from './HomeShortcutIcon'
import { tileBackgroundColor } from '@/lib/tile-colors'
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
  const sizeClass = compact ? 'h-[6.5rem] min-w-[6.5rem]' : 'h-[7.5rem] min-w-[7.5rem]'

  return (
    <div
      className={
        compact
          ? 'grid grid-cols-2 gap-3'
          : 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
      }
    >
      {tiles.map((tile) => {
        const tileBody = (
          <>
            <span className="mt-6 flex h-9 items-center justify-center">
              <TileIcon tile={tile} />
            </span>
            <span className="mt-auto mb-2.5 px-2 text-center text-[13px] font-semibold leading-tight">
              {tile.label}
            </span>
            {tile.comingSoon ? (
              <span className="absolute right-2 top-2 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Soon
              </span>
            ) : null}
          </>
        )

        if (tile.comingSoon) {
          return (
            <div
              key={tile.href}
              style={{ backgroundColor: tileBackgroundColor(tile.href, tile.shortcutId) }}
              className={`relative flex w-full cursor-not-allowed flex-col items-center rounded-2xl opacity-60 shadow-md text-white ${sizeClass}`}
              aria-disabled="true"
            >
              {tileBody}
            </div>
          )
        }

        return (
          <Link
            key={tile.href}
            href={tile.href}
            prefetch={false}
            onClick={onNavigate}
            style={{ backgroundColor: tileBackgroundColor(tile.href, tile.shortcutId) }}
            className={`relative flex w-full flex-col items-center rounded-2xl shadow-md text-white hover:brightness-110 ${sizeClass}`}
          >
            {tileBody}
          </Link>
        )
      })}
    </div>
  )
}
