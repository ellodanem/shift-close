/**
 * electron/main.js — Electron wrapper for the Shift Close Agent.
 * Runs the Node agent in-process (no fork). Uses 127.0.0.1 for dashboard URLs so the window
 * does not hit IPv6 (::1) while Express listens on IPv4 only — a common cause of a blank white window on Windows.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Blank white renderer windows on some Windows GPU/driver stacks — disable before app is ready.
if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

let tray = null
let agentModule = null
let dashboardWindow = null

const DEFAULT_DASHBOARD_PORT = 3001

function getDashboardPort() {
  try {
    const f = path.join(app.getPath('userData'), 'agent.config.json')
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'))
      const p = parseInt(j.dashboardPort, 10)
      if (!Number.isNaN(p) && p > 0 && p < 65536) return p
    }
  } catch (e) {
    console.warn('[Electron] Could not read dashboard port:', e.message)
  }
  return DEFAULT_DASHBOARD_PORT
}

function dashboardOrigin() {
  return `http://127.0.0.1:${getDashboardPort()}`
}

function getAgentRoot() {
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, '..')
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  openDashboard()
})

// Auto-start with Windows
function setAutoStart(enable) {
  if (process.platform !== 'win32') return
  const exe = app.getPath('exe')
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: exe,
    args: ['--autostart']
  })
}

/** Desktop .lnk → same EXE the user should run daily (not the NSIS installer). */
function createDesktopShortcutForAgent() {
  if (process.platform !== 'win32' || typeof shell.writeShortcutLink !== 'function') return false
  const exe = app.getPath('exe')
  const lnk = path.join(app.getPath('desktop'), 'Shift Close Agent.lnk')
  return shell.writeShortcutLink(lnk, 'create', {
    target: exe,
    cwd: path.dirname(exe),
    description: 'Shift Close Agent',
    icon: exe,
    iconIndex: 0
  })
}

/** Branded tray / window icon (cropped tile from horizontal lockup). */
function getBrandedIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'assets', 'tray.png')
  }
  return path.join(__dirname, 'assets', 'tray.png')
}

function getBrandedImage() {
  const p = getBrandedIconPath()
  const img = nativeImage.createFromPath(p)
  if (img.isEmpty()) {
    console.warn('[Electron] tray.png missing or invalid at', p)
  }
  return img
}

function loadFailedDashboardHtml(code, desc, url) {
  const origin = dashboardOrigin()
  const safe = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dashboard load error</title></head>' +
    '<body style="font-family:system-ui,sans-serif;padding:24px;background:#fef2f2;color:#111;max-width:52rem">' +
    '<h1 style="margin-top:0">This window could not show the dashboard</h1>' +
    '<p><strong>Error ' +
    safe(code) +
    ':</strong> ' +
    safe(desc) +
    '</p>' +
    '<p><strong>URL:</strong> ' +
    safe(url) +
    '</p>' +
    '<p>Open <a href="' +
    origin +
    '/">' +
    origin +
    '/</a> in <strong>Chrome or Edge</strong>. If the full UI appears there, the server is running and only this embedded window is failing.</p>' +
    '<p style="font-size:0.9rem;color:#444">The real dashboard has a <strong>dark blue header</strong> and buttons named ' +
    '<em>Test Device Connection</em>, <em>Sync Attendance Now</em>, and <em>Push Staff to Device</em>. ' +
    'Tiny <em>Review</em> / <em>Push</em> controls are <strong>not</strong> from Shift Close Agent.</p>' +
    '</body></html>'
  )
}

function getStatusTooltip(statusPayload) {
  if (!statusPayload) return 'Shift Close Agent'
  if (!statusPayload.configured) return 'Shift Close Agent — Not configured (open dashboard)'
  if (statusPayload.deviceStatus === 'connected') return 'Shift Close Agent — Device connected'
  if (statusPayload.deviceStatus === 'error') return 'Shift Close Agent — Device error'
  return 'Shift Close Agent — Device status pending'
}

