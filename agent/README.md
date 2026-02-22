# Shift Close Agent

Local Windows agent that bridges your ZKTeco F22 attendance device with the Shift Close cloud app.

## What It Does

| Task | How |
|---|---|
| Pushes new staff to device | Polls app every 5 min, calls `setUser()` on device |
| Syncs attendance logs (backup) | Polls device every 15 min, pushes to Vercel API |
| Provides a local dashboard | Web UI at http://localhost:3001 |
| Runs silently in system tray | Green/yellow/red icon shows connection status |
| Starts with Windows automatically | Registered as a login item on first launch |

---

## Quick Setup (One Time)

### 1. Prerequisites
- Node.js 18+ installed on the PC
- PC must be on the **same local network** as the ZKTeco device

### 2. Install dependencies
```
cd agent
npm install
```

### 3. Run without Electron (headless mode)
```
npm start
```
Opens dashboard at http://localhost:3001

### 4. Configure via Dashboard
Open http://localhost:3001 and fill in:
- **Device IP** — the ZKTeco device's local IP (check router for connected devices)
- **Device Port** — default `4370`
- **Vercel App URL** — e.g. `https://shift-close.vercel.app`
- **Agent Secret Key** — must match `AGENT_SECRET` in Vercel environment variables

Click **Save Settings**, then **Test Device Connection**.

---

## Build Windows Installer (.exe)

```
cd agent
npm install
npm run build
```

Output: `agent/dist/Shift Close Agent Setup 1.0.0.exe`

Run the installer on the station PC. It will:
- Install the agent
- Add a system tray icon
- Register to start automatically with Windows

---

## Environment Variables (alternative to dashboard config)

Create `agent/.env`:
```
ZK_DEVICE_IP=192.168.1.x
ZK_DEVICE_PORT=4370
VERCEL_URL=https://your-app.vercel.app
AGENT_SECRET=your-secret-key
```

---

## Vercel Environment Variables Required

Add these in your Vercel project settings:
```
AGENT_SECRET=your-secret-key   # Same value as agent config
```

---

## ADMS (Real-time Push from Device)

The agent's attendance sync is a **backup**. For real-time punches, configure ADMS on the F22:

1. On device: **COMM → Cloud Server Setting**
2. Set Server Address to your Vercel domain (without https://)
3. Port: `443`, HTTPS: ON, Enable Domain: ON
4. The device will push every punch to `/api/attendance/adms` automatically

---

## File Structure

```
agent/
├── src/
│   ├── index.js           Main entry — starts server + sync loops
│   ├── config.js          Load/save configuration
│   ├── deviceClient.js    ZKTeco SDK wrapper
│   ├── staffSync.js       Push staff to device
│   ├── attendanceSync.js  Pull attendance, push to cloud
│   ├── activityLog.js     In-memory activity log
│   └── dashboard/
│       ├── server.js      Express API for dashboard
│       └── public/
│           └── index.html Dashboard UI
├── electron/
│   └── main.js            Electron wrapper (tray, window)
├── package.json
└── README.md
```

---

## Migrating to Raspberry Pi

The agent runs identically on a Pi:
1. Install Node.js on the Pi: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`
2. Copy the `agent/` folder to the Pi
3. Run `npm install && npm start`
4. Set up auto-start: `pm2 start src/index.js --name shift-close-agent && pm2 startup && pm2 save`

No code changes needed — same agent, different hardware.
