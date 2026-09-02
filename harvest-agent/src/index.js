/**
 * index.js — harvest agent entry.
 * Daemon: local dashboard + scheduled keep-alive at 7am/7pm St. Lucia.
 * One-shot: node src/index.js --once --task=customer_accounts
 *            node src/index.js --once --task=vendor_invoices --month=2026-08 --vendor=Acado
 */

require('dotenv').config()

const { loadConfig } = require('./config')
const { runCstoreKeepalive, runCstoreSignIn } = require('./cstoreKeepalive')
const { runFirstCustomerCreditReport } = require('./customerAccounts')
const { runVendorInvoices } = require('./vendorInvoices')
const { sendHeartbeat, sendTask, sendCustomerCreditImport, sendVendorInvoiceImport } = require('./shiftCloseClient')
const { startSlotWatcher, zonedParts } = require('./schedule')
const { isPaused, pauseAgent, getPauseInfo } = require('./agentState')
const { notifyCloudPaused } = require('./pauseNotify')
const ActivityLog = require('./activityLog')

const once = process.argv.includes('--once')
const noDashboard = process.argv.includes('--no-dashboard')
const taskArg = process.argv.find((a) => a.startsWith('--task='))
const taskName = taskArg ? taskArg.slice('--task='.length) : 'cstore_keepalive'
const monthArg = process.argv.find((a) => a.startsWith('--month='))
const monthKey = monthArg ? monthArg.slice('--month='.length) : null
const parsedMonth = monthKey && /^(\d{4})-(\d{2})$/.test(monthKey)
  ? { year: Number(monthKey.slice(0, 4)), month: Number(monthKey.slice(5, 7)) }
  : null
const customerArg = process.argv.find((a) => a.startsWith('--customer='))
const customerQuery = customerArg ? customerArg.slice('--customer='.length).trim() : ''
const vendorArg = process.argv.find((a) => a.startsWith('--vendor='))
const vendorQuery = vendorArg ? vendorArg.slice('--vendor='.length).trim() : ''
const fromArg = process.argv.find((a) => a.startsWith('--from='))
const fromQuery = fromArg ? fromArg.slice('--from='.length).trim() : ''
const harvestAll = process.argv.includes('--all')

let httpServer = null
let stopSlotWatcher = null
let running = false
let pauseNotified = false
let activityLog = null
let status = null

function nextSlotLabel(config) {
  const { hour } = zonedParts(config.timeZone)
  const hours = [...config.slotHours].sort((a, b) => a - b)
  const next = hours.find((h) => h > hour) ?? hours[0]
  return `Next slot ${String(next).padStart(2, '0')}:00`
}

function createLoginHooks(config) {
  return {
    onLoginFailure: async ({ reason, message }) => {
      if (isPaused() && pauseNotified) return
      pauseAgent(reason, message)
      pauseNotified = true
      if (activityLog) activityLog.add(`PAUSED: ${message}`)
      if (status) {
        status.paused = true
        status.cstoreSessionOk = false
        status.cstoreSessionAt = new Date().toISOString()
      }
      await notifyCloudPaused(config, { reason, message })
    }
  }
}

function pushRecentTask(taskKey, taskStatus, message) {
  if (!status) return
  status.recentTasks.unshift({
    at: new Date().toISOString(),
    key: taskKey,
    status: taskStatus,
    message: message || ''
  })
  status.recentTasks = status.recentTasks.slice(0, 20)
}

