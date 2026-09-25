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

**Status:** First payroll screen is on `/payroll` (2026-09-25). The run is four steps: pay period, enter payroll, approve, print. Drafts can be deleted. An approved run can be voided with a reason, who voided it, and when. Voided amounts stay on record and no longer count toward N.I.S. Hours and money type columns can be shown, hidden, added, or removed from the hours step.

**Goal:** Payroll is a first-class tile and its own process. Attendance and payroll stay linked — hours and punches still feed pay — but payroll is not a next step of attendance.

**Entry:** Own home tile and nav entry. The run starts there. It is not **Extract Pay Period** on Attendance, and not a continuation into `/pay-run` from that page. Attendance stays punches, roster match, late/absent, and the staff attendance report. Extracted attendance fills hours after the pay period is chosen.

The Patriot layout is the model. US-only pieces are not copied: payroll tax, Social Security, Medicare, 401(k), W-2, 1099 contractors, direct-deposit funding, and departments. PAYE stays in Pay+.

### Step 1 — Pay period

Pay schedule, pay period start, pay period end, and pay date. **Import time list** saves that range and opens the hours.

### Step 2 — Enter payroll

Header from step 1 stays on the run: pay schedule, pay period, pay date.

- Schedules already on staff: Weekly, Bi-weekly, Semi-monthly, Monthly.
- Off-schedule: manual start date, end date, and pay date.
- The schedule chooses who is on this run.

**Enter hours and money**, split into Hourly and Salaried.

- Hourly row: name, rate, basic hours, OT hours (1.5×, split with the existing cycle cap), extra pay, line total.
- Hours prefill from extracted attendance for that period. The user can still edit them.
- Click the name to change the hourly rate, tax code, and medical for this run only, or for this run and future runs. Medical is also a column on the hours grid for this payroll.
- Salaried row: **Pay salary** checked by default. Uncheck to skip that person this run. Salary and tax code can be changed the same way as a rate (this run, or this run and future).
- **Hours & money types**, next to the hours heading, shows or hides Basic, Overtime, Extra, Medical, and Shortage, and can add or remove extra hour, money, or deduction columns. The choice is remembered on this browser. Added hour columns are paid at the hourly rate.
- Vacation and sick stay notes from attendance. They are not paid hour columns unless that is decided later.
- Save entries, clear entries, then **Continue**.

Deductions are not typed on this grid. They show on the review, where they can be adjusted before approval: employee NIS (5%, $250 monthly cap), staff loan, medical, shortage, and extra deductions. Employer NIS is a memo and is not taken from net.

### Step 3 — Review and approve

Summary grouped the same way: Hourly, then Salaried, then payroll totals. Columns: total hours, gross, net.

- **View details** opens each person: hours and earnings, deductions, gross, net, and bank / account for the banking pack. Employer NIS sits beside that as a memo. A line states that PAYE is still calculated in Pay+.
- **Back** returns to the hours step. Nothing is final until approve.
- **Download preview** before approve, so someone else can review it.
- **Approve payroll** locks the run.

### Step 4 — Done

Completed banner with the period and pay date.

- Print or download now, or later: payroll register, banking pack, the credit union allocation letter, and the **N.I.S. report**. These replace Patriot’s print-checks and tax-bill actions.
- The run can be left and reopened.

**N.I.S. report** (reference: `NIS 08152026.pdf`, period 08/16/2026–08/31/2026). One page per period:

- Header: **N.I.S.**, period start–end, cycle, and the month it is for (that sample is cycle 15, for August).
- Columns: **Name** (`staff number - name`), **Charge**, **Staff**, **Employer**, **Govt ttl**.
- On that sample, Charge, Staff, and Employer are the same amount per person. Govt ttl is Staff + Employer. People at the cap show 125.00 / 125.00 / 125.00 / 250.00.
- A totals line under the columns, then printed date and page number.

Staff and Employer come from the run (5%, $250 monthly cap each). Charge follows Staff, matching the sample. The report can be printed with the run or opened again later.

Patriot’s other reports (screenshot 18) are not part of this run.

**Still open:** tile label (Payroll). Whether vacation or sick ever become paid columns.

---

## 7. Adding more ideas

Use short subsections with **Goal**, **Rough behavior**, and **Open decisions**. Link to PRDs or issues when they exist.
