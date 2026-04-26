# Future: fuel book inventory and cost tracking

Design notes only — not implemented. Revisit when building a fuel monitoring widget or cost analytics.

## 1. Book inventory (tank level estimate)

**Goal:** Approximate on-hand fuel from operations data: purchases add volume; shift closes subtract sales.

**Core formula (per product, e.g. unleaded vs diesel):**

```text
book_on_hand = opening_balance_at_cutover
             + sum(delivered_volume since cutover)
             - sum(sold_volume from shift closes since cutover)
             + sum(manual_adjustments)   // dips, write-offs, corrections
```

**What we already store today**

- **Sales volume:** `ShiftClose.unleaded` and `ShiftClose.diesel` (per shift). Aggregate by calendar day or rolling total as needed.
- **Payments:** `PaymentBatch` / `PaidInvoice` are **financial** (amounts, invoice metadata), not litres delivered.

**What would need to be added (if we build this)**

- **Opening balance(s)** at a chosen cutover date (per grade, and per tank if we ever model multiple tanks).
- **Delivery ledger:** volume per grade (and optional delivery date), keyed off invoice/BOL rather than bank payment date — payment date often lags delivery and would skew the book.
- **Reconciliation:** periodic stick reading or ATG snapshot as an explicit adjustment row so evaporation, temperature, leakage, and timing errors do not silently drift the book.
- **Canonical units:** pick one internal unit (e.g. litres) and convert at import/UI; `HistoricalFuelData` already mixes litres/gallons — inventory should not mix without conversion.

**Caveats (product expectations)**

- This is a **book estimate**, not a physical gauge, unless reconciled to dips/ATG.
- Invoices in one payment batch may cover multiple products; each line may need its own volume breakdown.
- Corrections to past shifts or deliveries need a clear audit trail so the book can be replayed.

---

## 2. Fuel / LPG cost and price history (separate from inventory)

**Why it is useful even without tank inventory**

- Margin and P&L views (“what did fuel cost us this month?”).
- Explaining **payment** amounts vs **volume** (effective cost per litre from invoice line items or derived from amount ÷ litres when both exist).
- LPG is already a first-class `PaidInvoice.type` alongside `Fuel`; tracking **effective unit cost over time** applies to both.

**Lightweight approaches**

- **Derived from existing data:** When paid invoices include both **amount** and **volume** (entered manually or parsed later), store or compute `cost_per_unit` at invoice or line level. No extra “price list” if the invoice is the source of truth.
- **Explicit price table:** Optional time-bounded rows (product, unit, effective_from/to, currency) for pump pricing or supplier contract tiers — useful when invoices are late but you want “known rack price on date X” for dashboards.

**Thoughts**

- Cost/price tracking is **orthogonal** to book inventory: inventory needs **litres in/out**; cost needs **money ÷ volume** (or list prices). Implementing cost history first still pays off for reporting and does not block inventory later.
- Prefer **append-only or versioned** corrections (similar in spirit to `PaymentCorrection`) so historical charts do not change silently when someone fixes a typo.
