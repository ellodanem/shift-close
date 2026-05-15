# Attendance viewer (mobile, read-only)

## Route

- **Page:** `/attendance/viewer`
- **API:** `GET /api/attendance/viewer-summary?date=YYYY-MM-DD`

## Access

- **Admin** and **manager** roles only.
- Read-only: no punch edits or present/absence overrides on this page.

## Bookmark / sign-in

Send managers this link so login returns to the viewer:

```
/login?next=/attendance/viewer
```

## Default page after login (per user)

In **Settings → User accounts**, edit a user and set **After login** to **Attendance viewer**. Only that account is redirected; others keep the dashboard unless they use a `?next=` link.

## Features

- Week strip (Mon–Sun) with issue counts; tap a day for detail.
- Summary chips: present / late / absent.
- Scheduled list with status and last in/out for the day.
- Recent punches feed (newest first); tap a row for read-only detail.
- Polls `sync-hint` every 45s and refreshes when punches change.
