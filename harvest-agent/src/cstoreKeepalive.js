/**
 * cstoreKeepalive.js — open Cstore Pro with a persistent browser profile.
 * First run: log in once in the headed window. Later runs reuse cookies.
 * Login protection: at most one Login click per job; failure pauses the agent.
 */

const fs = require('fs')
const path = require('path')
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
  if (path.includes('grocerypurchase') || path.includes('purchaseinvoice')) return true
  if (path.includes('taskdashboard') || path.includes('/content/tasks')) return true

  const body = ((await page.locator('body').innerText().catch(() => '')) || '').toLowerCase()
  if (body.includes('session expired')) return false
  if (
    body.includes('report center') ||
    body.includes('day closing') ||
    body.includes('task dashboard') ||
    body.includes('customer account report') ||
    body.includes('manage purchases') ||
    body.includes('critical tasks')
  ) {
    return true
  }

  return false
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function loginFormFilled(page) {
  const fields = page.locator(
    'input[type="text"], input[type="email"], input[name*="user" i], input[id*="user" i]'
  )
  let username = ''
  const count = await fields.count().catch(() => 0)
  for (let i = 0; i < count; i++) {
    const el = fields.nth(i)
    if (!(await el.isVisible().catch(() => false))) continue
    username = ((await el.inputValue().catch(() => '')) || '').trim()
    if (username) break
  }
  const password = (
    (await page
      .locator('input[type="password"]')
      .filter({ visible: true })
      .first()
      .inputValue()
      .catch(() => '')) || ''
  ).trim()
  return username.length > 0 && password.length > 0
}

function findChromeExecutable() {
  if (process.platform !== 'win32') return null
  const candidates = [
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
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

async function loginFailureDetected(page) {
  if (!isCstoreLoginUrl(page.url())) return false

  const body = ((await page.locator('body').innerText().catch(() => '')) || '').toLowerCase()
  const patterns = [
    'invalid username',
    'invalid password',
    'incorrect password',
    'incorrect username',
    'wrong password',
    'login failed',
    'authentication failed',
    'account locked',
    'locked out',
    'has been locked',
    'disabled',
    'unsuccessful',
    'could not log',
    'unable to log'
  ]
  if (patterns.some((p) => body.includes(p))) return true

  const alert = page.locator(
    '.validation-summary-errors, .alert-danger, .error-message, [role="alert"]'
  )
  if ((await alert.count()) > 0) {
    const text = ((await alert.first().innerText().catch(() => '')) || '').toLowerCase()
    if (text && !text.includes('verify you are human')) return true
  }

  return false
}

async function trySubmitLoginAfterTurnstile(page, state) {
  if (!isCstoreLoginUrl(page.url())) return
  if (await pageLooksLoggedIn(page)) return
  if (state.submitUsed) return

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

  if (!state.clickLogged) {
    const filled = await loginFormFilled(page)
    if (!filled) {
      if (!state.waitingLogged) {
        console.log(
          '[Cstore] Enter your username and password in the browser window — the agent will click Login once both are filled'
        )
        state.waitingLogged = true
      }
      return
    }
    console.log(
      hasCf
        ? '[Cstore] Verification complete — clicking Login (once per job)'
        : '[Cstore] Credentials entered — clicking Login (once per job)'
    )
    state.clickLogged = true
  }

  const clicked = await clickCstoreLoginButton(page)
  if (!clicked) {
    console.warn('[Cstore] Login button not found or not clickable yet')
    return
  }

  state.submitUsed = true
  state.credentialsFilled = await loginFormFilled(page)
  state.submittedAt = Date.now()
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await sleep(1200)
}

async function waitForSession(page, config, hooks = {}, options = {}) {
  const manualSignIn = options.manualSignIn === true
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
      `[Cstore] Login required — enter credentials in the browser window (${Math.round(config.loginWaitMs / 1000)}s)`
    )
    const loginState = {
      submitUsed: false,
      submittedAt: 0,
      credentialsFilled: false,
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

      if (loginState.submitUsed && loginState.credentialsFilled) {
        if (await loginFailureDetected(page)) {
          const message =
            'Cstore rejected the login (wrong password or account locked). Jobs are paused — fix the password in the agent browser, then click Resume.'
          if (!manualSignIn && typeof hooks.onLoginFailure === 'function') {
            await hooks.onLoginFailure({ reason: 'cstore_login_failed', message })
          }
          return {
            ok: false,
            loginRequired: true,
            loginFailed: true,
            url: page.url(),
            message
          }
        }

        const sinceSubmit = Date.now() - loginState.submittedAt
        if (sinceSubmit >= 15000 && isCstoreLoginUrl(page.url())) {
          const message =
            'Cstore login did not succeed after submit. Jobs are paused — verify the password in the agent browser, then click Resume.'
          if (!manualSignIn && typeof hooks.onLoginFailure === 'function') {
            await hooks.onLoginFailure({ reason: 'cstore_login_failed', message })
          }
          return {
            ok: false,
            loginRequired: true,
            loginFailed: true,
            url: page.url(),
            message
          }
        }
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
  const chromePath = channel === 'chrome' ? findChromeExecutable() : null
  if (channel && channel !== 'chromium') {
    launchOptions.channel = channel
  }
  try {
    const context = await chromium.launchPersistentContext(config.userDataDir, launchOptions)
    if (chromePath || channel === 'chrome') {
      console.log(`[Cstore] Browser: ${chromePath || 'Google Chrome (channel)'}`)
    } else {
      console.log('[Cstore] Browser: Chromium (install Google Chrome for best results)')
    }
    return context
  } catch (err) {
    if (launchOptions.channel && chromePath) {
      console.warn(
        `[Cstore] Chrome channel failed (${err.message}); trying ${chromePath}`
      )
      delete launchOptions.channel
      launchOptions.executablePath = chromePath
      const context = await chromium.launchPersistentContext(config.userDataDir, launchOptions)
      console.log(`[Cstore] Browser: ${chromePath}`)
      return context
    }
    if (!launchOptions.channel) throw err
    console.warn(
      `[Cstore] ${channel} not available (${err.message}); falling back to Chromium`
    )
    delete launchOptions.channel
    const context = await chromium.launchPersistentContext(config.userDataDir, launchOptions)
    console.log('[Cstore] Browser: Chromium (install Google Chrome for best results)')
    return context
  }
}

async function ensureLoggedIn(page, config, hooks = {}) {
  await page.goto(config.cstoreUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  })
  await new Promise((r) => setTimeout(r, 1500))
  return waitForSession(page, config, hooks)
}

async function runCstoreKeepalive(config, hooks = {}) {
  fs.mkdirSync(config.userDataDir, { recursive: true })

  const context = await launchContext(config)
  const page = context.pages()[0] || (await context.newPage())

  try {
    return await ensureLoggedIn(page, config, hooks)
  } finally {
    await context.close()
  }
}

async function runCstoreSignIn(config) {
  fs.mkdirSync(config.userDataDir, { recursive: true })

  const context = await launchContext(config)
  const page = context.pages()[0] || (await context.newPage())

  try {
    await page.goto(config.cstoreUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    })
    await sleep(1500)
    return await waitForSession(page, config, {}, { manualSignIn: true })
  } finally {
    await context.close()
  }
}

module.exports = {
  runCstoreKeepalive,
  runCstoreSignIn,
  pageLooksLoggedIn,
  isCstoreLoginUrl,
  loginFailureDetected,
  launchContext,
  ensureLoggedIn,
  waitForSession
}
