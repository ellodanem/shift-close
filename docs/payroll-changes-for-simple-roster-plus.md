# Payroll changes for Simple Roster Plus

**Audience:** an agent that already built payroll from `docs/payroll-st-lucia-for-simple-roster-plus.md` (28 September 2026).  
**Source:** Shift Close payroll as of 7 October 2026.  
**Purpose:** compare that September spec with the current rules, then apply the differences. Keep SRP’s own screens. Do not copy Shift Close layout, colors, or the station name printed under the Payroll heading.

Anything not listed here is unchanged. NIC is still 5% of gross, employee and employer, each capped at $250 in the pay date’s calendar month. Approved runs still count toward that cap, year-to-date, and the loan balance. Voided runs stay visible and stop counting. There is still one non-void run per attendance extract.

Money is still rounded to cents at each step (`Math.round(n * 100) / 100`).

---

## 1. Who is on the run

**September rule.** One frequency is inferred from the date range. Only people on that frequency are included. Active salaried people are added even with no hours row, except a manager.

**Current rule.** The range can pay more than one frequency. A manager is no longer skipped.

| Range | Frequencies paid |
|---|---|
| 1st through the 15th | Semi-monthly only |
| 16th through the last day of that month | Semi-monthly and monthly |
| 1st through the last day of that month | Monthly |
| Any other window | The single frequency the September spec already inferred |

Then:

- An hours-extract row is included when that person’s pay frequency is one of the frequencies due. Report-only rows are still included regardless of frequency.
- Every **active salaried** person on a due frequency is added even with no hours row. Role does not matter. A salaried manager on a monthly frequency is paid on the 16th–end run, and on a full-month run, and is left off the 1st–15th run.
- An already approved run is left as it was. Rebuilding applies only while the run is still a draft. Opening a draft also adds salaried people who are now due and were missing when the draft was first built.

---

## 2. Hourly vacation is paid

**September rule.** Vacation text from attendance is shown and is not paid.

**Current rule.** Hourly vacation is an earning. Salaried vacation dates do not add pay. Sick is still a note and is not paid.

Days come from the person’s vacation start and end, counted only where those dates overlap this pay period. A vacation that crosses the 15th is split: the first run pays its days, the second run pays the rest.

```
vacation hours = vacation days × hours per day
vacation pay   = vacation hours × hourly rate
```

Hours per day is a company setting. The default is **6**. Allowed values are 0 to 24, with up to two decimal places. It is straight time. It does not use the overtime multiplier, and it does not consume the overtime cap. Clocked basic and overtime are unchanged.

```
hourly gross = basic pay + overtime pay + extra earnings + vacation pay
```

The grid edits **days**, not a block of hours. Changing the days recalculates hours and pay. Salaried gross stays `salary + extra earnings`.

Vacation pay is part of gross, so employee NIC is taken on it, and it is part of taxable pay for PAYE.

Example. Rate $10, 3 vacation days, 6 hours a day, 40 basic hours, no overtime, medical $5:

```
vacation pay = 3 × 6 × 10 = 180
basic pay    = 400
gross        = 580
NIC          = 29.00
net          = 580 − 29 − 5 = 546
```

---

## 3. PAYE is calculated

**September rule.** PAYE is not calculated. A clerk can type it as an extra deduction. Print PAYE is disabled. The payroll summary says PAYE is handled outside the app.

**Current rule.** Each line stores PAYE calculated with the PayMS annualization method. The employee's pay frequency, tax code, current employee NIS, and PAYE-taxable earnings determine the amount.

```
periods per year = weekly 52, bi-weekly 26, semi-monthly 24, monthly 12
code allowance   = max(numeric tax code, 254) × $100
annual NIS       = current employee NIS × periods per year, capped at $3,000
annual bands     = first $15,000 at 15%, next $15,000 at 20%, remainder at 30%
```

The current period's PAYE-taxable earnings are annualized. PayMS then subtracts annualized employee NIS and the tax-code allowance, applies the annual bands, and divides the result by the number of periods.

```
annual earnings = this period's PAYE-taxable earnings × periods per year
annual NIS      = min(current employee NIS × periods per year, $3,000)
chargeable      = max(0, annual earnings − annual NIS − code allowance)
this run's PAYE = annual tax on chargeable income ÷ periods per year
```

PAYE does not aggregate earlier pays in the month. NIS still uses the remaining monthly $250 employee/employer cap across approved runs.
Staff can be marked NIS exempt or PAYE exempt. NIS-exempt staff have zero employee/employer NIS and no annual NIS allowance; PAYE-exempt staff have zero PAYE.

Taxable pay defaults to the full gross, including vacation. An extra earning can be marked not taxed (section 4). Basic, overtime, and vacation stay taxable.

```
total deductions = PAYE + employee NIC + staff loan + medical + shortage + other deductions
net              = gross − total deductions
```

Employer NIC is still a memo and is still not subtracted.

Worked examples, no loan, no medical, no shortage:

Monthly taxable earnings of $5,000, employee NIS of $250, and tax code 254 produce annual chargeable income of $31,600 and period PAYE of $477.50.

