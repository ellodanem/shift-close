'use client'

import Link from 'next/link'
import { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CallOutsTab from './components/CallOutsTab'
import SickLeaveTab from './components/SickLeaveTab'
import VacationDayOffTab from './components/VacationDayOffTab'
import { TimeOffProvider } from './TimeOffProvider'

export type TimeOffTab = 'vacation-day-off' | 'sick-leave' | 'call-outs'

const TABS: { id: TimeOffTab; label: string }[] = [
  { id: 'vacation-day-off', label: 'Vacation / Day Off' },
  { id: 'sick-leave', label: 'Sick Leave' },
  { id: 'call-outs', label: 'Call Outs' }
]

function parseTab(raw: string | null): TimeOffTab {
  if (raw === 'sick-leave' || raw === 'call-outs' || raw === 'vacation-day-off') return raw
  return 'vacation-day-off'
}

function TimeOffPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = useMemo(() => parseTab(searchParams.get('tab')), [searchParams])
  const dateFromQuery = searchParams.get('date')

  const setTab = useCallback(
    (tab: TimeOffTab) => {
      const qs = new URLSearchParams(searchParams.toString())
      qs.set('tab', tab)
      if (tab !== 'call-outs') qs.delete('date')
      router.replace(`/time-off?${qs.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Dashboard
          </Link>
          <span className="text-slate-300 mx-2">·</span>
          <Link href="/roster" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            Roster
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Time Off</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage vacation, planned day offs, sick leave, and call outs in one place.
          </p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
                activeTab === id
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'vacation-day-off' ? <VacationDayOffTab /> : null}
        {activeTab === 'sick-leave' ? <SickLeaveTab /> : null}
        {activeTab === 'call-outs' ? <CallOutsTab initialDate={dateFromQuery} /> : null}
      </div>
    </div>
  )
}

export default function TimeOffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-6">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      }
    >
      <TimeOffProvider>
        <TimeOffPageContent />
      </TimeOffProvider>
    </Suspense>
  )
}
