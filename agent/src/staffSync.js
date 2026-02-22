/**
 * staffSync.js — polls Vercel API for staff, pushes any to ZKTeco device.
 * Runs every 5 minutes. Only pushes staff who have a deviceUserId assigned.
 */

const DeviceClient = require('./deviceClient')

const log = (msg) => console.log(`[StaffSync] ${new Date().toISOString()} ${msg}`)

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
    // Fetch staff from app
    const res = await fetch(`${config.vercelUrl}/api/attendance/device/pending-staff`, {
      headers: { 'x-agent-secret': config.agentSecret }
    })

    if (!res.ok) {
      const err = await res.text()
      log(`Failed to fetch staff: ${err}`)
      return { pushed: 0, skipped: 0, error: `API error: ${res.status}` }
    }

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