Semi-monthly taxable earnings of $3,200, current employee NIS of $125, and tax code 280 produce annual chargeable income of $45,800 and period PAYE of $416.25.

A typed deduction whose label is `PAYE` or `PAYE tax` is used only when the calculated PAYE on that line is zero. If the calculation produced an amount, the typed line is not shown again as P.A.Y.E. on the payslip or the certificate.

---

## 4. An extra can be left out of PAYE

Each extra earning defaults to both PAYE-taxable and NIS-eligible. Tax and NIS can be switched off separately. This supports allowances such as travel that are paid but excluded from either calculation.

Example. Salary $3,200 plus $500 travel excluded from both PAYE and NIS gives gross $3,700 but taxable/NIS-eligible pay of $3,200.

---

## 5. Year to date

**September rule.** YTD is approved pay in the calendar year, on or before this pay date, excluding this run. The screen adds the figure being typed.

**Current rule.** The stored prior total is still approved pay in the pay date’s calendar year, on or before this pay date, excluding this run and excluding later runs. Vacation and PAYE are now part of that total.

The review screen and the payslip show prior plus this run. While a draft amount is being edited, YTD moves by the difference between the saved line and the typed amount. A person with no earlier approved pay shows this run alone.

---

## 6. Print PAYE

The button on an approved or voided run is enabled. It prints one page for that run.

Header **P.A.Y.E.** Period start–end, pay date, cycle number, and the month of the **pay date**. A voided run says the report is a record only and is not filed.

| Name | Tax code | Gross | Taxable | NIC | PAYE |
|---|---|---:|---:|---:|---:|
| `{NIC} - {name}` | tax code | gross | taxable pay | employee NIC | calculated PAYE |

People with zero gross, taxable pay, NIC, and PAYE are omitted. Totals sit under the money columns. A note under the table states the progressive-band and standard-allowance rule.

---

## 7. TD5 and TD4 certificates

These are not part of one pay run. They are printed from the payroll list, for an income year or for a start and end date inside a single calendar year. A range that crosses 1 January is rejected.

Source rows are lines on **approved** runs whose pay date falls in that range. Voided and draft runs are left out.

One certificate per person, sorted by name. Someone still employed gets a **TD5**. Someone marked inactive gets a **TD4**. A person with no earnings, no listed deductions, and no allowances is omitted.

Identity comes from the staff record when the line has a staff id: name, address, employment start date, tax code, tax number, NIC number. The tax code and NIC number on the pay lines fill in when the staff record is blank. Report-only lines with no staff id are grouped by name.

| Earnings | Deductions |
|---|---|
| Basic | N.I.S. (employee NIC) |
| O/T(one&half) | P.A.Y.E. |
| Vacation | |
| Each named extra, in name order | |

A label that contains “allowance” is not an earning line. Those amounts add into **Total allowances**. Loan, medical, and shortage are not on the certificate.

PAYE on the certificate is the calculated amount. If that amount is zero, a typed `PAYE` or `PAYE tax` deduction from the old method is used instead, so a year that was filed by hand is not dropped.

The certificate says to attach that copy to the return and file on or before **31 March of the following year**. A full year downloads as `td5-td4-{year}`. A shorter range downloads as `td5-td4-{start}-{end}`.

---

## 8. NIC report

The Charge column is gone. It repeated the staff NIC figure. The columns are now:

| Name | Staff | Employer | Govt ttl |
|---|---:|---:|---:|
| `{NIC} - {name}` | employee NIC | employer NIC | staff + employer |

The month in the header is still the month of the period end. The PAYE report uses the pay date’s month instead.

---

## 9. Payslips

Vacation prints as its own earning, with hours and the straight-time rate, when the amount is not zero. Calculated PAYE prints as **P.A.Y.E.**

Slips are no longer held to three per page. They stack until the page is full, with a cut guide above the first slip, between slips, and under the last slip. SRP can use its own page size. The rule to keep is: more than three slips may share a page, and each slip can be cut out on its own.

---

## 10. Shortage on the hours extract

The attendance pay-period extract no longer calculates a shortage. The field starts at zero and is typed. Payroll still treats whatever amount is on the extract as a deduction, and the review step can still change it.

---

## 11. Still unfinished

Carry these forward. Do not invent a rule for them:

- Sick days are shown and are not paid.
- The numeric part of the tax code sets the allowance. Blank or lower codes use the PayMS minimum code 254.
- Hour and money column layout can still live in the browser. Whether SRP stores it per user or per company is unchanged.
- GL centre and department stay that site’s own values.
- Credit-union letterhead is still data, complete for one union in Shift Close.
- Third-party cash disbursements are still absent from the current payroll screen.
- Employer NIC is still reported and is still not taken from the employee.
- The NIS cap applies once for the pay-date month. PAYE is annualized independently for each payroll period.

---

## 12. Shift Close presentation — do not port

These changed in Shift Close and are not payroll rules:

- The payroll page lists existing runs, with counts for all, draft, and approved, before a new run is started.
- The company name under that heading is Westline Enterprise Ltd for this station. SRP prints its own company.
- The hours grid can be completed on a phone without sideways scrolling.
