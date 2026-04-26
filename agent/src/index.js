/**
 * index.js — main entry point for the Shift Close Agent.
 * Starts the dashboard server and periodic staff→device sync only.
 * Attendance punches are uploaded to Vercel only via the dashboard (manual selection).
 */

require('dotenv').config()

let httpServer = null
let staffInterval = null
let initialSyncTimeout = null
let devicePingInterval = null
let devicePingInitialTimeout = null

function start() {
  const { loadConfig, saveConfig } = require('./config')
  const { syncStaffToDevice } = require('./staffSync')
  const { createDashboardServer } = require('./dashboard/server')
  const { discoverDeviceIp } = require('./deviceDiscovery')
  const ActivityLog = require('./activityLog')
  const DeviceClient = require('./deviceClient')

  const config = loadConfig()
  const activityLog = new ActivityLog()

  const status = {
    deviceStatus: 'unknown',
    lastDevicePingAt: null,
    lastDevicePingError: null,
    devicePingFailCount: 0,
    isDiscoveringDevice: false,
    lastStaffSync: null,
    lastAttendanceSync: null,
    lastStaffSyncResult: null,
    lastAttendanceSyncResult: null
  }

  let discoverPromise = null

  async function runDeviceDiscovery(trigger = 'manual') {
    if (discoverPromise) return discoverPromise
    discoverPromise = (async () => {
      const cfg = loadConfig()
      Object.assign(config, cfg)
      status.isDiscoveringDevice = true
      activityLog.add(trigger === 'manual' ? 'Device IP discovery started' : 'Auto device rediscovery started')
      try {
        const result = await discoverDeviceIp({
          port: cfg.devicePort,
          hintIp: cfg.deviceIp
        })
        if (result.ok && result.ip) {
          saveConfig({ deviceIp: result.ip })
          Object.assign(config, loadConfig())
          status.deviceStatus = 'connected'
          status.lastDevicePingAt = new Date().toISOString()
          status.lastDevicePingError = null
          status.devicePingFailCount = 0
          activityLog.add(`Device discovered at ${result.ip}`)
        } else {
          activityLog.add(`Device discovery found no reachable device (${result.scanned} hosts scanned)`)
        }
        return result
      } catch (err) {
        activityLog.add(`Device discovery failed: ${err.message}`)
        return { ok: false, error: err.message, found: [], scanned: 0, openPorts: 0 }
      } finally {
        status.isDiscoveringDevice = false
        discoverPromise = null
      }
    })()
    return discoverPromise
  }

  async function runDevicePing() {
    const cfg = loadConfig()
    Object.assign(config, cfg)
    status.lastDevicePingAt = new Date().toISOString()
    if (!cfg.deviceIp) {
      status.deviceStatus = 'unknown'
      status.lastDevicePingError = null
      status.devicePingFailCount = 0
      return
    }
    const device = new DeviceClient(cfg.deviceIp, cfg.devicePort)
    const result = await device.testConnection()
    status.deviceStatus = result.ok ? 'connected' : 'error'
    status.lastDevicePingError = result.ok ? null : String(result.error || 'Unreachable')
    if (result.ok) {
      status.devicePingFailCount = 0
      return
    }
    status.devicePingFailCount += 1
    // If DHCP changed IP (or network changed), try rediscovery after repeated failures.
    if (status.devicePingFailCount >= 2 && !status.isDiscoveringDevice) {
      runDeviceDiscovery('auto').catch((err) => {
        console.error('[Agent] Auto device discovery error:', err)
      })
    }
  }

  async function runStaffSync() {
    const cfg = loadConfig()
    Object.assign(config, cfg)
    const result = await syncStaffToDevice(cfg, activityLog)
    status.lastStaffSync = new Date().toISOString()
    status.lastStaffSyncResult = result
  }

  const app = createDashboardServer(config, activityLog, status, {
    discoverDeviceIp: () => runDeviceDiscovery('manual')
  })
  const port = config.dashboardPort || 3001
  httpServer = app.listen(port, '127.0.0.1', () => {
    console.log(`[Agent] Dashboard running at http://127.0.0.1:${port}`)
    activityLog.add('Agent started')
  })
  httpServer.on('error', (err) => {
    console.error('[Agent] Dashboard listen error:', err)
  })

  const pingMs = Math.max(60_000, loadConfig().devicePingIntervalMs || 5 * 60 * 1000)
  devicePingInitialTimeout = setTimeout(() => {
    devicePingInitialTimeout = null
    runDevicePing().catch((err) => {
      console.error('[Agent] Device ping error:', err)
      status.deviceStatus = 'error'
      status.lastDevicePingError = err.message || String(err)
    })
  }, 15_000)

  devicePingInterval = setInterval(() => {
    runDevicePing().catch((err) => {
      console.error('[Agent] Device ping error:', err)
      status.deviceStatus = 'error'
      status.lastDevicePingError = err.message || String(err)
    })
  }, pingMs)

  initialSyncTimeout = setTimeout(async () => {
    initialSyncTimeout = null
    const cfg = loadConfig()
    if (cfg.deviceIp && cfg.vercelUrl && cfg.agentSecret) {
      await runStaffSync()
    } else {
      console.log('[Agent] Not fully configured — open http://127.0.0.1:' + port + ' to set up')
    }
  }, 3000)

  const cfg = loadConfig()
  staffInterval = setInterval(runStaffSync, cfg.staffSyncIntervalMs || 5 * 60 * 1000)
}

function stop() {
  if (devicePingInitialTimeout) {
    clearTimeout(devicePingInitialTimeout)
    devicePingInitialTimeout = null
  }
  if (devicePingInterval) {
    clearInterval(devicePingInterval)
    devicePingInterval = null
  }
  if (initialSyncTimeout) {
    clearTimeout(initialSyncTimeout)
    initialSyncTimeout = null
  }
  if (staffInterval) {
    clearInterval(staffInterval)
    staffInterval = null
  }
  if (httpServer) {
    httpServer.close()
    httpServer = null
  }
}

if (require.main === module) {
  start()
}

module.exports = { start, stop }
