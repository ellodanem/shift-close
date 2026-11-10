/**
 * cstoreDaySave.js — start and save a past day's Cstore Daily Report when nobody has yet.
 *
 * This is the only place the agent ever writes to Cstore, and it is off unless config.cstoreDayReportAutoSave
 * is 'dry-run' (everything except the Save click) or 'on'. Guardrails:
 *   - never the current business day or later (the 9th can be saved from midnight on the 10th);
 *   - only days Shift Close lists as a completed End of Day;
 *   - only days Cstore's printable report says are not saved, so a saved day is never touched;
 *   - oldest day first, with no gap: each day's closing cash and checks carry into the next day;
 *   - it uses Cstore's own "Start Day Report" page, which opens the next unstarted day, and stops when
 *     that day is not the one it wanted;
 *   - it saves what Cstore already filled in from the POS. It types nothing (Sales Tax, deposits and
 *     card batches stay as they are for the manager).
 */

const START_PATH = '/EmagineNETCOSM/Content/Daily/DailyReportGetData.aspx?inPageMode=1'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function addDays(ymd, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) return ''
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta, 12)).toISOString().slice(0, 10)
}

/** 'M/D/YYYY' (Cstore does not pad) → 'YYYY-MM-DD'. */
function cstoreMdyToYmd(m, d, y) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "Enter daily report for Monday 11/9/2026" → '2026-11-09'. */
function parseEntryTitleDate(text) {
  const m = /Enter daily report for\s+[A-Za-z]+\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(String(text || ''))
  return m ? cstoreMdyToYmd(m[1], m[2], m[3]) : null
}

/** "Daily Report for 11/9/2026 has been saved successful" → '2026-11-09'. */
function parseSavedBannerDate(text) {
  const m = /Daily Report for\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+has been saved/i.exec(String(text || ''))
  return m ? cstoreMdyToYmd(m[1], m[2], m[3]) : null
}

/**
 * Which days to start and save, oldest first.
 *   windowDates   the days the agent just read
 *   unsavedDates  the ones among them whose printable report was empty (not saved in Cstore)
 *   savedDates    the ones that were saved
 *   eligibleDates days Shift Close lists as a completed End of Day
 *   today         the current business day (YYYY-MM-DD); today and later are never saved
 */
function planSaves({ windowDates = [], unsavedDates = [], savedDates = [], eligibleDates = [], today, max = 3 }) {
  const window = new Set(windowDates)
  const saved = new Set(savedDates)
  const eligible = new Set(eligibleDates)
  const planned = new Set()
  const toSave = []
  const skipped = []

  for (const date of [...new Set(unsavedDates)].sort()) {
    if (!today || date >= today) {
      skipped.push({ date, reason: 'not before today' })
      continue
    }
    if (!eligible.has(date)) {
      skipped.push({ date, reason: 'no completed End of Day in Shift Close' })
      continue
    }
    const prev = addDays(date, -1)
    if (window.has(prev) && !saved.has(prev) && !planned.has(prev)) {
      skipped.push({ date, reason: `the day before (${prev}) is not saved in Cstore` })
      continue
    }
    if (toSave.length >= max) {
      skipped.push({ date, reason: `limit of ${max} days per run` })
      continue
    }
    toSave.push(date)
    planned.add(date)
  }
  return { toSave, skipped }
}

