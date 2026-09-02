/**
 * cstoreKeepalive.js — open Cstore Pro with a persistent browser profile.
 * First run: log in once in the headed window. Later runs reuse cookies.
 */

const fs = require('fs')
const { chromium } = require('playwright')

async function pageLooksLoggedIn(page) {
  const url = page.url().toLowerCase()
  if (url.includes('login') || url.includes('signin') || url.includes('logon')) {
    return false
  }

  const passwordCount = await page.locator('input[type="password"]').count()
  if (passwordCount > 0) return false

  const body = ((await page.locator('body').innerText().catch(() => '')) || '').toLowerCase()
  if (
    body.includes('report center') ||
    body.includes('day closing') ||
    body.includes('task dashboard') ||
    body.includes('customer account')
  ) {
    return true
  }

  if (url.includes('taskdashboard') || url.includes('/content/tasks')) {
    return true
  }

  return false
}

async function runCstoreKeepalive(config) {
  fs.mkdirSync(config.userDataDir, { recursive: true })

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: !config.headed,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true
  })

  const page = context.pages()[0] || (await context.newPage())
  let loginRequired = false

  try {
    await page.goto(config.cstoreUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    })
    await new Promise((r) => setTimeout(r, 1500))

    let ok = await pageLooksLoggedIn(page)
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
  } finally {
    await context.close()
  }
}

module.exports = { runCstoreKeepalive, pageLooksLoggedIn }
