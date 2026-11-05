# Payroll and roster changes — for Simple Roster Plus

**Source:** Shift Close as of **5 November 2026**.  
**Keep SRP's own screens.** Do not copy Shift Close layout, colors, or station names.

This document has two parts.

| Part | Covers | Audience |
|---|---|---|
| **A. Payroll** | Every payroll rule that changed after 7 October 2026 | An agent that built payroll from `docs/payroll-st-lucia-for-simple-roster-plus.md` (28 Sep) and applied `docs/payroll-changes-for-simple-roster-plus.md` as it stood on 7 Oct |
| **B. Roster and scheduling** | The major roster, time-off, and attendance-scheduling features in Shift Close, with the rules each one follows | An agent comparing SRP's roster with `docs/SIMPLE_ROSTER_PLUS_SOURCE_HANDOFF.md` (1 Jun, refreshed 30 Jul) and the other roster docs listed in Part B |

---

# Part A — Payroll

Anything not listed in Part A is unchanged. NIC (called NIS in the PayMS material) is still 5% of gross, employee and employer, each capped at $250 in the pay date's calendar month. Approved runs still count toward that cap, year to date, and the loan balance. Voided runs stay visible and stop counting. There is still one non-void run per attendance extract. Money is still rounded to cents at each step.

| # | Change | Date in Shift Close | Replaces |
|---|---|---|---|
| 1 | Eligibility follows the pay cycle number, and a pay type of Excluded exists | 13 Oct | Range-based "who is on the run" (changes §1 of the 7 Oct doc) |
| 2 | Salaried sick days reduce basic pay, with an optional 35% employer share | 13 Oct | "Sick is a note and is not paid" |
| 3 | PAYE report lists only people with PAYE, and the button hides when there is none | 19 Oct | "Zero rows omitted, button always on" |
| 4 | Draft checks can be generated from an approved run | 19 Oct | New |
| 5 | PAYE uses the PayMS annualization method, plus NIS and PAYE exemptions | 26 Oct | The flat 15% over $2,500 a month rule |
| 6 | Extras can be excluded from NIS separately from PAYE | 26 Oct | "NIC is taken on the full gross" |

---

## 1. Who is on the run: cycle number first, and "Excluded" staff

**7 October rule.** The date range decides which pay frequencies are paid.

**Current rule.** The **pay cycle number** on the run decides first. The date range is only a fallback.

| Cycle number | Frequencies paid |
|---|---|
| Odd, 1 to 23 (first half of a month) | Semi-monthly only |
| Even, 2 to 24 (second half of a month) | Semi-monthly and monthly |
| 25 to 53, or not a whole number | Fall back to the date-range rule from the 7 Oct doc |

Cycle numbers are the 24-per-year semi-monthly calendar: period 1 is 1–15 January, period 2 is 16–31 January, and so on. A monthly employee is therefore paid on every even cycle, and not on odd ones.

Changes that go with it:

- Changing a draft run's cycle number rebuilds its lines, the same way changing the range already did. Typed overrides are kept.
- Opening a draft still adds salaried people who are now due and were missing. It now uses the cycle number first.
- If the cycle number and the date range disagree on which frequencies are due (for example a 1–15 range typed with cycle 2), the run is flagged as a **cycle/range mismatch**. It is a warning only. The cycle number still wins.
- Each run can show an **eligibility list**: every active person, whether they are on this run, and the reason. Reasons used: `Eligible for this period`, `Excluded from payroll`, `Salaried amount is missing`, and `{frequency} staff — not due this period`.

### New pay type: Excluded

Pay type now has three values: `hourly`, `salaried`, and `excluded`.

- An excluded person is never paid on a run, even if they appear on the hours extract.
- They are not added as salaried, and a draft that already holds their line has that line removed when the staff record changes.
- Gross, basic, overtime, extras, and vacation are all zero for excluded.
- The staff form hides the hourly rate and salary fields for excluded people.

### Salaried with no salary

