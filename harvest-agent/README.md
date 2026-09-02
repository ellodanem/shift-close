# Shift Close Harvest Agent

Local browser agent that stays signed into Cstore Pro and reports job results to Shift Close.

This is **not** the ZKTeco attendance agent in `agent/`. It runs on a dedicated PC with a desktop (home PC, mini PC, or Pi with desktop).

## What it does

| Job | When | Result |
|---|---|---|
| Ping Shift Close | With every job | Last-seen on **Settings → Harvest agent** |
| `cstore_keepalive` | On start, then 7:00 and 19:00 America/St_Lucia | Pass if the Cstore dashboard is visible |
| `customer_accounts` | Manual or CLI | Imports customer credit reports into Shift Close |
| `vendor_invoices` | Manual or CLI | Scrapes Grocery → Purchases → Invoices and adds invoices in Shift Close |

Vendor invoices have no export. The agent selects a vendor and month, reads the table (including pagination), and posts rows to Shift Close. Existing invoices (same vendor, number, date, and amount) are skipped. If a vendor reuses an invoice number, a letter is appended (`2062886A`) and that mapping is included in the harvest summary email. VAT-registered vendors in Shift Close split the Cstore amount using the global VAT rate; new Cstore-only vendors are created with VAT off.

Cstore passwords stay in the local Chrome profile (`user-data/`). They are not stored in Shift Close. The **harvest secret** is stored encrypted on this PC (Windows DPAPI or Electron safeStorage) — enter it once in the dashboard; it cannot be viewed afterward.

### Login safety

- The agent clicks **Login at most once per job** (after Cloudflare if shown).
- If Cstore rejects login or login fails after submit, **all jobs pause** until an admin verifies the password in Chrome and clicks **Resume** in the local dashboard.
- The agent never retries a failed password automatically.

## Setup

1. Apply database scripts once (Neon SQL editor):
   - `scripts/neon-apply-harvest-agent.sql`
   - `scripts/neon-apply-harvest-agent-paused.sql`
   - `scripts/neon-apply-vendor-cstore-name.sql`
2. In Vercel, set `HARVEST_AGENT_SECRET`
3. On the harvest PC:

```
cd harvest-agent
copy config.example.json harvest-agent.config.json
npm.cmd install
```

### Option A — Node + dashboard (recommended for setup)

```
npm.cmd start
```

Open **http://127.0.0.1:3921**, set Shift Close URL and paste the harvest secret once. The first run opens **Google Chrome** — log into Cstore Pro, complete Cloudflare if shown, and wait for the dashboard to show **Signed in**.

### Option B — Electron tray app

```
npm.cmd run electron
```

Runs the same agent with a system tray icon, auto-start with Windows, and the dashboard in a window.

### Option C — Scheduled Task at logon

```
npm.cmd run install-task
```

Registers a Windows task that runs `node src/index.js` when you sign in.

## Schedule

All times use `timeZone` (default `America/St_Lucia`). Configure in the dashboard **Schedule** card.

| Job | Options |
|---|---|
| Cstore keep-alive | Daily at listed hours (`slotHours`), optional on start |
| Customer accounts | Off / Daily / Weekly (pick weekdays) / Monthly (day 1–28), plus time and which data month |
| Vendor invoices | Same as customer accounts |

Examples: weekly **Tue at 16:00** current month; monthly **day 2 at 08:00** previous month. The agent process must stay running.

## CLI (one-shot jobs)

Stop the daemon first if it is using the same Chrome profile.

```
npm.cmd run once
npm.cmd run customer-one
npm.cmd run customer-august
npm.cmd run customer-august -- --customer="NAME"
npm.cmd run customer-august -- --from="CLEAN OPS COMPANY"
npm.cmd run customer-august -- --all
npm.cmd run vendor-august -- --vendor=Acado
npm.cmd run vendor-august -- --all
```

## Local dashboard

**http://127.0.0.1:3921** — status, recent jobs, activity log, manual triggers, settings, resume when paused.

Tray menu (Electron): Open dashboard, Open Cstore, Resume (when paused), Quit.

## Cloud status

**Settings → Harvest agent** in Shift Close — online/stale/offline, Cstore session, **Paused** badge, task log, email summaries.

Configure task summary email under the same page.

## Config

`harvest-agent.config.json` (or `%AppData%` when using Electron):

- `vercelUrl` — Shift Close URL
- `agentKey` — short name for this PC
- `dashboardPort` — default `3921`
- Do **not** leave `agentSecret` in the file long-term; use the dashboard to store it securely.

Override config directory: `HARVEST_CONFIG_DIR`
