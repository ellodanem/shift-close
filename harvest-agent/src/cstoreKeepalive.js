/**
 * cstoreKeepalive.js — open Cstore Pro with a persistent browser profile.
 * First run: log in once in the headed window. Later runs reuse cookies.
 */

const fs = require('fs')
const { chromium } = require('playwright')

function urlPathname(url) {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return String(url || '').toLowerCase()
  }
}

function isCstoreLoginUrl(url) {
  const path = urlPathname(url)
  return path.includes('/login') || path.includes('signin') || path.includes('logon')
}

async function pageLooksLoggedIn(page) {
  const url = page.url()
  if (isCstoreLoginUrl(url)) return false

  const title = ((await page.title().catch(() => '')) || '').toLowerCase()
  if (title.includes('login')) return false

  const path = urlPathname(url)
  if (path.includes('customercreditreport')) return true
  if (path.includes('taskdashboard') || path.includes('/content/tasks')) return true

  const body = ((await page.locator('body').innerText().catch(() => '')) || '').toLowerCase()
  if (body.includes('session expired')) return false
  if (
    body.includes('report center') ||
    body.includes('day closing') ||
    body.includes('task dashboard') ||
    body.includes('customer account report') ||
    body.includes('critical tasks')
  ) {
    return true
  }

  return false
}

async function waitForSession(page, config) {
  let ok = await pageLooksLoggedIn(page)
  let loginRequired = false
  if (!ok) {
    loginRequired = true
    if (!config.headed) {
      return {
        ok: false,
        loginRequired: true,
        url: page.url(),
        message:
          'Cstore login required. Run with headed: true once and sign in, then leave the agent running.'
      }
    }
    console.log(
      `[Cstore] Login required — sign in in the browser window (${Math.round(config.loginWaitMs / 1000)}s)`
    )
    const deadline = Date.now() + config.loginWaitMs
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000))
      ok = await pageLooksLoggedIn(page)
      if (ok) {
        loginRequired = false
        break
      }
    }
  }

  if (!ok) {
    return {
      ok: false,
      loginRequired,
      url: page.url(),
      message: loginRequired
        ? 'Cstore login was not completed in time'
        : 'Cstore dashboard was not detected'
    }
  }

  return {
    ok: true,
    loginRequired: false,
    url: page.url(),
    message: 'Cstore session is active'
  }
}

async function launchContext(config) {
  const launchOptions = {
    headless: !config.headed,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
    args: ['--disable-blink-features=AutomationControlled']
  }
  const channel = config.browserChannel || 'chrome'
  if (channel && channel !== 'chromium') {
    launchOptions.channel = channel
  }
  try {
    return await chromium.launchPersistentContext(config.userDataDir, launchOptions)
  } catch (err) {
    if (!launchOptions.channel) throw err
    console.warn(
      `[Cstore] ${channel} not available (${err.message}); falling back to Chromium`
    )
    delete launchOptions.channel
    return chromium.launchPersistentContext(config.userDataDir, launchOptions)
  }
}

async function ensureLoggedIn(page, config) {
  await page.goto(config.cstoreUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  })
  await new Promise((r) => setTimeout(r, 1500))
  return waitForSession(page, config)
}

async function runCstoreKeepalive(config) {
  fs.mkdirSync(config.userDataDir, { recursive: true })

  const context = await launchContext(config)
  const page = context.pages()[0] || (await context.newPage())

  try {
    return await ensureLoggedIn(page, config)
  } finally {
    await context.close()
  }
}

module.exports = {
  runCstoreKeepalive,
  pageLooksLoggedIn,
  isCstoreLoginUrl,
  launchContext,
  ensureLoggedIn,
  waitForSession
}