A salaried person with no salary amount (or zero) is **not** auto-added to a run. If a line has to be built for them, it fails with `Salaried amount is missing for {name}`. This avoids silent zero-pay lines. The eligibility list shows the same reason.

---

## 2. Salaried sick days

**7 October rule.** Sick days from attendance are shown and are not paid, for both hourly and salaried.

**Current rule.**

- **Hourly:** unchanged. Sick days are shown and unpaid.
- **Salaried:** sick days reduce basic pay, and the employer can optionally pay 35% back.

The hours extract now carries a sick day count per person (`sickLeaveDays`). A salaried person with no hours row has zero sick days.

```
day rate           = salary ÷ 26                       (26 working days a month)
sick deduction     = (salary ÷ 26) × sick days         (rounded to cents at the end)
basic pay          = max(0, salary − sick deduction)
employer sick pay  = sick deduction × 35%              (only when the employer share is on)
NIC sickness benefit = sick deduction × 65%            (memo only)
gross              = basic pay + extra earnings (including employer sick pay)
```

Details:

- The day rate is shown rounded to cents, but the deduction uses the unrounded day rate.
- The **employer share is a per-line switch, on by default.** It is stored on the line and kept when the run is rebuilt.
- Employer sick pay is added as an extra earning labelled **`Sick pay (35%)`**. It is part of gross, so NIC is taken on it and it is PAYE-taxable by default. If the switch is off, that label is removed.
- The 65% NIC sickness benefit is **a memo**. It is not paid by the employer, is not part of gross, and does not change net. Shift Close shows it only in the line edit dialog. It is not on payslips or reports.
- Basic pay is floored at zero.

Example. Salary $900, 5 sick days, employer share on:

```
day rate           = 900 ÷ 26 = 34.62 (displayed)
sick deduction     = 173.08
employer sick pay  = 173.08 × 0.35 = 60.58
NIC benefit memo   = 173.08 × 0.65 = 112.50   (the 112.5 shown)
basic pay          = 900 − 173.08 = 726.92
gross              = 726.92 + 60.58 = 787.50
```

With the employer share off, gross is $726.92 and the benefit memo is still $112.50.

The open question from the earlier spec still stands: confirm whether NIC sickness-benefit reporting needs its own export. Shift Close has none.

---

## 3. PAYE report lists only people with PAYE

**7 October rule.** The PAYE report omitted a person only when gross, taxable pay, NIC, and PAYE were all zero. The button was always enabled on an approved or voided run.

**Current rule.**

- A row appears only when that person's **calculated PAYE is not zero**. Gross, taxable pay, and NIC no longer keep a row in.
- The **Print PAYE button is hidden** when no line on the run has PAYE. If there is nothing to report, there is nothing to open.
- Columns, header, voided-run wording, totals, and the pay-date month are unchanged.
- The note under the table is now the PayMS wording (section 5 below).

TD5 and TD4 certificates and the NIC report are unchanged by this.

---

## 4. Draft payroll checks

A new action on an **approved** run. It is only useful if SRP also keeps a cashbook or check register. If SRP does not, skip it and say so.

**Who gets a check.** Lines whose bank code is `CHQ` (cheque, check, or no bank and no account, per the banking list rules) and whose **net pay is above zero**.

**What it creates.** One **draft check entry** per qualifying line:

| Field | Value |
|---|---|
| Date | The run's pay date |
| Reference | `PENDING` (no check number is assigned) |
| Description | `Payroll check — {name}` |
| Amount | The line's net pay, as a check debit |
| Method | `check` |
| Link | Pay run id and pay run line id, status `draft` |

**Rules.**

- Only an approved run can generate checks. Any other status is rejected.
- Generation is **repeatable and safe**. A payroll line can create only one check (the line id is unique), so pressing it again creates nothing new.
- The run reports how many draft checks it has, and how many were created this time against how many qualified.
- **Voiding a run deletes its draft checks** in the same step, so the check register never keeps checks from a voided payroll. Real check numbers are not part of this feature, so there is nothing issued to protect.

