'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import HomeShortcutIcon from './HomeShortcutIcon'
import {
  DEFAULT_FAVORITE_IDS,
  HOME_SHORTCUTS,
  SUGGESTED_RECENT_IDS,
  loadFavoriteShortcutIds,
  loadRecentShortcutIds,
  resolveShortcutRow,
  saveFavoriteShortcutIds,
  type HomeShortcut,
  type HomeShortcutId
} from '@/lib/home-shortcuts'
import { tileBackgroundColor } from '@/lib/tile-colors'

function Tile({
  shortcut,
  index,
  favorited,
  onToggleFavorite
}: {
  shortcut: HomeShortcut
  index?: number
  favorited: boolean
  onToggleFavorite: (id: HomeShortcutId) => void
}) {
  return (
    <div className="relative shrink-0">
      <Link
        href={shortcut.href}
        prefetch={false}
        style={{ backgroundColor: tileBackgroundColor(shortcut.href, shortcut.id) }}
        className="relative flex h-[6.25rem] w-[6.25rem] flex-col items-center rounded-2xl text-white hover:brightness-110 sm:h-[7.5rem] sm:w-[7.5rem]"
      >
        {index != null ? (
          <span className="absolute left-2 top-1.5 flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold text-white/95">
            {index}
          </span>
        ) : null}
        <span className="mt-7 flex h-9 items-center justify-center">
          <HomeShortcutIcon id={shortcut.id} className="h-8 w-8 text-white" />
        </span>
        <span className="mt-auto mb-2.5 px-2 text-center text-[13px] font-semibold leading-tight">
          {shortcut.label}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => onToggleFavorite(shortcut.id)}
        className="absolute right-1.5 top-1.5 z-10 rounded-full p-1 text-white/90 hover:bg-black/20"
        aria-label={favorited ? `Remove ${shortcut.label} from favorites` : `Add ${shortcut.label} to favorites`}
        title={favorited ? 'Remove from favorites' : 'Add to favorites'}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill={favorited ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
          />
        </svg>
      </button>
    </div>
  )
}

function ScrollArrow({
  direction,
  onClick
}: {
  direction: 'left' | 'right'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 sm:flex"
      aria-label={direction === 'left' ? 'Scroll left' : 'Scroll right'}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {direction === 'left' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        )}
      </svg>
    </button>
  )
}

function Row({
  title,
  items,
  numbered,
  favorites,
  onToggleFavorite,
  empty
}: {
  title: string
  items: HomeShortcut[]
  numbered?: boolean
  favorites: Set<HomeShortcutId>
  onToggleFavorite: (id: HomeShortcutId) => void
  empty?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const scrollBy = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' })
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="flex items-center gap-2">
          <ScrollArrow direction="left" onClick={() => scrollBy(-1)} />
          <div
            ref={scrollerRef}
            className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((shortcut, i) => (
              <Tile
                key={shortcut.id}
                shortcut={shortcut}
                index={numbered ? i + 1 : undefined}
                favorited={favorites.has(shortcut.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
          <ScrollArrow direction="right" onClick={() => scrollBy(1)} />
        </div>
      )}
    </section>
  )
}

export default function HomeShortcutStrip() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const [recents, setRecents] = useState<HomeShortcut[]>(() =>
    resolveShortcutRow(null, SUGGESTED_RECENT_IDS, role, 6)
  )
  const [favorites, setFavorites] = useState<HomeShortcut[]>(() =>
    resolveShortcutRow(null, DEFAULT_FAVORITE_IDS, role, 8)
  )
  const [favoriteIds, setFavoriteIds] = useState<HomeShortcutId[]>(DEFAULT_FAVORITE_IDS)

  const refresh = useCallback(() => {
    const storedRecents = loadRecentShortcutIds()
    const storedFavorites = loadFavoriteShortcutIds()
    setRecents(resolveShortcutRow(storedRecents, SUGGESTED_RECENT_IDS, role, 6))
    const favIds = storedFavorites ?? DEFAULT_FAVORITE_IDS
    setFavoriteIds(favIds)
    setFavorites(
      storedFavorites && storedFavorites.length === 0
        ? []
        : resolveShortcutRow(favIds, DEFAULT_FAVORITE_IDS, role, 8)
    )
  }, [role])

  useEffect(() => {
    refresh()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'shift-close-recent-shortcuts' || e.key === 'shift-close-favorite-shortcuts') {
        refresh()
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('shift-close-shortcuts-changed', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('shift-close-shortcuts-changed', refresh)
    }
  }, [refresh])

  const onToggleFavorite = (id: HomeShortcutId) => {
    const current = loadFavoriteShortcutIds() ?? [...DEFAULT_FAVORITE_IDS]
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    saveFavoriteShortcutIds(next)
    setFavoriteIds(next)
    setFavorites(
      next
        .map((fid) => HOME_SHORTCUTS.find((s) => s.id === fid))
        .filter((s): s is HomeShortcut => Boolean(s))
        .filter((s) => next.includes(s.id))
    )
    window.dispatchEvent(new Event('shift-close-shortcuts-changed'))
  }

  return (
    <div className="mb-6 space-y-5 sm:mb-8 sm:space-y-6">
      <Row
        title="Recently Used"
        items={recents}
        favorites={new Set(favoriteIds)}
        onToggleFavorite={onToggleFavorite}
        empty="Pages you open will show up here."
      />
      <Row
        title="Favorites"
        items={favorites}
        numbered
        favorites={new Set(favoriteIds)}
        onToggleFavorite={onToggleFavorite}
        empty="Star a page from a tile or the top bar to pin it here."
      />
    </div>
  )
}
