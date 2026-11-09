# Stakeholder tile dashboard (Nov 9, 2026)

The stakeholder account's Home (`/dashboard`) was simplified to categorized tiles, End of Day first.
Other roles keep the full dashboard.

## What changed
- `app/components/StakeholderTileHome.tsx` (new): the tile layout. Same tile style as `HomeShortcutStrip`.
- `app/dashboard/page.tsx`: `DashboardPage` now wraps the original page (renamed `FullDashboard`) and shows the tile home for stakeholders.
- Stakeholder gets **read-only** access to End of Day (`/days`, `/api/days`):
  `isStakeholderEndOfDayPath` in `lib/roles.ts`, used in `lib/access-control.ts`, `lib/app-nav.ts`, `lib/home-shortcuts.ts`.
  Writes (uploads, notify, send-email) stay blocked by the default in `apiWriteAllowedForRole`.
- Shifts tile left out: the stakeholder still cannot open `/shifts`.

## Revert
Revert point (before any of this): git tag `pre-stakeholder-tile-dashboard` (commit `a261fc8`).

- Undo just this change: `git revert <the "Simplify stakeholder dashboard" commit>`
- Or restore the old files: `git checkout pre-stakeholder-tile-dashboard -- app/dashboard/page.tsx lib/access-control.ts lib/roles.ts lib/app-nav.ts lib/home-shortcuts.ts`
  and delete `app/components/StakeholderTileHome.tsx`.