---

## 5. PAYE: PayMS annualization (replaces the flat 15% rule)

**7 October rule (now removed).** 15% of taxable pay after NIC above a $2,500 monthly free amount, with earlier pays in the month counted. The tax code did not change the amount.

**Current rule.** Each line stores PAYE calculated with the PayMS annualization method. The pay frequency, tax code, this run's employee NIS, and this run's PAYE-taxable earnings decide the amount.

```
periods per year = weekly 52, bi-weekly 26, semi-monthly 24, monthly 12
code allowance   = max(numeric part of tax code, 254) × 100
annual earnings  = this run's taxable pay × periods per year
annual NIS       = min(this run's employee NIS × periods per year, 3,000)
chargeable       = max(0, annual earnings − annual NIS − code allowance)
annual tax       = 15% of the first 15,000 + 20% of the next 15,000 + 30% of the rest
this run's PAYE  = annual tax ÷ periods per year        (rounded to cents)
```

- The numeric part of the tax code is the leading digits. A blank, non-numeric, or lower code uses the minimum, **254**.
- **PAYE does not look at earlier pays in the month.** Each run is annualized on its own. The old "PAYE already taken this month" is gone.
- **NIS still uses the remaining monthly $250 cap** across approved runs. The annual NIS allowance uses the NIS actually charged on this run.
- Taxable pay is still gross minus extras marked not taxed. Basic, overtime, and vacation stay taxable.
- Net, total deductions, employer NIC memo, year to date, payslips, and certificates behave as in the 7 Oct doc.
- A typed `PAYE` or `PAYE tax` deduction still counts only when the calculated PAYE on that line is zero.

Worked examples (no loan, medical, or shortage):

| Pay | Taxable | Employee NIS | Code | Annual chargeable | PAYE this run |
|---|---:|---:|---|---:|---:|
| Monthly | 5,000 | 250 | 254 | 31,600 | 477.50 |
| Semi-monthly | 3,200 | 125 | 280 | 45,800 | 416.25 |

Check on the first row: `60,000 − 3,000 − 25,400 = 31,600`. Tax `2,250 + 3,000 + 480 = 5,730`. `5,730 ÷ 12 = 477.50`.

### Exemptions on the staff record

Two new yes/no fields on each person, copied onto each pay line when a run is built:

| Field | Effect |
|---|---|
| NIS exempt | Employee and employer NIS are zero. No annual NIS allowance is used in PAYE. |
| PAYE exempt | PAYE is zero. |

### Where the new wording shows

- The note under the PAYE report table, and under the payroll summary, now says PAYE uses annualization by frequency, NIS up to $3,000 and tax code × $100 (minimum 254), and the 15%, 20%, and 30% annual bands.
- Remove the old "15% above $2,500 a month" text everywhere.

---

## 6. Extras: NIS eligibility is separate from tax

**7 October rule.** An extra earning could be marked not taxed. NIC was still taken on the full gross.

**Current rule.** Each extra earning has two independent switches. Both default to on.

| Switch | When off |
|---|---|
| PAYE-taxable | The amount is left out of taxable pay |
| NIS-eligible | The amount is left out of the pay that NIS is charged on |

Basic pay, overtime, and vacation are always taxable and NIS-eligible.

NIS is now charged on **NIS-eligible pay**, not gross:

```
employee NIS = min(NIS-eligible pay × 5%, remaining monthly cap)
employer NIS = min(NIS-eligible pay × 5%, remaining monthly cap)
```

Gross, net, and the "total earned" shown to the person still include every extra.

Example. Salary $3,200 plus $500 travel switched off for both PAYE and NIS:

```
gross                  = 3,700
taxable / NIS-eligible = 3,200
```

---

## 7. Carry forward as unfinished

