# Date/Time Policy

This project uses a single business timezone and strict date semantics.

## Source of truth

- Business timezone: `America/St_Lucia`
- Policy module: `lib/datetime-policy.ts`

## Data model contract

- `date-only` values use `YYYY-MM-DD` and represent a calendar day.
- `instant` values are UTC `Date` timestamps for event moments.

## Required helper usage

- Use `toYmdInBusinessTz()` for "today" style business-day derivation.
- Use `zonedStartOfDayUtc()` and `zonedEndExclusiveUtc()` for day windows.
- Use `ymdToUtcNoonDate()` when storing date-only values in `DateTime` columns.
- Use `normalizeToUtcString()` when parsing inbound ISO-like strings.

## Review checklist

- No raw `new Date('YYYY-MM-DD')` for business dates.
- No `toISOString().slice(0, 10)` for business-day derivation.
- No direct `toLocaleDateString()` on date-only DB fields.
- Date filtering windows must use the business timezone helper boundaries.
