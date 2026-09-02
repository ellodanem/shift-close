/**
 * index.js — harvest agent entry.
 * Default: Cstore keep-alive at 7am/7pm St. Lucia.
 * One-shot: node src/index.js --once --task=customer_accounts
 */

require('dotenv').config()

const { loadConfig } = require('./config')
const { runCstoreKeepalive } = require('./cstoreKeepalive')
const { runFirstCustomerCreditReport } = require('./customerAccounts')
const { sendHeartbeat, sendTask, sendCustomerCreditImport } = require('./shiftCloseClient')
const { startSlotWatcher } = require('./schedule')

const once = process.argv.includes('--once')
const taskArg = process.argv.find((a) => a.startsWith('--task='))
const taskName = taskArg ? taskArg.slice('--task='.length) : 'cstore_keepalive'
let running = false

async function recordJob(config, taskKey, startedAt, result, extraDetails = {}) {
  const finishedAt = new Date()
  const status = result.ok ? 'pass' : 'fail'
  console.log(`[Harvest] ${taskKey} ${status}: ${result.message}`)
  try {
    await sendTask(config, {
      taskKey,
      status,
      message: result.message,
      details: {
        url: result.url || null,
        loginRequired: Boolean(result.loginRequired),
        account: result.account || null,
        ...extraDetails
      },
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      cstoreSessionOk: result.ok || result.loginRequired === false
    })
  } catch (err) {
    console.error('[Harvest] Failed to record task:', err.message)
    try {
      await sendHeartbeat(config, { cstoreSessionOk: Boolean(result.ok) })
    } catch (hbErr) {
      console.error('[Harvest] Follow-up heartbeat failed:', hbErr.message)
    }
  }
}

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
    result = { ok: false, loginRequired: false, message: err.message || String(err) }
  }

  await recordJob(config, 'cstore_keepalive', startedAt, result, { reason })
  running = false
}

async function runCustomerAccountsCycle(reason) {
  if (running) {
    console.log(`[Harvest] Skip ${reason} — a job is already running`)
    return
  }
  running = true
  const config = loadConfig()
  const startedAt = new Date()
  console.log(`[Harvest] Starting customer_accounts (${reason})`)

  try {
    await sendHeartbeat(config)
  } catch (err) {
    console.error('[Harvest] Heartbeat failed:', err.message)
  }

  let result
  try {
    result = await runFirstCustomerCreditReport(config)
  } catch (err) {
    result = { ok: false, loginRequired: false, message: err.message || String(err) }
  }

  let extra = { reason }
  if (result.ok && result.html) {
    try {
      const imported = await sendCustomerCreditImport(config, {
        account: result.account,
        year: result.year,
        month: result.month,
        html: result.html,
        updateSnapshot: true
      })
      extra = {
        reason,
        imported: imported.imported,
        empty: imported.empty,
        opening: imported.opening,
        totals: imported.totals || null
      }
      result = {
        ...result,
        ok: true,
        message: imported.empty
          ? `${result.account}: no activity this month (opening ${imported.opening})`
          : `${result.account}: imported ${imported.imported} line(s)`
      }
    } catch (err) {
      result = {
        ...result,
        ok: false,
        message: `Cstore report captured but Shift Close import failed: ${err.message}`
      }
    }
  }

  await recordJob(config, 'customer_accounts', startedAt, result, extra)
  running = false
  return result
}

async function main() {
  const config = loadConfig()
  console.log(
    `[Harvest] agentKey=${config.agentKey} vercelUrl=${config.vercelUrl || '(not set)'} task=${taskName} slots=${config.slotHours.join(',')} ${config.timeZone}`
  )

  if (!config.vercelUrl || !config.agentSecret) {
    console.warn(
      '[Harvest] Copy config.example.json to harvest-agent.config.json and set vercelUrl + agentSecret'
    )
  }

  if (taskName === 'customer_accounts') {
    const result = await runCustomerAccountsCycle(once ? 'once' : 'manual')
    if (once) {
      process.exit(result?.ok ? 0 : 1)
    }
    return
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
