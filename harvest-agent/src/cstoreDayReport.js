/**
 * cstoreDayReport.js — read the Cstore printable Daily Report for recent days.
 *
 * Reading is read-only: opens DailyReportGetPrintable.aspx for each date and hands the raw page HTML to
 * Shift Close, which does the parsing. The print page only has data for days that have been saved in
 * Cstore; for other days Shift Close answers "not ready" and the agent moves on.
 *
 * Optionally (config.cstoreDayReportAutoSave = "dry-run" or "on", off by default) it then starts and saves
 * past days nobody has saved yet and reads them back. See cstoreDaySave.js for the guardrails.
 */

const fs = require('fs')
const path = require('path')
const { launchContext, ensureLoggedIn, waitForSession, isCstoreLoginUrl } = require('./cstoreKeepalive')
const { zonedParts } = require('./schedule')
const { planSaves, startAndSaveDay } = require('./cstoreDaySave')

const PRINT_PATH = '/EmagineNETCOSM/Content/Daily/DailyReportGetPrintable.aspx'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** YYYY-MM-DD → MM/DD/YYYY, the format Cstore expects in the URL. */
function cstoreDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) throw new Error(`Bad date ${ymd}`)
  return `${m[2]}/${m[3]}/${m[1]}`
}

function printableUrl(origin, ymd) {
  return `${origin}${PRINT_PATH}?inReportDate=${cstoreDate(ymd)}&&inPageType=1`
}

/** The last `count` days ending on `endYmd`, newest first. */
function recentDates(endYmd, count) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(endYmd || ''))
  if (!m) return []
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

/** Every day of a calendar month up to and including `todayYmd`, newest first. */
function monthDates(year, month, todayYmd) {
  const last = new Date(Date.UTC(year, month, 0, 12)).getUTCDate()
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const out = []
  for (let day = last; day >= 1; day--) {
    const ymd = `${prefix}${String(day).padStart(2, '0')}`
    if (!todayYmd || ymd <= todayYmd) out.push(ymd)
  }
  return out
}

