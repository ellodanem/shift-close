/**
 * customerAccounts.js — Cstore Customer Credit Report (Details) for one account.
 */

const fs = require('fs')
const path = require('path')
const { launchContext, ensureLoggedIn, waitForSession, isCstoreLoginUrl } = require('./cstoreKeepalive')
const { zonedParts } = require('./schedule')
const { fetchHarvestCustomers } = require('./shiftCloseClient')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function clickFirstVisible(page, locators) {
  for (const loc of locators) {
    try {
      const n = loc.filter({ visible: true })
      if ((await n.count()) > 0) {
        await n.first().click({ timeout: 8000 })
        return true
      }
    } catch {
      // try the next candidate
    }
  }
  return false
}

async function saveDebug(page, dir, name) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
    fs.writeFileSync(path.join(dir, `${name}.html`), await page.content(), 'utf8')
  } catch (err) {
    console.warn('[Cstore] debug capture failed:', err.message)
  }
}

async function frameLooksLikeReport(frame) {
  const url = frame.url() || ''
  if (isCstoreLoginUrl(url)) return false
  let path = url.toLowerCase()
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    // keep raw url
  }
  if (path.includes('customercreditreport')) return true
  if ((await frame.getByText(/customer account report/i).count()) > 0) return true
  if ((await frame.getByText(/^credit account$/i).count()) > 0) return true
  return false
}

async function onCustomerCreditReport(page) {
  if (await frameLooksLikeReport(page)) return true
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    if (await frameLooksLikeReport(frame)) return true
  }
  return false
}

async function reportScope(page) {
  if (await frameLooksLikeReport(page)) return page
  for (const frame of page.frames()) {
    if (await frameLooksLikeReport(frame)) return frame
  }
  return page
}

async function openViaReportCenterFlyout(page) {
  const reportCenter = page.locator('#EWF-Menu-Link-1304')
  const otherEntries = page.locator('#EWF-Menu-Link-1431')
  const customerAccounts = page.locator('#EWF-Menu-Link-1912')
  if ((await reportCenter.count()) === 0) return false

  await reportCenter.hover()
  await sleep(500)
  if ((await otherEntries.count()) > 0) {
    await otherEntries.hover({ force: true })
    await sleep(500)
  }
  if ((await customerAccounts.count()) === 0) return false
  await customerAccounts.click({ force: true, timeout: 8000 })
  await sleep(1200)
  return onCustomerCreditReport(page)
}

