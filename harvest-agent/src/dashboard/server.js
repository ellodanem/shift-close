/**
 * dashboard/server.js — local harvest agent dashboard at http://127.0.0.1:3921
 */

const express = require('express')
const path = require('path')
const { loadConfig, saveConfig } = require('../config')
const { hasStoredSecret, setStoredSecret, clearStoredSecret } = require('../secrets')
const { isPaused, getPauseInfo, resumeAgent } = require('../agentState')

function createDashboardServer(config, activityLog, status, actions = {}) {
  const app = express()
  app.use(express.json())
  app.use(express.static(path.join(__dirname, 'public')))

  app.get('/api/status', (req, res) => {
    const cfg = loadConfig()
    const pause = getPauseInfo()
    res.json({
      agentKey: cfg.agentKey,
      vercelUrl: cfg.vercelUrl,
      cstoreUrl: cfg.cstoreUrl,
      configured: !!(cfg.vercelUrl && cfg.agentSecret),
      agentSecretSet: hasStoredSecret() || !!cfg.agentSecret,
      paused: isPaused(),
      pauseReason: pause?.reason || null,
      pauseMessage: pause?.message || null,
      pausedAt: pause?.pausedAt || null,
      cstoreSessionOk: status.cstoreSessionOk,
      cstoreSessionAt: status.cstoreSessionAt,
      lastJobKey: status.lastJobKey,
      lastJobStatus: status.lastJobStatus,
      lastJobMessage: status.lastJobMessage,
      lastJobAt: status.lastJobAt,
      lastHeartbeatAt: status.lastHeartbeatAt,
      lastHeartbeatError: status.lastHeartbeatError,
      jobRunning: status.jobRunning === true,
      nextSlotLabel: status.nextSlotLabel || null,
      recentTasks: (status.recentTasks || []).slice(0, 10),
      activity: activityLog.getAll().slice(0, 25),
      uptime: Math.floor(process.uptime() / 60) + ' min',
      dashboardPort: cfg.dashboardPort || 3921
    })
  })

  app.get('/api/config', (req, res) => {
    const cfg = loadConfig()
    res.json({
      agentKey: cfg.agentKey,
      vercelUrl: cfg.vercelUrl,
      cstoreUrl: cfg.cstoreUrl,
      headed: cfg.headed,
      browserChannel: cfg.browserChannel,
      runOnStart: cfg.runOnStart,
      slotHours: cfg.slotHours,
      timeZone: cfg.timeZone,
      dashboardPort: cfg.dashboardPort,
      agentSecretSet: hasStoredSecret() || !!cfg.agentSecret
    })
  })

  app.post('/api/config', (req, res) => {
    const body = req.body || {}
    const updates = {}
    if (body.agentKey !== undefined) updates.agentKey = String(body.agentKey).trim()
    if (body.vercelUrl !== undefined) {
      updates.vercelUrl = String(body.vercelUrl).trim().replace(/\/$/, '')
    }
    if (body.cstoreUrl !== undefined) updates.cstoreUrl = String(body.cstoreUrl).trim()
    if (body.headed !== undefined) updates.headed = Boolean(body.headed)
    if (body.browserChannel !== undefined) {
      updates.browserChannel = String(body.browserChannel).trim()
    }
    if (body.runOnStart !== undefined) updates.runOnStart = Boolean(body.runOnStart)
    if (body.timeZone !== undefined) updates.timeZone = String(body.timeZone).trim()
    if (body.dashboardPort !== undefined) {
      const p = parseInt(body.dashboardPort, 10)
      if (!Number.isNaN(p) && p > 0 && p < 65536) updates.dashboardPort = p
    }
    if (Array.isArray(body.slotHours)) {
      updates.slotHours = body.slotHours.map((n) => Number(n)).filter((n) => n >= 0 && n <= 23)
    }

    saveConfig(updates)
    Object.assign(config, loadConfig())
    activityLog.add('Settings saved')
    res.json({ ok: true })
  })

  app.post('/api/secret', (req, res) => {
    const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : ''
    if (!secret) {
      return res.status(400).json({ ok: false, error: 'Secret is required' })
    }
    if (hasStoredSecret()) {
      return res.status(409).json({
        ok: false,
        error: 'Secret is already configured. Remove it first to set a new one.'
      })
    }
    try {
      setStoredSecret(secret)
      Object.assign(config, loadConfig())
      activityLog.add('Harvest secret saved (encrypted locally)')
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.delete('/api/secret', (req, res) => {
    clearStoredSecret()
    Object.assign(config, loadConfig())
    activityLog.add('Harvest secret removed')
    res.json({ ok: true })
  })

  app.post('/api/resume', (req, res) => {
    if (!isPaused()) {
      return res.json({ ok: true, message: 'Agent was not paused' })
    }
    resumeAgent()
    activityLog.add('Agent resumed — scheduled jobs will run again')
    if (typeof actions.onResume === 'function') {
      actions.onResume()
    }
    res.json({ ok: true })
  })

  app.post('/api/test-shift-close', async (req, res) => {
    const cfg = loadConfig()
    if (!cfg.vercelUrl || !cfg.agentSecret) {
      return res.status(400).json({
        ok: false,
        error: 'Set Shift Close URL and harvest secret first'
      })
    }
    try {
      const { sendHeartbeat } = require('../shiftCloseClient')
      await sendHeartbeat(cfg, { test: true })
      activityLog.add('Shift Close connection test OK')
      res.json({ ok: true, message: 'Connected — harvest secret is valid' })
    } catch (err) {
      activityLog.add(`Shift Close connection test failed: ${err.message}`)
      res.status(502).json({ ok: false, error: err.message || String(err) })
    }
  })

  app.post('/api/run-cstore-sign-in', async (req, res) => {
    if (!actions.runCstoreSignIn) {
      return res.status(501).json({ ok: false, error: 'Not available' })
    }
    if (status.jobRunning === true) {
      return res.status(409).json({ ok: false, error: 'Another job is already running' })
    }
    activityLog.add('Manual Cstore sign-in triggered')
    actions.runCstoreSignIn('manual-dashboard').catch((err) => {
      activityLog.add(`Cstore sign-in error: ${err.message}`)
    })
    res.json({ ok: true, started: true })
  })

  app.post('/api/run-keepalive', async (req, res) => {
    if (!actions.runKeepalive) {
      return res.status(501).json({ ok: false, error: 'Not available' })
    }
    if (isPaused()) {
      return res.status(423).json({ ok: false, error: getPauseInfo()?.message || 'Agent is paused' })
    }
    activityLog.add('Manual keep-alive triggered')
    actions.runKeepalive('manual-dashboard').catch((err) => {
      activityLog.add(`Keep-alive error: ${err.message}`)
    })
    res.json({ ok: true, started: true })
  })

  app.post('/api/run-customer-accounts', async (req, res) => {
    if (!actions.runCustomerAccounts) {
      return res.status(501).json({ ok: false, error: 'Not available' })
    }
    if (isPaused()) {
      return res.status(423).json({ ok: false, error: getPauseInfo()?.message || 'Agent is paused' })
    }
    const month = typeof req.body?.month === 'string' ? req.body.month : null
    activityLog.add(
      month ? `Manual customer accounts triggered (${month})` : 'Manual customer accounts triggered'
    )
    actions.runCustomerAccounts('manual-dashboard', { month }).catch((err) => {
      activityLog.add(`Customer accounts error: ${err.message}`)
    })
    res.json({ ok: true, started: true })
  })

  app.post('/api/run-vendor-invoices', async (req, res) => {
    if (!actions.runVendorInvoices) {
      return res.status(501).json({ ok: false, error: 'Not available' })
    }
    if (isPaused()) {
      return res.status(423).json({ ok: false, error: getPauseInfo()?.message || 'Agent is paused' })
    }
    const month = typeof req.body?.month === 'string' ? req.body.month : null
    const vendor = typeof req.body?.vendor === 'string' ? req.body.vendor.trim() : ''
    activityLog.add(
      month || vendor
        ? `Manual vendor invoices triggered (${[month, vendor].filter(Boolean).join(' ')})`
        : 'Manual vendor invoices triggered'
    )
    actions
      .runVendorInvoices('manual-dashboard', {
        month,
        vendor,
        all: !vendor
      })
      .catch((err) => {
        activityLog.add(`Vendor invoices error: ${err.message}`)
      })
    res.json({ ok: true, started: true })
  })

  return app
}

module.exports = { createDashboardServer }