async function recordJob(config, taskKey, startedAt, result, extraDetails = {}) {
  const finishedAt = new Date()
  const taskStatus = result.ok ? 'pass' : 'fail'
  console.log(`[Harvest] ${taskKey} ${taskStatus}: ${result.message}`)

  if (status) {
    status.lastJobKey = taskKey
    status.lastJobStatus = taskStatus
    status.lastJobMessage = result.message
    status.lastJobAt = finishedAt.toISOString()
    if (typeof result.loginRequired === 'boolean' || result.ok) {
      status.cstoreSessionOk = result.ok || result.loginRequired === false
      status.cstoreSessionAt = finishedAt.toISOString()
    }
    pushRecentTask(taskKey, taskStatus, result.message)
  }
  if (activityLog) {
    activityLog.add(`${taskKey} ${taskStatus}: ${result.message}`)
  }

  try {
    await sendTask(config, {
      taskKey,
      status: taskStatus,
      message: result.message,
      details: {
        url: result.url || null,
        loginRequired: Boolean(result.loginRequired),
        loginFailed: Boolean(result.loginFailed),
        account: result.account || null,
        code: result.code || null,
        ...extraDetails
      },
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      cstoreSessionOk: result.ok || result.loginRequired === false,
      paused: isPaused(),
      pauseReason: getPauseInfo()?.reason || null
    })
  } catch (err) {
    console.error('[Harvest] Failed to record task:', err.message)
    try {
      await sendHeartbeat(config, {
        cstoreSessionOk: Boolean(result.ok),
        paused: isPaused(),
        pauseReason: getPauseInfo()?.reason || null
      })
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
  if (isPaused()) {
    const info = getPauseInfo()
    console.log(`[Harvest] Skip ${reason} — paused (${info?.reason || 'paused'})`)
    if (activityLog) activityLog.add(`Skipped keep-alive (${info?.message || 'paused'})`)
    return
  }

  running = true
  if (status) status.jobRunning = true
  const config = loadConfig()
  const startedAt = new Date()
  console.log(`[Harvest] Starting cstore_keepalive (${reason})`)
  if (activityLog) activityLog.add(`Keep-alive started (${reason})`)

  try {
    await sendHeartbeat(config, {
      paused: false,
      pauseReason: null
    })
    if (status) status.lastHeartbeatAt = new Date().toISOString()
  } catch (err) {
    console.error('[Harvest] Heartbeat failed:', err.message)
    if (status) status.lastHeartbeatError = err.message
  }

  let result
  try {
    result = await runCstoreKeepalive(config, createLoginHooks(config))
  } catch (err) {
    result = { ok: false, loginRequired: false, message: err.message || String(err) }
  }

  await recordJob(config, 'cstore_keepalive', startedAt, result, { reason })
  running = false
  if (status) status.jobRunning = false
  return result
}

async function runCstoreSignInCycle(reason) {
  if (running) {
    console.log(`[Harvest] Skip ${reason} — a job is already running`)
    return
  }

  running = true
  if (status) status.jobRunning = true
  const config = loadConfig()
  const startedAt = new Date()
  console.log(`[Harvest] Starting cstore_sign_in (${reason})`)
  if (activityLog) activityLog.add(`Cstore sign-in started (${reason})`)

  let result
  try {
    result = await runCstoreSignIn(config)
  } catch (err) {
    result = { ok: false, loginRequired: true, message: err.message || String(err) }
  }

  if (result.ok && status) {
    status.cstoreSessionOk = true
    status.cstoreSessionAt = new Date().toISOString()
  }

  await recordJob(config, 'cstore_sign_in', startedAt, result, { reason })
  running = false
  if (status) status.jobRunning = false
  return result
}

async function runCustomerAccountsCycle(reason, options = {}) {
  if (running) {
    console.log(`[Harvest] Skip ${reason} — a job is already running`)
    return
  }
  if (isPaused()) {
    const info = getPauseInfo()
    console.log(`[Harvest] Skip ${reason} — paused (${info?.reason || 'paused'})`)
    if (activityLog) activityLog.add(`Skipped customer accounts (${info?.message || 'paused'})`)
    return
  }

  running = true
  if (status) status.jobRunning = true
  const config = loadConfig()
  const startedAt = new Date()

  let monthOpts = parsedMonth
  if (options.month && /^(\d{4})-(\d{2})$/.test(options.month)) {
    monthOpts = {
      year: Number(options.month.slice(0, 4)),
      month: Number(options.month.slice(5, 7))
    }
  }

  console.log(
    `[Harvest] Starting customer_accounts (${reason}${monthOpts ? ` ${monthOpts.year}-${String(monthOpts.month).padStart(2, '0')}` : ''}${
      customerQuery ? ` ${customerQuery}` : fromQuery ? ` from ${fromQuery}` : harvestAll ? ' all' : ''
    })`
  )
  if (activityLog) activityLog.add(`Customer accounts started (${reason})`)

  try {
    await sendHeartbeat(config, {
      paused: false,
      pauseReason: null
    })
    if (status) status.lastHeartbeatAt = new Date().toISOString()
  } catch (err) {
    console.error('[Harvest] Heartbeat failed:', err.message)
  }

  let extra = { reason }
  const summaries = []

  async function importCaptured(captured) {
    if (!captured.ok || !captured.html) {
      summaries.push({
        account: captured.account,
        ok: false,
        message: captured.message,
        added: Boolean(captured.added)
      })
      return captured
    }
    try {
      const imported = await sendCustomerCreditImport(config, {
        account: captured.account,
        year: captured.year,
        month: captured.month,
        html: captured.html,
        updateSnapshot: true
      })
      const message = imported.empty
        ? `${captured.account}: no activity this month (opening ${imported.opening})`
        : `${captured.account}: imported ${imported.imported} line(s)`
      console.log(`[Harvest] ${message}`)
      summaries.push({
        account: captured.account,
        ok: true,
        imported: imported.imported,
        empty: imported.empty,
        opening: imported.opening,
        added: Boolean(captured.added)
      })
      return { ...captured, ok: true, message, html: undefined }
    } catch (err) {
      const message = `Cstore report captured but Shift Close import failed: ${err.message}`
      console.error(`[Harvest] ${captured.account}: ${message}`)
      summaries.push({
        account: captured.account,
        ok: false,
        message,
        added: Boolean(captured.added)
      })
      return { ...captured, ok: false, message, html: undefined }
    }
  }

  let result
  try {
    result = await runFirstCustomerCreditReport(config, {
      ...(monthOpts || {}),
      customer: customerQuery || undefined,
      from: fromQuery || undefined,
      all: harvestAll,
      onAccount: importCaptured,
      hooks: createLoginHooks(config)
    })
  } catch (err) {
    result = { ok: false, loginRequired: false, message: err.message || String(err) }
  }

  if (summaries.length > 0) {
    extra = { reason, accounts: summaries }
    const failed = summaries.filter((s) => !s.ok)
    const addedCount = summaries.filter((s) => s.added).length
    const importedCount = summaries.filter((s) => s.ok).length
    result = {
      ...result,
      ok: failed.length === 0 && result.ok !== false,
      html: undefined,
      message:
        summaries.length === 1
          ? summaries[0].message || result.message
          : `${importedCount} imported, ${failed.length} failed${
              addedCount ? `, ${addedCount} new name(s)` : ''
            }`
    }
  } else if (result.ok && result.html) {
    result = await importCaptured(result)
    extra = { reason, accounts: summaries }
  }

  await recordJob(config, 'customer_accounts', startedAt, result, extra)
  running = false
  if (status) status.jobRunning = false
  return result
}

async function runVendorInvoicesCycle(reason, options = {}) {
  if (running) {
    console.log(`[Harvest] Skip ${reason} — a job is already running`)
    return
  }
  if (isPaused()) {
    const info = getPauseInfo()
    console.log(`[Harvest] Skip ${reason} — paused (${info?.reason || 'paused'})`)
    if (activityLog) activityLog.add(`Skipped vendor invoices (${info?.message || 'paused'})`)
    return
  }

  running = true
  if (status) status.jobRunning = true
  const config = loadConfig()
  const startedAt = new Date()

  let monthOpts = parsedMonth
  if (options.month && /^(\d{4})-(\d{2})$/.test(options.month)) {
    monthOpts = {
      year: Number(options.month.slice(0, 4)),
      month: Number(options.month.slice(5, 7))
    }
  }
  const vendorName = (options.vendor || vendorQuery || '').trim()
  const harvestVendorsAll = options.all === true || (harvestAll && !vendorName)

  console.log(
    `[Harvest] Starting vendor_invoices (${reason}${monthOpts ? ` ${monthOpts.year}-${String(monthOpts.month).padStart(2, '0')}` : ''}${
      vendorName ? ` ${vendorName}` : harvestVendorsAll ? ' all' : ''
    })`
  )
  if (activityLog) activityLog.add(`Vendor invoices started (${reason})`)

  try {
    await sendHeartbeat(config, {
      paused: false,
      pauseReason: null
    })
    if (status) status.lastHeartbeatAt = new Date().toISOString()
  } catch (err) {
    console.error('[Harvest] Heartbeat failed:', err.message)
  }

  let extra = { reason }
  const summaries = []

  async function importCaptured(captured) {
    const cstoreCount = captured.invoices?.length ?? 0
    if (!captured.ok) {
      summaries.push({
        vendor: captured.vendor,
        ok: false,
        message: captured.message,
        cstoreCount,
        shiftCloseCount: undefined,
        created: 0,
        skipped: 0,
        suffixed: [],
        vendorCreated: false
      })
      return captured
    }
    if (!captured.invoices || captured.invoices.length === 0) {
      let shiftCloseCount
      let message = captured.message || `${captured.vendor}: no invoices this month`
      try {
        const imported = await sendVendorInvoiceImport(config, {
          vendor: captured.vendor,
          year: captured.year,
          month: captured.month,
          invoices: []
        })
        shiftCloseCount = imported.shiftCloseCount
        if (imported.shiftCloseCount > 0) {
          message = `${captured.vendor}: Cstore 0, Shift Close ${imported.shiftCloseCount} (no new invoices this month)`
        }
      } catch {
        shiftCloseCount = undefined
      }
      console.log(`[Harvest] ${message}`)
      summaries.push({
        vendor: captured.vendor,
        ok: true,
        message,
        cstoreCount: 0,
        shiftCloseCount,
        created: 0,
        skipped: 0,
        suffixed: [],
        vendorCreated: false
      })
      return { ...captured, message, invoices: undefined }
    }
    try {
      const imported = await sendVendorInvoiceImport(config, {
        vendor: captured.vendor,
        year: captured.year,
        month: captured.month,
        invoices: captured.invoices || []
      })
      const message =
        imported.message ||
        `${imported.vendorName || captured.vendor}: Cstore ${imported.cstoreCount ?? cstoreCount}, Shift Close ${imported.shiftCloseCount}, added ${imported.created}, skipped ${imported.skipped}`
      console.log(`[Harvest] ${message}`)
      summaries.push({
        vendor: imported.vendorName || captured.vendor,
        ok: imported.errors && imported.errors.length > 0 ? false : true,
        message,
        cstoreCount: imported.cstoreCount ?? cstoreCount,
        shiftCloseCount: imported.shiftCloseCount,
        created: imported.created,
        skipped: imported.skipped,
        suffixed: imported.suffixed || [],
        vendorCreated: Boolean(imported.vendorCreated)
      })
      return { ...captured, ok: !imported.errors?.length, message, invoices: undefined }
    } catch (err) {
      const message = `Cstore invoices captured but Shift Close import failed: ${err.message}`
      console.error(`[Harvest] ${captured.vendor}: ${message}`)
      summaries.push({
        vendor: captured.vendor,
        ok: false,
        message,
        cstoreCount,
        shiftCloseCount: undefined,
        created: 0,
        skipped: 0,
        suffixed: [],
        vendorCreated: false
      })
      return { ...captured, ok: false, message, invoices: undefined }
    }
  }

  let result
  try {
    result = await runVendorInvoices(config, {
      ...(monthOpts || {}),
      vendor: vendorName || undefined,
      all: harvestVendorsAll || !vendorName,
      onVendor: importCaptured,
      hooks: createLoginHooks(config)
    })
  } catch (err) {
    result = { ok: false, loginRequired: false, message: err.message || String(err) }
  }

  if (summaries.length > 0) {
    extra = { reason, vendors: summaries }
    const failed = summaries.filter((s) => !s.ok)
    const addedCount = summaries.filter((s) => s.vendorCreated).length
    const suffixedCount = summaries.reduce((n, s) => n + (s.suffixed?.length || 0), 0)
    const importedCount = summaries.filter((s) => s.ok).length
    result = {
      ...result,
      ok: failed.length === 0 && result.ok !== false,
      invoices: undefined,
      message:
        summaries.length === 1
          ? summaries[0].message || result.message
          : `${importedCount} imported, ${failed.length} failed${
              addedCount ? `, ${addedCount} new vendor(s)` : ''
            }${suffixedCount ? `, ${suffixedCount} numbered with a letter` : ''}`
    }
  }

  await recordJob(config, 'vendor_invoices', startedAt, result, extra)
  running = false
  if (status) status.jobRunning = false
  return result
}

function startDashboard(config) {
  const { createDashboardServer } = require('./dashboard/server')
  const app = createDashboardServer(config, activityLog, status, {
    runKeepalive: runKeepaliveCycle,
    runCstoreSignIn: runCstoreSignInCycle,
    runCustomerAccounts: runCustomerAccountsCycle,
    runVendorInvoices: runVendorInvoicesCycle,
    onResume: () => {
      pauseNotified = false
      if (status) status.paused = false
      const cfg = loadConfig()
      sendHeartbeat(cfg, { paused: false, pauseReason: null }).catch(() => {})
    }
  })
  const port = config.dashboardPort || 3921
  httpServer = app.listen(port, '127.0.0.1', () => {
    console.log(`[Harvest] Dashboard at http://127.0.0.1:${port}`)
    activityLog.add('Harvest agent started')
  })
  httpServer.on('error', (err) => {
    console.error('[Harvest] Dashboard listen error:', err)
  })
}

function start() {
  const config = loadConfig()
  activityLog = new ActivityLog()
  status = {
    cstoreSessionOk: null,
    cstoreSessionAt: null,
    lastJobKey: null,
    lastJobStatus: null,
    lastJobMessage: null,
    lastJobAt: null,
    lastHeartbeatAt: null,
    lastHeartbeatError: null,
    jobRunning: false,
    paused: isPaused(),
    recentTasks: [],
    nextSlotLabel: nextSlotLabel(config)
  }

  console.log(
    `[Harvest] agentKey=${config.agentKey} vercelUrl=${config.vercelUrl || '(not set)'} slots=${config.slotHours.join(',')} ${config.timeZone}`
  )

  if (!config.vercelUrl || !config.agentSecret) {
    console.warn(
      '[Harvest] Open the dashboard to set vercelUrl and harvest secret, or copy config.example.json'
    )
  }

  if (!noDashboard) {
    startDashboard(config)
  }

  if (isPaused()) {
    const info = getPauseInfo()
    console.warn(`[Harvest] Agent is PAUSED: ${info?.message || info?.reason}`)
    activityLog.add(`Paused: ${info?.message || info?.reason}`)
  }

  if (config.runOnStart && !isPaused() && config.vercelUrl && config.agentSecret) {
    runKeepaliveCycle('startup').catch((err) => {
      console.error('[Harvest] Startup keep-alive error:', err)
    })
  }

  stopSlotWatcher = startSlotWatcher({
    timeZone: config.timeZone,
    slotHours: config.slotHours,
    onSlot: (key) => runKeepaliveCycle(`slot:${key}`)
  })

  setInterval(() => {
    if (status) status.nextSlotLabel = nextSlotLabel(loadConfig())
  }, 60_000)

  console.log('[Harvest] Scheduled keep-alive at 07:00 and 19:00. Use dashboard or tray to control.')
}

function stop() {
  if (stopSlotWatcher) {
    stopSlotWatcher()
    stopSlotWatcher = null
  }
  if (httpServer) {
    httpServer.close()
    httpServer = null
  }
}

async function runCliOnce() {
  const config = loadConfig()
  console.log(
    `[Harvest] agentKey=${config.agentKey} vercelUrl=${config.vercelUrl || '(not set)'} task=${taskName} slots=${config.slotHours.join(',')} ${config.timeZone}`
  )

  if (!config.vercelUrl || !config.agentSecret) {
    console.warn(
      '[Harvest] Copy config.example.json to harvest-agent.config.json and set vercelUrl + agentSecret'
    )
  }

  if (isPaused()) {
    const info = getPauseInfo()
    console.error(`[Harvest] Agent is paused: ${info?.message || info?.reason}`)
    process.exit(1)
  }

  if (taskName === 'customer_accounts') {
    const result = await runCustomerAccountsCycle('once')
    process.exit(result?.ok ? 0 : 1)
    return
  }

  if (taskName === 'vendor_invoices') {
    const result = await runVendorInvoicesCycle('once')
    process.exit(result?.ok ? 0 : 1)
    return
  }

  const keepResult = await runKeepaliveCycle('once')
  process.exit(keepResult?.ok ? 0 : 1)
}

if (require.main === module) {
  if (once) {
    activityLog = new ActivityLog()
    status = { recentTasks: [] }
    runCliOnce().catch((err) => {
      console.error('[Harvest] Fatal:', err)
      process.exit(1)
    })
  } else {
    start()
  }
}

module.exports = { start, stop, runKeepaliveCycle, runCstoreSignInCycle, runCustomerAccountsCycle, runVendorInvoicesCycle }
