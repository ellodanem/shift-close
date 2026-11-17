/**
 * cstoreDaySave.js — start and save a past day's Cstore Daily Report when nobody has yet.
 *
 * This is the only place the agent ever writes to Cstore, and it is off unless config.cstoreDayReportAutoSave
 * is 'dry-run' (everything except the Save click) or 'on'. Guardrails:
 *   - never the current business day or later (the 9th can be saved from midnight on the 10th);
 *   - only days before today that Shift Close lists as eligible (the POS day is over);
 *   - only days Cstore's printable report says are not saved, or were saved with $0 merchandise and fuel
 *     (the blue POS badges were never copied into the boxes). A finished saved day is never touched;
 *   - oldest day first, with no gap: each day's closing cash and checks carry into the next day;
 *   - new days use Cstore's "Start Day Report" page, which opens the next unstarted day, and stops when
 *     that day is not the one it wanted. Empty-POS days are reopened by date and saved again;
 *   - it copies POS badge values into empty boxes (grocery, fuel, fleet cards). It does not type Sales Tax,
 *     deposits, Credit card 2, or customer-account amounts — those stay for the manager.
 */

const START_PATH = '/EmagineNETCOSM/Content/Daily/DailyReportGetData.aspx?inPageMode=1'

/** POS rows the agent may copy from the blue badge into an empty box. */
const POS_FIELDS = [
  { key: 'grocery', label: /^Grocery-?\s*Tax/i },
  { key: 'groceryNonTax', label: /^Grocery-?\s*NonTax/i },
  { key: 'regularLitres', label: /^Regular Volume/i },
  { key: 'plusLitres', label: /^Plus Volume/i },
  { key: 'superLitres', label: /^Super Volume/i },
  { key: 'dieselLitres', label: /^Diesel Gallons/i },
  { key: 'regularAmt', label: /^Regular Amt Sold/i },
  { key: 'plusAmt', label: /^Plus Amt Sold/i },
  { key: 'superAmt', label: /^Super Amt Sold/i },
  { key: 'dieselAmt', label: /^Diesel Amt Sold/i },
  { key: 'fleetBatch', label: /^Credit card batc/i }
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function addDays(ymd, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) return ''
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta, 12)).toISOString().slice(0, 10)
}

function cstoreDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) throw new Error(`Bad date ${ymd}`)
  return `${m[2]}/${m[3]}/${m[1]}`
}

