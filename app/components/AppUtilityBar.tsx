'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { formatAppUserDisplayName } from '@/lib/roles'
import {
  DEFAULT_FAVORITE_IDS,
  loadFavoriteShortcutIds,
  saveFavoriteShortcutIds,
  shortcutForPath,
  shortcutsVisibleForRole,
  type HomeShortcutId
} from '@/lib/home-shortcuts'

export default function AppUtilityBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const role = user?.role ?? ''
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [favoriteIds, setFavoriteIds] = useState<HomeShortcutId[]>(DEFAULT_FAVORITE_IDS)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const current = shortcutForPath(pathname ?? '')
  const isFavorite = current ? favoriteIds.includes(current.id) : false

  useEffect(() => {
    const stored = loadFavoriteShortcutIds()
    if (stored) setFavoriteIds(stored)
  }, [])

  useEffect(() => {
    if (!searchOpen) return
    inputRef.current?.focus()
    const onDoc = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [searchOpen])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = shortcutsVisibleForRole(role)
    if (!q) return list.slice(0, 8)
    return list.filter((s) => s.label.toLowerCase().includes(q) || s.href.toLowerCase().includes(q)).slice(0, 10)
  }, [query, role])

  const toggleFavorite = () => {
    if (!current) return
    const currentIds = loadFavoriteShortcutIds() ?? [...DEFAULT_FAVORITE_IDS]
    const next = currentIds.includes(current.id)
      ? currentIds.filter((id) => id !== current.id)
      : [...currentIds, current.id]
    saveFavoriteShortcutIds(next)
    setFavoriteIds(next)
    window.dispatchEvent(new Event('shift-close-shortcuts-changed'))
  }

  if (!user) return null

  return (
    <header className="flex h-11 shrink-0 items-center justify-end gap-1 border-b border-slate-700 bg-slate-800 pl-14 pr-3 sm:px-4 lg:pl-4">
      <div className="relative" ref={searchRef}>
        <button
          type="button"
          onClick={() => {
            setSearchOpen((o) => !o)
            setQuery('')
          }}
          className="rounded-md p-2 text-slate-200 hover:bg-slate-700 hover:text-white"
          aria-label="Search pages"
          title="Search pages"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
            />
          </svg>
        </button>
        {searchOpen ? (
          <div className="absolute right-0 z-50 mt-1 w-[min(90vw,20rem)] rounded-md border border-slate-600 bg-slate-900 p-2 shadow-lg">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to a page…"
              className="mb-2 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-400"
            />
            <ul className="max-h-64 overflow-y-auto">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(false)
                      router.push(item.href)
                    }}
                    className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-100 hover:bg-slate-700"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
              {results.length === 0 ? (
                <li className="px-2 py-1.5 text-sm text-slate-400">No matching pages</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={!current}
        className="rounded-md p-2 text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-40"
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        title={
          current
            ? isFavorite
              ? `Unfavorite ${current.label}`
              : `Favorite ${current.label}`
            : 'This page cannot be favorited'
        }
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill={isFavorite ? 'currentColor' : 'none'}
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
      <span
        className="ml-2 truncate text-sm text-slate-200 max-w-[40vw] sm:max-w-md"
        title={user.email}
      >
        {formatAppUserDisplayName(user)}
        <span className="ml-2 hidden text-xs capitalize text-slate-400 sm:inline">
          ({user.role.replace(/_/g, ' ')})
        </span>
      </span>
      <Link
        href="/dashboard"
        prefetch={false}
        className="hidden rounded-md px-2 py-1 text-sm text-slate-300 hover:bg-slate-700 hover:text-white sm:inline"
      >
        Home
      </Link>
      <button
        type="button"
        onClick={() => void logout()}
        className="flex-shrink-0 rounded-md px-2 py-1 text-sm font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
      >
        Log out
      </button>
    </header>
  )
}
