# Attendance → Logs → Staff filter (revert reference)

## Snapshot before the searchable list (2026-03-27)

- **Git commit (parent / last “pills-only” UI):** `6ebba7650687d13ef68e51e35fbc7937938fc341`
- **File:** `app/attendance/page.tsx`
- **Previous behavior:** Staff filter was a **single horizontal row of pills** (“All” + one truncated pill per active staff with device). Horizontal scroll on narrow widths; names capped with `max-w-[4.5rem]` / `sm:max-w-[5.5rem]`.
- **State unchanged for filtering logic:** `staffFilter` (`''` = all), `displayedLogs`, `allTabPill`, `staffTabPill`, `staffPillIndicator` / punch helpers — same semantics; only the **control UI** changed.

## Revert only this UI

After the feature commit exists on your branch:

```bash
git checkout 6ebba7650687d13ef68e51e35fbc7937938fc341 -- app/attendance/page.tsx
```

Or revert the specific commit (if it only touched this file):

```bash
git revert <commit-sha>
```

## Other working-tree files (not part of this change)

At the time of the staff-filter edit, the repo also had local modifications to `lib/access-control.ts` and `lib/roles.ts` — unrelated to the attendance staff strip. Do not mix those into a revert of the staff filter unless you intend to.
