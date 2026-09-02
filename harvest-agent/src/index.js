/**
 * index.js — harvest agent entry.
 * Pings Shift Close, refreshes the Cstore session at 7am/7pm St. Lucia, records pass/fail.
 */

require('dotenv').config()

const { loadConfig } = require('./config')
const { runCstoreKeepalive } = require('./cstoreKeepalive')
const { sendHeartbeat, sendTask } = require('./shiftCloseClient')
const { startSlotWatcher } = require('./schedule')

const once = process.argv.includes('--once')
let running = false

async function runKeepaliveCycle(reason) {
  if (running) {
    console.log(`[Harvest] Skip ${reason} — a job is already running`)
    return
  }
  running = true
  const config = loadConfig()
  const startedAt = new Date()
  console.log(`[Harvest] Starting cstore_keepalive (${reason})`)

  try {
    await sendHeartbeat(config)
  } catch (err) {
    console.error('[Harvest] Heartbeat failed:', err.message)
  }

  let result
  try {
    result = await runCstoreKeepalive(config)
  } catch (err) {
    result = {
      ok: false,
      loginRequired: false,
      message: err.message || String(err)
    }
  }

  const finishedAt = new Date()
  const status = result.ok ? 'pass' : 'fail'
  console.log(`[Harvest] cstore_keepalive ${status}: ${result.message}`)

  try {
    await sendTask(config, {
      taskKey: 'cstore_keepalive',
      status,
      message: result.message,
      details: {
        reason,
        url: result.url || null,
        loginRequired: Boolean(result.loginRequired)
      },
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      cstoreSessionOk: result.ok
    })
  } catch (err) {
    console.error('[Harvest] Failed to record task:', err.message)
    try {
      await sendHeartbeat(config, { cstoreSessionOk: result.ok })
    } catch (hbErr) {
      console.error('[Harvest] Follow-up heartbeat failed:', hbErr.message)
    }
  } finally {
    running = false
  }
}

async function main() {
  const config = loadConfig()
  console.log(
    `[Harvest] agentKey=${config.agentKey} vercelUrl=${config.vercelUrl || '(not set)'} slots=${config.slotHours.join(',')} ${config.timeZone}`
  )

  if (!config.vercelUrl || !config.agentSecret) {
    console.warn(
      '[Harvest] Copy config.example.json to harvest-agent.config.json and set vercelUrl + agentSecret'
    )
  }

  if (once) {
    await runKeepaliveCycle('once')
    return
  }

  if (config.runOnStart) {
    await runKeepaliveCycle('startup')
  }

  startSlotWatcher({
    timeZone: config.timeZone,
    slotHours: config.slotHours,
    onSlot: (key) => runKeepaliveCycle(`slot:${key}`)
  })
  console.log('[Harvest] Waiting for 07:00 and 19:00 keep-alives. Ctrl+C to stop.')
}

main().catch((err) => {
  console.error('[Harvest] Fatal:', err)
  process.exit(1)
})
