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

interface DeviceUser {
  uid: number
  userId: string
  name: string
}

interface DeviceSettings {
  zk_device_ip: string
  zk_device_port: string
}

type Tab = 'logs' | 'device'

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
  const [activeTab, setActiveTab] = useState<Tab>('logs')

  // --- Logs tab state ---
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'custom'>('week')
  const [customStart, setCustomStart] = useState(formatDate(new Date()))
  const [customEnd, setCustomEnd] = useState(formatDate(new Date()))
  const [staffFilter, setStaffFilter] = useState<string>('')

  // --- Device tab state ---
  const [deviceUsers, setDeviceUsers] = useState<DeviceUser[]>([])
  const [deviceLoading, setDeviceLoading] = useState(false)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [mappings, setMappings] = useState<Record<string, string>>({}) // deviceUserId → staffId
  const [mappingSaving, setMappingSaving] = useState(false)
  const [pushingStaff, setPushingStaff] = useState(false)
  const [deviceActionResult, setDeviceActionResult] = useState<string | null>(null)
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>({ zk_device_ip: '', zk_device_port: '4370' })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

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
          setAllStaff(data)
        }
      } catch {}
    }
    void loadStaff()
  }, [])

  const staffWithDevice = useMemo(() => allStaff.filter((s) => s.deviceUserId), [allStaff])

  // Load device settings from DB on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings?keys=zk_device_ip,zk_device_port')
        if (res.ok) {
          const data = await res.json()
          setDeviceSettings({
            zk_device_ip: data.zk_device_ip || '',
            zk_device_port: data.zk_device_port || '4370'
          })
        }
      } catch {}
    }
    void loadSettings()
  }, [])

  const handleSaveDeviceSettings = async () => {
    setSettingsSaving(true)
    setSettingsSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: deviceSettings })
      })
      if (res.ok) setSettingsSaved(true)
    } catch {}
    finally { setSettingsSaving(false) }
  }

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

  const handleImportDeviceUsers = async () => {
    setDeviceLoading(true)
    setDeviceError(null)
    setDeviceActionResult(null)
    try {
      const res = await fetch('/api/attendance/sync', { method: 'POST' })
      if (!res.ok) {
        // If sync fails, the device endpoint isn't reachable — show helpful message
        setDeviceError('Cannot reach device. Run the app locally on the same network as the device, or use the Windows Agent.')
        return
      }
      // Pull device users via a temporary approach — call sync which returns user info
      // For now, show a message that this requires local access
      setDeviceActionResult('Device users can be imported via the Windows Agent dashboard at localhost:3001 → Push Staff to Device.')
    } catch (err) {
      setDeviceError('Device not reachable from this browser. Use the local Windows Agent.')
    } finally {
      setDeviceLoading(false)
    }
  }

  const handleSaveMappings = async () => {
    const pairs = Object.entries(mappings).filter(([, staffId]) => staffId)
    if (pairs.length === 0) return
    setMappingSaving(true)
    try {
      const res = await fetch('/api/attendance/device/map-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: pairs.map(([deviceUserId, staffId]) => ({ deviceUserId, staffId })) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setDeviceActionResult(`Saved ${data.updated} mapping${data.updated === 1 ? '' : 's'} successfully.`)
      // Refresh staff list
      const staffRes = await fetch('/api/staff')
      if (staffRes.ok) setAllStaff(await staffRes.json())
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'Failed to save mappings')
    } finally {
      setMappingSaving(false)
    }
  }

  const irregularityCount = useMemo(() => logs.filter((l) => l.hasIrregularity).length, [logs])

  const vercelUrl = typeof window !== 'undefined' ? `${window.location.origin}` : 'https://your-app.vercel.app'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-600 mt-1">
            ZKTeco device integration — logs, staff sync, and device setup.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {(['logs', 'device'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab === 'logs' ? 'Attendance Logs' : 'Device Management'}
            </button>
          ))}
        </div>

        {/* ── LOGS TAB ── */}
        {activeTab === 'logs' && (
          <>
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
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
                  <span className="text-gray-500">to</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
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
                  {staffWithDevice.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
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
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
            )}

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
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">Loading…</td></tr>
                    ) : logs.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">No attendance logs. Sync from device or configure ADMS to pull data.</td></tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className={`border-t border-gray-100 hover:bg-gray-50 ${log.hasIrregularity ? 'bg-red-50/50' : ''}`}>
                          <td className="px-3 py-2">
                            {log.hasIrregularity ? (
                              <span className="inline-block w-4 h-4 bg-red-500 rounded-sm shrink-0" title={log.punchType === 'in' ? 'Clock-in without matching clock-out' : 'Clock-out without matching clock-in'} />
                            ) : (
                              <span className="inline-block w-4 h-4 bg-green-500 rounded-sm shrink-0 opacity-60" title="OK" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{formatDateDisplay(log.punchTime)}</td>
                          <td className="px-3 py-2 font-medium">{formatTime(log.punchTime)}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${log.punchType === 'in' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                              {log.punchType === 'in' ? 'In' : 'Out'}
                            </span>
                          </td>
                          <td className="px-3 py-2">{log.staff?.name ?? log.deviceUserName ?? `Device ${log.deviceUserId}`}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{log.source}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── DEVICE MANAGEMENT TAB ── */}
        {activeTab === 'device' && (
          <div className="space-y-6">

            {/* Device Settings */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Device Settings</h2>
              <p className="text-sm text-gray-600 mb-4">
                Saved to the database — no env vars or redeployment required.
                <span className="ml-1 inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded font-medium">
                  Direct sync only works on the same local network as the device
                </span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Device IP Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 192.168.1.100"
                    value={deviceSettings.zk_device_ip}
                    onChange={(e) => setDeviceSettings((s) => ({ ...s, zk_device_ip: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Device Port</label>
                  <input
                    type="number"
                    placeholder="4370"
                    value={deviceSettings.zk_device_port}
                    onChange={(e) => setDeviceSettings((s) => ({ ...s, zk_device_port: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveDeviceSettings}
                  disabled={settingsSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {settingsSaving ? 'Saving…' : 'Save Settings'}
                </button>
                {settingsSaved && (
                  <span className="text-sm text-green-700 font-medium">Saved successfully.</span>
                )}
              </div>
              {deviceSettings.zk_device_ip && (
                <p className="mt-3 text-xs text-gray-500">
                  Current: <span className="font-mono font-medium text-gray-700">{deviceSettings.zk_device_ip}:{deviceSettings.zk_device_port || 4370}</span>
                  {' '} — Use &ldquo;Sync from device&rdquo; on the Logs tab when on the same network, or configure the Windows Agent for automatic cloud sync.
                </p>
              )}
            </div>

            {/* ADMS Setup */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">ADMS Setup (Real-time Push)</h2>
              <p className="text-sm text-gray-600 mb-4">
                Configure your ZKTeco F22 to push punches directly to this app in real time.
                Go to <strong>COMM → Cloud Server Setting</strong> on the device and enter:
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-sm space-y-1">
                <div className="flex gap-4"><span className="text-gray-500 w-40">Server Address</span><span className="font-semibold text-gray-900">{vercelUrl.replace('https://', '').replace('http://', '')}</span></div>
                <div className="flex gap-4"><span className="text-gray-500 w-40">Server Port</span><span className="font-semibold text-gray-900">443</span></div>
                <div className="flex gap-4"><span className="text-gray-500 w-40">HTTPS</span><span className="font-semibold text-gray-900">ON</span></div>
                <div className="flex gap-4"><span className="text-gray-500 w-40">Enable Domain Name</span><span className="font-semibold text-gray-900">ON</span></div>
                <div className="flex gap-4"><span className="text-gray-500 w-40">API Endpoint</span><span className="font-semibold text-blue-700">{vercelUrl}/api/attendance/adms</span></div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Once configured, every punch will appear in Attendance Logs automatically — no manual sync needed.
              </p>
            </div>

            {/* Windows Agent */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Windows Agent</h2>
              <p className="text-sm text-gray-600 mb-4">
                Install the local agent on an always-on PC at the station. It automatically pushes new staff to the device
                and syncs attendance logs as a backup. Runs silently in the system tray.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-blue-800 mb-1">Auto Staff Sync</div>
                  <div className="text-blue-700">Every 5 min — pushes new staff to device automatically</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-green-800 mb-1">Attendance Backup</div>
                  <div className="text-green-700">Every 15 min — backup sync in case ADMS fails</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-purple-800 mb-1">Local Dashboard</div>
                  <div className="text-purple-700">Status & controls at localhost:3001</div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>To build the installer:</strong> Run <code className="bg-amber-100 px-1 rounded">cd agent &amp;&amp; npm install &amp;&amp; npm run build</code> — produces a <code>.exe</code> installer in <code>agent/dist/</code>.
              </div>
            </div>

            {/* Staff Device Mapping */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Staff ↔ Device Mapping</h2>
              <p className="text-sm text-gray-600 mb-4">
                Each staff member needs a Device User ID to link their punch records to their profile.
                Set this on each staff member&apos;s edit page, or use the Windows Agent dashboard to import from the device.
              </p>

              {deviceError && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{deviceError}</div>
              )}
              {deviceActionResult && (
                <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{deviceActionResult}</div>
              )}

              <table className="w-full text-sm mb-4">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Staff Member</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Device User ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allStaff.filter(s => s).map((s) => (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{s.name}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono">{s.deviceUserId || '—'}</td>
                      <td className="px-3 py-2">
                        {s.deviceUserId ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Mapped</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Not mapped</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex gap-3 flex-wrap">
                <a
                  href="/staff"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700"
                >
                  Edit Staff Profiles
                </a>
                <button
                  onClick={handleImportDeviceUsers}
                  disabled={deviceLoading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {deviceLoading ? 'Checking…' : 'Import from Device (LAN only)'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
