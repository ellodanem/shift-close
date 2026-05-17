'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ATTENDANCE_VIEWER_PATH, canAccessAttendanceViewer } from '@/lib/attendance-viewer'
import { MANAGER_HUB_PATH } from '@/lib/manager-hub'
import { ROSTER_MOBILE_PATH, canAccessRosterMobile } from '@/lib/roster-mobile'
import { useAuth } from '@/app/components/AuthContext'

export default function ManagerHubPage() {
  const router = useRouter()
  const { user, loading, logout, isFullAccess } = useAuth()
  const role = user?.role ?? ''
  const showAttendance = canAccessAttendanceViewer(role)
  const showRoster = canAccessRosterMobile(role)

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(MANAGER_HUB_PATH)}`)
      return
    }
    if (!showAttendance && !showRoster) {
      router.replace('/dashboard')
    }
  }, [loading, user, showAttendance, showRoster, router])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-700 px-4 py-4 max-w-lg mx-auto flex justify-between items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">Manager</h1>
          <p className="text-xs text-slate-400 mt-1">Quick links for phone</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {(isFullAccess || role === 'operations_manager') && (
            <Link href="/dashboard" className="text-xs text-blue-300 hover:text-blue-200 px-2 py-1">
              Full app
            </Link>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="text-xs text-slate-400 hover:text-white px-2 py-1"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-4">
        {showAttendance ? (
          <Link
            href={ATTENDANCE_VIEWER_PATH}
            className="block rounded-2xl border border-slate-600 bg-slate-800 p-5 hover:bg-slate-750 transition-colors"
          >
            <h2 className="text-lg font-semibold text-white">Attendance</h2>
            <p className="text-sm text-slate-400 mt-1">
              Who is in, late, or absent today — clock punches (read-only).
            </p>
          </Link>
        ) : null}

        {showRoster ? (
          <Link
            href={ROSTER_MOBILE_PATH}
            className="block rounded-2xl border border-slate-600 bg-slate-800 p-5 hover:bg-slate-750 transition-colors"
          >
            <h2 className="text-lg font-semibold text-white">Roster</h2>
            <p className="text-sm text-slate-400 mt-1">
              Edit shifts by day or by person — copy week, share image.
            </p>
          </Link>
        ) : null}

        <p className="text-[11px] text-slate-500 pt-4 text-center">
          Set <span className="text-slate-400">After login → Manager hub</span> in Settings → User accounts to open
          this page when you sign in.
        </p>
      </main>
    </div>
  )
}
