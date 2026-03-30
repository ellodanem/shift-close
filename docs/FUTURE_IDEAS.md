# Future ideas & planned features

Design notes for features **not yet implemented**. Add new sections here as ideas solidify. Active task work stays in `TODO.md`.

---

## 1. Daily hours email (end-of-day digest)

**Goal:** Around **10:00 PM**, email selected users a short summary (**WhatsApp later** when sending is ready).

**Content (two sections, keep scannable):**

- **Today:** Hours for the calendar day + **exceptions first** (missed punches, irregular/unpaired rows, short-shift signals — align with attendance UI). No raw punch tables in v1.
- **Pay period to date:** Running totals for the **current pay period** (e.g. Mon–Fri): accumulated hours + rolled-up exception counts. On Friday, still show **today** + **week-to-date**.

**Usability:** Lead with problems; one link to open attendance for detail; optional “only send if exceptions.”

**Decisions to lock:** Hours math (in/out → duration, overnight splits), **timezone** for “10 PM,” **pay period boundaries** (match `pay-days` / existing pay-period logic), recipient list, idempotent send per day.

**Out of scope v1:** Full payroll narrative; duplicate Grand Total / revenue.

---

## 2. Attendance vs roster (scheduled vs present)

**Goal:** Compare **who is scheduled** (roster) with **whether they punched** (device logs), surface **absent / present / excused**, with **manual overrides** (shift swaps, errors).

**Core rules (conceptual):**

- **Roster “Off”** (`shiftTemplateId` null, or explicit not-scheduled) → do **not** infer absent from missing punches; day is **N/A** or **not scheduled**.
- **Roster says working** (shift template, e.g. 6–1) → expect attendance evidence.
- **Scheduled + no qualifying evidence** → default **absent (unexcused)** until overridden or excused.
- **Manual override:** Present (swap), absent excused, wrong roster, etc., with note + actor; consider **not** overwriting overrides on blind recompute.

**Punch evidence (agreed):** **Any punch** on that **calendar date** for that staff (after `staffId` / `deviceUserId` resolution). Fingerprint device → treat as identity; buddy punching out of scope.

**Separation from punch “traffic lights”:** Roster-based **present / absent / excused** is **separate** from row **green / blue / red** (punch quality). Use a **different UI**: attendance **section**, **widget**, or **dashboard** — **no color coupling** between absent and punch diagnostics.

**Excused / planned absence — check before “unexcused absent”:**

| Source | Schema (today) | Role |
|--------|----------------|------|
| Vacation | `Staff.vacationStart` / `vacationEnd` | Date in range → vacation, no punch required |
| Sick leave | `StaffSickLeave` (date range, `status`) | Approved range → sick / excused |
| Single day off | `StaffDayOff` (`date`, `reason`, `status`) | Planned day off |
| Calling out | May use `StaffDayOff` same-day, a dedicated record, or override-only | Must exist so “scheduled + no punch” ≠ absent if they called out |

**Suggested decision order (staff + date):** (1) Not scheduled → N/A. (2) Vacation / sick / approved day-off → excused. (3) Scheduled, no time-off: any punch → present; no punch → unexcused absent until override.

**Technical notes:** Prefer **published** roster weeks for expectations; handle **no roster row** vs **Off** explicitly; **deviceUserId** missing → don’t auto-absent without policy.

**Optional later:** “Late” vs “present” using template start vs first punch (not required if “any punch = present”).

---

## 3. Adding more ideas

Use short subsections with **Goal**, **Rough behavior**, and **Open decisions**. Link to PRDs or issues when they exist.
