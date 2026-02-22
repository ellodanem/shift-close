/**
 * attendanceSync.js — polls ZKTeco device for attendance logs, pushes to Vercel.
 * Runs every 15 minutes as a backup for ADMS.
 * Tracks last sync time to avoid re-pushing old records.
 */

const DeviceClient = require('./deviceClient')
const fs = require('fs')
const path = require('path')

const STATE_FILE = path.join(process.cwd(), 'agent.state.json')
const log = (msg) => console.log(`[AttendanceSync] ${new Date().toISOString()} ${msg}`)

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch {}
  }
  return { lastSyncTime: null }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

async function syncAttendanceToCloud(config, activityLog) {
  if (!config.deviceIp) {
    log('Skipped — device IP not configured')
    return { synced: 0, error: 'Device IP not configured' }
  }
  if (!config.vercelUrl || !config.agentSecret) {
    log('Skipped — Vercel URL or agent secret not configured')
    return { synced: 0, error: 'Vercel URL or agent secret not configured' }
  }

  const fetch = require('node-fetch')
  const device = new DeviceClient(config.deviceIp, config.devicePort)
  const state = loadState()

  try {
    await device.connect()
    const rawLogs = await device.getAttendances()
    await device.disconnect()

    if (!rawLogs || rawLogs.length === 0) {
      log('No attendance records on device')
      return { synced: 0 }
    }

    // Filter to records newer than last sync
    const lastSync = state.lastSyncTime ? new Date(state.lastSyncTime) : null
    const toSync = lastSync
      ? rawLogs.filter((r) => {
          const t = new Date(r.recordTime || r.attTime || 0)
          return t > lastSync
        })
      : rawLogs

    if (toSync.length === 0) {
      log('No new records since last sync')
      return { synced: 0 }
    }

    // Normalise record format
    const logs = toSync.map((r) => ({
      deviceUserId: String(r.deviceUserId || r.userId || '').trim(),
      recordTime: new Date(r.recordTime || r.attTime).toISOString(),
      state: r.state ?? r.status ?? undefined
    })).filter((r) => r.deviceUserId)

    // Push to Vercel
    const res = await fetch(`${config.vercelUrl}/api/attendance/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-secret': config.agentSecret
      },
      body: JSON.stringify({ logs })
    })

    if (!res.ok) {
      const err = await res.text()
      log(`Ingest failed: ${err}`)
      return { synced: 0, error: `API error: ${res.status}` }
    }

    const { synced } = await res.json()

    // Update state
    saveState({ lastSyncTime: new Date().toISOString() })

    log(`Done — sent ${logs.length} records, ${synced} new`)
    if (synced > 0) activityLog.add(`Synced ${synced} attendance record${synced === 1 ? '' : 's'}`)
    return { synced }
  } catch (err) {
    await device.disconnect()
    log(`Error: ${err.message}`)
    return { synced: 0, error: err.message }
  }
}

module.exports = { syncAttendanceToCloud }
