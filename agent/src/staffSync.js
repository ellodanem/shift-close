/**
 * staffSync.js — polls Vercel API for staff, pushes any to ZKTeco device.
 * Default interval is 30 minutes (see config.js). Uses If-None-Match / 304 when
 * the pending-staff fingerprint is unchanged to skip full payload work.
 */

const DeviceClient = require('./deviceClient')

const log = (msg) => console.log(`[StaffSync] ${new Date().toISOString()} ${msg}`)

/** Last ETag from pending-staff (in-memory for this agent process). */
let lastStaffEtag = null

async function syncStaffToDevice(config, activityLog) {
  if (!config.deviceIp) {
    log('Skipped — device IP not configured')
    return { pushed: 0, skipped: 0, error: 'Device IP not configured' }
  }
  if (!config.vercelUrl || !config.agentSecret) {
    log('Skipped — Vercel URL or agent secret not configured')
    return { pushed: 0, skipped: 0, error: 'Vercel URL or agent secret not configured' }
  }

  const fetch = require('node-fetch')
  const device = new DeviceClient(config.deviceIp, config.devicePort)

  try {
    const headers = { 'x-agent-secret': config.agentSecret }
    if (lastStaffEtag) {
      headers['If-None-Match'] = lastStaffEtag
    }

    const res = await fetch(`${config.vercelUrl}/api/attendance/device/pending-staff`, {
      headers
    })

    if (res.status === 304) {
      const etag = res.headers.get('etag')
      if (etag) lastStaffEtag = etag
      log('Staff unchanged (304) — skip device sync')
      return { pushed: 0, skipped: 0, unchanged: true }
    }

    if (!res.ok) {
      const err = await res.text()
      log(`Failed to fetch staff: ${err}`)
      return { pushed: 0, skipped: 0, error: `API error: ${res.status}` }
    }

    const etag = res.headers.get('etag')
    if (etag) lastStaffEtag = etag

    const { staff } = await res.json()
    if (!staff || staff.length === 0) {
      log('No staff to sync')
      return { pushed: 0, skipped: 0 }
    }

    // Connect to device
    await device.connect()
    const deviceUsers = await device.getUsers()
    const deviceUserIds = new Set(deviceUsers.map((u) => String(u.userId || u.uid || '')))

    let pushed = 0
    let skipped = 0

    for (const s of staff) {
      const deviceId = String(s.deviceUserId).trim()
      if (deviceUserIds.has(deviceId)) {
        skipped++
        continue
      }

      try {
        const uid = parseInt(deviceId, 10) || (pushed + 1)
        const displayName = (s.firstName || s.name || '').slice(0, 24)
        await device.setUser(uid, deviceId, displayName)
        pushed++
        log(`Pushed: ${s.name} (device ID ${deviceId})`)
        activityLog.add(`Pushed staff to device: ${s.name}`)
      } catch (err) {
        log(`Failed to push ${s.name}: ${err.message}`)
      }
    }

    await device.disconnect()
    log(`Done — pushed ${pushed}, already on device ${skipped}`)
    return { pushed, skipped }
  } catch (err) {
    await device.disconnect()
    log(`Error: ${err.message}`)
    return { pushed: 0, skipped: 0, error: err.message }
  }
}

module.exports = { syncStaffToDevice }
