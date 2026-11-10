# Stakeholder tile dashboard (Nov 9, 2026)

The stakeholder account's Home (`/dashboard`) was simplified to categorized tiles, End of Day first.
Other roles keep the full dashboard.

## What changed
- `app/components/StakeholderTileHome.tsx` (new): the tile layout. Same tile style as `HomeShortcutStrip`.
- `app/dashboard/page.tsx`: `DashboardPage` now wraps the original page (renamed `FullDashboard`) and shows the tile home for stakeholders.
- Stakeholder gets only the **mini report** from End of Day (Nov 10, 2026): the "Mini report" tile opens `/days/mini`
  (pick a range, Generate, Print), fed by `/api/days/mini`, which returns just the Collected and Deposit totals
  (`lib/mini-report.ts`). `/days`, `/days/v2`, the range report and the rest of `/api/days` are closed to this role.
  `isStakeholderMiniReportPath` in `lib/roles.ts`, used in `lib/access-control.ts`, `lib/app-nav.ts`, `lib/home-shortcuts.ts`.
  (Before that, the stakeholder had read-only access to all of `/days` and `/api/days`: `isStakeholderEndOfDayPath`.)
- Roster, Attendance, Time Off and Applications tiles are shown greyed out and not clickable (`disabled: true` in
  `StakeholderTileHome.tsx`). Remove that flag to turn a tile back on. Page access via URL is unchanged.
- Stakeholder sidebar trimmed to Home, Accounting and Reports (`STAKEHOLDER_SIDEBAR_GROUPS` in `lib/app-nav.ts`).
  Operations, Insights, Financial, People, Mobile and Setup are hidden there; the pages are still reachable from the Home tiles.
- Shifts tile left out: the stakeholder still cannot open `/shifts`.

## Manager tile home (Nov 9, 2026)
The `manager` role (not admin) gets a similar home: Recently Used + Favorites stay, Upcoming with Today's roster
under it, then the same categorized tile layout as the stakeholder (End of Day first; Operations incl. Shifts,
Insights, People, Financial incl. fuel/vendor payments and Check Management), nothing greyed out
(`app/components/ManagerTileHome.tsx`). All dashboard widgets are removed for that role. Admin is unchanged.
The sidebar still has the full menu for the manager.
- Revert point: git tag `pre-manager-tile-dashboard` (commit `50eac46`).
- Undo: `git revert <the "manager tile dashboard" commit>`, or
  `git checkout pre-manager-tile-dashboard -- app/dashboard/page.tsx` and delete `app/components/ManagerTileHome.tsx`.
- Quick switch-off without reverting: set `isManagerTiles` to `false` in `app/dashboard/page.tsx`.

## Revert (stakeholder)
Revert point (before any of this): git tag `pre-stakeholder-tile-dashboard` (commit `a261fc8`).

- Undo just this change: `git revert <the "Simplify stakeholder dashboard" commit>`
- Or restore the old files: `git checkout pre-stakeholder-tile-dashboard -- app/dashboard/page.tsx lib/access-control.ts lib/roles.ts lib/app-nav.ts lib/home-shortcuts.ts`
  and delete `app/components/StakeholderTileHome.tsx`.
