# St. Lucia payroll — behavior spec for Simple Roster Plus

**Audience:** an agent implementing payroll inside Simple Roster Plus (SRP).  
**Source:** the working payroll in Shift Close, as of 28 September 2026. It is in daily use and still unfinished.  
**Purpose:** reproduce the **rules, money, and outputs**. Build the screens in SRP’s own layout. Do not copy Shift Close’s colors, spacing, or page chrome.

Shift Close is one station (Total Auto, Cul de Sac). SRP should use the company, banks, and department labels already configured for that SRP site. The formulas below are the St. Lucia rules.

---

## 1. What this payroll is

A pay run turns an **extracted attendance period** into gross pay, St. Lucia NIC, other deductions, and net pay, then locks that result so it can be printed and paid.

Payroll is its own process. Attendance stays punches, roster match, and the extracted hours report. Payroll reads that extract. It does not start from the attendance screen.

Income tax (PAYE) is **not calculated**. A clerk can type a PAYE amount as an extra deduction. A “Print PAYE” action exists and is disabled.

US payroll pieces are out of scope: Social Security, Medicare, 401(k), W-2, 1099, and direct-deposit funding.

---

## 2. What a person needs on file

Each person who can be paid has:

| Field | Role |
|---|---|
| Full name | Payslips, banking list, NIC report |
| NIC / national number | Printed as the staff number. NIC report name is `{number} - {name}` |
| Status | `active` people can be added as salaried even when they have no hours row |
| Role | `manager` is left off that salaried add. A manager who is already on the hours extract is still paid |
| Pay frequency | `weekly`, `biweekly`, `semimonthly`, or `monthly`. Default is semi-monthly |
| Pay type | `hourly` or `salaried` |
| Hourly rate | Hourly basic and overtime |
| Salary amount | One cycle of salary. Not an annual figure |
| Tax code | Stored and printed. Does not change the math |
| Medical amount | Recurring deduction, prefilled each run |
| Bank name and account | Banking list and payslip |
| Staff loan | See §7 |

---

## 3. Hours that feed the run

Before a run can start, someone has already saved an attendance pay period. That save stores one row per person:

- staff id and name
- total worked hours (`transTtl`), decimal hours
- vacation text
- sick days
- shortage amount
- pay frequency and staff number, when known

Rows that exist only on the report (not a real staff record) use a staff id starting with `report-only:`. They are still paid if they have a name.

Vacation and sick are **shown** on the hours grid. They are **not paid**. Sick cannot be edited on the payroll grid. Paying vacation or sick is an open decision.

**Reload hours** replaces edited basic and overtime with a fresh split of the extracted total, after a confirm. Other typed amounts stay unless the user clears entries.

**Clear entries** blanks hourly basic, overtime, extra, and shortage, and blanks extra on salaried rows. Rates, salary, loan, and medical stay.

---

## 4. Opening a run

The start screen asks for:

1. **Hours from attendance** — pick a saved extract. The latest is marked.
2. **Pay range start and end** — prefilled from that extract, and editable.
3. **Pay cycle number** — a Pay+ style period number, 1–53. See below.
4. **Pay date** — defaults to the range end. The user can move it. NIC’s monthly cap uses this date, not the period end.

**Pay cycle number.** Semi-monthly periods are numbered from January: period 1 is 1–15 January, period 2 is 16–31 January, period 17 is 1–15 September. Formula from the end date: `(month - 1) * 2 + (day <= 15 ? 1 : 2)`. Weekly and monthly runs can type a number instead. Changing the end date refills the number until the user edits it.

**Who is on the run** depends on the frequency implied by the range:

| Range | Frequency |
|---|---|
| 1st through the 15th | Semi-monthly |
| 16th through the last day of that month | Semi-monthly |
| 1st through the last day | Monthly |
| 8 days or fewer | Weekly |
| 27 days or more | Monthly |
| Anything else | Semi-monthly |

Then:

- Every hours-extract row whose **staff pay frequency** matches that frequency is included. Report-only rows are included regardless of frequency.
- Active, non-manager, **salaried** people on that frequency are added even when they have no hours row.
- Inactive people are not added that way. They are still paid if they already appear on the extract and their frequency matches.
- Lines are sorted by name.

There is **one non-void run per attendance extract**. A second run for the same extract is allowed only after the first is voided. Drafts can be deleted. Approved runs are voided, not deleted.

