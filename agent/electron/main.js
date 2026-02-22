/**
 * electron/main.js — Electron wrapper for the Shift Close Agent.
 * Adds system tray icon, auto-start with Windows, and wraps the Node.js agent.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron')
const path = require('path')
const { fork } = require('child_process')

let tray = null
let agentProcess = null
let dashboardWindow = null
const DASHBOARD_PORT = 3001

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
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: process.execPath,
    args: ['--autostart']
  })
}

function getStatusIcon(color) {
  // Simple colored circle as tray icon
  // In production, replace with proper .ico files in assets/
  const colors = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444', grey: '#9ca3af' }
  const c = colors[color] || colors.grey
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <circle cx="8" cy="8" r="7" fill="${c}"/>
  </svg>`
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))
}

function openDashboard() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus()
    return
  }
  dashboardWindow = new BrowserWindow({
    width: 960,
    height: 700,
    title: 'Shift Close Agent',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    autoHideMenuBar: true
  })
  dashboardWindow.loadURL(`http://localhost:${DASHBOARD_PORT}`)
  dashboardWindow.on('closed', () => { dashboardWindow = null })
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Shift Close Agent', enabled: false },
    { type: 'separator' },
    { label: 'Open Dashboard', click: openDashboard },
    { label: 'Open in Browser', click: () => shell.openExternal(`http://localhost:${DASHBOARD_PORT}`) },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => setAutoStart(item.checked) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } }
  ])
}

function startAgent() {
  const agentScript = path.join(__dirname, '..', 'src', 'index.js')
  agentProcess = fork(agentScript, [], {
    silent: false,
    env: { ...process.env }
  })

  agentProcess.on('exit', (code) => {
    console.log(`[Electron] Agent process exited with code ${code}`)
    if (!app.isQuitting) {
      // Restart agent after 5 seconds if it crashes
      setTimeout(startAgent, 5000)
      if (tray) tray.setImage(getStatusIcon('yellow'))
    }
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('Shift Close Agent')

  // Create tray
  tray = new Tray(getStatusIcon('grey'))
  tray.setToolTip('Shift Close Agent')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', openDashboard)

  // Start agent
  startAgent()

  // Update tray icon based on agent status (poll dashboard)
  setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:${DASHBOARD_PORT}/api/status`)
      if (res.ok) {
        const s = await res.json()
        const color = !s.configured ? 'grey'
          : s.deviceStatus === 'connected' ? 'green'
          : s.deviceStatus === 'error' ? 'red' : 'yellow'
        tray.setImage(getStatusIcon(color))
        tray.setContextMenu(buildTrayMenu())
      }
    } catch {}
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
  if (agentProcess) agentProcess.kill()
})
