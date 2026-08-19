# Late & Absent Summary — feature spec for Simple Roster Plus

**Audience:** Simple Roster Plus product / engineering  
**Purpose:** Add a manager-facing report that answers, in a few seconds: *who was late or absent, how often, over this period?*  
**Status:** Spec from a live implementation. Adapt names and navigation to Simple Roster Plus; keep the rules and UX below.

---

## 1. Problem

Managers need a digestible count of **late** and **absent** incidents per person over a pay period (or custom range). Existing day boards and punch logs do not tally “how many times” or let someone drill into dates and shifts. The report must be printable / PDF for conversations with staff.

---

## 2. Product outcome

Two surfaces, **same rules**:

1. **Live day** — scheduled staff for today (or a selected calendar day): pending → late → absent as the clock runs, or on time / tardy based on first punch.
2. **Period summary** — rostered staff, ranked by incident count, with a **per-person day/shift drill-down**, CSV of the summary, and **print + PDF** of the drill-down.

---

## 3. Definitions (must be identical on live board and report)

All times use the **business timezone** (not UTC, not the browser TZ). Calendar days are `YYYY-MM-DD` in that zone.

Configurable thresholds (defaults below):

| Setting | Default | Meaning |
|---|---|---|
| **Late after** | **15 minutes** | After scheduled shift start |
| **Absent after** | **60 minutes** | After scheduled shift start; must be **greater than** late |

**First punch** = earliest punch that belongs to that staff member on that calendar day (any in/out type). Compare it to **that day’s roster shift start** (if multiple shifts, use the **earliest start**).

### Status algorithm (one staff, one scheduled day)

Evaluate in order:

1. **Not expected** (see §4) → `off` (not counted).
2. Punch-exempt / no-clock staff: `present` unless explicitly marked absent → `absent`.
3. Manual “marked present” override → `present`.
4. **If there is a first punch:**
   - punch time **≤ start + late minutes** → `present` (on time)
   - punch time **> start + late minutes** → `late`  
   A punch **after** the absent window is still **late**, not absent. They showed up.
5. **If there is no punch:**
   - future calendar day → `pending`
   - `now` **before** start + late minutes → `pending`
   - `now` **before** start + absent minutes → `late` (no-show so far)
   - otherwise → `absent`

Past calendar days with no punch always reach `absent` (because `now` is after the absent window).

### What the period report counts

For each **rostered, expected** staff-day in the range:

- **Late count** = days with status `late`
- **Absent count** = days with status `absent`
- **`pending`, `present`, `off`, `excused` do not increment either count**

Staff with **zero** late and zero absent can be omitted from the summary table (still included in “staff rostered” denominator).

---

## 4. Who is “expected”

A person counts only if they have a **roster assignment with a shift** that day **and** they are not excused.

**Excused (not late, not absent)** — treat as `excused` on the drill-down, exclude from counts:

- Vacation covering that date
- Sick leave (non-denied / approved, per your time-off model)
- Approved day off (not a “shift request” style swap, if you distinguish those)
- **Call-out** recorded for that work date

**Out of scope for counts:** people with no shift that day (roster off).

Punch-exempt / salaried: do not treat missing punches as late/absent unless a manager marks them absent.

---

## 5. Period filters

Provide:

- **This pay period**
- **Last pay period**
- **Custom** start/end (`YYYY-MM-DD`)

Cap range length (e.g. **93 days**) so the query stays bounded.

**Scope:** active staff who were **rostered with a shift** at least once in the range. Do not include the whole employee directory.

---

## 6. UI

### 6.1 Period summary (scan in seconds)

**Headline metrics**

- Total **Late** incidents  
- Total **Absent** incidents  
- **Staff with incidents** (and how many rostered in the range)

**Table — By staff** (sort by Late + Absent descending, then name)

| Staff | Late | Absent | Total | Last incident |
|---|---|---|---|---|

Last incident example: `Aug 14, 2026 late`.

Click a row → drill-down.

**Export CSV** for the summary plus a second section of incident days (staff, date, shift, status, punch, minutes after start).

### 6.2 Staff drill-down

