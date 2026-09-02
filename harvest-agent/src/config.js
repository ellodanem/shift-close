/**
 * config.js — harvest agent settings from harvest-agent.config.json and env.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const CONFIG_DIR = process.env.HARVEST_CONFIG_DIR || process.cwd()
const CONFIG_FILE = path.join(CONFIG_DIR, 'harvest-agent.config.json')

const DEFAULTS = {
  agentKey: os.hostname() || 'harvest-1',
  vercelUrl: '',
  agentSecret: '',
  cstoreUrl:
    'https://secure.cstorepro.com/EmagineNETCOSM/Content/Tasks/TaskDashboard.aspx',
  headed: true,
  runOnStart: true,
  slotHours: [7, 19],
  timeZone: 'America/St_Lucia',
  loginWaitMs: 5 * 60 * 1000,
  userDataDir: path.join(CONFIG_DIR, 'user-data')
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
    agentSecret:
      process.env.HARVEST_AGENT_SECRET ||
      process.env.AGENT_SECRET ||
      fileConfig.agentSecret ||
      DEFAULTS.agentSecret,
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
    runOnStart:
      fileConfig.runOnStart !== undefined
        ? Boolean(fileConfig.runOnStart)
        : DEFAULTS.runOnStart,
    slotHours: slotHours.length ? slotHours : DEFAULTS.slotHours,
    timeZone: process.env.HARVEST_TZ || fileConfig.timeZone || DEFAULTS.timeZone,
    loginWaitMs: Number(fileConfig.loginWaitMs) || DEFAULTS.loginWaitMs,
    userDataDir: fileConfig.userDataDir
      ? path.resolve(CONFIG_DIR, fileConfig.userDataDir)
      : DEFAULTS.userDataDir
  }
}

module.exports = { loadConfig, CONFIG_FILE }
