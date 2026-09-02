/**
 * customerAccounts.js — Cstore Customer Credit Report (Details) for one account.
 */

const fs = require('fs')
const path = require('path')
const { launchContext, ensureLoggedIn } = require('./cstoreKeepalive')
const { zonedParts } = require('./schedule')
const { fetchHarvestCustomers } = require('./shiftCloseClient')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function clickFirstVisible(page, locators) {
  for (const loc of locators) {
    const n = loc.filter({ visible: true })
    if ((await n.count()) > 0) {
      await n.first().click({ timeout: 8000 })
      return true
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

async function onCustomerCreditReport(page) {
  const url = page.url().toLowerCase()
  if (url.includes('customercreditreport')) return true
  if ((await page.getByText(/customer account report/i).count()) > 0) return true
  if ((await page.getByLabel(/credit account/i).count()) > 0) return true
  return false
}

async function openViaReportCenterFlyout(page) {
  const reportCenter = page.locator('#EWF-Menu-Link-1304')
  const otherEntries = page.locator('#EWF-Menu-Link-1431')
  const customerAccounts = page.locator('#EWF-Menu-Link-1912')
  if ((await reportCenter.count()) === 0) return false

  await reportCenter.hover()
  await sleep(500)
  if ((await otherEntries.count()) > 0) {
    await otherEntries.hover()
    await sleep(500)
  }
  if ((await customerAccounts.count()) === 0) return false
  await customerAccounts.click({ timeout: 8000 })
  await sleep(1200)
  return onCustomerCreditReport(page)
}

async function openCustomerAccountsReport(page) {
  if (await onCustomerCreditReport(page)) return

  if (await openViaReportCenterFlyout(page)) return

  const viewLocal = page.locator('a[href*="CustomerCreditReport.aspx"]')
  if ((await viewLocal.count()) > 0) {
    await viewLocal.first().click()
    await sleep(1200)
    if (await onCustomerCreditReport(page)) return
  }

  const reportUrl =
    'https://secure.cstorepro.com/EmagineNETCOSM/Content/Reports/CustomerCreditReport.aspx?enetFoundationMenuID=1912'
  await page.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await sleep(1000)
  if (await onCustomerCreditReport(page)) return

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

async function openDatePicker(page) {
  await clickFirstVisible(page, [
    page.getByLabel(/report date/i),
    page.locator('input[placeholder*="date" i]'),
    page.locator('text=Report Date').locator('xpath=following::input[1]')
  ])
  await sleep(400)
}

async function setReportMonth(page, year, month) {
  const presetName = `${MONTH_SHORT[month - 1]} ${year}`
  const preset = page.getByRole('button', { name: new RegExp(`^${presetName}$`, 'i') })
  if ((await preset.count()) > 0 && (await preset.first().isVisible().catch(() => false))) {
    await preset.first().click()
    const submit = page.getByRole('button', { name: /^submit$/i })
    if ((await submit.count()) > 0) await submit.first().click()
    await sleep(500)
    return
  }

  await openDatePicker(page)

  const presetAfterOpen = page.getByRole('button', { name: new RegExp(`^${presetName}$`, 'i') })
  if ((await presetAfterOpen.count()) > 0) {
    await presetAfterOpen.first().click()
    const submit = page.getByRole('button', { name: /^submit$/i })
    if ((await submit.count()) > 0) await submit.first().click()
    await sleep(500)
    return
  }

  const fromVal = formatUsDate(year, month, 1)
  const toVal = formatUsDate(year, month, lastDayOfMonth(year, month))
  const labeledFrom = page.locator('text=FROM').locator('xpath=following::input[1]')
  const labeledTo = page.locator('text=TO').locator('xpath=following::input[1]')

  if ((await labeledFrom.count()) > 0 && (await labeledTo.count()) > 0) {
    await labeledFrom.first().fill(fromVal)
    await labeledTo.first().fill(toVal)
    const submit = page.getByRole('button', { name: /^submit$/i })
    if ((await submit.count()) > 0) await submit.first().click()
    await sleep(500)
    return
  }

  console.warn(`[Cstore] Could not set ${presetName}; leaving current date range`)
}

async function setReportTypeDetails(page) {
  const typed = page.getByLabel(/report type/i)
  if ((await typed.count()) > 0) {
    await typed.selectOption({ label: 'Details' }).catch(async () => {
      await typed.selectOption({ value: 'Details' }).catch(() => {})
    })
    return
  }
  const selects = page.locator('select')
  const count = await selects.count()
  for (let i = 0; i < count; i++) {
    const sel = selects.nth(i)
    const labels = await sel.locator('option').allTextContents()
    if (labels.some((t) => /^\s*details\s*$/i.test(t))) {
      await sel.selectOption({ label: 'Details' })
      return
    }
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

async function creditAccountSelect(page) {
  const labeled = page.getByLabel(/credit account/i)
  if ((await labeled.count()) > 0) return labeled.first()
  return page.locator('select').first()
}

async function listCreditAccountOptions(page) {
  const select = await creditAccountSelect(page)
  const options = await select.locator('option').allTextContents()
  return options.map((t) => t.trim()).filter(usableAccountName)
}

async function selectShiftCloseCustomer(page, customer) {
  const select = await creditAccountSelect(page)
  const options = await listCreditAccountOptions(page)
  const matched = matchCstoreOption(options, customer)
  if (!matched) {
    return { ok: false, options }
  }
  await select.selectOption({ label: matched })
  return { ok: true, matched, options }
}

async function runReport(page) {
  const clicked = await clickFirstVisible(page, [
    page.getByRole('button', { name: /run report/i }),
    page.getByText(/^run report$/i)
  ])
  if (!clicked) throw new Error('Run Report button not found')
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await sleep(2500)
}

async function reportHtmlFromPage(page) {
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

    const target = directory.first
    if (!target) {
      return {
        ok: false,
        loginRequired: false,
        url: page.url(),
        code: 'no_directory',
        message: 'No active customers in the Shift Close customer list'
      }
    }

    await openCustomerAccountsReport(page)
    await setReportMonth(page, year, month)
    await setReportTypeDetails(page)
    const selected = await selectShiftCloseCustomer(page, target)
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
    await runReport(page)

    const captured = await reportHtmlFromPage(page)
    if (!captured.html || captured.html.length < 200) {
      await saveDebug(page, debugDir, 'customer-accounts-empty-html')
      throw new Error('Customer account report HTML was empty')
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
