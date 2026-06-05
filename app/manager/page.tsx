'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ATTENDANCE_VIEWER_PATH, canAccessAttendanceViewer } from '@/lib/attendance-viewer'
import {
  MANAGER_HUB_DESKTOP_PATH,
  MANAGER_HUB_PATH,
  canAccessManagerHubDesktop
} from '@/lib/manager-hub'
import { ROSTER_MOBILE_PATH, canAccessRosterMobile } from '@/lib/roster-mobile'
import { SCANS_MOBILE_PATH, canAccessScansMobile } from '@/lib/scans-mobile'
import { useAuth } from '@/app/components/AuthContext'

const tileClass =
  'block rounded-2xl border border-slate-600 bg-slate-800 p-5 hover:bg-slate-700/60 transition-colors'

export default function ManagerHubPage() {
  const router = useRouter()
  const { user, loading, logout } = useAuth()
  const role = user?.role ?? ''
  const showDesktop = canAccessManagerHubDesktop(role)
  const showAttendance = canAccessAttendanceViewer(role)
  const showRoster = canAccessRosterMobile(role)
  const showScans = canAccessScansMobile(role)
  const showMobileSection = showAttendance || showRoster || showScans

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(MANAGER_HUB_PATH)}`)
      return
    }
    if (!showDesktop && !showAttendance && !showRoster && !showScans) {
      router.replace('/dashboard')
    }
  }, [loading, user, showDesktop, showAttendance, showRoster, showScans, router])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-700 px-4 py-4 max-w-xl mx-auto flex justify-between items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">Manager</h1>
          <p className="text-xs text-slate-400 mt-1">Choose how you want to work</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 shrink-0"
        >
          Log out
        </button>
      </header>

      <main className="max-w-xl mx-auto px-4 py-8 space-y-6">
        {showDesktop ? (
          <Link
            href={MANAGER_HUB_DESKTOP_PATH}
            className={`${tileClass} border-blue-500/40 bg-slate-800/90`}
          >
            <h2 className="text-lg font-semibold text-white">Desktop</h2>
            <p className="text-sm text-slate-400 mt-1">
              Full app — roster, attendance, shifts, reports, and settings.
            </p>
          </Link>
        ) : null}

        {showMobileSection ? (
          <section className="space-y-4">
            {showDesktop ? (
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">
                On your phone
              </h2>
            ) : null}

            {showAttendance ? (
              <Link href={ATTENDANCE_VIEWER_PATH} className={tileClass}>
                <h2 className="text-lg font-semibold text-white">Attendance</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Who is in, late, or absent today — clock punches (read-only).
                </p>
              </Link>
            ) : null}

            {showRoster ? (
              <Link href={ROSTER_MOBILE_PATH} className={tileClass}>
                <h2 className="text-lg font-semibold text-white">Roster</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Edit shifts — week grid, day, or person — copy week, share image.
                </p>
              </Link>
            ) : null}

            {showScans ? (
              <Link href={SCANS_MOBILE_PATH} className={tileClass}>
                <h2 className="text-lg font-semibold text-white">Debit scans</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Find, view, and send debit scans to the owner by email or WhatsApp.
                </p>
              </Link>
            ) : null}
          </section>
        ) : null}

        <p className="text-[11px] text-slate-500 pt-2 text-center">
          Set <span className="text-slate-400">After login → Manager hub</span> in Settings → User accounts to open
          this page when you sign in.
        </p>
      </main>
    </div>
  )
}