Header: name, period label, `N late · M absent`.

Back link: all staff.

**Table**

| Date | Shift | Status | Punch | After start |
|---|---|---|---|---|

- **Shift:** shift **name only** (no start–end times on the badge). Color the badge with the **roster shift template color** so 6-1 / 8-4 / 1-9 are distinct; pick light or dark text from luminance.
- **Status:** colored pills — Late (amber), Absent (red), On time (green), Excused (violet), Pending (gray).
- **Punch:** first punch time, or `No punch` when absent.
- **After start:** minutes vs shift start (`+22m`, `-6m`, or `—`).

Show **all rostered days** in the period for that person (on time and excused included), not only incidents — so a printout is a full picture.

### 6.3 Print and PDF (drill-down)

On the drill-down:

- **Print** — print-friendly page; browser “Save as PDF” is enough as a second path. Preserve shift and status colors (`print-color-adjust: exact`).
- **Download PDF** — named file, e.g. `late-absent-{Staff}-{start}-to-{end}.pdf`.

Include name, period, late/absent totals, the day table, and a one-line legend of the 15 / 60 (or configured) rules.

### 6.4 Live day board (same thresholds)

Do not keep a separate “60 minute grace then late, past days absent” model.

Today:

- Before 15 min, no punch → pending  
- 15–60 min, no punch → late  
- After 60 min, no punch → **absent the same day**  
- Punch within 15 min → on time  
- Punch after 15 min → late  

Optional: notify managers when someone is past the **late** window **with no punch** (late or absent, still no punch). Do **not** notify solely because they punched tardy.

---

## 7. Data you need

| Input | Used for |
|---|---|
| Roster entries + shift templates (name, start, color) | Expected days, late/absent clock, badges |
| Attendance punches (timestamp, staff identity) | First punch per calendar day |
| Vacation / sick / day off / call-outs | Excused |
| Manual day overrides (optional) | Marked present / absent |
| Business timezone | Day boundaries and “now” |

**Queries:** load roster for the date range first, then punches **only for those staff IDs** (plus device IDs if punches are keyed that way) in `[start 00:00, end+1 00:00)` in the business TZ. Do not scan all punches in the company for the window if you can avoid it.

---

## 8. Settings

| Field | Default | Notes |
|---|---|---|
| Enable live present/absent | on/off | |
| Late after (minutes) | 15 | 1–1440 |
| Absent after (minutes) | 60 | Must stay **> late** |
| Late alerts (email / WhatsApp) | optional | No-punch after late window only |

---

## 9. Edge cases

- **Tardy after 60 minutes:** still **late**, not absent.  
- **Early punch:** on time; after-start can be negative.  
- **Multiple punches:** only the **first** of the day vs start.  
- **Two shifts one day:** one status using **earliest** start (keep it simple unless you already model split shifts).  
- **Identity:** match punches by staff id and/or badge/device user id, including common padding variants (`7` vs `007`).  
- **Future days** in a custom range: `pending`, not counted.  
- **Today** still inside the late window, no punch: `pending`, not counted yet.

---

## 10. Acceptance checks

1. Defaults are 15 late / 60 absent on both live and period views.  
2. Summary sorts by total incidents; drill-down shows every rostered day.  
3. Call-out / vacation / sick / approved day off do not add to Absent.  
4. First punch at start+16 is Late; no punch at start+61 is Absent.  
5. Punch at start+70 is Late, not Absent.  
6. Shift column is name + template color only.  
7. Drill-down Print and Download PDF work; CSV exports the period summary.  
8. Pay period presets match whatever Simple Roster Plus already uses for payroll windows.

---

## 11. Out of scope (unless you already have it)

- Minutes-late payroll deductions  
- Pairing in/out quality (short day, missed punch)  
- Hours totals (separate attendance ledger)

Those can stay on existing reports. This feature is **counts + drill-down + shareable PDF**.

---

## 12. Suggested copy (legend)

> Late = first punch after 15 min past shift start. Absent = scheduled day with no punch by 60 min. Vacation, sick leave, approved day off, and call-outs are excused.
