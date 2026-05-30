# Roster coverage COUNT row

## Current behaviour

The **Count** row (desktop table and mobile “Coverage by day”) shows per-day shift headcounts for **active staff only**.

- **Active staff** — included in shift totals and the implicit “Off” bucket.
- **Inactive ghost rows** — still visible on the current/past-week grid when they were scheduled before leaving, but **excluded from COUNT**.
- When ghosts are present, the UI shows optional polish:
  - Footnote under the Count label: “Active only · N inactive not counted”
  - Per-day tooltip when a ghost is on shift that day: “Counts active staff only. … inactive scheduled this day (not counted).”

Implementation: `activeCountStaffIds`, `buildCountByDayAndShift`, and helpers in `lib/roster-week-client.ts`.

## Deferred: separate archive / inactive COUNT row

**Status:** documented option, not implemented.

Some managers may want to audit how many inactive staff still appear on locked days without mixing that into planning numbers. A future enhancement could add a second row, e.g. **“Inactive”**, showing per-day shift counts for ghost staff only.

| Approach | Pros | Cons |
|----------|------|------|
| Main COUNT = active only (current) | Clear planning signal | Ghost shifts not visible in totals |
| + Footnote / tooltip (current polish) | Explains gap when ghosts exist | No per-shift breakdown for inactive |
| Separate inactive COUNT row (deferred) | Full visibility for audits | Extra UI noise; often zero |

**Recommendation if built later:** show the inactive row only when `ghostStaffInWeek.length > 0`, styled muted (grey) to distinguish from operational COUNT. Reuse `ghostShiftCountsByDay` and the same shift colour chips as the main row.

**Not planned unless requested** — the ghost row + footnote/tooltip is sufficient for most weeks.
