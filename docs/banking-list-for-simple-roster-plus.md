# Banking list and bank grouping — for Simple Roster Plus

**Audience:** an agent implementing payroll payment output inside Simple Roster Plus (SRP).  
**Source:** the working banking list in Shift Close, as of 28 September 2026.  
**Purpose:** reproduce the **bank names, codes, and totals**. Build the picker and the printout in SRP’s own layout. Do not copy Shift Close’s colors, spacing, or page chrome.

This is the St. Lucia list used at Total Auto, Cul de Sac. If an SRP site already has its own banks, keep those. Use this document when the site pays staff in Saint Lucia the way Shift Close does.

Two groupings are involved. They are not the same list:

1. **Picker groups** — how a clerk chooses a bank on the person. Three headings, then free text.
2. **Banking-list buckets** — how net pay is added up after the pay run. Short codes, then station totals. FICS rolls into CIBC. Each credit union stays on its own.

The pay formulas, NIC, and the credit-union letter text live in `docs/payroll-st-lucia-for-simple-roster-plus.md`. This file is only the banks and the listing.

---

## 1. What is stored on the person

| Field | Role |
|---|---|
| Bank name | The exact string from the picker, or whatever was typed under Other |
| Account number | Printed on the listing and the payslip |

The short bank code is **derived** when the pay run is built. It is not what the clerk picks. A later run reads the name again. If that name matches a known credit union, the union’s code replaces any older code saved on the line.

---

## 2. Picker groups

Show the banks in this order, under these headings. Then one **Other…** choice that stores a typed name. A blank choice is allowed (no bank yet).

Match the strings exactly. The codes in §3 look for words inside these names.

### Commercial Banks

- 1st National Bank Saint Lucia Limited
- Bank of Saint Lucia Ltd.
- CIBC Caribbean Bank Limited (formerly CIBC FirstCaribbean)
- Financial Investment and Consultancy Services Ltd
- Republic Bank (EC) Ltd.
- Cheque

Cheque sits in this group so it can be picked like a bank. On the listing it becomes code `CHQ` and the Cheques bucket.

### Credit Unions

- Choiseul Co-operative Credit Union
- Dennery Community Co-operative Credit Union
- Elks City of Castries Co-operative Credit Union
- Fond St. Jacques Co-operative Credit Union
- Jannou Credit Union (formerly St. Lucia Civil Service)
- Laborie Co-operative Credit Union
- Mabouya Valley Co-operative Credit Union
- Mon Repos Eastern Co-operative Credit Union
- National Farmers & General Workers
- Royal St. Lucia Police and Allied Services
- Saltibus Co-operative Credit Union
- Saint Lucia Hospitality Industry Workers
- Seventh Day Adventist Credit Union
- St. Lucia Teachers Co-operative Credit Union
- St. Lucia Workers' Credit Co-operative Society

### International Banks

- PROVEN Bank (Saint Lucia) Limited
- Bank of Saint Lucia International Limited
- Berkeley Bank & Trust Limited
- Euro Exim Bank Limited
- Petrus Private Bank Limited
- Hermes Bank Limited
- Arbiter Bank International (St. Lucia) Ltd.
- First Citizens Financial Services (St. Lucia) Limited
- Atlantic Financial Limited

**Bank of Saint Lucia International Limited** contains the words “bank of saint lucia”, so the listing codes it `BOSL` and puts it in **BOSL S/Station** with Bank of Saint Lucia Ltd. Keep that. Split it only if someone asks.

---

## 3. Code from the bank name

Apply these tests **in this order**. The first match wins. Compare the name in lower case.

| Order | Name | Code |
|---|---|---|
| 1 | No name and no account | `CHQ` |
| 2 | The name has the word `chq`, `cheque`, or `check` | `CHQ` |
| 3 | A known credit union (table below) | that union’s code |
| 4 | Any other credit union: the name is one of the picker names, or it contains `credit union` or `co-operative credit` | first 12 letters and digits of the name, upper case. If nothing remains, `CU` |
| 5 | Contains `fics` or `financial investment` | `FICS` |
| 6 | Contains `firstcaribbean`, `fcib`, or the word `cibc` | `FCIB` |
| 7 | Contains `bank of saint lucia` or the word `bosl` | `BOSL` |
| 8 | Contains `republic` | `REPUBLIC` |
| 9 | Name is blank (an account was present, or step 1 would have matched) | `CHQ` |
| 10 | Anything else | first 12 letters and digits of the name, upper case. If nothing remains, `OTHER` |

“First 12 letters and digits” drops spaces and punctuation, then keeps 12 characters. `1st National Bank Saint Lucia Limited` becomes `1STNATIONALB`.

### Known credit unions

Test these patterns in this order.

