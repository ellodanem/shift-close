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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function pageHasTurnstile(page) {
  const widgets = page.locator(
    '.cf-turnstile, iframe[src*="challenges.cloudflare"], iframe[src*="turnstile"], iframe[title*="Cloudflare" i]'
  )
  if ((await widgets.count()) > 0) return true
  return page.frames().some((f) => /challenges\.cloudflare|turnstile/i.test(f.url() || ''))
}

async function turnstileLooksSolved(page) {
  const token = await page
    .evaluate(() => {
      function findToken(root) {
        if (!root) return ''
        const nodes = root.querySelectorAll
          ? root.querySelectorAll('input, textarea')
          : []
        for (const el of nodes) {
          const name = String(el.name || el.id || '')
          const v = el.value || el.getAttribute('value') || ''
          if (/turnstile/i.test(name) && v && String(v).length > 20) return String(v)
        }
        const all = root.querySelectorAll ? root.querySelectorAll('*') : []
        for (const el of all) {
          if (el.shadowRoot) {
            const nested = findToken(el.shadowRoot)
            if (nested) return nested
          }
        }
        return ''
      }
      return findToken(document)
    })
    .catch(() => '')
  if (token) return true
  const success = page.locator('.cf-turnstile[data-state="success"], .cf-success')
  return (await success.count()) > 0
}

async function clickCstoreLoginButton(page) {
  const candidates = [
    page.getByRole('button', { name: /^log\s*in$/i }),
    page.getByRole('link', { name: /^log\s*in$/i }),
    page.locator(
      'input[type="submit"][value="Login" i], input[type="submit"][value="Log In" i], #btnLogin, #Login, #loginBtn'
    )
  ]
  for (const loc of candidates) {
    try {
      const n = loc.filter({ visible: true })
      if ((await n.count()) === 0) continue
      const btn = n.first()
      if (await btn.isDisabled().catch(() => false)) continue
      await btn.click({ timeout: 5000 })
      return true
    } catch {
      // try the next candidate
    }
  }
  return false
}

async function trySubmitLoginAfterTurnstile(page, state) {
  if (!isCstoreLoginUrl(page.url())) return
  if (await pageLooksLoggedIn(page)) return

  if (!state.nudged) {
    await page
      .locator('input[type="password"]')
      .filter({ visible: true })
      .first()
      .click({ timeout: 2000 })
      .catch(() => {})
    state.nudged = true
  }

  const hasCf = await pageHasTurnstile(page)
  const solved = await turnstileLooksSolved(page)
  if (hasCf && !solved) {
    if (!state.waitingLogged) {
      console.log('[Cstore] Waiting for Cloudflare “Verify you are human”')
      state.waitingLogged = true
    }
    return
  }

  if (Date.now() - state.lastClick < 8000) return

  if (!state.clickLogged) {
    console.log(
      hasCf
        ? '[Cstore] Verification complete — clicking Login'
        : '[Cstore] Clicking Login'
    )
    state.clickLogged = true
  }

  const clicked = await clickCstoreLoginButton(page)
  if (clicked) {
    state.lastClick = Date.now()
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    await sleep(800)
  } else {
    console.warn('[Cstore] Login button not found or not clickable yet')
  }
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
      `[Cstore] Login required — complete Cloudflare if shown; the agent will click Login (${Math.round(config.loginWaitMs / 1000)}s)`
    )
    const loginState = {
      lastClick: 0,
      waitingLogged: false,
      clickLogged: false,
      nudged: false
    }
    const deadline = Date.now() + config.loginWaitMs
    while (Date.now() < deadline) {
      await trySubmitLoginAfterTurnstile(page, loginState)
      await sleep(1000)
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