Saving a different range that implies a different frequency rebuilds the lines and keeps rate, deduction, and extra overrides.

---

## 5. The three steps

1. **Enter payroll** — hours and money. Edits save on their own.
2. **Approve payroll** — review gross, deductions, and net. Download a preview. Approve locks the run.
3. **Print** — available only after approval or void. Payslips, GL, NIC, payroll summary, banking list, and credit-union emails.

Approved and voided runs open on step 3. Step 3 cannot be opened while the run is still a draft.

Clicking a name edits **rate or salary, tax code, and medical**:

- **This run only** — stored on the line.
- **This run and future runs** — also writes the staff record (rate or salary, tax code, medical).

Draft lines follow the staff pay type. If someone is switched from hourly to salaried on their staff record, an open draft picks that up.

---

## 6. Gross pay

Money is rounded to cents at each step (`round half away from zero` via `Math.round(n * 100) / 100`).

### Hourly

Shift Close uses one overtime rule: a fixed hour cap for the pay period, then a company-wide multiplier. **The 86.67 semi-monthly cap belongs to Shift Close only.** Do not make it SRP’s overtime rule.

Shift Close caps (40 × 52 / pays per year):

| Frequency | Shift Close cap |
|---|---|
| Weekly | 40 |
| Bi-weekly | 80 |
| Semi-monthly | 86.67 |
| Monthly | 173.33 |

```
basic hours = min(total hours, cap)
overtime hours = max(0, total hours - cap)
basic pay = basic hours × hourly rate
overtime pay = overtime hours × hourly rate × overtime multiplier
gross = basic pay + overtime pay + extra earnings
```

The Shift Close multiplier defaults to **1.5** (time and a half). A payroll setting can set it from **1** to **3**, with up to two decimal places. 1 is straight time. 2 is double time. That setting is company-wide, not per person.

The user can type basic and overtime hours after the split. The grid does not re-split while they type.

**SRP overtime rule.** SRP needs its own overtime setting, with several common choices, so an employer can pick the rule that matches how they pay. Keep 86.67 out of that list. Offer at least:

- **No automatic split.** All clocked hours stay basic. Overtime hours are typed.
- **Daily.** Hours after 8 in a day are overtime.
- **Weekly.** Hours after 40 in a week are overtime.
- **Multiplier.** Straight time (1), time and a half (1.5), or double time (2). A custom multiplier from 1 to 3 is allowed.

The chosen rule decides which hours are overtime. The multiplier decides how those hours are paid. Both are company settings. People can still edit the resulting basic and overtime hours on the run.

### Salaried

```
basic pay = salary for this cycle
overtime pay = 0
gross = basic pay + extra earnings
```

Clock hours on a salaried person do not create overtime.

### Extra earnings

- A built-in **Extra** money column adds to gross.
- Custom **hour** columns (added in the browser) pay `hours × hourly rate`. They do not use the overtime multiplier.
- Custom **money** columns add their amount to gross.
- A marker line labeled `__skipSalary` is ignored in totals. The current screen does not create it. Treat it as unused.

### Column choices

Built-in columns: Basic, Overtime, Vacation (display), SICK (display, locked), Extra, Medical, Shortage.

Shortage starts **hidden**. The rest start visible.

The user can show, hide, add, or remove extra hour, money, or deduction columns. **That choice is stored in the browser**, not in the company database. SRP should decide whether to keep it per user or per company. The pay amounts themselves are stored on the run.

A custom column named Sick, Sick Day, or Sick Days is hidden while the attendance SICK column is on, so sick is not entered twice.

---

## 7. Deductions and net

```
employee NIC = min(gross × 5%, remaining monthly cap)
employer NIC = min(gross × 5%, remaining monthly cap)    // memo only
total deductions = employee NIC + staff loan + medical + shortage + extra deductions
net = gross − total deductions
```

Employer NIC is **not** subtracted from net. Net is allowed to go negative if deductions exceed gross. There is no floor at zero.

### NIC (labeled N.I.C. on screen, N.I.S. on payslips)

- Rate: **5%** of this run’s gross, employee and employer each.
- Monthly cap: **$250** each. Employee and employer caps are tracked separately.
- “This month” is the **pay date’s** calendar month (`YYYY-MM`).
- Already taken = employee or employer NIC on other **approved** runs in that month. Drafts and voided runs do not count.
- A person who already used $200 of employee NIC this month can only be charged $50 more, even if 5% of this gross is higher.