async function openCustomerAccountsReport(page, config) {
  if (await onCustomerCreditReport(page)) return

  const reportPath = '/EmagineNETCOSM/Content/Reports/CustomerCreditReport.aspx?enetFoundationMenuID=1912'
  await page.goto(new URL(reportPath, page.url()).href, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  })
  await sleep(1000)
  if (isCstoreLoginUrl(page.url())) {
    const login = await waitForSession(page, config)
    if (!login.ok) throw new Error(login.message)
    if (!(await onCustomerCreditReport(page))) {
      await page.goto(new URL(reportPath, page.url()).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
      })
      await sleep(1000)
    }
  }
  if (await onCustomerCreditReport(page)) return

  const menuLink = page.locator('#EWF-Menu-Link-1912')
  if ((await menuLink.count()) > 0) {
    await menuLink.click({ force: true, timeout: 8000 })
    await sleep(1200)
    if (await onCustomerCreditReport(page)) return
  }

  if (await openViaReportCenterFlyout(page)) return

  const viewLocal = page.locator('a[href*="CustomerCreditReport.aspx"]')
  if ((await viewLocal.count()) > 0) {
    await viewLocal.first().click({ force: true })
    await sleep(1200)
    if (await onCustomerCreditReport(page)) return
  }

  throw new Error('Could not open Customer account report')
}

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function formatUsDate(year, month, day) {
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

function parseLooseUsDate(value) {
  const m = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return { month: Number(m[1]), day: Number(m[2]), year: Number(m[3]) }
}

async function hiddenDateRange(page) {
  const from = await page.locator('#CustomerCreditReport_Form_reportDateFrom').inputValue().catch(() => '')
  const to = await page.locator('#CustomerCreditReport_Form_reportDateTo').inputValue().catch(() => '')
  return { from: parseLooseUsDate(from), to: parseLooseUsDate(to) }
}

async function monthAlreadySet(page, year, month) {
  const { from, to } = await hiddenDateRange(page)
  if (!from || !to) return false
  const last = lastDayOfMonth(year, month)
  return (
    from.year === year &&
    from.month === month &&
    from.day === 1 &&
    to.year === year &&
    to.month === month &&
    to.day === last
  )
}

async function clickVisibleDateSubmit(page) {
  const submit = page.locator('.daterangepicker .applyBtn').filter({ visible: true })
  if ((await submit.count()) === 0) return false
  await submit.first().click({ timeout: 5000 })
  await sleep(400)
  return true
}

async function openDatePicker(page) {
  await clickFirstVisible(page, [
    page.locator('#CustomerCreditReport_Form_reportDate_EnetDRS'),
    page.getByLabel(/report date/i),
    page.locator('text=Report Date').locator('xpath=following::input[1]')
  ])
  await sleep(400)
}

async function setReportMonth(page, year, month) {
  if (await monthAlreadySet(page, year, month)) {
    console.log(`[Cstore] Report date already ${MONTH_SHORT[month - 1]} ${year}`)
    return
  }

  const presetName = `${MONTH_SHORT[month - 1]} ${year}`
  await openDatePicker(page)

  const preset = page.getByText(new RegExp(`^${presetName}$`, 'i')).filter({ visible: true })
  if ((await preset.count()) > 0) {
    await preset.first().click()
    await sleep(300)
    await clickVisibleDateSubmit(page)
    if (await monthAlreadySet(page, year, month)) return
  }

  const fromVal = formatUsDate(year, month, 1)
  const toVal = formatUsDate(year, month, lastDayOfMonth(year, month))
  const labeledFrom = page.locator('text=FROM').locator('xpath=following::input[1]').filter({ visible: true })
  const labeledTo = page.locator('text=TO').locator('xpath=following::input[1]').filter({ visible: true })
  if ((await labeledFrom.count()) > 0 && (await labeledTo.count()) > 0) {
    await labeledFrom.first().fill(fromVal)
    await labeledTo.first().fill(toVal)
    await clickVisibleDateSubmit(page)
    if (await monthAlreadySet(page, year, month)) return
  }

  console.warn(`[Cstore] Could not set ${presetName}; leaving current date range`)
}

async function setReportTypeDetails(page) {
  const typeSelect = page.locator('#CustomerCreditReport_Form_enetreportviewtype')
  const accountBox = page.locator('#AccountIDContainer')
  if ((await typeSelect.count()) > 0) {
    await typeSelect.selectOption({ value: 'Details' })
    await typeSelect.dispatchEvent('change')
    await page
      .evaluate(() => {
        const el = document.getElementById('CustomerCreditReport_Form_enetreportviewtype')
        if (!el) return
        el.value = 'Details'
        el.dispatchEvent(new Event('change', { bubbles: true }))
        if (window.jQuery) window.jQuery(el).trigger('change')
      })
      .catch(() => {})
    await accountBox.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    if (await accountBox.isVisible().catch(() => false)) return
  }

  await clickFirstVisible(page, [
    page.locator('#CustomerCreditReport_Form_enetreportviewtype'),
    page.getByText('Report Type', { exact: true })
  ])
  const details = page.getByText(/^details$/i).filter({ visible: true })
  if ((await details.count()) > 0) {
    await details.last().click({ timeout: 8000 })
    await sleep(400)
    return
  }
  throw new Error('Could not set Report Type to Details')
}

function usableAccountName(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^select/i.test(t)) return false
  if (/^-+$/.test(t)) return false
  if (/^all(\s+accounts?)?$/i.test(t)) return false
  return true
}

function normalizeCustomerKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
}

function matchCstoreOption(options, customer) {
  const keys = [customer.cstoreName, customer.name]
    .filter(Boolean)
    .map((v) => normalizeCustomerKey(v))
  for (const opt of options) {
    if (keys.includes(normalizeCustomerKey(opt))) return opt
  }
  return null
}

