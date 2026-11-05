# Payroll changes since 7 October 2026 — for Simple Roster Plus

**Audience:** an agent that already built payroll from `docs/payroll-st-lucia-for-simple-roster-plus.md` (28 September 2026) and then applied `docs/payroll-changes-for-simple-roster-plus.md` as it stood on **7 October 2026**.  
**Source:** Shift Close payroll as of **5 November 2026**.  
**Purpose:** list every payroll rule that changed after 7 October so SRP can apply the differences. Keep SRP's own screens. Do not copy Shift Close layout, colors, or station names.

Anything not listed here is unchanged. NIC (called NIS in the PayMS material) is still 5% of gross, employee and employer, each capped at $250 in the pay date's calendar month. Approved runs still count toward that cap, year to date, and the loan balance. Voided runs stay visible and stop counting. There is still one non-void run per attendance extract. Money is still rounded to cents at each step.

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
