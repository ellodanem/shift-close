# CoreShift - Important TODO List

## 🔴 HIGH PRIORITY - Financial Module Development

### 1. Cashbook Reverse Engineering & Implementation
**Status**: Pending  
**Priority**: Critical  
**Owner**: TBD

**Objective**: Reverse engineer the January cashbook spreadsheet (used by accountant) to understand the structure and implement the Financial module.

**Tasks**:
- [ ] Obtain January cashbook spreadsheet from accountant
- [ ] Analyze spreadsheet structure:
  - [ ] Identify all expense categories
  - [ ] Identify payables tracking structure
  - [ ] Identify receivables tracking structure
  - [ ] Document data entry patterns and workflows
  - [ ] Identify calculation formulas and dependencies
  - [ ] Note any reporting requirements
- [ ] Design database schema for expenses, payables, receivables
- [ ] Create Prisma models for financial data
- [ ] Build input forms matching cashbook structure
- [ ] Implement Financial Report page with all required sections
- [ ] Integrate financial data with Monthly Report
- [ ] Add cash flow and P&L calculations
- [ ] Test with real data from cashbook

**Deliverables**:
- Financial module fully functional
- Financial Report page complete
- Monthly Report integrated with financial data
- Net profit/loss calculations working
- Cash flow statements accurate

---

## 🔴 HIGH PRIORITY - Historical Fuel Data Import

### 2. Two-Year Historical Fuel Data Upload
**Status**: Pending  
**Priority**: Critical  
**Owner**: TBD

**Objective**: Import last two years of fuel sales data to enable comparative fuel report analysis.

**Tasks**:
- [ ] Locate historical fuel data source (spreadsheets, POS exports, etc.)
- [ ] Verify data format and structure
- [ ] Design data import process:
  - [ ] CSV/Excel import functionality
  - [ ] Data validation rules
  - [ ] Date range handling
  - [ ] Duplicate detection
- [ ] Create import API endpoint
- [ ] Build import UI page
- [ ] Test import with sample data
- [ ] Import full two-year dataset
- [ ] Verify data integrity after import
- [ ] Test Fuel Comparison Report with historical data

**Deliverables**:
- Import functionality complete
- Two years of fuel data imported
- Fuel Comparison Report working with historical data
- Year-over-year comparisons functional

---

## 📋 Notes

- Both tasks are critical for production readiness by mid-March
- Financial module must mirror existing cashbook workflow for accountant adoption
- Historical fuel data enables trend analysis and business insights
- Coordinate with accountant on cashbook structure before implementation

---

## 🟡 PLANNED - Lightweight A/R (Customer Accounts) Tracking

**Goal**: Add a simple way to track **In-House / customer account activity** so the app can show:
- Cash vs. fuel payments (current behaviour), and
- A clearer picture of **sales on account** without becoming a full accounting system.

**Initial ideas**:
- Start by surfacing **In-House (systemInhouse)** totals on the dashboard as "Customer Charges (MTD)".
- Keep Grand Total as **cash-like tenders only**; show In-House alongside it, not blended in.
- Later, explore a **lightweight A/R view**:
  - Daily new charges by customer (optional)
  - Simple monthly summary: opening A/R (from accounting), new charges, payments, closing A/R.
- Ensure this stays compatible with the accountant’s primary A/R in QuickBooks (no double system of record).

**Status**: Idea stage – to be fleshed out after core Financial module work.

### Recommendation for now

- **Do not** fold In-House into the main **"Total Deposits / Grand Total"** number.
- Instead, **show it separately** and keep **Fuel Net explicitly cash-based**, with maybe a small "+ Customer Charges (MTD)" helper line.
- Continue to rely on the accounting system (QuickBooks, etc.) for the fully accurate A/R picture; let the dashboard focus on:
  - "Cash vs fuel payments this month?"
  - "How much did we push into customer accounts this month?"

---

## 🔵 REMINDER - Monthly Report Printing & Export

### Printing and Export Functionality for Monthly Report
**Status**: Pending Discussion  
**Priority**: Medium  
**Owner**: TBD

**Objective**: Discuss and implement printing/export capabilities for the Monthly Report.

**Discussion Points**:
- [ ] Determine preferred export format (PDF, Excel, or both)
- [ ] Define print layout requirements (page breaks, headers/footers, styling)
- [ ] Decide on print-specific formatting (hide navigation, optimize for A4/Letter)
- [ ] Consider multi-page handling for long reports
- [ ] Evaluate need for print preview functionality
- [ ] Determine if Executive Summary should be separate from full report
- [ ] Discuss email/WhatsApp sharing requirements (if any)

**Current Status**: Monthly Report exists but lacks print/export functionality

**Related Files**:
- `app/reports/monthly/page.tsx` - Monthly Report page
- `app/api/reports/monthly/route.ts` - Monthly Report API

**Next Steps**: Schedule discussion to determine requirements before implementation

---

## 🔴 HIGH PRIORITY – Quick Sharing to Mr. Elcock (Mobile-first)

**Goal**: From wherever Dane is (phone, tablet, laptop), be able to quickly send Mr. Elcock the latest Shift Close / Fuel information via email or WhatsApp.

### 1. Dane’s real-time access from anywhere
- [ ] Deploy app to secure, internet-accessible host (e.g. Vercel + managed Postgres).
- [ ] Configure custom domain with HTTPS.
- [ ] Verify key flows work smoothly on **mobile** and laptop:
      - Dashboard summary
      - Monthly Fuel Payment Report
      - Proposed / Paid fuel payment views

### 2. One-tap email sending (Dane → Mr. Elcock)
- [ ] Choose and configure email provider (SendGrid or SMTP).
- [ ] Add “Email to Mr. Elcock” buttons on:
      - Proposed Payment (PNG/PDF)
      - Paid Payment summary
      - Monthly Fuel Payment Report
- [ ] Default recipient = Mr. Elcock, with optional CC/BCC.
- [ ] Keep a simple log (when, which report, success/fail).

### 3. One-tap WhatsApp sharing (Dane → Mr. Elcock)
- [ ] Standardize PNG/PDF generation for:
      - Proposed Payment
      - Paid Payment summary
- [ ] On mobile:
      - Use Web Share API to open WhatsApp with the image/PDF attached to Mr. Elcock’s chat.
- [ ] On desktop:
      - Copy image/PDF to clipboard and open WhatsApp Web, with on-screen instructions to paste.

### 4. (Secondary) Optional direct access for Mr. Elcock
- [ ] Create a read-only account for Mr. Elcock (if/when requested).
- [ ] Limit to key reports pages; no editing capabilities.
