# Roster (mobile)

## Route

- **Page:** `/roster/mobile`
- **Hub:** `/manager` (links to attendance viewer and roster mobile)

## Access

| Role | Access |
|------|--------|
| admin, manager, operations_manager | Edit (assign, fill week, copy week, share) |
| senior_supervisor, supervisor | Read-only |
| stakeholder | No access |

## Sign-in

- Bookmark: `/login?next=/roster/mobile`
- **Manager hub** (recommended home): Settings → User accounts → **After login** → **Manager hub (mobile)**

## v1 features

- Week navigation and day strip
- **Week** grid (staff × Mon–Sun, swipe sideways) — default view
- **Day** / **Person** toggles (remembers last choice in `localStorage`)
- **Day coverage:** tap a date (strip or week header) → chips per shift with counts (matches desktop roster)
- Assign shift via bottom sheet (including Off)
- Fill week (per staff)
- Copy previous week
- Share roster image (Web Share on phone)

## Not on this route

- Shift preset CRUD → full app `/roster/templates`
- Clear week, day-off/sick modals, staff reorder → full `/roster`
