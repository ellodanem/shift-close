# Session Notes – Shift Close

Context and decisions from development sessions. Use this to recover context if a chat is lost.

---

## Cashbook (Financial Module)

### Simplified UI (implemented)
- **Add Income** / **Add Expense** buttons instead of complex grid
- **Sort by date**: Click Date column header to toggle asc/desc; preference saved in localStorage
- **Sticky header**: Title, month selector, Financial Report, Add Income/Add Expense stay visible when scrolling
- Modal form: Date, Description, Category, Amount, Ref (optional)
- **How paid** (expenses only): Cash, Check, Deposit, EFT, Direct debit, Debit/Credit
- Simple list view: Date | Type | Description | Category | Amount | How paid | Edit | Delete
- Categories filtered by type (Income vs Expense) when adding

### Schema
- `debitCheck` – for check payments
- `paymentMethod` – stores how paid (cash, check, deposit, eft, direct_debit, debit_credit)
- Mapping: Cash→debitCash, Check→debitCheck, Deposit/EFT/Direct debit→debitEcard, Debit/Credit→debitDcard

### Description suggestions
- Dropdown of previously used descriptions when typing in Add Income/Expense
- Suggestions from existing entries, filtered by type (income vs expense)
- "Remove from suggestions" (✕) on hover to hide typos/one-offs
- Exclusions stored in `cashbook_description_exclusions` table
- Neon script: `scripts/neon-apply-description-exclusions.sql`

### Bank Charges
- **Direct debit** added to How paid for auto-deducted bank charges
- When category name matches "Bank Charges" (case-insensitive), How paid auto-selects "Direct debit"

### Income: Credit Card / Debit Card
- When income category is "Credit Card" or "Debit Card", Description auto-fills "Card Transactions"

### Income: Deposit
- When income category is "Deposit", Description auto-fills "Deposit"

### Save & Add another
- Button keeps modal open after save; retains date and category, clears amount/description/ref
- Speeds up adding multiple entries for the same day

### Neon scripts to run (if tables/columns missing)
- `scripts/neon-apply-cashbook-tables.sql` – creates cashbook tables
- `scripts/neon-apply-cashbook-payment-method.sql` – adds debitCheck, payment_method columns
- `scripts/neon-apply-description-exclusions.sql` – description suggestion exclusions

---

## Fuel Payments → Cashbook (implemented)

### Optional checkbox
- **"Add to Cashbook as expense"** checkbox on Make Payment form (default: checked)
- When checked: creates CashbookEntry linked via `paymentBatchId` on payment
- On revert: deletes any CashbookEntry where `paymentBatchId` = reverted batch

### Implementation
- Splits by invoice type: LPG+Lubricants+vendor payments→Rec. Gen (3021), Fuel→Rec. Gas (3022), Rent→Mtnce
- **Rec. Gen** = LPG, Lubricants, and payments to vendors
- Auto-creates categories if missing
- One entry with multiple allocations; fallback to "Fuel payments" if no type matches

### Future
- When vendor invoice types exist, add them to `recGenTypes` in the make-payment route so vendor payments map to Rec. Gen

---

## Reminders (partially implemented)

### Schema
- `Reminder` model: title, date, notes, notifyEmail, notifyWhatsApp, notifyDaysBefore (e.g. "7,3,1,0")

### Implemented
- Migration: `prisma/migrations/20260219120000_add_reminders/migration.sql`
- Neon script: `scripts/neon-apply-reminders.sql`
- API: GET/POST `/api/reminders`, DELETE `/api/reminders/[id]`, GET `/api/reminders/check` (cron)
- Upcoming API includes custom reminders (type: 'other', reminderId)

### Implemented (dashboard)
- "+" button in Upcoming component top-right
- Create-reminder modal (title, date, notes, notifyEmail, notifyWhatsApp, notifyDaysBefore)
- Delete button (✕) for custom reminders in upcoming list

### Pending
- Vercel cron: add to `vercel.json`, set `CRON_SECRET` env var

### Cron
```json
"crons": [{ "path": "/api/reminders/check", "schedule": "0 8 * * *" }]
```

---

## Roster (implemented)

- **Past week lock**: Once new week starts (Monday), previous week is read-only
- **Copy previous week**: Modal confirmation before overwriting
- **Staff mobile + wa.me**: Roster share via WhatsApp links

---

## Over/Short Items (implemented)

- **Data safety:** Additive only. New table `over_short_items`. No existing ShiftClose or related tables/columns modified. Current data unaffected.
- Structured overage/shortage line items per shift (e.g. Rumie check, Manager took from drawer)
- Green "+ Add overage" and red "− Add shortage" buttons on shift detail page
- Each item: amount + description. Delete via ✕.
- Raw Over/Short (count vs system) unchanged. Items are structured explanations.
- Schema: `OverShortItem` (shiftId, type, amount, description, sortOrder)
- Neon script: `scripts/neon-apply-over-short-items.sql`
- Additive only: no existing data modified

---

## Customer A/R Payments (Phase 1 – Capture)

### Purpose
Captures individual customer payments as they are received (like Mr. Elcock's spreadsheet). Payments entered on Cstore as well as Mr. Elcock's spreadsheet should be recorded here.

### Implemented
- **Record Payment** section on Customer Accounts page: Date, Customer, Amount, Ref (optional)
- **Recorded payments** table with month filter: Date | Customer | Amount | Ref | Total
- Schema: `CustomerArPayment` (date, account, amount, paymentMethod?, ref?, notes?)
- API: GET/POST `/api/customer-accounts/payments` (query: startDate, endDate, account)
- Neon script: `scripts/neon-apply-customer-ar-payments.sql`

### Future (Phase 2 – Accounting)
- Link to cashbook (auto-create entries when recording payment)
- Reconcile with POS/Cstore monthly totals
- Per-account roll-forward (opening + charges − payments = closing)

---

## Attendance (ZKTeco)

### Implemented
- **AttendanceLog** model: staffId, deviceUserId, deviceUserName, punchTime, punchType (in/out), source
- **Staff.deviceUserId**: links Staff to ZKTeco device user ID for matching
- **Sync API** `POST /api/attendance/sync`: connects to device (ZK_DEVICE_IP, ZK_DEVICE_PORT env), pulls logs, stores in DB. Dedupes on re-sync.
- **Logs API** `GET /api/attendance/logs`: startDate, endDate, staffId filters. Returns logs with `hasIrregularity` flag.
- **Irregularity logic**: clock-in without matching clock-out, or clock-out without matching clock-in → red icon
- **Attendance page**: Sync button, date range (week/month/custom), staff filter, table with red icon for irregularities
- **zk-attendance-sdk** (Node.js) for device communication
- Punch type inferred: for each user per day, sort by time; odd index = in, even = out

### Config
- `.env`: `ZK_DEVICE_IP` (required), `ZK_DEVICE_PORT` (default 4370)
- Staff edit: "Device User ID (Attendance)" field to match device user ID

### Neon
- Run `scripts/neon-apply-attendance-module.sql` if tables missing

### Remote
- Sync requires server to reach device on LAN. Vercel serverless cannot reach local network. Use local dev or a machine on same network for sync.

---

## Other

- Dashboard Cashbook (MTD) widget shows income/expense for displayed month
- Financial Report page uses real cashbook data (income, expense, net, by category, debits/credit)
- WhatsApp notifications for reminders: not implemented (requires Twilio); structure in place