This is a running cap, not “$125 per semi-monthly period.” A single large period can use the whole $250, and the other period in that month then has $0 left. A sample NIC form that shows 125 / 125 / 125 / 250 is what you get when each period’s 5% lands on half the cap. The app does not force that split.

### Staff loan

Interest-free. One active loan per person.

- Principal, term (in months or in pays), installment, and a start date (first eligible pay date).
- Pays per month: weekly 4, bi-weekly 2, semi-monthly 2, monthly 1. A term in months is converted with that count.
- Regular installment = principal ÷ number of pays, in cents.
- Each pay deducts the installment, or whatever is left if that is smaller. Leftover cents under $1 ride on the last pay.
- Remaining = principal − loan amounts already taken on **approved** runs.
- If there is no active loan with a balance, the older open-ended “staff loan” amount on the person is used instead, with no remaining-balance cap.
- The hours step does not edit the loan. The review step can change this run’s deduction. The deduction cannot exceed what is still owed when a real loan balance exists.
- Approve and void both refresh the loan. Remaining of zero marks the loan **paid**. A void puts that run’s deduction back into the balance, so a paid loan can become active again.

### Medical, shortage, other

- Medical prefills from the staff record and can be changed on the grid or in the name dialog.
- Shortage prefills from the attendance extract and is a deduction. It can be edited on the review step.
- Extra deductions (built-in **Other**, plus custom deduction columns) reduce net. They do not reduce gross.
- A deduction whose label is `PAYE` or `PAYE tax` is still just a typed amount. Payslips and the GL print it as **P.A.Y.E.**

### Year to date

YTD on the review and on payslips is the sum of **approved** runs in the pay date’s calendar year, with pay date on or before this run’s pay date, excluding this run. Voided runs are left out. While the user is still editing a draft, the on-screen YTD follows the typed figure for this run plus that prior total.

---

## 8. Approve, void, and delete

| Status stored | Shown as | Meaning |
|---|---|---|
| `draft` | Draft | Editable. Can be deleted |
| `processed` | Approved | Locked. Counts toward NIC cap, YTD, and loan balance |
| `void` | Voided | Locked record. Does not count toward NIC, YTD, or loan balance |

**Approve** sets the status and the time. It does not rebuild the lines. What is on the screen is what gets locked.

**Void** is allowed only on an approved run. The reason must be at least 3 characters. The record keeps who voided it, their name at that moment, and when. Amounts stay. The user can start a new run for the same attendance extract. The print step says the report is a record only and is not filed.

**Delete** is drafts only.

---

## 9. Outputs

All of these can be opened again later from the approved or voided run. Voided documents say they are a record only.

### Payslips

One slip per person who has any earning, deduction, or non-zero gross or net. Company name, address, and phone are settings (Shift Close’s defaults are Total Auto, John Compton Highway, Castries). Each slip shows earnings (basic, overtime, extras) with hours and rate where they exist, deductions, gross, total deductions, net, year-to-date, NIC number, tax code, bank, and the pay frequency.

### Payroll summary

Hourly people, then salaried people, then totals. Columns are hours, gross, deductions, and net. A line on the summary says PAYE is still handled outside this app. A preview can be downloaded **before** approval.

### NIC report (button label: Print NIC)

One page. Header **N.I.C.**, period start–end, cycle number, and the month of the period end (for example FOR: SEPTEMBER).

Columns:

| Name | Charge | Staff | Employer | Govt ttl |
|---|---|---|---|---|
| `{NIC} - {name}` | employee NIC | employee NIC | employer NIC | staff + employer |

Charge is a copy of the employee amount. It is not a third calculation. People with zero gross and zero NIC are omitted. A totals line sits under the columns, then the printed date.

### GL analysis

A station summary, not a full accounting export. Two pages: a centre page (earnings beside deductions) and a grand-totals page. In Shift Close the centre is hardcoded **CUL DE SAC** and the department is **004**. SRP should use that site’s centre and department, not these values.

Earning labels fold into Basic, Overtime, Commission, Add duties, or the extra’s own name. Deduction labels fold into P.A.Y.E., N.I.S., Staff Loan, CARED Loan, Medical Insurance, Republic Bank, Shortage, or the extra’s own name.

