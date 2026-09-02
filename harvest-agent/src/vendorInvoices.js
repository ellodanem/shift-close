/**
 * vendorInvoices.js — Cstore Grocery → Purchases → Invoices scrape.
 * No export: select vendor, read the table, post rows to Shift Close.
 */

const fs = require('fs')
const path = require('path')
const { launchContext, ensureLoggedIn, waitForSession, isCstoreLoginUrl } = require('./cstoreKeepalive')
const { zonedParts } = require('./schedule')

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

function normalizeVendorKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
}

function usableVendorName(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^select/i.test(t)) return false
  if (/^-+$/.test(t)) return false
  if (/^all(\s+vendors?)?$/i.test(t)) return false
  return true
}

async function pageTextLooksLikeInvoices(frame) {
  const url = frame.url() || ''
  if (isCstoreLoginUrl(url)) return false
  let path = url.toLowerCase()
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    // keep raw url
  }
  if (path.includes('grocerypurchase')) return true
  const text = ((await frame.locator('body').innerText().catch(() => '')) || '').toLowerCase()
  if (text.includes('manage purchases')) return true
  if (text.includes('purchase invoice list')) return true
  if (text.includes('all purchases') && text.includes('invoice')) return true
  return false
}

async function onPurchaseInvoices(page) {
  if (await pageTextLooksLikeInvoices(page)) return true
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    if (await pageTextLooksLikeInvoices(frame)) return true
  }
  return false
}

async function invoicesScope(page) {
  if (await pageTextLooksLikeInvoices(page)) return page
  for (const frame of page.frames()) {
    if (await pageTextLooksLikeInvoices(frame)) return frame
  }
  return page
}

async function openViaGroceryFlyout(page) {
  const grocery = page.locator('#EWF-Menu-Link-1322')
  const purchases = page.locator('#EWF-Menu-Link-1704')
  const invoices = page.locator('#EWF-Menu-Link-2050')
  if ((await grocery.count()) === 0) return false

  await grocery.hover()
  await sleep(500)
  if ((await purchases.count()) > 0) {
    await purchases.hover({ force: true })
    await sleep(500)
  }
  if ((await invoices.count()) === 0) return false
  await invoices.click({ force: true, timeout: 8000 })
  await sleep(1500)
  return onPurchaseInvoices(page)
}

async function openPurchaseInvoices(page, config, hooks = {}) {
  if (await onPurchaseInvoices(page)) return

  const invoicesPath =
    '/EmagineNETCOSM/Content/Grocery/GroceryPurchase.aspx?enetFoundationMenuID=2050'
  await page.goto(new URL(invoicesPath, page.url()).href, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  })
  await sleep(1500)
  await page
    .getByText(/manage purchases|purchase invoice list|all purchases/i)
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => {})
  if (isCstoreLoginUrl(page.url())) {
    const login = await waitForSession(page, config, hooks)
    if (!login.ok) throw new Error(login.message)
    if (!(await onPurchaseInvoices(page))) {
      await page.goto(new URL(invoicesPath, page.url()).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
      })
      await sleep(1200)
    }
  }
  if (await onPurchaseInvoices(page)) return

  const debugDir = path.join(process.cwd(), 'downloads')
  if (await openViaGroceryFlyout(page)) return

  await saveDebug(page, debugDir, 'vendor-invoices-nav-failed')
  throw new Error('Could not open Grocery → Purchases → Invoices')
}

