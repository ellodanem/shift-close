# End of Day V2 is the default (revert reference)

## What changed (2026-11-09)

End of Day V2 (Cstore daily report comparison, Paper table with uploads, range report) is now what
`/days` opens. The original End of Day page was **not changed**; it moved to `/days/v1`.

| URL | Before | Now |
| --- | --- | --- |
| `/days` | Original End of Day (V1) | Redirects to `/days/v2`. Query strings such as `?date=2026-11-07` are carried across. |
| `/days/v1` | did not exist | The original End of Day page, same code and behaviour. |
| `/days/v2` | V2 preview | V2, the default. |
| `/days/v2/report` | n/a | Range report (This week, Last week, This month, Last month, or pick dates). |

Every link in the app (menu, Home tile, Shift, Deposit comparisons, inbox, email) still points to
`/days`, so they all land on whichever version is the default.

Other small edits made with the move:

- `app/days/page.tsx` is now a tiny server redirect. The old page moved to `app/days/v1/page.tsx`
  (imports changed from `./` to `../`, and its "clear date" link goes to `/days/v1`).
- The V1 page's link at the top now reads "Back to End of Day V2". V2 has a "Previous version (V1)" link.
- The "V2 preview" badge was removed from V2 and from the report.
- The side menu highlights End of Day on any `/days/...` page (`isPathActive` in `lib/app-nav.ts`).
- The old "Paper (x of y filed)" button on a V2 day was removed, because Paper is now on the card.

## Go back to V1 (one line)

Edit `lib/end-of-day-version.ts`:

```ts
export const END_OF_DAY_DEFAULT_VERSION: EndOfDayVersion = 'v1'
```

Commit, push, and deploy. `/days` then redirects to `/days/v1`. Nothing else needs to change, and V2 stays
reachable at `/days/v2` for anyone who wants to look at it.

## Full undo (remove the redirect completely)

If you want `/days` to be the V1 page again with no redirect:

```bash
git mv app/days/v1/page.tsx app/days/page.tsx
```

then change the four imports at the top from `'../BagNumberChips'` style back to `'./BagNumberChips'`
(also `DaySlipTasks`, `DepositBreakdownModal`, `OtherItemsBreakdownModal`), change
`router.replace('/days/v1'` back to `router.replace('/days'`, and delete `lib/end-of-day-version.ts`.
Or `git revert <migration commit>`.

## What V2 needs to keep working

- The Cstore harvest agent (Daily Report import) fills `CstoreDayReport`. Without it V2 still shows
  Collected, Deposit and Paper from the shifts, and Sales shows "fill in once the Cstore daily report is in".
- V2 uploads and slips write to the same data as V1 (`/api/days/[date]/upload`, the waiver endpoints), so a
  slip uploaded in either version shows in the other.
