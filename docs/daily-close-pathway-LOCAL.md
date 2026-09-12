# Daily close pathway — local experiment

Do not push this branch until the flow feels right.

## Revert point

- Branch: `local/daily-close-pathway`
- Started from `main` at `6db22a3` (`Allow harvest fuel/LPG imports through middleware.`)
- Working tree at branch creation: clean (untracked `docs/ux-mockups/` only)

To throw this away:

```
git checkout main
git branch -D local/daily-close-pathway
```

To keep main and drop only the pathway commit(s) after they land on this branch:

```
git log --oneline main..HEAD
git revert <commit>
```

## What this is

Contextual links only:

- Shift → End of Day (`/days?date=YYYY-MM-DD`)
- End of Day → Deposit Comparisons (`/financial/deposit-comparisons?date=YYYY-MM-DD`)
- Deposit Comparisons → End of Day (same date)

Nav and pages stay independently accessible. Changing a period filter clears the date query so the page does not snap back.