### Banking list

One row per person, sorted by bank code then name. Net pay only. Also a print and an Excel download.

Bank code comes from the bank name:

| Name contains | Code | Totals bucket |
|---|---|---|
| Bank of Saint Lucia | `BOSL` | BOSL S/Station |
| CIBC, FirstCaribbean, FCIB | `FCIB` | CIBC S/Station |
| FICS / Financial Investment | `FICS` | CIBC S/Station |
| Republic | `REPUBLIC` | Republic S/Station |
| Cheque, check, or no bank and no account | `CHQ` | Cheques |
| A known St. Lucia credit union | that union’s code | the code by itself |

Known credit-union codes: `NFGWCCU`, `CHOISEUL`, `DENNERY`, `ELKS`, `FONDSTJ`, `JANNOU`, `LABORIE`, `MABOUYA`, `MONREPOS`, `POLICE`, `SALTIBUS`, `HOSPITALITY`, `SDA`, `TEACHERS`, `WORKERS`. An unrecognized credit union gets a 12-letter code from its name. Any other bank gets a 12-letter code and a `{code} S/Station` bucket.

Cheque rows keep a blank account number. The list total must equal the sum of the bank buckets.

### Credit-union allocation letter

If anyone on the list is paid to a credit union, the print step offers an email for that union. The letter lists members and net amounts. The message and letter text can be edited before send.

Only **NFGWCCU** has a postal address and a settlement account filled in (Bank of Saint Lucia `412102733`). Other unions start with a blank address. SRP should keep those addresses as data, not as one hardcoded union.

### Third-party cash (not on the current payroll screen)

The run can store extra disbursements that are **not** anyone’s net (Republic, CARED, and similar). They add to the banking total. The older `/pay-run` screen edits them. The current `/payroll` screen’s banking list is staff net only and does not show that editor. Bring the behavior across if SRP still pays those third parties with the salary file.

### Print PAYE

The button is present and disabled. There is no PAYE report.

---

## 10. What is still unfinished

Carry these forward as known gaps, not as bugs to silently “fix” into different rules:

- PAYE is typed, not calculated. There is no tax table.
- Print PAYE does nothing.
- Vacation and sick are notes, not earnings.
- Hour and money column layout lives in the browser.
- GL centre and department are one station’s constants.
- Credit-union letterhead is complete for one union only.
- Third-party banking lines exist in the data and on an older screen, and are absent from the current payroll screen.
- Employer NIC is reported and is not a cost deduction from the employee.
- The NIC cap is monthly on the pay date. It does not split $250 into $125 per half month.

---

## 11. Worked example

This example uses **Shift Close’s** semi-monthly cap of 86.67. SRP should run the same NIC math after whatever overtime rule that company selected.

Semi-monthly, cap 86.67, rate $10, multiplier 1.5, no prior NIC this month, no loan, medical $20, shortage $0.

Hours worked: 90.

```
basic hours = 86.67
overtime hours = 3.33
basic pay = 866.70
overtime pay = 49.95
gross = 916.65
employee NIC = 45.83
employer NIC = 45.83 (memo)
net = 916.65 − 45.83 − 20.00 = 850.82
```

A second run the same pay-date month, same gross, still has $204.17 of the $250 cap left, so NIC is again $45.83. After enough gross that the month’s employee NIC has reached $250, further runs in that month take $0 employee NIC. Employer NIC reaches its own $250 the same way.

---

## 12. Fit this into SRP

Keep:

- The pay frequencies, 5% NIC, and $250 monthly cap.
- An overtime setting with the common choices in §6. The 86.67 cap stays a Shift Close fact, not an SRP default.
- Hourly versus salaried gross.
- Loan remaining balance and the last-pay leftover.
- Approve / void, and the rule that voided money stays visible and stops counting.
- One open run per attendance extract.
- Payslips, summary, NIC report, banking list, and the credit-union letter.

Change to match SRP:

- Navigation, tables, dialogs, and print styling.
- Company name, address, phone, GL centre, and department.
- Where staff, banks, loans, and attendance extracts already live. Read those. Do not invent a second staff list.
- Whether column layout is per browser or per company.

Leave out until someone asks:

- A PAYE calculation.
- Paid vacation or paid sick.
- US payroll taxes.
