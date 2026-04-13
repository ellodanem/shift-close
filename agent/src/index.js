/**
 * index.js — main entry point for the Shift Close Agent.
 * Starts the dashboard server and periodic staff→device sync only.
 * Attendance punches are uploaded to Vercel only via the dashboard (manual selection).
 */

require('dotenv').config()

let httpServer = null
let staffInterval = null
let initialSyncTimeout = null

function start() {
  const { loadConfig } = require('./config')
  const { syncStaffToDevice } = require('./staffSync')
  const { createDashboardServer } = require('./dashboard/server')
  const ActivityLog = require('./activityLog')

  const config = loadConfig()
  const activityLog = new ActivityLog()

  const status = {
    deviceStatus: 'unknown',
    lastStaffSync: null,
    lastAttendanceSync: null,
    lastStaffSyncResult: null,
    lastAttendanceSyncResult: null
  }

  async function runStaffSync() {
    const cfg = loadConfig()
    Object.assign(config, cfg)
    const result = await syncStaffToDevice(cfg, activityLog)
    status.lastStaffSync = new Date().toISOString()
    status.lastStaffSyncResult = result
  }

  const app = createDashboardServer(config, activityLog, status)
  const port = config.dashboardPort || 3001
  httpServer = app.listen(port, '127.0.0.1', () => {
    console.log(`[Agent] Dashboard running at http://127.0.0.1:${port}`)
    activityLog.add('Agent started')
  })
  httpServer.on('error', (err) => {
    console.error('[Agent] Dashboard listen error:', err)
  })

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
