/**
 * index.js — main entry point for the Shift Close Agent.
 * Starts the dashboard server and the sync loops.
 * Can be run standalone (node src/index.js) or inside Electron.
 */

require('dotenv').config()

const { loadConfig } = require('./config')
const { syncStaffToDevice } = require('./staffSync')
const { syncAttendanceToCloud } = require('./attendanceSync')
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

async function runAttendanceSync() {
  const cfg = loadConfig()
  Object.assign(config, cfg)
  const result = await syncAttendanceToCloud(cfg, activityLog)
  status.lastAttendanceSync = new Date().toISOString()
  status.lastAttendanceSyncResult = result
}

// Start dashboard server
const app = createDashboardServer(config, activityLog, status)
const port = config.dashboardPort || 3001
app.listen(port, '127.0.0.1', () => {
  console.log(`[Agent] Dashboard running at http://localhost:${port}`)
  activityLog.add('Agent started')
})

// Run initial sync after a short delay (let server start first)
setTimeout(async () => {
  if (config.deviceIp && config.vercelUrl) {
    await runAttendanceSync()
    await runStaffSync()
  } else {
    console.log('[Agent] Not fully configured — open http://localhost:' + port + ' to set up')
  }
}, 3000)

// Schedule recurring syncs
const cfg = loadConfig()
setInterval(runAttendanceSync, cfg.attendanceSyncIntervalMs || 15 * 60 * 1000)
setInterval(runStaffSync, cfg.staffSyncIntervalMs || 5 * 60 * 1000)

// Export for Electron IPC
module.exports = { status, activityLog, config }