- Hourly sick days are shown and unpaid.
- Cycle-number eligibility covers 1 to 24 only. Weekly and bi-weekly numbering beyond that uses the date-range fallback.
- The NIS cap applies once for the pay-date month. PAYE is annualized independently for each run.
- NIC sickness-benefit reporting has no export.
- Real check numbers for payroll checks are not assigned. Checks stay in draft with reference `PENDING`.
- Everything listed as unfinished in the 7 Oct doc (column layout in the browser, GL centre and department, one credit-union letterhead, third-party cash disbursements) is unchanged.

---

## 8. Shift Close tooling — do not port

These exist in Shift Close and are not payroll rules:

- A **Test run** on the create-pay-run dialog builds a full preview from an attendance extract without saving a run. SRP can have its own preview, but it is not a rule.
- A one-time "clear saved runs" button was added on 13 October and **removed again the same day**. It is not part of the product.
- Phone layout, page chrome, and the company name printed under the Payroll heading.

---

## 9. Quick checklist for SRP

1. Decide eligibility from the cycle number (odd: semi-monthly, even: semi-monthly plus monthly), falling back to the range for 25+.
2. Add an **Excluded** pay type, and refuse to auto-add salaried people with no salary.
3. Reduce salaried basic pay by `salary ÷ 26 × sick days`. Add the optional 35% as `Sick pay (35%)`. Keep the 65% as a memo.
4. Replace the old PAYE with the annualized PayMS formula, and remove "earlier pays this month" from it.
5. Add NIS exempt and PAYE exempt flags on staff and lines.
6. Split each extra's switch into PAYE-taxable and NIS-eligible. Charge NIS on NIS-eligible pay.
7. PAYE report: only people with PAYE above zero. Hide the button when there is none.
8. Optional: generate draft checks for approved `CHQ` lines, and delete them on void.

---

# Part B — Roster and scheduling

**What this part is.** A catalogue of the roster, time-off, and scheduling-related features Shift Close has added, with the rules each one follows, so SRP can match or deliberately differ. Dates are when the feature landed in Shift Close.

**Already described elsewhere. Not repeated here:**

| Document | Covers |
|---|---|
| `docs/SIMPLE_ROSTER_PLUS_SOURCE_HANDOFF.md` | Stack, data models (`ShiftTemplate`, `RosterWeek`, `RosterEntry`, `StaffDayOff`, `StaffSickLeave`, `PublicHoliday`), API and middleware map, a suggested v1 scope |
| `docs/roster-mobile.md` and `docs/manager-hub.md` | The phone roster and the manager launcher |
| `docs/ROSTER_COVERAGE_COUNT.md` | How the Count row treats inactive staff |
| `docs/late-absent-summary-spec-simple-roster-plus.md` | The Late & Absent rules, in full |
| `docs/whatsapp-twilio-roster-image.md` | The WhatsApp roster image pipeline |

**Summary of what is new or changed since the 1 June handoff:**

| # | Feature | Landed |
|---|---|---|
| B1 | Per-day roster locking, replacing the manual Edit / Lock model | 27 May |
| B2 | Leave and closed-day blocking, on the server and in the grid | 20 Apr – 20 Jun |
| B3 | Shift requests alongside off-day requests | Jun |
| B4 | Minimum off days per week warning | 17 May |
| B5 | Ghost rows for inactive staff, and active-only coverage counts | 30 May |
| B6 | Call outs | 31 May – 1 Jun |
| B7 | Time Off page and roster modals for vacation, sick leave, and day off | Feb – Jun |
| B8 | Phone roster and the manager hub | 17 – 18 May |
| B9 | Staff roster report | 1 Jul |
| B10 | Scheduled pay-period hours while editing the roster | 14 Aug |
| B11 | Late and absent counts, live and per period | 19 Aug |
| B12 | Sharing and printing, including the blank day-off form | Feb – Sep |
| B13 | Roster display name, ordering, and small markers | Feb – Sep |
| B14 | Who can edit | ongoing |
| B15 | Known gaps to decide on, not copy | — |

