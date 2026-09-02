/**
 * agentState.js — persistent pause flag when Cstore login fails or admin pauses jobs.
 */

const fs = require('fs')
const path = require('path')

const CONFIG_DIR = process.env.HARVEST_CONFIG_DIR || process.cwd()
const STATE_FILE = path.join(CONFIG_DIR, 'agent-state.json')

const DEFAULT_STATE = {
  paused: false,
  pauseReason: null,
  pausedAt: null,
  message: null
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    return {
      ...DEFAULT_STATE,
      ...raw,
      paused: Boolean(raw.paused)
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function writeState(updates) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  const next = { ...readState(), ...updates }
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function isPaused() {
  return readState().paused === true
}

function getPauseInfo() {
  const s = readState()
  if (!s.paused) return null
  return {
    reason: s.pauseReason || 'paused',
    message: s.message || s.pauseReason || 'Agent is paused',
    pausedAt: s.pausedAt
  }
}

function pauseAgent(reason, message) {
  const state = writeState({
    paused: true,
    pauseReason: reason || 'paused',
    pausedAt: new Date().toISOString(),
    message: message || reason || 'Agent paused'
  })
  console.warn(`[Harvest] PAUSED: ${state.message}`)
  return state
}

function resumeAgent() {
  const state = writeState({
    paused: false,
    pauseReason: null,
    pausedAt: null,
    message: null
  })
  console.log('[Harvest] Resumed — jobs will run again')
  return state
}

function assertNotPaused() {
  if (!isPaused()) return true
  const info = getPauseInfo()
  throw new Error(info?.message || 'Harvest agent is paused')
}

module.exports = {
  STATE_FILE,
  readState,
  writeState,
  isPaused,
  getPauseInfo,
  pauseAgent,
  resumeAgent,
  assertNotPaused
}