function pickDirectoryCustomer(directory, query) {
  const list = Array.isArray(directory.customers) ? directory.customers : []
  if (!query) return directory.first || list[0] || null
  const key = normalizeCustomerKey(query)
  return (
    list.find((c) => normalizeCustomerKey(c.name) === key) ||
    list.find((c) => normalizeCustomerKey(c.cstoreName || '') === key) ||
    list.find(
      (c) =>
        normalizeCustomerKey(c.name).includes(key) ||
        normalizeCustomerKey(c.cstoreName || '').includes(key)
    ) ||
    null
  )
}

function pickDirectoryCustomers(directory, options = {}) {
  const list = Array.isArray(directory.customers) ? directory.customers : []
  if (options.customer) {
    const one = pickDirectoryCustomer(directory, options.customer)
    return one ? [one] : []
  }
  let start = 0
  if (options.from) {
    const key = normalizeCustomerKey(options.from)
    const idx = list.findIndex(
      (c) =>
        normalizeCustomerKey(c.name) === key ||
        normalizeCustomerKey(c.cstoreName || '') === key ||
        normalizeCustomerKey(c.name).includes(key)
    )
    if (idx >= 0) start = idx
  }
  if (options.all || options.from) return list.slice(start)
  const first = directory.first || list[0]
  return first ? [first] : []
}

async function listCreditAccountOptions(page) {
  const select = page.locator('#CustomerCreditReport_Form_AccountID')
  if ((await select.count()) > 0) {
    const options = await select.locator('option').allTextContents()
    return options.map((t) => t.trim()).filter(usableAccountName)
  }
  return []
}

async function selectShiftCloseCustomer(page, customer) {
  const accountBox = page.locator('#AccountIDContainer')
  if ((await accountBox.count()) > 0) {
    await accountBox.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  }

  const select = page.locator('#CustomerCreditReport_Form_AccountID')
  const options = await listCreditAccountOptions(page)
  const matched = matchCstoreOption(options, customer)
  if (!matched) {
    return { ok: false, options }
  }
  if ((await select.count()) > 0) {
    await select.selectOption({ label: matched })
    await select.dispatchEvent('change')
    await sleep(300)
    return { ok: true, matched, options }
  }
  return { ok: false, options }
}

async function runReport(page) {
  const clicked = await clickFirstVisible(page, [
    page.locator('#btnCustomerCreditReport_Filter_Search'),
    page.getByRole('button', { name: /run report/i }),
    page.getByText(/^run report$/i)
  ])
  if (!clicked) throw new Error('Run Report button not found')
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page
    .waitForFunction(() => {
      const btn = document.getElementById('btnCustomerCreditReport_Filter_Search')
      const text = (btn && btn.textContent) || ''
      return !/loading/i.test(text)
    }, { timeout: 30_000 })
    .catch(() => {})
  await sleep(1500)
}