---

## B1. Per-day locking

**Earlier models (all replaced).** Lock the previous week on Monday (13 Feb). Lock on Sunday instead (22 Feb). Lock a saved week until someone presses Edit, with a confirm for the current week (29 Mar). Do not rebuild any of these.

**Current rule.** Weeks run Monday to Sunday and are keyed by the Monday date. Lock status depends on today's date alone:

| Week | What is locked |
|---|---|
| Future week | Nothing. Fully editable. |
| Current week | Every day dated **today or earlier**. Later days are still editable. |
| A week whose Sunday has been reached | The **whole week**. This includes Sunday itself, so the current week becomes read-only on its own Sunday. |

- There is **no manual Edit or Lock button**. The roster **auto-saves** on every change. There is no Save button.
- The server enforces the same rule. When a save arrives, locked days are replaced by what is already stored. If the request tried to change a locked day, the save is rejected with `Cannot change roster for {date}: that day is locked.`
- A brand-new locked cell that has nothing stored comes back as blank.
- **Fill week** skips locked days in the browser. **Copy previous week** keeps locked days as they are. **Clear week** (with a confirm) sends an empty week and relies on the server to restore locked days.
- Advance rosters (future weeks) drop inactive staff automatically when loaded or saved. Past and current weeks keep them (see B5).

## B2. What blocks a shift

A shift cannot be assigned to someone on a day that is blocked. The server rejects the save for the first three:

| Block | Server message | Notes |
|---|---|---|
| Station-closed public holiday | `Cannot assign shifts on {date}: station is closed for this public holiday.` | Cell shows `Closed · {holiday}`. Any shift on that date is cleared when a full week is built. |
| Vacation | `Cannot assign shifts on {date}: staff is on vacation.` | Vacation dates are inclusive of the last day (27 Feb). |
| Sick leave | `Cannot assign shifts on {date}: staff is on sick leave.` | Any record that is **not denied** blocks (requested or approved). |
| Approved "off" day request | Not rejected by the server | The grid shows the cell as blocked: label `—`, flagged with the tooltip `Shift assignment exists but is blocked by leave/day-off request`. Attendance, the dashboard, and reports treat that person as off. |

Other details:

- Copy previous week removes any shift that lands on a closed day, vacation, or sick leave.
- A **blocked or unassigned cell prints as `—`**. An explicit Off prints as `Off`. A shift prints its name. The share image and the mobile grid use the same labels.
- Public holidays carry a **station closed** flag. Shift Close holds the 2026 St. Lucia list and a settings toggle for which holidays close the station (29 Mar). Station-closed days **count as off days** for the minimum-off-days check (B4) and for the Count row.

## B3. Shift requests

A day-off request can be one of two types:

| Type | Meaning |
|---|---|
| **Off** | "I need this day off." Blocks the day once approved (B2). |
| **Shift** | "I would like this shift on this day." Does not block anything. It is a preference. |

How it shows on the grid:

- The cell shows the requested shift's name until the assigned shift matches it (19 Jun).
- A warning marks any day where the assigned shift **differs from the requested one**. Tooltip example: `Requested 6-1, assigned 8-4. Reason: school run`.
- Once the assigned shift equals the request, the marker changes to **Shift request fulfilled**.
- An off request shows its own marker with the reason as the tooltip.

How Shift Close stores it, which SRP should not copy: the type and shift are packed into the day-off `reason` text as `SHIFT_REQUEST:{shiftTemplateId}|{reason}`. Every report filters out reasons that start with `SHIFT_REQUEST:` so a shift preference never counts as time off. **SRP should store a real type column and a shift id.**

Requests made from the roster's Day Off Request modal are saved as **approved** straight away. The data model also allows `requested` and `denied`. Attendance, the dashboard, and the reports only count `approved` day-offs.

## B4. Minimum off days per week

A company setting, `Minimum off days per staff (per week)`. Default **1**, range 0 to 7. 0 turns it off.