| Code | Printed name | Name contains |
|---|---|---|
| `NFGWCCU` | National Farmers & General Workers | `nfgw`, `national farmers`, or `general workers` |
| `CHOISEUL` | Choiseul Co-operative Credit Union | `choiseul` |
| `DENNERY` | Dennery Community Co-operative Credit Union | `dennery` |
| `ELKS` | Elks City of Castries Co-operative Credit Union | `elks` |
| `FONDSTJ` | Fond St. Jacques Co-operative Credit Union | `fond st` or `fondst` |
| `JANNOU` | Jannou Credit Union | `jannou` or `civil service` |
| `LABORIE` | Laborie Co-operative Credit Union | `laborie` |
| `MABOUYA` | Mabouya Valley Co-operative Credit Union | `mabouya` |
| `MONREPOS` | Mon Repos Eastern Co-operative Credit Union | `mon repos` or `monrepos` |
| `POLICE` | Royal St. Lucia Police and Allied Services | `police` |
| `SALTIBUS` | Saltibus Co-operative Credit Union | `saltibus` |
| `HOSPITALITY` | Saint Lucia Hospitality Industry Workers | `hospitality` |
| `SDA` | Seventh Day Adventist Credit Union | `seventh day` or `adventist` |
| `TEACHERS` | St. Lucia Teachers Co-operative Credit Union | `teachers` |
| `WORKERS` | St. Lucia Workers' Credit Co-operative Society | `workers' credit`, `workers credit`, `workers co-operative`, or `workers cooperative` |

`NFGWCCU` is the code already used on file for National Farmers & General Workers. Keep it.

---

## 4. Which code a listing row uses

For each person on the pay run:

1. If the **bank name** matches a known credit union, use that code. This wins over a code already stored on the line. A line saved as `LABORIECOOPE` with the name “Laborie Co-operative Credit Union” prints as `LABORIE`.
2. Otherwise use the code already stored on the pay line.
3. Otherwise derive it with §3.
4. Otherwise `CHQ`.

Upper-case the code.

`CHQ` rows print a **blank** account number, even if one was stored.

Everyone on the run is listed, including a zero net. The NIC report drops zero-gross people. This list does not.

---

## 5. The banking list

One row per person. Sort by bank code, then by name. Ignore case.

| Column | Contents |
|---|---|
| `BANKCODE` | The code from §4 |
| `STAFFNAME` | Full name |
| `STAFFNO` | NIC / national number. Blank if none |
| `ACCOUNTNO` | Account number. Blank on `CHQ` |
| `NETPAY` | Net pay for this run, two decimals |

Title the page **Banks Listing**. Show the pay date.

Offer a print and an Excel download. Excel file name: `banks-listing-{pay date}.xlsx`, sheet name `Banks Listing`. The sheet is the title, the pay date, a blank row, the column headers, the people, a blank row, then the totals in §6.

On the print step this sits with payslips, GL, NIC, and the payroll summary. That step is available after the run is approved, and still available after a void. A voided run’s money stays visible and stops counting in later payroll. The list itself still prints that run’s nets.

---

## 6. Totals buckets

This is the second grouping. It is a footer under the people, not the picker in §2.

Add each person’s net into one bucket. Round to two decimals on each add.

| Code | Bucket label |
|---|---|
| `BOSL` | BOSL S/Station |
| `FCIB`, `CIBC`, or `FICS` | CIBC S/Station |
| `REPUBLIC` | Republic S/Station |
| `CHQ` | Cheques |
| A credit union (a known code, a known name, or a name that looks like a credit union) | the code by itself, with no “S/Station” |
| Any other code | `{code} S/Station` |

FICS is its own code on the person’s row. Its money joins FCIB in **CIBC S/Station**.

Sort the buckets by label, A to Z, ignoring case.

Under the buckets:

| Line | Amount |
|---|---|
| Staff total | Sum of every person’s net |
| Extra cash out | Only when third-party lines exist. See §7. One row per line |
| Banking total | Staff total + extra cash out |

The staff total must equal the sum of the buckets. Show that they tie. A mismatch is an error in the grouping, not a rounding difference to hide.

---

## 7. Third-party cash

A run can store extra payments that are **not** anyone’s net (Republic, CARED, and similar). Each has a label and an amount. They add to the banking total. They do **not** enter a bank bucket, and they do not change the staff total.

Shift Close’s current payroll screen lists staff nets only and has no editor for these lines. An older pay-run screen does. Include the lines when SRP still pays those third parties in the same salary file. Leave them out when it does not.

---

## 8. Worked example

These nets are the check figures from Shift Close. Codes are already resolved.

| Name | Code | Account | Net |
|---|---|---|---|
| Crestie | BOSL | 1 | 400.00 |
| Natasha Sandiford | BOSL | 2 | 400.00 |
| Urancia Brown | BOSL | 3 | 381.71 |
| Jervis Byron | CHQ | | 500.00 |
| Judan Adrian | CHQ | | 514.58 |
| Orena Stange | FCIB | 4 | 436.80 |
| Elena James | FICS | 107072661 | 489.33 |
| Althea Frank | NFGWCCU | 9 | 774.02 |

Printed order is the table above: `BOSL`, then `CHQ`, then `FCIB`, then `FICS`, then `NFGWCCU`, and by name inside each code. Cheque accounts are blank.

| Bucket | Amount |
|---|---|
| BOSL S/Station | 1,181.71 |
| CIBC S/Station | 926.13 |
| Cheques | 1,014.58 |
| NFGWCCU | 774.02 |
| Staff total | 3,896.44 |

`926.13` is Elena (FICS) plus Orena (FCIB). NFGWCCU is not folded into a station bucket.

With extra cash out of Rep `600.00` and CARED `374.89`, extra total is `974.89` and the banking total is `4,871.33`. Those two lines sit under Extra cash out. They are not inside the four buckets.

A Laborie member stored under a truncated code still prints as `LABORIE`, and that bucket is `LABORIE`, not `LABORIE S/Station`.

---

## 9. Fit this into SRP

Keep:

- The three picker groups, the names, and Other.
- The code tests in the order in §3, including `NFGWCCU` and the FICS → CIBC rollup.
- Cheque as a blank account and a Cheques bucket.
- Sort by code, then name.
- Staff total equal to the sum of the buckets.
- Credit-union buckets named as the code alone.

Change to match SRP:

- The staff screen and the print layout.
- Where bank name and account number already live. Read those fields. Do not invent a second staff list.
- Company name on the page, if SRP prints one. The listing itself is people, codes, and nets.

Leave out until someone asks:

- A separate bucket for Bank of Saint Lucia International.
- Third-party cash, unless that site still pays Republic, CARED, or the like with the salary file.