async function captureReport(page) {
  const frames = [page, ...page.frames()]
  for (const frame of frames) {
    const text = ((await frame.locator('body').innerText().catch(() => '')) || '').toLowerCase()
    if (
      text.includes('opening balance') ||
      text.includes('no data exists') ||
      text.includes('total charges')
    ) {
      return {
        html: await frame.content(),
        empty: text.includes('no data exists'),
        textSnippet: text.slice(0, 400)
      }
    }
  }
  return {
    html: await page.content(),
    empty: false,
    textSnippet: ((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 400)
  }
}

async function reportHtmlFromPage(page, accountName, beforeHtml) {
  const key = normalizeCustomerKey(accountName)
  const deadline = Date.now() + 25_000
  let captured = await captureReport(page)
  while (Date.now() < deadline) {
    const changed = !beforeHtml || captured.html !== beforeHtml
    const blob = `${captured.textSnippet}\n${captured.html}`.toLowerCase()
    if (changed && (captured.empty || (key && blob.includes(key)))) return captured
    await sleep(600)
    captured = await captureReport(page)
  }
  return captured
}

async function harvestOneAccount(page, form, target, year, month, debugDir) {
  const selected = await selectShiftCloseCustomer(form, target)
  if (!selected.ok) {
    return {
      ok: false,
      loginRequired: false,
      url: page.url(),
      account: target.name,
      year,
      month,
      code: 'not_in_cstore',
      message: `${target.name} is not in the Cstore Credit Account list`,
      cstoreOptions: selected.options
    }
  }
  console.log(
    `[Cstore] Shift Close customer ${target.name} → Cstore "${selected.matched}" (${year}-${String(month).padStart(2, '0')})`
  )
  const beforeHtml = (await captureReport(page)).html
  await runReport(form)
  const captured = await reportHtmlFromPage(page, selected.matched, beforeHtml)
  if (!captured.html || captured.html.length < 200) {
    await saveDebug(page, debugDir, 'customer-accounts-empty-html')
    return {
      ok: false,
      loginRequired: false,
      url: page.url(),
      account: target.name,
      year,
      month,
      message: `${target.name}: report HTML was empty`
    }
  }
  return {
    ok: true,
    loginRequired: false,
    url: page.url(),
    account: target.name,
    cstoreLabel: selected.matched,
    year,
    month,
    html: captured.html,
    emptyReport: captured.empty,
    message: captured.empty
      ? `${target.name}: no activity this month`
      : `${target.name}: report captured`
  }
}

async function runFirstCustomerCreditReport(config, options = {}) {
  fs.mkdirSync(config.userDataDir, { recursive: true })
  const debugDir = path.join(process.cwd(), 'downloads')
  const { ymd } = zonedParts(config.timeZone || 'America/St_Lucia')
  const current = ymd.split('-').map(Number)
  const year = Number(options.year) || current[0]
  const month = Number(options.month) || current[1]

  const context = await launchContext(config)
  const page = context.pages()[0] || (await context.newPage())

  try {
    const login = await ensureLoggedIn(page, config)
    if (!login.ok) {
      return { ...login, taskKey: 'customer_accounts' }
    }

    let directory
    try {
      directory = await fetchHarvestCustomers(config)
    } catch (err) {
      return {
        ok: false,
        loginRequired: false,
        url: page.url(),
        message: `Could not load Shift Close customers: ${err.message}`
      }
    }

    const targets = pickDirectoryCustomers(directory, options)
    if (targets.length === 0) {
      return {
        ok: false,
        loginRequired: false,
        url: page.url(),
        code: options.customer || options.from ? 'customer_missing' : 'no_directory',
        message: options.customer
          ? `${options.customer} is not in the Shift Close customer list`
          : 'No active customers in the Shift Close customer list',
        results: []
      }
    }

    await openCustomerAccountsReport(page, config)
    const form = await reportScope(page)
    console.log(`[Cstore] Report form ready at ${page.url()} (${targets.length} account(s))`)
    await setReportMonth(form, year, month)
    await setReportTypeDetails(form)

    const results = []
    for (const target of targets) {
      let captured
      try {
        captured = await harvestOneAccount(page, form, target, year, month, debugDir)
      } catch (err) {
        captured = {
          ok: false,
          loginRequired: false,
          url: page.url(),
          account: target.name,
          year,
          month,
          message: err.message || String(err)
        }
        await saveDebug(page, debugDir, 'customer-accounts-error')
      }
      if (typeof options.onAccount === 'function') {
        captured = (await options.onAccount(captured)) || captured
      }
      results.push(captured)
    }

    const failed = results.filter((r) => !r.ok)
    const passed = results.filter((r) => r.ok)
    return {
      ok: failed.length === 0,
      loginRequired: false,
      url: page.url(),
      year,
      month,
      results,
      account: results.length === 1 ? results[0].account : null,
      html: results.length === 1 ? results[0].html : undefined,
      emptyReport: results.length === 1 ? results[0].emptyReport : undefined,
      message:
        results.length === 1
          ? results[0].message
          : `${passed.length} imported, ${failed.length} failed`
    }
  } catch (err) {
    await saveDebug(page, debugDir, 'customer-accounts-error')
    return {
      ok: false,
      loginRequired: false,
      url: page.url(),
      message: err.message || String(err)
    }
  } finally {
    await context.close()
  }
}

module.exports = { runFirstCustomerCreditReport }