- Any staff member with fewer off days than the minimum in the displayed week gets a **flashing red name** (made more visible in June).
- An off day is any day with: a station-closed holiday, vacation, sick leave, or no shift assigned (Off or blank).
- It is a warning only. The week can still be saved.
- Note that the settings screen text still says station-closed days are ignored. The code counts them as off (20 Jun). Follow the code.

## B5. Inactive staff on the roster

- **Past and current weeks:** an inactive person who was scheduled that week still shows as a read-only "ghost" row, so history is not rewritten. Tooltip: `Inactive — scheduled before leaving`.
- **Future weeks:** inactive staff are removed.
- **Count row:** counts **active staff only**. A footnote says how many inactive staff are not counted, and a per-day tooltip appears when a ghost was on shift.
- Staff who start after the week ends do not appear on that week. **Managers are never on the roster grid.**
- A separate inactive count row is a documented option and is **not built**.

## B6. Call outs

A call out records that someone phoned in before a shift and did not come.

| Field | Rule |
|---|---|
| Staff and work date | One call out per person per date |
| Called at | Date and time, in 15-minute steps. If left blank, the server uses the work date plus the current station time. A back-dated call out no longer defaults to today (1 Jun fix). |
| Notes | Free text |
| Recorded by | The signed-in user |

- A small marker shows on the roster cell with the tooltip `Called {time} · {notes} · Logged by {user}`. It adds `Sick leave also covers this day` when a sick leave overlaps.
- **The roster cell only shows the marker.** Logging happens from a roster toolbar button (with a staff picker), the Call Outs page, or the staff profile.
- The Call Outs tab has a ranged history list, pill filters, and search.
- **Call outs excuse the day** in the Late & Absent report (B11).
- Who can log: admin, manager, operations manager, and supervisors. Not stakeholders.

## B7. Time off

Shift Close groups time off on one page, `Time Off`, with three tabs:

1. **Vacation & Day off.**
2. **Sick leave.**
3. **Call outs.**

The page loads from one bundle request with bounded date ranges and a row cap, to keep it fast.

| Kind | Shape | Where it comes from |
|---|---|---|
| Vacation | One start and end date on the staff record, inclusive | Staff edit page, or the roster's **Vacation** modal (24 May) |
| Day off | A single date, with a reason and status | The roster's **Day Off Request** modal (22 Feb) |
| Sick leave | A date range, with a reason, a status, and attached documents such as a doctor's note | The roster's sick leave modal (8 Mar) or the staff profile. The Time Off table shows an inclusive day count (1 Jun). |

- Vacation is a single range per person. SRP may want several.
- The sick leave documents belong to the leave record and open in a preview modal (28 Apr).
- Hourly vacation days and salaried sick days both feed payroll (section 2 of the 7 October doc, and Part A section 2 here).

## B8. Phone roster and manager hub

Covered by `docs/roster-mobile.md` and `docs/manager-hub.md`. In short:

- `/manager` is a launcher: Desktop, plus focused phone tools.
- `/roster/mobile` offers a Week grid (staff down, Mon–Sun across, swipe sideways), a Day view, and a Person view. The last choice is remembered on the device.
- Tap a date to see **shift chips with coverage counts** for that day.
- Assign a shift from a bottom sheet (including Off). Fill week, Copy previous week, and Share image all work here.
- It does **not** do Clear week, day-off or sick modals, staff reorder, or shift presets.
- It saves the same way the desktop does, with the same locking rules.
- Supervisors can open it read-only. Stakeholders cannot.

## B9. Staff roster report

A per-person schedule for a date range (1 Jul). Use it to answer "when does this person work?" and to hand someone a printed schedule.

- Pick a person and a start and end date. **Maximum 93 days.**
- Output is grouped by week, with a one-line summary per week (`4 shifts · 2 off · Vacation Tue, Wed`).
- A period summary lists each shift name with a count, plus the number of **weekend shifts** and **late closes** (shift ending at 20:00 or later).
- Printable, with the shift template colors.

