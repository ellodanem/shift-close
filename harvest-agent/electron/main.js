/**
 * electron/main.js — Electron tray wrapper for the Shift Close Harvest Agent.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

let tray = null
let agentModule = null
let dashboardWindow = null

const DEFAULT_DASHBOARD_PORT = 3921

function getDashboardPort() {
  try {
    const f = path.join(app.getPath('userData'), 'harvest-agent.config.json')
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'))
      const p = parseInt(j.dashboardPort, 10)
      if (!Number.isNaN(p) && p > 0 && p < 65536) return p
    }
  } catch (e) {
    console.warn('[Harvest Electron] Could not read dashboard port:', e.message)
  }
  return DEFAULT_DASHBOARD_PORT
}

function dashboardOrigin() {
  return `http://127.0.0.1:${getDashboardPort()}`
}

function getAgentRoot() {
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, '..')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  openDashboard()
})

function setAutoStart(enable) {
  if (process.platform !== 'win32') return
  const exe = app.getPath('exe')
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: exe,
    args: ['--autostart']
  })
}

function createDesktopShortcut() {
  if (process.platform !== 'win32' || typeof shell.writeShortcutLink !== 'function') return false
  const exe = app.getPath('exe')
  const lnk = path.join(app.getPath('desktop'), 'Shift Close Harvest Agent.lnk')
  return shell.writeShortcutLink(lnk, 'create', {
    target: exe,
    cwd: path.dirname(exe),
    description: 'Shift Close Harvest Agent',
    icon: exe,
    iconIndex: 0
  })
}

function trayIcon() {
  const p = path.join(__dirname, 'assets', 'tray.png')
  const img = nativeImage.createFromPath(p)
  return img.isEmpty() ? nativeImage.createEmpty() : img
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
  const winIcon = trayIcon()
  dashboardWindow = new BrowserWindow({
    width: 980,
    height: 760,
    title: 'Shift Close Harvest Agent',
    icon: winIcon.isEmpty() ? undefined : winIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    },
    autoHideMenuBar: true,
    backgroundColor: '#f3f4f6'
  })

  const loadingHtml =
    '<!DOCTYPE html><html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#334155"><p>Starting harvest dashboard…</p></body></html>'
  dashboardWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHtml))

  ;(async () => {
    const ok = await waitForDashboardReady()
    if (!dashboardWindow || dashboardWindow.isDestroyed()) return
    const origin = dashboardOrigin()
    if (ok) {
      await dashboardWindow.loadURL(`${origin}/`)
    } else {
      await dashboardWindow.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px"><h1>Dashboard did not start</h1><p>Open <a href="${origin}/">${origin}/</a> in Chrome or Edge.</p></body></html>`
          )
      )
    }
  })()

  dashboardWindow.on('closed', () => {
    dashboardWindow = null
  })
}

async function fetchStatus() {
  try {
    const res = await fetch(`${dashboardOrigin()}/api/status`)
    if (res.ok) return res.json()
  } catch {}
  return null
}

function buildTrayMenu(statusPayload) {
  const paused = statusPayload?.paused === true
  const winExtras =
    process.platform === 'win32'
      ? [
          { label: 'Create Desktop shortcut', click: () => createDesktopShortcut() },
          { type: 'separator' }
        ]
      : []

  return Menu.buildFromTemplate([
    { label: 'Shift Close Harvest Agent', enabled: false },
    { type: 'separator' },
    { label: 'Open dashboard', click: openDashboard },
    {
      label: 'Open Cstore',
      click: async () => {
        const s = await fetchStatus()
        const url = s?.cstoreUrl || 'https://secure.cstorepro.com/EmagineNETCOSM/Content/Tasks/TaskDashboard.aspx'
        shell.openExternal(url)
      }
    },
    { type: 'separator' },
    {
      label: paused ? 'Resume jobs' : 'Pause jobs',
      enabled: paused,
      click: async () => {
        if (!paused) return
        try {
          await fetch(`${dashboardOrigin()}/api/resume`, { method: 'POST' })
        } catch (e) {
          dialog.showErrorBox('Harvest Agent', e.message || String(e))
        }
      }
    },
    ...winExtras,
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => setAutoStart(item.checked)
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])
}

function startAgent() {
  process.env.HARVEST_CONFIG_DIR = app.getPath('userData')
  const indexPath = path.join(getAgentRoot(), 'src', 'index.js')
  try {
    agentModule = require(indexPath)
    agentModule.start()
  } catch (err) {
    console.error('[Harvest Electron] Failed to start agent:', err)
    dialog.showErrorBox(
      'Shift Close Harvest Agent',
      `The local dashboard did not start.\n\n${err.message || String(err)}`
    )
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('Shift Close Harvest Agent')

  tray = new Tray(trayIcon())
  tray.setToolTip('Shift Close Harvest Agent — Starting…')
  tray.setContextMenu(buildTrayMenu(null))
  tray.on('click', openDashboard)

  startAgent()
  setAutoStart(true)

  setInterval(async () => {
    const s = await fetchStatus()
    if (s?.paused) {
      tray.setToolTip('Shift Close Harvest Agent — PAUSED')
    } else if (s?.cstoreSessionOk) {
      tray.setToolTip('Shift Close Harvest Agent — Cstore signed in')
    } else if (s?.configured) {
      tray.setToolTip('Shift Close Harvest Agent — Running')
    } else {
      tray.setToolTip('Shift Close Harvest Agent — Needs setup')
    }
    tray.setContextMenu(buildTrayMenu(s))
  }, 15000)

  if (!process.argv.includes('--autostart')) {
    setTimeout(openDashboard, 1500)
  }
})

app.on('window-all-closed', (e) => {
  e.preventDefault()
})

app.on('before-quit', () => {
  app.isQuitting = true
  if (agentModule && typeof agentModule.stop === 'function') {
    agentModule.stop()
  }
})
