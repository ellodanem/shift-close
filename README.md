# Shift Close - Gas Station End of Shift Closing System

A local-first operational app for digitizing gas station end-of-shift closing sheets. This app prioritizes simplicity, visual similarity to paper forms, immutable records, and clear red-flag detection.

## Features

- **Shift Entry Form**: Visually matches the paper form with live over/short calculations
- **Red Flag Detection**: Automatically flags shifts with over/short discrepancies that lack notes
- **Shift List Dashboard**: Quick overview of all shifts with status indicators (✅ Green, 🟡 Amber, 🔴 Red)
- **Day Reports**: Aggregated daily reports with completeness validation
- **Excel Export**: One-click export of day reports for sharing with stakeholders
- **Immutable Records**: All shifts are immutable; corrections are additive only

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database**: SQLite
- **ORM**: Prisma
- **Export**: xlsx library

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Initialize database**:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Creating a Shift

1. Click "New Shift" from the Shift List
2. Fill in all required fields matching the paper form
3. The form will automatically calculate over/short values
4. If over/short is not zero, you must add notes (red flag will appear)
5. Click "Save Shift" to create the immutable record

### Viewing Shifts

- **Shift List**: View all shifts with status indicators
- **Shift Detail**: Click any shift to view full details (read-only)
- **Day Reports**: View aggregated daily reports with completeness status

### Day Reports

Day reports automatically group shifts by date and validate completeness:

- **Standard Day**: Requires both 6-1 and 1-9 shifts
- **Custom Day**: Requires exactly one Custom shift (for Sundays/holidays)
- **Invalid Mix**: Custom + Standard shifts on same day (flagged)

### Excel Export

Click "Export Excel" on any day report to download a formatted Excel file with:
- Day summary
- Money summary
- Fuel summary
- Shift breakdown

## Database

The SQLite database is stored at `prisma/shiftclose.db`. To view/edit data:

```bash
npx prisma studio
```

## Deployment

This app is designed to deploy to Vercel without architecture changes. The SQLite database will need to be migrated to a serverless-compatible database (e.g., PostgreSQL) for production use.

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── shifts/          # Shift CRUD endpoints
│   │   └── days/            # Day report aggregation
│   ├── shifts/              # Shift UI pages
│   ├── days/                # Day report pages
│   └── layout.tsx
├── lib/
│   ├── prisma.ts            # Prisma client
│   ├── types.ts             # TypeScript types
│   └── calculations.ts      # Business logic
├── prisma/
│   └── schema.prisma        # Database schema
└── package.json
```

## Red Flag Rule

**Critical**: If `Over/Short ≠ 0` AND `Notes` are empty → **RED FLAG**

This rule forces explanations for discrepancies and is visually enforced throughout the app.

