/**
 * dashboard/server.js — Express server for the local agent dashboard.
 * Opens in browser at http://localhost:3001
 */

const express = require('express')
const path = require('path')
const { loadConfig, saveConfig } = require('../config')
const { syncStaffToDevice } = require('../staffSync')
const { fetchPunchesFromDevice, pushPunchesToCloud } = require('../attendanceSync')
const DeviceClient = require('../deviceClient')

function createDashboardServer(config, activityLog, status, actions = {}) {
  const app = express()
  app.use(express.json())
  app.use(express.static(path.join(__dirname, 'public')))

  // GET /api/status — dashboard polls this
  app.get('/api/status', (req, res) => {
    res.json({
      deviceIp: config.deviceIp,
      vercelUrl: config.vercelUrl,
      configured: !!(config.deviceIp && config.vercelUrl && config.agentSecret),
      lastStaffSync: status.lastStaffSync,
      lastAttendanceSync: status.lastAttendanceSync,
      lastStaffSyncResult: status.lastStaffSyncResult,
      lastAttendanceSyncResult: status.lastAttendanceSyncResult,
      deviceStatus: status.deviceStatus,
      lastDevicePingAt: status.lastDevicePingAt,
      lastDevicePingError: status.lastDevicePingError,
      isDiscoveringDevice: status.isDiscoveringDevice === true,
      activity: activityLog.getAll().slice(0, 20),
      uptime: Math.floor(process.uptime() / 60) + ' min'
    })
  })

  // GET /api/config
  app.get('/api/config', (req, res) => {
    const cfg = loadConfig()
    // Don't expose secret in full — show masked version
    res.json({
      deviceIp: cfg.deviceIp,
      devicePort: cfg.devicePort,
      vercelUrl: cfg.vercelUrl,
      agentSecretSet: !!cfg.agentSecret
    })
  })

  // POST /api/config — save settings
  app.post('/api/config', (req, res) => {
    const { deviceIp, devicePort, vercelUrl, agentSecret } = req.body
    const updates = {}
    if (deviceIp !== undefined) updates.deviceIp = deviceIp
    if (devicePort !== undefined) updates.devicePort = parseInt(devicePort, 10) || 4370
    if (vercelUrl !== undefined) updates.vercelUrl = vercelUrl.replace(/\/$/, '')
    if (agentSecret !== undefined && agentSecret !== '***') updates.agentSecret = agentSecret

    // Update live config object
    Object.assign(config, loadConfig(), updates)
    saveConfig(updates)

    activityLog.add('Settings updated')
    res.json({ ok: true })
  })

  // POST /api/test-device — test ZKTeco connection
  app.post('/api/test-device', async (req, res) => {
    const cfg = loadConfig()
    if (!cfg.deviceIp) return res.json({ ok: false, error: 'Device IP not set' })
    const device = new DeviceClient(cfg.deviceIp, cfg.devicePort)
    const result = await device.testConnection()
    status.deviceStatus = result.ok ? 'connected' : 'error'
    status.lastDevicePingAt = new Date().toISOString()
    status.lastDevicePingError = result.ok ? null : String(result.error || '')
    activityLog.add(result.ok ? `Device test OK (${cfg.deviceIp})` : `Device test failed: ${result.error}`)
    res.json(result)
  })

  // POST /api/find-device — scan local subnet(s) for a reachable ZKTeco terminal
  app.post('/api/find-device', async (req, res) => {
    if (!actions.discoverDeviceIp) {
      return res.json({ ok: false, error: 'Device discovery not available' })
    }
    const result = await actions.discoverDeviceIp()
    res.json(result)
  })

  // GET /api/device-punches — load punches from device for manual selection (limit query, default 2000)
  app.get('/api/device-punches', async (req, res) => {
    const cfg = loadConfig()
    const limit = parseInt(req.query.limit, 10) || 2000
    const result = await fetchPunchesFromDevice(cfg, limit)
    res.json(result)
  })

  // POST /api/push-punches — upload selected punches to Vercel (body: { logs: [...] })
  app.post('/api/push-punches', async (req, res) => {
    const cfg = loadConfig()
    const logs = req.body && Array.isArray(req.body.logs) ? req.body.logs : []
    activityLog.add(`Manual punch upload (${logs.length} selected)`)
    const result = await pushPunchesToCloud(cfg, logs, activityLog)
    status.lastAttendanceSync = new Date().toISOString()
    status.lastAttendanceSyncResult = result
    res.json(result)
  })

  // POST /api/sync-staff — manual trigger
  app.post('/api/sync-staff', async (req, res) => {
    const cfg = loadConfig()
    activityLog.add('Manual staff sync triggered')
    const result = await syncStaffToDevice(cfg, activityLog)
    status.lastStaffSync = new Date().toISOString()
    status.lastStaffSyncResult = result
    res.json(result)
  })

  // GET /api/device-users — pull users from device for mapping UI
  app.get('/api/device-users', async (req, res) => {
    const cfg = loadConfig()
    if (!cfg.deviceIp) return res.json({ ok: false, error: 'Device IP not set', users: [] })
    const device = new DeviceClient(cfg.deviceIp, cfg.devicePort)
    try {
      await device.connect()
      const users = await device.getUsers()
      await device.disconnect()
      res.json({ ok: true, users })
    } catch (err) {
      await device.disconnect()
      res.json({ ok: false, error: err.message, users: [] })
    }
  })

  return app
}

module.exports = { createDashboardServer }