Each day takes the **first** status that applies:

| Order | Status |
|---|---|
| 1 | Station closed (holiday name shown) |
| 2 | Vacation |
| 3 | Sick leave (approved only) |
| 4 | Day off (approved, and not a shift request) |
| 5 | Unassigned, when the week is a draft or missing and "published weeks only" is on |
| 6 | Working (shift name and times) |
| 7 | Off |
| 8 | Unassigned |

If a leave day also had a shift on the roster, the report shows the status and notes `Roster: {shift}`.

A toggle, **Published weeks only**, is on by default. **See B15: no screen in Shift Close ever publishes a week.** As built, the default view therefore marks every week `Draft roster (not published)`. SRP should either add publishing or default to including drafts.

Note one inconsistency: the report counts only **approved** sick leave, while roster blocking and the late/absent logic count any **non-denied** record.

## B10. Scheduled pay-period hours while editing

While the roster is editable, each staff name carries a small **hours total** (14 Aug) so a manager can see overtime building before payroll.

```
shift hours   = end − start from the shift preset (an end at or before the start wraps past midnight)
period hours  = sum of shift hours from the open period start through the end of the displayed week
week hours    = sum within the displayed week
```

- The **open pay period** starts the day after the last saved pay period ended. If none exists it starts on the 1st of the current month. It never looks back more than **62 days**.
- Days that are vacation, sick leave, or a station-closed holiday add **zero hours**, even if a shift is stored there.
- Targets are soft: **40 h a week** and **80 h a pay period**. The total shows gray below 80% of target, green from 80% up to 80 h, and amber above 80 h. The tooltip adds the week figure.
- It shows only to roles that can edit, on weeks that are not fully locked, and not on inactive (ghost) rows. The shared and printed picture is a separate table and does not include it.
- These targets are Shift Close's. They are not payroll rules, and they should follow whatever overtime rule SRP chooses (Part A and the September spec).

## B11. Late and absent

The full rules are in `docs/late-absent-summary-spec-simple-roster-plus.md`. What Shift Close does with them:

- **Defaults:** late after **15** minutes and absent after **60**, both company settings. Absent must stay greater than late, and the code lowers late to one below absent if they conflict.
- **One rule set everywhere.** The live board (dashboard and `/dashboard/present-absence`) and the period report call the same function. The old "60 minute grace" model was removed.
- **Status order for a scheduled person:** punch-exempt staff are present unless marked absent. A manual "marked present" override is present. With a punch, on time is present and later than the late window is late (never absent). With no punch, the status is pending, then late, then absent as the clock passes the two thresholds.
- **Expected** means a roster shift that day with the person not blocked. The expected list leaves out vacation, non-denied sick leave, an approved off-day request, and (for the period report) a call out. A shift request does not excuse anyone.
- **Period report** (`/attendance/late-absent`, 19 Aug): presets for this pay period, last pay period, and custom (cap 93 days). Headline counts, a table by staff, a per-person drill-down listing every rostered day, and **CSV, Print, and PDF** from the drill-down. Shift badges use the shift template colors and show the name only.
- **Alerts:** optional email or WhatsApp to managers when someone is past the late window with no punch. Not sent for a tardy punch.
- **Tests:** `scripts/test-late-absent.ts` covers clamp, pending, late, absent, tardy-after-60, on-time, and the pay period bounds helper.

Attendance also has a week grid that colors each rostered cell as present, late, absent, pending, vacation, day off, sick, or no shift. It reads the same presence settings and status function as the live board.

## B12. Sharing and printing

**Share menu on the desktop roster:**

