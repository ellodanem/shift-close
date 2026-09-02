/**
 * customerAccounts.js — Cstore Customer Credit Report (Details) for one account.
 */

const fs = require('fs')
const path = require('path')
const { launchContext, ensureLoggedIn } = require('./cstoreKeepalive')
const { zonedParts } = require('./schedule')

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

async function openCustomerAccountsReport(page) {
  const already = await page.getByText(/customer account report/i).count()
  if (already > 0) return

  const paths = [
    [/report center/i, /other entries/i, /customer accounts/i],
    [/other entries/i, /customer accounts/i],
    [/customer accounts/i]
  ]

  for (const steps of paths) {
    for (const step of steps) {
      const clicked = await clickFirstVisible(page, [
        page.getByRole('link', { name: step }),
        page.getByRole('button', { name: step }),
        page.getByText(step)
      ])
      if (!clicked) break
      await sleep(800)
    }
    if ((await page.getByText(/customer account report/i).count()) > 0) return
  }

  throw new Error('Could not open Customer account report')
}

async function setThisMonth(page) {
  const monthBtn = page.getByRole('button', { name: /^this month$/i })
  if ((await monthBtn.count()) > 0 && (await monthBtn.first().isVisible().catch(() => false))) {
    await monthBtn.first().click()
    const submit = page.getByRole('button', { name: /^submit$/i })
    if ((await submit.count()) > 0) await submit.first().click()
    await sleep(500)
    return
  }

  const dateField = page
    .locator('input')
    .filter({ hasText: '' })
    .or(page.getByLabel(/report date/i))
    .first()

  const clickedDate = await clickFirstVisible(page, [
    page.getByLabel(/report date/i),
    page.locator('input[placeholder*="date" i]'),
    page.locator('text=Report Date').locator('xpath=following::input[1]')
  ])
  if (!clickedDate && (await dateField.count()) > 0) {
    await dateField.click({ timeout: 5000 }).catch(() => {})
  }
  await sleep(400)

  const thisMonth = page.getByRole('button', { name: /^this month$/i })
  if ((await thisMonth.count()) === 0) {
    console.warn('[Cstore] This Month preset not found; leaving current date range')
    return
  }
  await thisMonth.first().click()
  const submit = page.getByRole('button', { name: /^submit$/i })
  if ((await submit.count()) > 0) await submit.first().click()
  await sleep(500)
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

async function selectFirstCreditAccount(page) {
  const labeled = page.getByLabel(/credit account/i)
  const select =
    (await labeled.count()) > 0 ? labeled.first() : page.locator('select').first()

  const options = await select.locator('option').allTextContents()
  const names = options.map((t) => t.trim()).filter(usableAccountName)
  if (names.length === 0) {
    throw new Error('Credit Account dropdown has no customers')
  }
  const account = names[0]
  await select.selectOption({ label: account })
  return account
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

async function runFirstCustomerCreditReport(config) {
  fs.mkdirSync(config.userDataDir, { recursive: true })
  const debugDir = path.join(process.cwd(), 'downloads')
  const { ymd } = zonedParts(config.timeZone || 'America/St_Lucia')
  const [year, month] = ymd.split('-').map(Number)

  const context = await launchContext(config)
  const page = context.pages()[0] || (await context.newPage())

  try {
    const login = await ensureLoggedIn(page, config)
    if (!login.ok) {
      return { ...login, taskKey: 'customer_accounts' }
    }

    await openCustomerAccountsReport(page)
    await setThisMonth(page)
    await setReportTypeDetails(page)
    const account = await selectFirstCreditAccount(page)
    console.log(`[Cstore] First customer: ${account} (${year}-${String(month).padStart(2, '0')})`)
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
      account,
      year,
      month,
      html: captured.html,
      emptyReport: captured.empty,
      message: captured.empty
        ? `${account}: no activity this month`
        : `${account}: report captured`
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
