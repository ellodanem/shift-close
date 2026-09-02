# Shift Close Harvest Agent

Local browser agent that stays signed into Cstore Pro and reports job results to Shift Close.

This is **not** the ZKTeco attendance agent in `agent/`. Long term it should run on a dedicated mini PC or Raspberry Pi with a desktop. For now it can run on a home PC.

## What it does today

| Job | When | Result |
|---|---|---|
| Ping Shift Close | With every job | Last-seen on **Settings → Harvest agent** |
| `cstore_keepalive` | On start, then 7:00 and 19:00 America/St_Lucia | Pass if the Cstore dashboard is visible |

Cstore passwords stay in the local Chrome profile (`harvest-agent/user-data/`). They are not stored in Shift Close.

Customer account Excel download is the next job after keep-alive is stable.

## Setup

1. Apply the database script once (Neon SQL editor): `scripts/neon-apply-harvest-agent.sql`
2. In Vercel, set `HARVEST_AGENT_SECRET` (or reuse `AGENT_SECRET`)
3. On this machine:

```
cd harvest-agent
copy config.example.json harvest-agent.config.json
```

Edit `harvest-agent.config.json`:

- `vercelUrl` — your Shift Close URL, no trailing slash
- `agentSecret` — same value as `HARVEST_AGENT_SECRET`
- `agentKey` — a short name, e.g. `home-pc` or `pi-1`

```
npm install
npm start
```

The first run opens Chromium. Log into Cstore Pro and wait until the store dashboard appears. The agent records **Pass** in Shift Close.

Leave the process running (Task Scheduler / pm2 later). At 7am and 7pm it reopens Cstore to refresh the session and pings Shift Close.

One-off test:

```
npm run once
```

## Status

In Shift Close: **Settings → Harvest agent**

- Online / stale / offline from last ping
- Cstore signed-in vs needs login
- Task log with pass or fail

## Raspberry Pi / mini PC later

Use a desktop OS (not Lite). Same Node 18+ install. Persistent profile means you log in once on that machine’s screen.
