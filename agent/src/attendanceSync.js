/**
 * attendanceSync.js — read punches from the ZKTeco device; push to Vercel only when explicitly requested.
 * No automatic polling to the cloud (staff sync handles users; ADMS can handle device→cloud if configured).
 */

const DeviceClient = require('./deviceClient')

const log = (msg) => console.log(`[AttendanceSync] ${new Date().toISOString()} ${msg}`)

function normalizeRawRecord(r) {
  const deviceUserId = String(r.deviceUserId || r.userId || '').trim()
  const t = new Date(r.recordTime || r.attTime || 0)
  if (!deviceUserId || isNaN(t.getTime())) return null
  const state = r.state ?? r.status ?? undefined
  const key = `${deviceUserId}|${t.getTime()}`
  return { key, deviceUserId, recordTime: t.toISOString(), state }
}

/**
 * Pull punch records from the device for display / manual selection (newest first).
 */
async function fetchPunchesFromDevice(config, limit = 2000) {
  if (!config.deviceIp) {
    return { ok: false, punches: [], error: 'Device IP not configured' }
  }

  const cap = Math.min(Math.max(1, parseInt(limit, 10) || 2000), 10000)
  const device = new DeviceClient(config.deviceIp, config.devicePort)

  try {
    await device.connect()
    const rawLogs = await device.getAttendances()
    await device.disconnect()

    if (!rawLogs || rawLogs.length === 0) {
      return { ok: true, punches: [], totalOnDevice: 0 }
    }

    const normalized = []
    const seen = new Set()
    for (const r of rawLogs) {
      const n = normalizeRawRecord(r)
      if (n && !seen.has(n.key)) {
        seen.add(n.key)
        normalized.push(n)
      }
    }
    normalized.sort((a, b) => new Date(b.recordTime) - new Date(a.recordTime))

    return {
      ok: true,
      punches: normalized.slice(0, cap),
      totalOnDevice: normalized.length
    }
  } catch (err) {
    await device.disconnect()
    log(`fetchPunchesFromDevice: ${err.message}`)
    return { ok: false, punches: [], error: err.message }
  }
}

/**
 * POST selected punches to Vercel ingest (manual only).
 * @param {Array<{ deviceUserId: string, recordTime: string, state?: number }>} logs
 */
async function pushPunchesToCloud(config, logs, activityLog) {
  if (!config.deviceIp) {
    return { synced: 0, error: 'Device IP not configured' }
  }
  if (!config.vercelUrl || !config.agentSecret) {
    return { synced: 0, error: 'Vercel URL or agent secret not configured' }
  }
  if (!Array.isArray(logs) || logs.length === 0) {
    return { synced: 0, error: 'No punches selected' }
  }

  const fetch = require('node-fetch')
  const bodyLogs = logs
    .map((l) => ({
      deviceUserId: String(l.deviceUserId || '').trim(),
      recordTime:
        typeof l.recordTime === 'string'
          ? l.recordTime
          : new Date(l.recordTime).toISOString(),
      state: l.state
    }))
    .filter((l) => l.deviceUserId)

  if (bodyLogs.length === 0) {
    return { synced: 0, error: 'No valid punches in selection' }
  }

  try {
    const res = await fetch(`${config.vercelUrl}/api/attendance/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-secret': config.agentSecret
      },
      body: JSON.stringify({ logs: bodyLogs })
    })

    if (!res.ok) {
      const err = await res.text()
      log(`Ingest failed: ${err}`)
      return { synced: 0, error: `API error: ${res.status}` }
    }

    const data = await res.json()
    const synced = typeof data.synced === 'number' ? data.synced : 0
    log(`Manual upload — sent ${bodyLogs.length} punch(es), ${synced} new in DB`)
    if (synced > 0) {
      activityLog.add(`Uploaded ${synced} punch record${synced === 1 ? '' : 's'} to cloud`)
    }
    return { synced, total: bodyLogs.length }
  } catch (err) {
    log(`pushPunchesToCloud: ${err.message}`)
    return { synced: 0, error: err.message }
  }
}

module.exports = { fetchPunchesFromDevice, pushPunchesToCloud }
