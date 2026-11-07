/**
 * cstoreDayReport.js — read the Cstore printable Daily Report for recent days.
 *
 * Read-only: opens DailyReportGetPrintable.aspx for each date and hands the raw page HTML to
 * Shift Close, which does the parsing. Never clicks Save or edits anything in Cstore. The print page
 * only has data for days the manager has saved; for other days Shift Close answers "not ready" and the
 * agent moves on.
 */

const fs = require('fs')
const path = require('path')
const { launchContext, ensureLoggedIn, waitForSession, isCstoreLoginUrl } = require('./cstoreKeepalive')
const { zonedParts } = require('./schedule')

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

function saveDebug(dir, name, html) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${name}.html`), html, 'utf8')
  } catch {
    /* debug only */
  }
}

/**
 * options.dates     YYYY-MM-DD list (default: last `config.cstoreDayReportDays` || 7 days ending today)
 * options.onDay     async ({ date, html }) => { ok, saved, message }  (imports into Shift Close)
 * options.hooks     login hooks
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

    const saved = days.filter((d) => d.saved)
    const waiting = days.filter((d) => d.ok !== false && !d.saved)
    const failed = days.filter((d) => d.ok === false)
    return {
      ok: failed.length === 0,
      loginRequired: false,
      url: page.url(),
      days,
      message:
        `${saved.length} day(s) saved` +
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

module.exports = { runCstoreDayReports, printableUrl, recentDates, cstoreDate }
