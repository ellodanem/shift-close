'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

interface AttendanceLog {
  id: string
  staffId: string | null
  deviceUserId: string
  deviceUserName: string | null
  punchTime: string
  punchType: string
  source: string
  hasIrregularity: boolean
  staff: { id: string; name: string } | null
}

interface Staff {
  id: string
  name: string
  deviceUserId: string | null
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatDateDisplay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AttendancePage() {
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'custom'>('week')
  const [customStart, setCustomStart] = useState(formatDate(new Date()))
  const [customEnd, setCustomEnd] = useState(formatDate(new Date()))
  const [staffFilter, setStaffFilter] = useState<string>('')

  const { startDate, endDate } = useMemo(() => {
    const now = new Date()
    if (dateRange === 'week') {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return { startDate: formatDate(start), endDate: formatDate(now) }
    }
    if (dateRange === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { startDate: formatDate(start), endDate: formatDate(end) }
    }
    return { startDate: customStart, endDate: customEnd }
  }, [dateRange, customStart, customEnd])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      if (staffFilter) params.set('staffId', staffFilter)
      const res = await fetch(`/api/attendance/logs?${params}`)
      if (!res.ok) throw new Error('Failed to load logs')
      const data: AttendanceLog[] = await res.json()
      setLogs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, staffFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const res = await fetch('/api/staff')
        if (res.ok) {
          const data: Staff[] = await res.json()
          setStaff(data.filter((s) => s.deviceUserId))
        }
      } catch {
        // ignore
      }
    }
    void loadStaff()
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/attendance/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      await fetchLogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const irregularityCount = useMemo(() => logs.filter((l) => l.hasIrregularity).length, [logs])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-600 mt-1">
            ZKTeco device logs. Sync from device, then review. Red icon = irregularity (missing in/out pair).
          </p>
        </div>

        {/* Top bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-4">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {syncing ? 'Syncing…' : 'Sync from device'}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Range:</span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as 'week' | 'month' | 'custom')}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Staff:</span>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[140px]"
            >
              <option value="">All</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {irregularityCount > 0 && (
            <div className="ml-auto px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm font-medium">
              {irregularityCount} irregularit{irregularityCount === 1 ? 'y' : 'ies'} need attention
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 w-10"></th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Time</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Staff</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      No attendance logs. Sync from device to pull data.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className={`border-t border-gray-100 hover:bg-gray-50 ${
                        log.hasIrregularity ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        {log.hasIrregularity ? (
                          <span
                            className="inline-block w-4 h-4 bg-red-500 rounded-sm shrink-0"
                            title={
                              log.punchType === 'in'
                                ? 'Clock-in without matching clock-out'
                                : 'Clock-out without matching clock-in'
                            }
                          />
                        ) : (
                          <span
                            className="inline-block w-4 h-4 bg-green-500 rounded-sm shrink-0 opacity-60"
                            title="OK"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{formatDateDisplay(log.punchTime)}</td>
                      <td className="px-3 py-2 font-medium">{formatTime(log.punchTime)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            log.punchType === 'in' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {log.punchType === 'in' ? 'In' : 'Out'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {log.staff?.name ?? log.deviceUserName ?? `Device ${log.deviceUserId}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Configure ZK_DEVICE_IP (and optionally ZK_DEVICE_PORT) in .env. Map staff in Settings → Staff by setting
          Device User ID to match the device.
        </p>
      </div>
    </div>
  )
}
