/**
 * config.js — harvest agent settings from harvest-agent.config.json and env.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  getStoredSecret,
  migratePlaintextFromConfig,
  hasStoredSecret
} = require('./secrets')

const CONFIG_DIR = process.env.HARVEST_CONFIG_DIR || process.cwd()
const CONFIG_FILE = path.join(CONFIG_DIR, 'harvest-agent.config.json')

const DEFAULTS = {
  agentKey: os.hostname() || 'harvest-1',
  vercelUrl: '',
  agentSecret: '',
  cstoreUrl:
    'https://secure.cstorepro.com/EmagineNETCOSM/Content/Tasks/TaskDashboard.aspx',
  headed: true,
  browserChannel: 'chrome',
  runOnStart: true,
  slotHours: [7, 19],
  timeZone: 'America/St_Lucia',
  loginWaitMs: 10 * 60 * 1000,
  dashboardPort: 3921,
  userDataDir: path.join(CONFIG_DIR, 'user-data'),
  /** Job schedule: frequency off|daily|weekly|monthly (off until set in dashboard). */
  customerAccountsSchedule: {
    frequency: 'off',
    enabled: false,
    hour: 8,
    minute: 0,
    daysOfWeek: [2],
    dayOfMonth: 2,
    monthScope: 'previous',
    all: true
  },
  vendorInvoicesSchedule: {
    frequency: 'off',
    enabled: false,
    hour: 9,
    minute: 0,
    daysOfWeek: [2],
    dayOfMonth: 2,
    monthScope: 'previous',
    all: true
  }
}

function normalizeJobSchedule(raw, defaults) {
  const src = raw && typeof raw === 'object' ? raw : {}
  let frequency = String(src.frequency || '').toLowerCase()
  if (!['off', 'daily', 'weekly', 'monthly'].includes(frequency)) {
    frequency = src.enabled ? 'monthly' : 'off'
  }
  const hour = Number(src.hour)
  const minute = Number(src.minute)
  const day = Number(src.dayOfMonth)
  let scope = src.monthScope || defaults.monthScope
  if (scope !== 'current' && scope !== 'previous') {
    scope = frequency === 'monthly' ? 'previous' : 'current'
  }
  const daysOfWeek = Array.isArray(src.daysOfWeek)
    ? [...new Set(src.daysOfWeek.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b)
    : defaults.daysOfWeek

  return {
    frequency,
    enabled: frequency !== 'off',
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.trunc(hour))) : defaults.hour,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, Math.trunc(minute))) : defaults.minute,
    daysOfWeek: daysOfWeek.length ? daysOfWeek : defaults.daysOfWeek,
    dayOfMonth: Number.isFinite(day) ? Math.min(28, Math.max(1, Math.trunc(day))) : defaults.dayOfMonth,
    monthScope: scope === 'current' ? 'current' : 'previous',
    all: src.all !== undefined ? Boolean(src.all) : defaults.all
  }
}

/** @deprecated */
function normalizeMonthlySchedule(raw, defaults) {
  return normalizeJobSchedule(raw, defaults)
}

function loadConfig() {
  let fileConfig = {}
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    } catch {
      console.warn('[Config] Could not parse harvest-agent.config.json, using defaults')
    }
  }

  const slotHours = Array.isArray(fileConfig.slotHours)
    ? fileConfig.slotHours.map((n) => Number(n)).filter((n) => n >= 0 && n <= 23)
    : DEFAULTS.slotHours

  const plaintextSecret = fileConfig.agentSecret || ''
  if (plaintextSecret) {
    migratePlaintextFromConfig(plaintextSecret)
  }

  const storedSecret = getStoredSecret()
  const agentSecret =
    process.env.HARVEST_AGENT_SECRET ||
    process.env.AGENT_SECRET ||
    storedSecret ||
    plaintextSecret ||
    DEFAULTS.agentSecret

  return {
    ...DEFAULTS,
    ...fileConfig,
    agentKey:
      process.env.HARVEST_AGENT_KEY ||
      fileConfig.agentKey ||
      DEFAULTS.agentKey,
    vercelUrl: (
      process.env.VERCEL_URL ||
      fileConfig.vercelUrl ||
      DEFAULTS.vercelUrl
    ).replace(/\/$/, ''),
    agentSecret,
    cstoreUrl:
      process.env.CSTORE_URL || fileConfig.cstoreUrl || DEFAULTS.cstoreUrl,
    headed:
      process.env.CSTORE_HEADED === '0'
        ? false
        : process.env.CSTORE_HEADED === '1'
          ? true
          : fileConfig.headed !== undefined
            ? Boolean(fileConfig.headed)
            : DEFAULTS.headed,
    browserChannel:
      process.env.CSTORE_BROWSER ||
      fileConfig.browserChannel ||
      DEFAULTS.browserChannel,
    runOnStart:
      fileConfig.runOnStart !== undefined
        ? Boolean(fileConfig.runOnStart)
        : DEFAULTS.runOnStart,
    slotHours: slotHours.length ? slotHours : DEFAULTS.slotHours,
    timeZone: process.env.HARVEST_TZ || fileConfig.timeZone || DEFAULTS.timeZone,
    loginWaitMs: Number(fileConfig.loginWaitMs) || DEFAULTS.loginWaitMs,
    dashboardPort: Number(fileConfig.dashboardPort) || DEFAULTS.dashboardPort,
    userDataDir: fileConfig.userDataDir
      ? path.resolve(CONFIG_DIR, fileConfig.userDataDir)
      : DEFAULTS.userDataDir,
    customerAccountsSchedule: normalizeJobSchedule(
      fileConfig.customerAccountsSchedule,
      DEFAULTS.customerAccountsSchedule
    ),
    vendorInvoicesSchedule: normalizeJobSchedule(
      fileConfig.vendorInvoicesSchedule,
      DEFAULTS.vendorInvoicesSchedule
    ),
    agentSecretSet: Boolean(agentSecret) || hasStoredSecret()
  }
}

function saveConfig(updates) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  let existing = {}
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    } catch {}
  }
  const merged = { ...existing, ...updates }
  if ('agentSecret' in merged) {
    delete merged.agentSecret
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

module.exports = {
  loadConfig,
  saveConfig,
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULTS,
  normalizeJobSchedule,
  normalizeMonthlySchedule
}
