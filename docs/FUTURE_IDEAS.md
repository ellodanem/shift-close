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

## 3. Individual staff attendance report — later

**Shipped (MVP + polish):** `/attendance/staff-report` — one staff, date range, daily Present/Absent (plus Excused/Off/Pending where applicable), clock times, daily hours, period total, print. Links from Attendance logs (staff filter) and Pay Period rows.

**Later (not in MVP):**

- **Late arrival** status (first punch vs roster shift start + grace) — distinct from live “no punch yet” late.
- **Email on demand** — send report PDF/HTML to staff or manager.
- **Staff self-service** — employee login to view own report (no app login for staff today).
- **Excel export** — same row layout as on-screen table.
- **Saved report snapshots** — freeze a copy when answering a dispute.
- **“Only days with issues”** filter — absent + irregular punches only.

---

## 4. Operations checklist (floating panel)

**Goal:** Global floating checklist of daily/weekly close tasks with derived green status, badge counts, and links into the right screen.

**Spec (locked):** [`operations-checklist.md`](./operations-checklist.md)

**Locked highlights:** Shift entry **W+1**; deposit comparison **bank receipt → process → due next day** (Fri–Sun → bank Mon → due **Tue**; Mon → due **Wed**; banking holidays push dates); weekly customer/vendor due **Sunday** with **`in_progress`** for partial invoice entry; O/S disclosure **excluded** from close; scans required unless station closed; `discrepancy` = incomplete.

**Still open:** Time-of-day cutoff, weekend notification policy, vendor complete rule detail.

---

## 5. Internal Inbox (shared station mail)

**Goal:** One work inbox for Westline covering Station (`westline.slu`), Management (`totalarubis`), and O/S (Outlook) — triage, assign, reply, and jump into the matching Shift Close record.

**Shipped (UI + IMAP sync):** `/inbox` with Compose / Reply / Reply all / Forward (To/Cc/Bcc). **Settings → Inbox mailboxes** configures Station / Management / O/S via IMAP app passwords; **Sync** pulls recent INBOX mail into the DB; attachments view/download via Blob or on-demand IMAP fetch. Mockups in `docs/ux-mockups/internal-inbox-*.png`.

**Still required:**
- Per-mailbox SMTP send-as (today send uses station SMTP)
- Done ↔ Gmail archive sync
- Cron auto-sync
- Role rules (who sees all vs assigned-only)
- Outlook OAuth if app passwords are blocked

**Out of scope:** Personal mail, calendar, spam fighting, helpdesk SLAs.

---

## 6. Payroll is its own tile and process

**Status:** Decision only (2026-09-25). Do not implement yet.

**Goal:** Payroll is a first-class tile and its own process. Attendance and payroll stay linked — hours and punches still feed pay — but payroll is not a next step of attendance.

**Rough behavior:**

- Own home tile and nav entry, separate from Attendance.
- Enter the payroll flow from that tile. It is not a button or continuation on the Attendance page.
- Today that continuation is **Extract Pay Period** on Attendance → `/attendance/pay-period`, then **Pay run** from a saved period (`/pay-run`). That chain should not be the way payroll is started.
- Attendance stays punches, roster match, late/absent, and the staff attendance report.
- The link is data (attendance feeds payroll). It is not a wizard step.

**Open decisions:** Tile label (Payroll vs Pay period vs Pay run), and whether the pay-period report and pay run sit under one payroll process or stay two screens inside it.

---

## 7. Adding more ideas

Use short subsections with **Goal**, **Rough behavior**, and **Open decisions**. Link to PRDs or issues when they exist.
