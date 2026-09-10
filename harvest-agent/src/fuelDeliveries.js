/**
 * fuelDeliveries.js — Cstore Gas → Delivery scrape (unpaid only).
 * Opens each unpaid row's Edit modal to read B.O.L No as the invoice number,
 * then posts Fuel invoices to Shift Close.
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
      // try next
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

async function pageLooksLikeGasDelivery(frame) {
  const url = frame.url() || ''
  if (isCstoreLoginUrl(url)) return false
  let pathName = url.toLowerCase()
  try {
    pathName = new URL(url).pathname.toLowerCase()
  } catch {
    // keep raw
  }
  if (pathName.includes('gasdelivery') || pathName.includes('gas/delivery')) return true
  const text = ((await frame.locator('body').innerText().catch(() => '')) || '').toLowerCase()
  if (text.includes("your store's delivery list")) return true
  if (text.includes('gas delivery') && text.includes('delivery date')) return true
  if (text.includes('invoice total') && text.includes('regular') && text.includes('diesel')) {
    return true
  }
  return false
}

async function onGasDelivery(page) {
  if (await pageLooksLikeGasDelivery(page)) return true
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    if (await pageLooksLikeGasDelivery(frame)) return true
  }
  return false
}

async function deliveryScope(page) {
  if (await pageLooksLikeGasDelivery(page)) return page
  for (const frame of page.frames()) {
    if (await pageLooksLikeGasDelivery(frame)) return frame
  }
  return page
}

async function openViaGasFlyout(page) {
  const gasCandidates = [
    page.locator('#EWF-Menu a').filter({ hasText: /^Gas$/i }),
    page.locator('a[id^="EWF-Menu-Link"]').filter({ hasText: /^Gas$/i }),
    page.getByRole('link', { name: /^Gas$/i }),
    page.locator('nav a, .sidebar a, #EWF-Menu *').filter({ hasText: /^Gas$/i })
  ]
  let opened = false
  for (const loc of gasCandidates) {
    if ((await loc.count()) === 0) continue
    try {
      await loc.first().hover({ timeout: 3000 }).catch(() => {})
      await loc.first().click({ force: true, timeout: 5000 })
      opened = true
      await sleep(600)
      break
    } catch {
      // try next
    }
  }
  if (!opened) return false

  const delivery = await clickFirstVisible(page, [
    page.locator('#EWF-Menu a').filter({ hasText: /^Delivery$/i }),
    page.locator('a[id^="EWF-Menu-Link"]').filter({ hasText: /^Delivery$/i }),
    page.getByRole('link', { name: /^Delivery$/i }),
    page.getByText(/^Delivery$/i)
  ])
  if (!delivery) return false
  await sleep(1500)
  return onGasDelivery(page)
}

async function openGasDelivery(page, config, hooks = {}) {
  if (await onGasDelivery(page)) return

  const candidates = [
    '/EmagineNETCOSM/Content/Gas/GasDelivery.aspx',
    '/EmagineNETCOSM/Content/Gas/GasDeliveries.aspx',
    '/EmagineNETCOSM/Content/Gas/Delivery.aspx'
  ]
  for (const deliveryPath of candidates) {
    await page.goto(new URL(deliveryPath, page.url()).href, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    })
    await sleep(1200)
    if (isCstoreLoginUrl(page.url())) {
      const login = await waitForSession(page, config, hooks)
      if (!login.ok) throw new Error(login.message)
    }
    if (await onGasDelivery(page)) return
  }

  const debugDir = path.join(process.cwd(), 'downloads')
  if (await openViaGasFlyout(page)) return

  await saveDebug(page, debugDir, 'fuel-deliveries-nav-failed')
  throw new Error('Could not open Gas → Delivery')
}

async function clickDateSubmit(scope) {
  return clickFirstVisible(scope, [
    scope.locator('.daterangepicker .applyBtn'),
    scope.getByRole('button', { name: /^submit$/i }),
    scope.getByRole('button', { name: /^apply$/i }),
    scope.getByText(/^submit$/i)
  ])
}

async function setDeliveryMonth(scope, year, month) {
  const fromVal = formatUsDate(year, month, 1)
  const toVal = formatUsDate(year, month, lastDayOfMonth(year, month))
  const range = `${fromVal} - ${toVal}`
  const presetName = `${MONTH_SHORT[month - 1]} ${year}`

  await scope
    .evaluate(({ fromVal, toVal, range }) => {
      const inputs = Array.from(document.querySelectorAll('input'))
      for (const el of inputs) {
        const id = String(el.id || '').toLowerCase()
        const name = String(el.name || '').toLowerCase()
        const key = `${id} ${name}`
        if (!key.includes('date') && !key.includes('delivery')) continue
        if (key.includes('from')) {
          el.value = fromVal
          el.dispatchEvent(new Event('change', { bubbles: true }))
        } else if (key.includes('to')) {
          el.value = toVal
          el.dispatchEvent(new Event('change', { bubbles: true }))
        } else if (key.includes('drs') || key.includes('range') || key.includes('deliverydate')) {
          el.value = range
          el.dispatchEvent(new Event('change', { bubbles: true }))
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
    }, { fromVal, toVal, range })
    .catch(() => {})

  const dateInput = scope.locator('input').filter({
    has: scope.locator('xpath=ancestor::*[contains(., "Delivery date") or contains(., "Delivery Date")]')
  })
  if ((await dateInput.count()) === 0) {
    const anyRange = scope.locator('input[id*="Date" i], input[id*="DRS" i]').filter({ visible: true })
    if ((await anyRange.count()) > 0) {
      await anyRange.first().click({ timeout: 4000 }).catch(() => {})
      await sleep(400)
      const preset = scope.getByText(new RegExp(`^${presetName}$`, 'i')).filter({ visible: true })
      if ((await preset.count()) > 0) {
        await preset.first().click()
        await sleep(300)
        await clickDateSubmit(scope)
      }
    }
  } else {
    await dateInput.first().click({ timeout: 4000 }).catch(() => {})
    await sleep(400)
    const preset = scope.getByText(new RegExp(`^${presetName}$`, 'i')).filter({ visible: true })
    if ((await preset.count()) > 0) {
      await preset.first().click()
      await sleep(300)
      await clickDateSubmit(scope)
    }
  }

  console.log(`[Cstore] Delivery date range set toward ${presetName}`)
}

async function setUnpaidStatus(scope) {
  const selects = scope.locator('select')
  const count = await selects.count()
  for (let i = 0; i < count; i++) {
    const sel = selects.nth(i)
    const options = await sel.locator('option').allTextContents().catch(() => [])
    const unpaid = options.find((t) => /un-?\s*paid/i.test(t))
    if (unpaid) {
      await sel.selectOption({ label: unpaid }).catch(async () => {
        const vals = await sel.locator('option').evaluateAll((els) =>
          els.map((el) => ({ value: el.value, text: (el.textContent || '').trim() }))
        )
        const match = vals.find((o) => /un-?\s*paid/i.test(o.text))
        if (match) await sel.selectOption(match.value)
      })
      await sleep(200)
      console.log('[Cstore] Status filter set to Un-Paid')
      return true
    }
  }

  // Custom dropdowns
  const statusLabel = scope.getByText(/^status$/i).filter({ visible: true })
  if ((await statusLabel.count()) > 0) {
    await statusLabel.first().click().catch(() => {})
    await sleep(200)
    const unpaidOpt = scope.getByText(/^un-?\s*paid$/i).filter({ visible: true })
    if ((await unpaidOpt.count()) > 0) {
      await unpaidOpt.first().click()
      await sleep(200)
      return true
    }
  }
  console.warn('[Cstore] Could not set Status=Un-Paid; will filter rows in scrape')
  return false
}

async function clickSearch(scope) {
  const clicked = await clickFirstVisible(scope, [
    scope.locator('button').filter({ has: scope.locator('.fa-search, .glyphicon-search') }),
    scope.getByRole('button', { name: /search/i }),
    scope.locator('a').filter({ has: scope.locator('.fa-search') }),
    scope.locator('button[type="submit"]')
  ])
  await sleep(1500)
  return clicked
}

async function readUnpaidDeliveryRows(scope) {
  return scope.evaluate(() => {
    function norm(s) {
      return String(s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    }
    function parseAmount(s) {
      const m = String(s || '').replace(/,/g, '').match(/\$?\s*(\d+(\.\d{1,2})?)/)
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
      if (!headers.some((h) => h.includes('invoice') || h.includes('regular') || h === 'date')) {
        continue
      }

      const dateIdx = headers.findIndex((h) => h === 'date' || h.includes('delivery'))
      const totalIdx = headers.findIndex((h) => h.includes('invoice total') || h === 'total')
      if (dateIdx < 0 && totalIdx < 0) continue

      const bodyRows = table.querySelectorAll('tbody tr')
      const list = bodyRows.length ? bodyRows : table.querySelectorAll('tr')
      list.forEach((tr, rowIndex) => {
        const cells = Array.from(tr.querySelectorAll('td'))
        if (cells.length < 3) return
        const dateText = dateIdx >= 0 ? cells[dateIdx]?.innerText || '' : cells[0]?.innerText || ''
        const invoiceDate = parseDate(dateText)
        if (!invoiceDate) return
        const totalText =
          totalIdx >= 0 ? cells[totalIdx]?.innerText || '' : cells[cells.length - 2]?.innerText || ''
        const paid = /(?:^|\s)paid(?:\s|$)/i.test(totalText) && !/un-?\s*paid/i.test(totalText)
        const unpaid = /un-?\s*paid/i.test(totalText)
        if (paid || !unpaid) return
        const amount = parseAmount(totalText)
        if (!Number.isFinite(amount) || amount <= 0) return
        const loadMatch = String(dateText).match(/load\s*(\d+)/i)
        rows.push({
          rowIndex,
          invoiceDate,
          amount,
          load: loadMatch ? loadMatch[1] : '',
          key: `${invoiceDate}|${loadMatch ? loadMatch[1] : ''}|${amount}`
        })
      })
      if (rows.length) break
    }
    return rows
  })
}

async function openEditForRow(scope, row) {
  const opened = await scope.evaluate((target) => {
    function parseDate(s) {
      const m = String(s || '').trim().match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
      return m ? m[1] : ''
    }
    function parseAmount(s) {
      const m = String(s || '').replace(/,/g, '').match(/\$?\s*(\d+(\.\d{1,2})?)/)
      return m ? Number(m[1]) : NaN
    }
    function norm(s) {
      return String(s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    }

    const tables = Array.from(document.querySelectorAll('table'))
    for (const table of tables) {
      const headerCells = Array.from(table.querySelectorAll('thead th, thead td, tr:first-child th'))
      const headers = headerCells.map((el) => norm(el.innerText))
      if (!headers.some((h) => h.includes('invoice') || h.includes('regular') || h === 'date')) {
        continue
      }
      const dateIdx = headers.findIndex((h) => h === 'date' || h.includes('delivery'))
      const totalIdx = headers.findIndex((h) => h.includes('invoice total') || h === 'total')
      const bodyRows = table.querySelectorAll('tbody tr')
      const list = bodyRows.length ? Array.from(bodyRows) : Array.from(table.querySelectorAll('tr'))
      for (const tr of list) {
        const cells = Array.from(tr.querySelectorAll('td'))
        if (cells.length < 3) continue
        const dateText = dateIdx >= 0 ? cells[dateIdx]?.innerText || '' : cells[0]?.innerText || ''
        const invoiceDate = parseDate(dateText)
        const totalText =
          totalIdx >= 0 ? cells[totalIdx]?.innerText || '' : cells[cells.length - 2]?.innerText || ''
        if (!/un-?\s*paid/i.test(totalText)) continue
        const amount = parseAmount(totalText)
        const loadMatch = String(dateText).match(/load\s*(\d+)/i)
        const load = loadMatch ? loadMatch[1] : ''
        if (invoiceDate !== target.invoiceDate || amount !== target.amount) continue
        if (target.load && load && target.load !== load) continue

        const icons = Array.from(tr.querySelectorAll('a, button, i, span'))
        const edit =
          icons.find((el) => /edit|pencil/i.test(el.getAttribute('title') || '')) ||
          icons.find((el) => /fa-pencil|fa-edit|glyphicon-pencil|icon-pencil/i.test(el.className || '')) ||
          icons.find((el) => {
            const svg = el.querySelector?.('svg, use')
            return svg && /pencil|edit/i.test(svg.outerHTML || '')
          })
        if (!edit) continue
        const clickable = edit.closest('a, button') || edit
        clickable.click()
        return true
      }
    }
    return false
  }, row)

  if (!opened) return false
  await sleep(1000)
  return true
}

async function waitForUpdateModal(page) {
  const modal = page
    .locator('.modal, [role="dialog"], .ui-dialog, .modal-dialog, .k-window')
    .filter({ hasText: /update gas delivery|gas delivery/i })
  await modal.first().waitFor({ state: 'visible', timeout: 12_000 }).catch(() => {})
  return modal.first()
}

async function readBolNumber(page) {
  const modal = await waitForUpdateModal(page)
  const byLabel = page.getByLabel(/b\.?\s*o\.?\s*l/i)
  if ((await byLabel.count()) > 0) {
    const v = ((await byLabel.first().inputValue().catch(() => '')) || '').trim()
    if (v) return v.split(/\s+/)[0]
  }

  const fromModal = await page
    .evaluate(() => {
      const roots = Array.from(
        document.querySelectorAll('.modal, [role="dialog"], .ui-dialog, .modal-dialog, .k-window, body')
      )
      for (const root of roots) {
        const text = (root.innerText || '').toLowerCase()
        if (!text.includes('b.o.l') && !text.includes('bol') && !text.includes('bill of lading')) {
          continue
        }
        const labels = Array.from(root.querySelectorAll('label, span, td, div, th'))
        for (const label of labels) {
          const t = (label.textContent || '').replace(/\s+/g, ' ').trim()
          if (!/b\.?\s*o\.?\s*l|bill of lading/i.test(t) || t.length > 80) continue
          let input =
            label.querySelector('input') ||
            label.parentElement?.querySelector('input') ||
            label.nextElementSibling
          if (input && input.tagName !== 'INPUT') {
            input = input.querySelector?.('input') || null
          }
          if (input && input.tagName === 'INPUT') {
            const val = String(input.value || '').trim()
            if (val) return val
          }
        }
        const inputs = Array.from(root.querySelectorAll('input[type="text"], input:not([type])'))
        for (const input of inputs) {
          const id = `${input.id || ''} ${input.name || ''} ${input.placeholder || ''}`.toLowerCase()
          if (/bol|bill.?of.?lading|supplier/.test(id)) {
            const val = String(input.value || '').trim()
            if (val) return val
          }
        }
      }
      return ''
    })
    .catch(() => '')

  if (fromModal) return String(fromModal).trim().split(/\s+/)[0]

  // Fallback: first non-date text input in visible modal
  if ((await modal.count()) > 0) {
    const inputs = modal.locator('input[type="text"], input:not([type])')
    const n = await inputs.count()
    for (let i = 0; i < n; i++) {
      const val = ((await inputs.nth(i).inputValue().catch(() => '')) || '').trim()
      if (!val) continue
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) continue
      if (/^load/i.test(val)) continue
      if (/^\d{4,}$/.test(val) || /^[A-Za-z0-9-]{4,}$/.test(val)) return val.split(/\s+/)[0]
    }
  }
  return ''
}

async function closeUpdateModal(page) {
  const closed = await clickFirstVisible(page, [
    page.getByRole('button', { name: /^cancel$/i }),
    page.locator('.modal, [role="dialog"], .ui-dialog').getByText(/^cancel$/i),
    page.locator('button.close, .modal .close, [aria-label="Close"]')
  ])
  if (!closed) {
    await page.keyboard.press('Escape').catch(() => {})
  }
  await sleep(600)
}

async function goToNextDeliveryPage(scope) {
  const next = scope.locator('a, button').filter({ has: scope.locator('.fa-chevron-right') })
  if ((await next.count()) > 0) {
    const btn = next.last()
    const cls = ((await btn.getAttribute('class').catch(() => '')) || '')
    if (/disabled/i.test(cls)) return false
    await btn.click({ timeout: 5000 }).catch(() => null)
    await sleep(1200)
    return true
  }
  return clickFirstVisible(scope, [
    scope.locator('a[title*="next" i]'),
    scope.locator('a').filter({ hasText: /^(›|»|>|next)$/i })
  ])
}

async function scrapeUnpaidFuelInvoices(page, scope, year, month, debugDir) {
  await setDeliveryMonth(scope, year, month)
  await setUnpaidStatus(scope)
  await clickSearch(scope)

  const invoices = []
  const seenKeys = new Set()
  const seenBols = new Set()

  for (let pageNo = 0; pageNo < 30; pageNo++) {
    let safety = 0
    while (safety < 40) {
      safety++
      const unpaid = await readUnpaidDeliveryRows(scope)
      const next = unpaid.find((r) => !seenKeys.has(r.key))
      if (!next) break

      seenKeys.add(next.key)
      console.log(
        `[Cstore] Opening unpaid delivery ${next.invoiceDate} Load ${next.load || '?'} ($${next.amount})`
      )
      const opened = await openEditForRow(scope, next)
      if (!opened) {
        console.warn(`[Cstore] Could not open edit for ${next.key}`)
        await saveDebug(page, debugDir, `fuel-edit-miss-${pageNo}-${safety}`)
        continue
      }

      const bol = await readBolNumber(page)
      await closeUpdateModal(page)

      if (!bol) {
        console.warn(`[Cstore] No B.O.L found for ${next.key}`)
        await saveDebug(page, debugDir, `fuel-bol-miss-${pageNo}-${safety}`)
        continue
      }
      if (seenBols.has(bol)) continue
      seenBols.add(bol)
      invoices.push({
        invoiceNumber: bol,
        invoiceDate: next.invoiceDate,
        amount: next.amount
      })
      console.log(`[Cstore] Captured Fuel invoice ${bol} · ${next.invoiceDate} · $${next.amount}`)
    }

    if (!(await goToNextDeliveryPage(scope))) break
  }

  return invoices
}

async function runFuelDeliveries(config, options = {}) {
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
      return { ...login, taskKey: 'fuel_invoices' }
    }

    await openGasDelivery(page, config, hooks)
    const scope = await deliveryScope(page)
    console.log(`[Cstore] Gas delivery ready at ${page.url()}`)

    const invoices = await scrapeUnpaidFuelInvoices(page, scope, year, month, debugDir)
    const message =
      invoices.length === 0
        ? `Fuel: no unpaid gas deliveries for ${year}-${String(month).padStart(2, '0')}`
        : `Fuel: read ${invoices.length} unpaid delivery invoice(s)`

    return {
      ok: true,
      loginRequired: false,
      url: page.url(),
      year,
      month,
      invoices,
      message
    }
  } catch (err) {
    await saveDebug(page, debugDir, 'fuel-deliveries-error')
    return {
      ok: false,
      loginRequired: isCstoreLoginUrl(page.url()),
      url: page.url(),
      year,
      month,
      invoices: [],
      message: err.message || String(err)
    }
  } finally {
    // Keep browser profile open like other jobs — context stays alive via user-data.
    // Close only extra pages if needed; launchContext manages lifecycle.
    try {
      // Mirror vendor invoices: close context when done with this job
      await context.close()
    } catch {
      // ignore
    }
  }
}

module.exports = {
  runFuelDeliveries
}