| Option | Delivery |
|---|---|
| WhatsApp (Direct) | Sends the roster picture to staff phones through a Twilio WhatsApp template. See `docs/whatsapp-twilio-roster-image.md`. |
| WhatsApp (Image) | Copies or shares the picture, then opens WhatsApp. |
| WhatsApp (Text) | Copies a text version. |
| SMS | A sub-menu lists staff with a mobile number. Picking one opens an SMS draft with the roster text for that person's phone. |
| Email | Sends the picture to the **first** configured email recipient only. |
| Print | Prints the same picture the WhatsApp image uses (23 Feb). |

- The picture is a **display-only table** drawn off-screen: Staff plus Mon–Sun, active staff only, shift colors, vacation in gray, birthdays marked. It is not a screenshot of the editable grid.
- WhatsApp (Direct) warns and asks for confirmation first, and can go to every staff member with a mobile number on file.
- **Blank day-off request form** (27 Sep): a button prints a paper form on Letter size. Fields: date, name, four requested-date rows, reason lines, "Submitted to", employee signature, Approved Yes / No boxes, comments. Staff fill it by hand. Nothing is stored.

## B13. Names, order, and small markers

- **Roster display name** (26 Sep). A field on the staff record that defaults to the first name. It is used on the roster, the dashboard, and the attendance screens (27 Sep).
- **Reorder staff.** Move up and down arrows on a name change the stored sort order for everyone.
- **Fill week.** Set one shift across the entire week for one person.
- **Copy previous week**, **Clear week** (with confirmation), and **coloured week banner** (past, current, future).
- **Cell color** follows the shift preset color. **Shift presets** have a name, start, end, and color, managed on their own page.
- **Birthday** cake on a cell when the date matches the person's date of birth.
- **Last-week hint:** hovering a cell shows what that person had on the same day last week.
- Staff reliability letter grades are **hidden on the roster** and remain on Staff Management only (19 Sep).
- The dashboard shows **Today's roster** grouped by shift, with who is off or on vacation, and an **Upcoming** list.

## B14. Who can edit

| Role | Roster | Call outs |
|---|---|---|
| admin, manager, operations manager | Edit | Log |
| supervisor, senior supervisor | View only (the save endpoint returns 403 `Roster is view-only for your role`) | Log |
| stakeholder | No edit | No |
| accountant | No edit | No |

Per the earlier handoff, supervisor-level roles also cannot manage shift presets, save a week, send the WhatsApp roster, or change settings.

## B15. Known gaps to decide on, not copy

1. **Publishing is never set.** `RosterWeek.status` is `draft` or `published`, and every save from the desktop and phone roster writes `draft`. Only the staff roster report reads it. Decide whether SRP has a real publish step, and what staff see before it.
2. **Approved off-day requests are not rejected by the server.** The grid blocks them visually, so a stored shift can sit under one. Decide whether SRP rejects it.
3. **One vacation range per person.** A second vacation replaces the first.
4. **Shift requests ride on the reason text** (B3). Use proper fields.
5. **Settings text and code disagree** on station-closed days and the off-day count (B4). Code is right.
6. **Sick leave is counted two ways.** Non-denied blocks the roster and the late/absent logic. The staff roster report counts approved only.
7. **Managers are off the roster grid**, but since 2 October they **are** paid on the payroll run (Part A). Decide whether SRP rosters managers.
8. **Weeks start on Monday and the station time zone is a code constant** (`America/St_Lucia`). The handoff says to make the zone configurable.
9. **No roster conflict check across people.** Nothing limits how many people can work a shift, or requires a minimum on each. Coverage counts are informational.
10. **The inactive coverage row** is documented and not built.

## B16. Shift Close presentation — do not port

- Pinned week bar and sticky day header, sky-tinted header buttons, and custom shift menu (Sep).
- Phone layout details such as the bottom sheet and swipe grid, beyond the behaviors in B8.
- Dashboard widget arrangement, and the manager launcher tiles.
- Performance work specific to Shift Close's database, such as the one-request week bundle and the static bootstrap. SRP can load its own data however it likes. The data the bundle gathers is still a good checklist: week entries, the previous week, day-offs, sick leaves, call outs, public holidays, and the open pay period.