function editPath(ymd) {
  return `/EmagineNETCOSM/Content/Daily/DailyReportGetData.aspx?inReportDate=${cstoreDate(ymd)}`
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
 * Copy the POS badge into the box only when the box is empty. Never overwrite a value the manager typed.
 */
function shouldCopyPos(inputVal, badgeVal) {
  const badge = badgeVal == null ? 0 : badgeVal
  const input = inputVal == null ? 0 : inputVal
  return badge > 0 && !(input > 0)
}

/**
 * Which days to start and save, oldest first.
 *   windowDates   the days the agent just read
 *   unsavedDates  the ones among them whose printable report was empty (not saved in Cstore)
 *   savedDates    the ones that were saved
 *   eligibleDates days before today in the save window
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
      skipped.push({ date, reason: 'not before today in the save window' })
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

function posLabelSources() {
  return POS_FIELDS.map((f) => ({ key: f.key, source: f.label.source }))
}

async function readEntryFields(page, { mark = false } = {}) {
  return page.evaluate(
    ({ labelSources, mark: doMark }) => {
      const num = (s) => {
        const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''))
        return Number.isFinite(n) ? n : null
      }
      const labelText = (el) => {
        if (el.tagName === 'INPUT') return String(el.value || '').trim()
        const direct = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join('')
          .trim()
        if (direct) return direct
        return el.children.length === 0 ? String(el.textContent || '').trim() : ''
      }
      const out = {}
      for (const { key, source } of labelSources) {
        const re = new RegExp(source, 'i')
        out[key] = { input: null, badge: null, text: null }
        const candidates = [...document.querySelectorAll('td,th,span,div,label,p,strong,b,a')].filter((e) =>
          re.test(labelText(e))
        )
        for (const el of candidates) {
          let p = el
          for (let i = 0; i < 6 && p; i++) {
            p = p.parentElement
            if (!p) break
            const inputs = [...p.querySelectorAll('input')].filter((x) => {
              const t = String(x.type || 'text').toLowerCase()
              return x !== el && (t === 'text' || t === 'number' || t === 'tel' || t === '')
            })
            if (!inputs.length) continue
            const input = inputs[0]
            let badge = null
            let text = null
            for (const b of p.querySelectorAll('span, a, button, div, label')) {
              if (b === el || b.contains(input) || input.contains(b)) continue
              const raw = String(b.textContent || '').trim()
              if (!/^\$?\s*[\d,]+(?:\.\d+)?$/.test(raw)) continue
              const n = num(raw)
              if (n == null) continue
              if (badge == null || n > badge) {
                badge = n
                text = raw.replace(/[$,\s]/g, '')
              }
            }
            out[key] = { input: num(input.value), badge, text }
            if (doMark) input.setAttribute('data-harvest-pos', key)
            break
          }
          if (out[key].input != null || out[key].badge != null) break
        }
      }
      return out
    },
    { labelSources: posLabelSources(), mark }
  )
}

function figuresFromFields(fields) {
  return {
    grocery: fields.grocery && fields.grocery.input,
    regularLitres: fields.regularLitres && fields.regularLitres.input,
    dieselLitres: fields.dieselLitres && fields.dieselLitres.input
  }
}

function describeFigures(f) {
  const n = (v) => (v === null || v === undefined ? '?' : String(v))
  return `grocery ${n(f.grocery)}, regular ${n(f.regularLitres)} L, diesel ${n(f.dieselLitres)} L`
}

/** Copy each POS badge into its empty box. Returns how many boxes were filled. */
async function applyPosBadges(page) {
  const fields = await readEntryFields(page, { mark: true })
  let copied = 0
  for (const spec of POS_FIELDS) {
    const f = fields[spec.key]
    if (!f || !shouldCopyPos(f.input, f.badge) || !f.text) continue
    await readEntryFields(page, { mark: true })
    const loc = page.locator(`[data-harvest-pos="${spec.key}"]`).first()
    if ((await loc.count()) === 0) continue
    await loc.fill(f.text)
    copied += 1
  }
  return { fields, copied }
}

async function waitForEntryPage(page) {
  await page
    .waitForFunction(() => /Enter daily report for/i.test(document.body.innerText), null, { timeout: 30_000 })
    .catch(() => {})
  await sleep(1500)
}

async function clickSaveReport(page) {
  const save = page
    .locator('button:has-text("Save Report"), input[value="Save Report"], a:has-text("Save Report")')
    .first()
  if ((await save.count()) === 0) {
    return { ok: false, message: 'The Save Report button was not found. Nothing saved' }
  }
  await save.click({ timeout: 15_000 })
  await page
    .waitForFunction(() => /Daily Report for\s+\d{1,2}\/\d{1,2}\/\d{4}\s+has been saved/i.test(document.body.innerText), null, {
      timeout: 60_000
    })
    .catch(() => {})
  await sleep(500)
  return { ok: true }
}

/**
 * On the entry form already showing `targetYmd`: copy POS badges into empty boxes, then save.
 */
async function saveOpenDay(page, targetYmd, { dryRun = false, log = () => {}, wrongDay } = {}) {
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
      message: wrongDay
        ? wrongDay(opened)
        : `Cstore opened ${opened}, not ${targetYmd}. Nothing saved`
    }
  }

  const applied = await applyPosBadges(page)
  if (applied.copied > 0) {
    log(`Copied ${applied.copied} POS badge(s) into empty boxes for ${targetYmd}`)
    await sleep(800)
  }

  const fields = await readEntryFields(page)
  const figures = figuresFromFields(fields)
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

  log(`Saving the Cstore daily report for ${targetYmd} (${describeFigures(figures)})`)
  const clicked = await clickSaveReport(page)
  if (!clicked.ok) {
    return { ok: false, saved: false, stop: true, message: clicked.message }
  }
  const after = await page.evaluate(() => document.body.innerText)
  const savedFor = parseSavedBannerDate(after)
  if (savedFor !== targetYmd) {
    return {
      ok: false,
      saved: false,
      stop: true,
      message: 'Did not see the "saved" confirmation from Cstore. Check the day in Cstore'
    }
  }
  return { ok: true, saved: true, stop: false, message: `Saved in Cstore (${describeFigures(figures)})` }
}

async function withDialogs(page, fn) {
  let dialogText = null
  const onDialog = (d) => {
    dialogText = d.message()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', onDialog)
  try {
    const result = await fn()
    if (!result.saved && dialogText && /not confirmed saved|Did not see the "saved"/i.test(result.message || '')) {
      return { ...result, message: `Cstore showed a prompt (${dialogText}). Not confirmed saved` }
    }
    return result
  } finally {
    page.off('dialog', onDialog)
  }
}

/**
 * Open Cstore's "Start Day Report", check it is the wanted day, copy POS badges, and save (unless dryRun).
 * Returns { ok, saved, stop, message }. `stop` means do not try later days this run.
 */
async function startAndSaveDay(page, origin, targetYmd, { dryRun = false, log = () => {} } = {}) {
  return withDialogs(page, async () => {
    await page.goto(`${origin}${START_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForEntryPage(page)
    return saveOpenDay(page, targetYmd, {
      dryRun,
      log,
      wrongDay: (opened) => `Cstore's next unstarted day is ${opened}, not ${targetYmd}. Nothing saved`
    })
  })
}

/**
 * Re-open a day that was already started/saved with empty POS boxes, copy badges, and save.
 */
async function editAndSaveDay(page, origin, targetYmd, { dryRun = false, log = () => {} } = {}) {
  return withDialogs(page, async () => {
    await page.goto(`${origin}${editPath(targetYmd)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForEntryPage(page)
    return saveOpenDay(page, targetYmd, { dryRun, log })
  })
}

module.exports = {
  START_PATH,
  POS_FIELDS,
  addDays,
  cstoreDate,
  editPath,
  parseEntryTitleDate,
  parseSavedBannerDate,
  planSaves,
  shouldCopyPos,
  startAndSaveDay,
  editAndSaveDay
}