function parseLooseUsDate(value) {
  const m = String(value || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return { month: Number(m[1]), day: Number(m[2]), year: Number(m[3]) }
}

async function hiddenDateRange(scope) {
  const from = await scope.locator('#GroceryPurchases_Form_PurchaseDateFrom').inputValue().catch(() => '')
  const to = await scope.locator('#GroceryPurchases_Form_PurchaseDateTo').inputValue().catch(() => '')
  return { from: parseLooseUsDate(from), to: parseLooseUsDate(to) }
}

async function monthAlreadySet(scope, year, month) {
  const { from, to } = await hiddenDateRange(scope)
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

async function clickDateSubmit(scope) {
  return clickFirstVisible(scope, [
    scope.locator('.daterangepicker .applyBtn'),
    scope.getByRole('button', { name: /^submit$/i }),
    scope.getByRole('button', { name: /^apply$/i }),
    scope.getByText(/^submit$/i)
  ])
}

async function setInvoiceMonth(scope, year, month) {
  if (await monthAlreadySet(scope, year, month)) {
    console.log(`[Cstore] Purchase date already ${MONTH_SHORT[month - 1]} ${year}`)
    return
  }

  const fromVal = formatUsDate(year, month, 1)
  const toVal = formatUsDate(year, month, lastDayOfMonth(year, month))
  const range = `${fromVal} - ${toVal}`

  await scope
    .evaluate(({ fromVal, toVal, range }) => {
      const vis = document.getElementById('GroceryPurchases_Form_PurchaseDate_EnetDRS')
      const fromEl = document.getElementById('GroceryPurchases_Form_PurchaseDateFrom')
      const toEl = document.getElementById('GroceryPurchases_Form_PurchaseDateTo')
      if (vis) {
        vis.value = range
        vis.dispatchEvent(new Event('change', { bubbles: true }))
        vis.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (fromEl) {
        fromEl.value = fromVal
        fromEl.dispatchEvent(new Event('change', { bubbles: true }))
      }
      if (toEl) {
        toEl.value = toVal
        toEl.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, { fromVal, toVal, range })
    .catch(() => {})

  if (await monthAlreadySet(scope, year, month)) {
    console.log(`[Cstore] Purchase date set to ${MONTH_SHORT[month - 1]} ${year}`)
    return
  }

  const presetName = `${MONTH_SHORT[month - 1]} ${year}`
  const dateInput = scope.locator('#GroceryPurchases_Form_PurchaseDate_EnetDRS')
  if ((await dateInput.count()) > 0) {
    await dateInput.first().click({ timeout: 5000 }).catch(() => {})
    await sleep(400)
  }
  const preset = scope.getByText(new RegExp(`^${presetName}$`, 'i')).filter({ visible: true })
  if ((await preset.count()) > 0) {
    await preset.first().click()
    await sleep(300)
    await clickDateSubmit(scope)
    if (await monthAlreadySet(scope, year, month)) return
  }

  console.warn(`[Cstore] Could not set purchase date to ${presetName}; leaving current range`)
}

async function clickAllPurchasesTab(scope) {
  await clickFirstVisible(scope, [
    scope.getByRole('tab', { name: /all purchases/i }),
    scope.getByText(/^all purchases$/i)
  ])
  await sleep(400)
}

async function openVendorDropdown(scope) {
  const opened = await clickFirstVisible(scope, [
    scope.locator('#GroceryPurchases_Form_VendorID'),
    scope.getByLabel(/^vendor$/i),
    scope.locator('xpath=//*[normalize-space()="Vendor"]/following::*[self::input or self::button or self::select][1]'),
    scope.getByRole('combobox', { name: /vendor/i }),
    scope.getByText(/^vendor$/i)
  ])
  await sleep(400)
  return opened
}

async function listVendorOptions(scope) {
  const select = scope.locator('#GroceryPurchases_Form_VendorID')
  if ((await select.count()) > 0) {
    const options = await select.locator('option').allTextContents()
    return options.map((t) => t.trim()).filter(usableVendorName)
  }
  await openVendorDropdown(scope)
  const options = await scope.evaluate(() => {
    const names = []
    const nodes = document.querySelectorAll(
      'select option, li, [role="option"], .dropdown-item, .select2-results__option'
    )
    for (const el of nodes) {
      const t = (el.textContent || '').trim()
      if (t) names.push(t)
    }
    return names
  })
  await scope.keyboard.press('Escape').catch(() => {})
  await sleep(200)
  return [...new Set(options)].filter(usableVendorName)
}

async function selectVendor(scope, vendorName) {
  const key = normalizeVendorKey(vendorName)
  const native = scope.locator('#GroceryPurchases_Form_VendorID')
  if ((await native.count()) > 0) {
    const labels = await native.locator('option').allTextContents()
    const matched = labels.map((t) => t.trim()).find((t) => normalizeVendorKey(t) === key)
    if (matched) {
      await native.selectOption({ label: matched })
      await native.dispatchEvent('change')
      await sleep(300)
      return { ok: true, matched }
    }
  }

  await openVendorDropdown(scope)

  const fallbackSelect = scope.locator('select').filter({ has: scope.locator('option') })
  if ((await fallbackSelect.count()) > 0) {
    const select = fallbackSelect.first()
    const labels = await select.locator('option').allTextContents()
    const matched = labels.find((t) => normalizeVendorKey(t) === key)
    if (matched) {
      await select.selectOption({ label: matched })
      await select.dispatchEvent('change')
      await sleep(300)
      return { ok: true, matched }
    }
  }

  const search = scope.locator('input[type="search"], input[placeholder*="Search" i]').filter({
    visible: true
  })
  if ((await search.count()) > 0) {
    await search.first().fill(vendorName)
    await sleep(400)
  }

  const option = scope.getByText(new RegExp(`^${vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')).filter({
    visible: true
  })
  if ((await option.count()) > 0) {
    const matched = (await option.first().innerText()).trim()
    await option.first().click({ timeout: 8000 })
    await sleep(300)
    return { ok: true, matched }
  }

  const loose = scope.getByText(new RegExp(vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).filter({
    visible: true
  })
  for (let i = 0; i < Math.min(await loose.count(), 20); i++) {
    const text = (await loose.nth(i).innerText()).trim()
    if (normalizeVendorKey(text) === key) {
      await loose.nth(i).click({ timeout: 8000 })
      await sleep(300)
      return { ok: true, matched: text }
    }
  }

  return { ok: false, matched: null }
}

async function clickSearch(scope) {
  const clicked = await clickFirstVisible(scope, [
    scope.locator('#btnGroceryPurchases_Filter_Search'),
    scope.getByRole('button', { name: /^search$/i }),
    scope.locator('a').filter({ hasText: /^search$/i }),
    scope.locator('button').filter({ hasText: /^search$/i })
  ])
  if (!clicked) throw new Error('Search button not found on purchase invoices')
  await scope.waitForLoadState('domcontentloaded').catch(() => {})
  await scope
    .waitForFunction(() => {
      const btn = document.getElementById('btnGroceryPurchases_Filter_Search')
      const text = (btn && btn.textContent) || ''
      return !/loading/i.test(text)
    }, { timeout: 30_000 })
    .catch(() => {})
  await sleep(1500)
}

function parseScrapedRows(rows) {
  const out = []
  const seen = new Set()
  for (const row of rows || []) {
    const invoiceNumber = String(row.invoiceNumber || '').trim()
    const invoiceDate = String(row.invoiceDate || '').trim()
    const amount = Number(row.amount)
    if (!invoiceNumber || !invoiceDate || !Number.isFinite(amount) || amount <= 0) continue
    const key = `${invoiceNumber}|${invoiceDate}|${amount}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      invoiceNumber,
      invoiceDate,
      amount,
      paymentType: row.paymentType ? String(row.paymentType).trim() : null
    })
  }
  return out
}

async function readInvoiceRows(scope) {
  return scope.evaluate(() => {
    function norm(s) {
      return String(s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    }
    function parseAmount(s) {
      const m = String(s || '').replace(/,/g, '').match(/-?\$?\s*(\d+(\.\d{1,2})?)/)
      return m ? Number(m[1]) : NaN
    }
    function parseDate(s) {
      const m = String(s || '').trim().match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
      return m ? m[1] : ''
    }

    const tables = Array.from(document.querySelectorAll('table'))
    const rows = []
    for (const table of tables) {
      const headerCells = Array.from(table.querySelectorAll('thead th, thead td, tr:first-child th'))
      const headers = headerCells.map((el) => norm(el.innerText))
      if (!headers.some((h) => h.includes('invoice'))) continue

      const dateIdx = headers.findIndex((h) => h.includes('purchase date') || h === 'date')
      const vendorIdx = headers.findIndex((h) => h.includes('vendor'))
      const invIdx = headers.findIndex((h) => h.includes('invoice'))
      const payIdx = headers.findIndex((h) => h.includes('payment'))
      const amountIdx = headers.findIndex((h) => h === 'amount' || (h.includes('amount') && !h.includes('retail')))
      if (invIdx < 0 || amountIdx < 0) continue

      const bodyRows = table.querySelectorAll('tbody tr')
      const list = bodyRows.length ? bodyRows : table.querySelectorAll('tr')
      for (const tr of list) {
        const cells = Array.from(tr.querySelectorAll('td'))
        if (cells.length < 3) continue
        const dateText = dateIdx >= 0 ? cells[dateIdx]?.innerText || '' : cells[0]?.innerText || ''
        const invoiceDate = parseDate(dateText)
        if (!invoiceDate) continue
        rows.push({
          invoiceDate,
          vendor: vendorIdx >= 0 ? (cells[vendorIdx]?.innerText || '').trim() : '',
          invoiceNumber: (cells[invIdx]?.innerText || '').trim().split('\n')[0].trim(),
          paymentType: payIdx >= 0 ? (cells[payIdx]?.innerText || '').trim().split('\n')[0].trim() : '',
          amount: parseAmount(cells[amountIdx]?.innerText || '')
        })
      }
    }
    return rows
  })
}

async function invoicesFoundCount(scope) {
  const text = (await scope.locator('body').innerText().catch(() => '')) || ''
  const m = text.match(/(\d+)\s+invoices?\s+found/i)
  return m ? Number(m[1]) : null
}

async function goToNextInvoicePage(scope) {
  const next = scope.locator('a.EJS_Grid2_OpPage').filter({ has: scope.locator('.fa-chevron-right') })
  if ((await next.count()) === 0) {
    return clickFirstVisible(scope, [
      scope.locator('a[title*="next" i]'),
      scope.locator('a').filter({ hasText: /^(›|»|>|next)$/i })
    ])
  }
  const btn = next.last()
  const cls = (await btn.getAttribute('class').catch(() => '')) || ''
  if (/disabled/i.test(cls)) return false
  const before = (await readInvoiceRows(scope))[0]
  await btn.click({ timeout: 5000 }).catch(() => null)
  await sleep(1200)
  const after = (await readInvoiceRows(scope))[0]
  if (before && after && before.invoiceNumber === after.invoiceNumber && before.invoiceDate === after.invoiceDate) {
    return false
  }
  return true
}

async function scrapeAllInvoicePages(scope) {
  const collected = []
  const seen = new Set()
  for (let pageNo = 0; pageNo < 40; pageNo++) {
    const rows = parseScrapedRows(await readInvoiceRows(scope))
    for (const row of rows) {
      const key = `${row.invoiceNumber}|${row.invoiceDate}|${row.amount}`
      if (seen.has(key)) continue
      seen.add(key)
      collected.push(row)
    }
    const total = await invoicesFoundCount(scope)
    if (total != null && collected.length >= total) break
    if (!(await goToNextInvoicePage(scope))) break
  }
  return collected
}

function pickVendorTargets(cstoreNames, options = {}) {
  const list = (cstoreNames || []).filter(usableVendorName)
  if (options.vendor) {
    const key = normalizeVendorKey(options.vendor)
    const matched =
      list.find((n) => normalizeVendorKey(n) === key) ||
      list.find((n) => normalizeVendorKey(n).includes(key))
    return matched ? [matched] : [options.vendor]
  }
  if (options.all) return list
  return []
}

async function harvestOneVendor(page, scope, vendorName, year, month, debugDir) {
  const selected = await selectVendor(scope, vendorName)
  if (!selected.ok) {
    await saveDebug(page, debugDir, 'vendor-invoices-vendor-missing')
    return {
      ok: false,
      loginRequired: false,
      vendor: vendorName,
      year,
      month,
      invoices: [],
      message: `${vendorName} is not in the Cstore vendor list`
    }
  }
  console.log(
    `[Cstore] Vendor invoices "${selected.matched}" (${year}-${String(month).padStart(2, '0')})`
  )
  await clickSearch(scope)
  const invoices = await scrapeAllInvoicePages(scope)
  return {
    ok: true,
    loginRequired: false,
    vendor: selected.matched,
    year,
    month,
    invoices,
    message:
      invoices.length === 0
        ? `${selected.matched}: no invoices this month`
        : `${selected.matched}: read ${invoices.length} invoice(s)`
  }
}

async function runVendorInvoices(config, options = {}) {
  fs.mkdirSync(config.userDataDir, { recursive: true })
  const debugDir = path.join(process.cwd(), 'downloads')
  const { ymd } = zonedParts(config.timeZone || 'America/St_Lucia')
  const current = ymd.split('-').map(Number)
  const year = Number(options.year) || current[0]
  const month = Number(options.month) || current[1]
  const hooks = options.hooks || {}

  const context = await launchContext(config)
  const page = context.pages()[0] || (await context.newPage())

  try {
    const login = await ensureLoggedIn(page, config, hooks)
    if (!login.ok) {
      return { ...login, taskKey: 'vendor_invoices' }
    }

    await openPurchaseInvoices(page, config, hooks)
    const form = await invoicesScope(page)
    console.log(`[Cstore] Purchase invoices ready at ${page.url()}`)
    await clickAllPurchasesTab(form)
    await setInvoiceMonth(form, year, month)

    let names = []
    try {
      names = await listVendorOptions(form)
    } catch (err) {
      console.warn('[Cstore] Could not list vendor dropdown:', err.message)
    }

    let targets = pickVendorTargets(names, options)
    if (targets.length === 0 && options.vendor) targets = [options.vendor]
    if (targets.length === 0) {
      await saveDebug(page, debugDir, 'vendor-invoices-no-vendors')
      return {
        ok: false,
        loginRequired: false,
        url: page.url(),
        year,
        month,
        results: [],
        message: 'No vendors found on the Cstore purchase invoices page'
      }
    }

    const results = []
    for (const vendorName of targets) {
      let captured
      try {
        captured = await harvestOneVendor(page, form, vendorName, year, month, debugDir)
      } catch (err) {
        captured = {
          ok: false,
          loginRequired: false,
          url: page.url(),
          vendor: vendorName,
          year,
          month,
          invoices: [],
          message: err.message || String(err)
        }
        await saveDebug(page, debugDir, 'vendor-invoices-error')
      }
      if (typeof options.onVendor === 'function') {
        captured = (await options.onVendor(captured)) || captured
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
      vendor: results.length === 1 ? results[0].vendor : null,
      message:
        results.length === 1
          ? results[0].message
          : `${passed.length} vendor(s) harvested, ${failed.length} failed`
    }
  } catch (err) {
    await saveDebug(page, debugDir, 'vendor-invoices-error')
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

module.exports = { runVendorInvoices }
