/**
 * electron/main.js — Electron tray wrapper for the Shift Close Harvest Agent.
 * Packaged builds spawn a bundled Node 20 runtime (Playwright rejects Electron's Node).
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

let tray = null
let agentChild = null
let dashboardWindow = null
let lastStatus = null
let updateState = null
let updatePrompted = false
let installStarted = false
let agentStopStarted = false
let agentStopPromise = null

const DEFAULT_DASHBOARD_PORT = 3921
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000

function getConfigDir() {
  return app.isPackaged ? app.getPath('userData') : getAgentRoot()
}

function getDashboardPort() {
  try {
    const f = path.join(getConfigDir(), 'harvest-agent.config.json')
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
  if (!app.isPackaged) return path.join(__dirname, '..')
  // asar:false so system/bundled Node can require playwright from disk
  return app.getAppPath()
}

function getNodeBinary() {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'node', 'node.exe')
    if (fs.existsSync(bundled)) return bundled
  }
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

function getBrandedIconPath() {
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, 'app', 'electron', 'assets', 'tray.png')
    if (fs.existsSync(unpacked)) return unpacked
  }
  return path.join(__dirname, 'assets', 'tray.png')
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
  const img = nativeImage.createFromPath(getBrandedIconPath())
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

async function waitForDashboardReady(maxAttempts = 60, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = getDashboardPort()
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(2000)
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

function logUpdate(line) {
  const text = `[${new Date().toISOString()}] ${line}\n`
  console.log('[Harvest Update]', line)
  try {
    fs.appendFileSync(path.join(getConfigDir(), 'update.log'), text)
  } catch {}
}

function applyTrayStatus(statusPayload) {
  lastStatus = statusPayload
  if (!tray) return
  if (updateState?.phase === 'ready') {
    tray.setToolTip(`Shift Close Harvest Agent — Update ${updateState.version} ready`)
  } else if (updateState?.phase === 'downloading') {
    tray.setToolTip(`Shift Close Harvest Agent — Downloading ${updateState.version}`)
  } else if (statusPayload?.paused) {
    tray.setToolTip('Shift Close Harvest Agent — PAUSED')
  } else if (statusPayload?.cstoreSessionOk) {
    tray.setToolTip('Shift Close Harvest Agent — Cstore signed in')
  } else if (statusPayload?.configured) {
    tray.setToolTip('Shift Close Harvest Agent — Running')
  } else {
    tray.setToolTip('Shift Close Harvest Agent — Needs setup')
  }
  tray.setContextMenu(buildTrayMenu(statusPayload))
  maybePromptForUpdate()
}

function stopAgentChild() {
  if (agentStopPromise) return agentStopPromise
  agentStopStarted = true
  app.isQuitting = true
  if (!agentChild || agentChild.killed) return Promise.resolve()
  const child = agentChild
  agentStopPromise = new Promise((resolve) => {
    const timer = setTimeout(resolve, 8000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    try {
      child.kill()
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
  return agentStopPromise
}

async function installUpdateNow() {
  if (installStarted || updateState?.phase !== 'ready') return
  installStarted = true
  logUpdate(`Installing ${updateState.version}`)
  await stopAgentChild()
  autoUpdater.quitAndInstall(true, true)
}

function maybePromptForUpdate() {
  if (updateState?.phase !== 'ready' || updatePrompted || installStarted) return
  if (lastStatus?.jobRunning) return
  updatePrompted = true
  const version = updateState.version
  dialog
    .showMessageBox({
      type: 'info',
      buttons: ['Restart and install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Shift Close Harvest Agent',
      message: `Version ${version} is ready`,
      detail:
        'Restart to install it. Settings and the harvest secret stay on this PC. Later installs the update the next time you quit.'
    })
    .then(({ response }) => {
      if (response === 0) installUpdateNow()
    })
    .catch((err) => {
      logUpdate(`Update prompt failed: ${err && err.message ? err.message : String(err)}`)
    })
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    logUpdate('Skipping update check (not a packaged install)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = {
    info: (message) => logUpdate(typeof message === 'string' ? message : JSON.stringify(message)),
    warn: (message) => logUpdate(typeof message === 'string' ? message : JSON.stringify(message)),
    error: (message) => logUpdate(message && message.stack ? message.stack : String(message))
  }

  autoUpdater.on('update-available', (info) => {
    updateState = { phase: 'downloading', version: info.version }
    logUpdate(`Update available: ${info.version}`)
    applyTrayStatus(lastStatus)
  })

  autoUpdater.on('update-not-available', (info) => {
    logUpdate(`Up to date (${info?.version || app.getVersion()})`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateState = { phase: 'ready', version: info.version }
    logUpdate(`Update downloaded: ${info.version}`)
    applyTrayStatus(lastStatus)
    if (tray) {
      tray.displayBalloon({
        title: 'Harvest Agent update',
        content: `Version ${info.version} is ready to install.`
      })
    }
  })

  autoUpdater.on('error', (err) => {
    logUpdate(`Update check failed: ${err && err.message ? err.message : String(err)}`)
  })

  const check = () => {
    if (updateState?.phase === 'ready' || installStarted) return
    autoUpdater.checkForUpdates().catch((err) => {
      logUpdate(`Update check failed: ${err && err.message ? err.message : String(err)}`)
    })
  }

  setTimeout(check, 20000)
  setInterval(check, UPDATE_CHECK_MS)
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

  const updateItems =
    updateState?.phase === 'ready'
      ? [
          {
            label: `Restart to install ${updateState.version}`,
            click: () => installUpdateNow()
          },
          { type: 'separator' }
        ]
      : updateState?.phase === 'downloading'
        ? [
            { label: `Downloading update ${updateState.version}…`, enabled: false },
            { type: 'separator' }
          ]
        : []

  return Menu.buildFromTemplate([
    ...updateItems,
    { label: `Shift Close Harvest Agent ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Open dashboard', click: openDashboard },
    {
      label: 'Open in browser',
      click: () => shell.openExternal(dashboardOrigin() + '/')
    },
    {
      label: 'Open Cstore',
      click: async () => {
        const s = await fetchStatus()
        const url =
          s?.cstoreUrl ||
          'https://secure.cstorepro.com/EmagineNETCOSM/Content/Tasks/TaskDashboard.aspx'
        shell.openExternal(url)
      }
    },
    { type: 'separator' },
    {
      label: paused ? 'Resume jobs' : 'Jobs running',
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
  const configDir = getConfigDir()
  const agentRoot = getAgentRoot()
  const indexPath = path.join(agentRoot, 'src', 'index.js')
  const nodeCmd = getNodeBinary()
  const logPath = path.join(configDir, 'agent.log')

  if (!fs.existsSync(indexPath)) {
    dialog.showErrorBox(
      'Shift Close Harvest Agent',
      `Agent entry not found:\n${indexPath}\n\nReinstall the app.`
    )
    return
  }

  let logStream = null
  try {
    logStream = fs.createWriteStream(logPath, { flags: 'a' })
    logStream.write(`\n--- ${new Date().toISOString()} starting ${nodeCmd} ${indexPath}\n`)
  } catch (err) {
    console.warn('[Harvest Electron] Could not open agent.log:', err.message)
  }

  agentChild = spawn(nodeCmd, [indexPath], {
    cwd: agentRoot,
    env: {
      ...process.env,
      HARVEST_CONFIG_DIR: configDir
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  if (agentChild.stdout) {
    agentChild.stdout.on('data', (buf) => {
      process.stdout.write(buf)
      if (logStream) logStream.write(buf)
    })
  }
  if (agentChild.stderr) {
    agentChild.stderr.on('data', (buf) => {
      process.stderr.write(buf)
      if (logStream) logStream.write(buf)
    })
  }

  agentChild.on('error', (err) => {
    console.error('[Harvest Electron] Failed to start agent:', err)
    dialog.showErrorBox(
      'Shift Close Harvest Agent',
      `Could not start the harvest agent.\n\n${err.message || String(err)}\n\nNode used: ${nodeCmd}`
    )
  })

  agentChild.on('exit', (code, signal) => {
    if (logStream) {
      try {
        logStream.write(`\n--- exited code=${code} signal=${signal}\n`)
        logStream.end()
      } catch {}
    }
    agentChild = null
    if (app.isQuitting) return
    if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') return
    dialog.showErrorBox(
      'Shift Close Harvest Agent',
      `The harvest agent stopped unexpectedly (code ${code ?? signal ?? 'unknown'}).\n\nSee log:\n${logPath}`
    )
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.westline.shiftclose.harvest-agent')

  tray = new Tray(trayIcon())
  tray.setToolTip('Shift Close Harvest Agent — Starting…')
  tray.setContextMenu(buildTrayMenu(null))
  tray.on('click', openDashboard)

  startAgent()
  setAutoStart(true)
  setupAutoUpdater()

  setInterval(async () => {
    applyTrayStatus(await fetchStatus())
  }, 15000)

  if (!process.argv.includes('--autostart')) {
    setTimeout(openDashboard, 1500)
  }
})

app.on('window-all-closed', (e) => {
  e.preventDefault()
})

app.on('before-quit', (event) => {
  app.isQuitting = true
  const pendingUpdate = updateState?.phase === 'ready' && !installStarted

  if (!agentStopStarted && agentChild && !agentChild.killed) {
    event.preventDefault()
    stopAgentChild().then(() => {
      if (pendingUpdate) installUpdateNow()
      else app.quit()
    })
    return
  }

  if (pendingUpdate) {
    event.preventDefault()
    installUpdateNow()
  }
})