/** Best-effort read of the POS figures Cstore already put on the entry page. */
async function readEntryFigures(page) {
  return page.evaluate(() => {
    const num = (s) => {
      const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    const find = (labelRe) => {
      const candidates = [...document.querySelectorAll('td,th,span,div,label,p,input')].filter((e) => {
        const text = e.tagName === 'INPUT' ? e.value : e.children.length === 0 ? e.textContent : ''
        return labelRe.test(String(text || '').trim())
      })
      for (const el of candidates) {
        let p = el
        for (let i = 0; i < 4 && p; i++) {
          p = p.parentElement
          if (!p) break
          const inputs = [...p.querySelectorAll('input')].filter((x) => x !== el && num(x.value) !== null)
          if (inputs.length) return num(inputs[0].value)
        }
      }
      return null
    }
    return {
      grocery: find(/^Grocery-?\s*Tax/i),
      regularLitres: find(/^Regular Volume/i),
      dieselLitres: find(/^Diesel Gallons/i)
    }
  })
}

function describeFigures(f) {
  const n = (v) => (v === null || v === undefined ? '?' : String(v))
  return `grocery ${n(f.grocery)}, regular ${n(f.regularLitres)} L, diesel ${n(f.dieselLitres)} L`
}

/**
 * Open Cstore's "Start Day Report", check it is the wanted day, and save it (unless dryRun).
 * Returns { ok, saved, stop, message }. `stop` means do not try later days this run.
 */
async function startAndSaveDay(page, origin, targetYmd, { dryRun = false, log = () => {} } = {}) {
  let dialogText = null
  const onDialog = (d) => {
    dialogText = d.message()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', onDialog)
  try {
    await page.goto(`${origin}${START_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page
      .waitForFunction(() => /Enter daily report for/i.test(document.body.innerText), null, { timeout: 30_000 })
      .catch(() => {})
    await sleep(1500)

    const bodyText = await page.evaluate(() => document.body.innerText)
    const opened = parseEntryTitleDate(bodyText)
    if (!opened) {
      return { ok: false, saved: false, stop: true, message: 'Cstore did not open the daily report entry page' }
    }
    if (opened !== targetYmd) {
      return {
        ok: true,
        saved: false,
        stop: true,
        message: `Cstore's next unstarted day is ${opened}, not ${targetYmd}. Nothing saved`
      }
    }

    const figures = await readEntryFigures(page)
    const known = [figures.grocery, figures.regularLitres, figures.dieselLitres].filter((v) => v !== null)
    if (known.length === 0) {
      return { ok: false, saved: false, stop: true, message: 'Could not read the POS figures on the entry page. Nothing saved' }
    }
    if (!known.some((v) => v > 0)) {
      return {
        ok: true,
        saved: false,
        stop: true,
        message: `The POS figures for ${targetYmd} are blank (${describeFigures(figures)}). Nothing saved`
      }
    }

    if (dryRun) {
      log(`Dry run: would save ${targetYmd} in Cstore (${describeFigures(figures)})`)
      return { ok: true, saved: false, stop: false, message: `Dry run: would save (${describeFigures(figures)})` }
    }

    const save = page
      .locator('button:has-text("Save Report"), input[value="Save Report"], a:has-text("Save Report")')
      .first()
    if ((await save.count()) === 0) {
      return { ok: false, saved: false, stop: true, message: 'The Save Report button was not found. Nothing saved' }
    }
    log(`Saving the Cstore daily report for ${targetYmd} (${describeFigures(figures)})`)
    await save.click({ timeout: 15_000 })
    await page
      .waitForFunction(() => /Daily Report for\s+\d{1,2}\/\d{1,2}\/\d{4}\s+has been saved/i.test(document.body.innerText), null, {
        timeout: 60_000
      })
      .catch(() => {})
    await sleep(500)
    const after = await page.evaluate(() => document.body.innerText)
    const savedFor = parseSavedBannerDate(after)
    if (savedFor !== targetYmd) {
      return {
        ok: false,
        saved: false,
        stop: true,
        message: dialogText
          ? `Cstore showed a prompt (${dialogText}). Not confirmed saved`
          : 'Did not see the "saved" confirmation from Cstore. Check the day in Cstore'
      }
    }
    return { ok: true, saved: true, stop: false, message: `Saved in Cstore (${describeFigures(figures)})` }
  } finally {
    page.off('dialog', onDialog)
  }
}

module.exports = {
  START_PATH,
  addDays,
  parseEntryTitleDate,
  parseSavedBannerDate,
  planSaves,
  startAndSaveDay
}