function saveDebug(dir, name, html) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${name}.html`), html, 'utf8')
  } catch {
    /* debug only */
  }
}

/**
 * Start and save past days that Cstore has no saved report for, then read them back (see cstoreDaySave.js).
 * Mutates `days` (the per-date results of the read pass).
 */
async function autoSaveMissingDays({ page, origin, config, dates, days, today, options, hooks, dryRun }) {
  const log = typeof options.log === 'function' ? options.log : () => {}
  const readOk = days.filter((d) => d.ok !== false)
  const unsaved = readOk.filter((d) => !d.saved && d.date < today).map((d) => d.date)
  if (unsaved.length === 0) return

  let eligible = []
  try {
    const res = await options.getEligibleDates(dates)
    eligible = Array.isArray(res && res.dates) ? res.dates : []
  } catch (err) {
    log(`Auto-save skipped: could not ask Shift Close which days to save (${err.message || err})`)
    return
  }

  const max = Number(config.cstoreDayReportAutoSaveMax) > 0 ? Number(config.cstoreDayReportAutoSaveMax) : 3
  const plan = planSaves({
    windowDates: dates,
    unsavedDates: unsaved,
    savedDates: readOk.filter((d) => d.saved).map((d) => d.date),
    eligibleDates: eligible,
    today,
    max
  })
  for (const s of plan.skipped) log(`Not saving ${s.date} in Cstore: ${s.reason}`)

  for (const date of plan.toSave) {
    const entry = days.find((d) => d.date === date)
    let result
    try {
      result = await startAndSaveDay(page, origin, date, { dryRun, log })
    } catch (err) {
      result = { ok: false, saved: false, stop: true, message: err.message || String(err) }
    }
    if (!entry) continue

    if (result.saved) {
      // Read the day back so Shift Close has it straight away.
      try {
        const url = printableUrl(origin, date)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await sleep(800)
        const html = await page.content()
        const imported = await options.onDay({ date, html })
        Object.assign(entry, imported, { autoSaved: true, message: `Started and saved in Cstore by the agent; ${imported.message || ''}`.trim() })
      } catch (err) {
        Object.assign(entry, { ok: false, saved: false, autoSaved: true, message: `Saved in Cstore but could not read it back: ${err.message || err}` })
      }
    } else {
      Object.assign(entry, { ok: result.ok !== false, saved: false, message: result.message })
    }
    log(`${date}: ${entry.message}`)
    if (result.stop) break
  }
}

/**
 * options.dates     YYYY-MM-DD list (default: last `config.cstoreDayReportDays` || 7 days ending today)
 * options.onDay     async ({ date, html }) => { ok, saved, message }  (imports into Shift Close)
 * options.hooks     login hooks
 * options.getEligibleDates  async (dates) => ({ dates })  days before today in the read window
 *                   (only used when config.cstoreDayReportAutoSave is 'dry-run' or 'on')
 * options.log       (message) => void
 */
async function runCstoreDayReports(config, options = {}) {
  fs.mkdirSync(config.userDataDir, { recursive: true })
  const debugDir = path.join(process.cwd(), 'downloads')
  const { ymd: today } = zonedParts(config.timeZone || 'America/St_Lucia')
  const count = Number(config.cstoreDayReportDays) > 0 ? Number(config.cstoreDayReportDays) : 7
  const dates = options.dates && options.dates.length ? options.dates : recentDates(today, count)
  const hooks = options.hooks || {}

  const context = await launchContext(config)
  const page = context.pages()[0] || (await context.newPage())
  const days = []

  try {
    const login = await ensureLoggedIn(page, config, hooks)
    if (!login.ok) return { ...login, taskKey: 'cstore_day_reports', days }

    const origin = new URL(page.url()).origin

    // Newest first, as listed. (Saving, if on, always goes oldest first; see autoSaveMissingDays.)
    for (const date of dates) {
      const url = printableUrl(origin, date)
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await sleep(800)
        if (isCstoreLoginUrl(page.url())) {
          const relog = await waitForSession(page, config, hooks)
          if (!relog.ok) return { ...relog, taskKey: 'cstore_day_reports', days }
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await sleep(800)
        }
        const html = await page.content()
        const result = await options.onDay({ date, html })
        days.push({ date, ...result })
        if (result && result.ok === false) saveDebug(debugDir, `cstore-day-report-${date}`, html)
      } catch (err) {
        days.push({ date, ok: false, saved: false, message: err.message || String(err) })
      }
    }

    const autoSaveMode = config.cstoreDayReportAutoSave
    if ((autoSaveMode === 'on' || autoSaveMode === 'dry-run') && typeof options.getEligibleDates === 'function') {
      await autoSaveMissingDays({ page, origin, config, dates, days, today, options, hooks, dryRun: autoSaveMode === 'dry-run' })
    }

    const saved = days.filter((d) => d.saved)
    const autoSaved = days.filter((d) => d.autoSaved)
    const waiting = days.filter((d) => d.ok !== false && !d.saved)
    const failed = days.filter((d) => d.ok === false)
    return {
      ok: failed.length === 0,
      loginRequired: false,
      url: page.url(),
      days,
      message:
        `${saved.length} day(s) saved` +
        (autoSaved.length ? ` (${autoSaved.length} started and saved by the agent: ${autoSaved.map((d) => d.date).join(', ')})` : '') +
        (waiting.length ? `, ${waiting.length} not saved in Cstore yet` : '') +
        (failed.length ? `, ${failed.length} failed (${failed.map((d) => d.date).join(', ')})` : '')
    }
  } catch (err) {
    saveDebug(debugDir, 'cstore-day-reports-error', await page.content().catch(() => ''))
    return { ok: false, loginRequired: false, url: page.url(), days, message: err.message || String(err) }
  } finally {
    await context.close()
  }
}

module.exports = { runCstoreDayReports, printableUrl, recentDates, monthDates, cstoreDate }
