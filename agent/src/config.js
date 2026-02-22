/**
 * config.js — loads and saves agent configuration.
 * Config is stored in agent.config.json alongside the app,
 * or falls back to environment variables / defaults.
 */

const fs = require('fs')
const path = require('path')

const CONFIG_FILE = path.join(process.cwd(), 'agent.config.json')

const DEFAULTS = {
  deviceIp: '',
  devicePort: 4370,
  vercelUrl: '',
  agentSecret: '',
  staffSyncIntervalMs: 5 * 60 * 1000,      // 5 minutes
  attendanceSyncIntervalMs: 15 * 60 * 1000, // 15 minutes
  dashboardPort: 3001
}

function loadConfig() {
  let fileConfig = {}
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    } catch {
      console.warn('[Config] Could not parse config file, using defaults')
    }
  }

  return {
    ...DEFAULTS,
    ...fileConfig,
    // Environment variables override file config
    deviceIp: process.env.ZK_DEVICE_IP || fileConfig.deviceIp || DEFAULTS.deviceIp,
    devicePort: parseInt(process.env.ZK_DEVICE_PORT || fileConfig.devicePort || DEFAULTS.devicePort, 10),
    vercelUrl: process.env.VERCEL_URL || fileConfig.vercelUrl || DEFAULTS.vercelUrl,
    agentSecret: process.env.AGENT_SECRET || fileConfig.agentSecret || DEFAULTS.agentSecret
  }
}

function saveConfig(updates) {
  let existing = {}
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    } catch {}
  }
  const merged = { ...existing, ...updates }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

module.exports = { loadConfig, saveConfig }