async function waitForDashboardReady(maxAttempts = 120, intervalMs = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = getDashboardPort()
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(1500)
      })
      if (res.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

function openDashboard() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus()
    return
  }
  const winIcon = getBrandedImage()
  dashboardWindow = new BrowserWindow({
    width: 960,
    height: 700,
    title: 'Shift Close Agent',
    icon: winIcon.isEmpty() ? undefined : winIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // Only used to load our own http://127.0.0.1 dashboard (avoids rare blank renderer with default sandbox/security).
      webSecurity: false
    },
    autoHideMenuBar: true,
    backgroundColor: '#f3f4f6'
  })
  const loadingHtml =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shift Close Agent</title></head>' +
    '<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#334155">' +
    '<p>Starting dashboard…</p></body></html>'
  dashboardWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHtml))

  dashboardWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    // -3 = ERR_ABORTED (e.g. we navigated away); ignore so we do not flash an error during handoff.
    if (code === -3) return
    console.error('[Electron] Dashboard failed to load', { code, desc, url })
    if (!dashboardWindow || dashboardWindow.isDestroyed()) return
    const html = loadFailedDashboardHtml(code, desc, url)
    dashboardWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  })

  ;(async () => {
    const ok = await waitForDashboardReady()
    if (!dashboardWindow || dashboardWindow.isDestroyed()) return
    const origin = dashboardOrigin()
    if (ok) {
      await dashboardWindow.loadURL(`${origin}/`)
    } else {
      const port = getDashboardPort()
      const errHtml =
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:system-ui;padding:24px">' +
        '<h1>Dashboard did not start</h1><p>The agent server on port ' +
        port +
        ' did not respond. Try <strong>Quit</strong> from the tray menu and open the app again, or run from a command prompt to see error output.</p>' +
        '<p>You can also open <a href="' +
        origin +
        '/">' +
        origin +
        '/</a> in an external browser.</p></body></html>'
      await dashboardWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errHtml))
    }
  })()

  dashboardWindow.on('closed', () => { dashboardWindow = null })
}

function buildTrayMenu() {
  const winExtras =
    process.platform === 'win32'
      ? [
          {
            label: 'Create Desktop shortcut',
            click: () => {
              const ok = createDesktopShortcutForAgent()
              if (ok) {
                const lnk = path.join(app.getPath('desktop'), 'Shift Close Agent.lnk')
                shell.showItemInFolder(lnk)
              } else {
                dialog.showErrorBox(
                  'Shift Close Agent',
                  'Could not create a shortcut on your Desktop. Open the folder where the app is installed and pin "Shift Close Agent.exe", or run the installer once and leave "Create desktop shortcut" enabled.'
                )
              }
            }
          },
          {
            label: 'Show program in File Explorer',
            click: () => shell.showItemInFolder(app.getPath('exe'))
          },
          { type: 'separator' }
        ]
      : []
  return Menu.buildFromTemplate([
    { label: 'Shift Close Agent', enabled: false },
    { type: 'separator' },
    { label: 'Open Dashboard', click: openDashboard },
    { label: 'Open in Browser', click: () => shell.openExternal(dashboardOrigin() + '/') },
    { type: 'separator' },
    ...winExtras,
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => setAutoStart(item.checked) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } }
  ])
}

function startAgent() {
  const userData = app.getPath('userData')
  process.env.AGENT_CONFIG_DIR = userData

  const indexPath = path.join(getAgentRoot(), 'src', 'index.js')
  try {
    agentModule = require(indexPath)
    agentModule.start()
  } catch (err) {
    console.error('[Electron] Failed to start agent:', err)
    dialog.showErrorBox(
      'Shift Close Agent — Dashboard failed to start',
      `The local dashboard server did not start, so nothing will listen on port ${getDashboardPort()}.\n\n` +
        `${err.message || String(err)}\n\n` +
        'If you are on a dev build, try: cd agent && npm start'
    )
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('Shift Close Agent')

  // Create tray (winner artwork — same tile as app / installer icon)
  const trayImg = getBrandedImage()
  tray = new Tray(trayImg.isEmpty() ? nativeImage.createEmpty() : trayImg)
  tray.setToolTip('Shift Close Agent — Starting…')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', openDashboard)

  // Start agent (in-process; no fork)
  startAgent()

  // Update tray icon based on agent status (poll dashboard)
  setInterval(async () => {
    try {
      const res = await fetch(`${dashboardOrigin()}/api/status`)
      if (res.ok) {
        const s = await res.json()
        tray.setToolTip(getStatusTooltip(s))
        tray.setContextMenu(buildTrayMenu())
      }
    } catch {
      tray.setToolTip('Shift Close Agent — Dashboard unreachable')
    }
  }, 15000)

  // Auto-start on first run
  setAutoStart(true)

  // Open dashboard on first launch (not autostart)
  if (!process.argv.includes('--autostart')) {
    setTimeout(openDashboard, 1500)
  }
})

app.on('window-all-closed', (e) => {
  // Stay in tray even when all windows closed
  e.preventDefault()
})

app.on('before-quit', () => {
  app.isQuitting = true
  if (agentModule && typeof agentModule.stop === 'function') {
    agentModule.stop()
  }
})
