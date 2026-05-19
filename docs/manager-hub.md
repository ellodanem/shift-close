# Manager hub

## Route

- **Page:** `/manager`

## Purpose

Launcher after sign-in: pick **Desktop** (full web app) or focused **mobile** tools (attendance viewer, roster mobile).

## Access

| Role | Desktop | Attendance | Roster (mobile) |
|------|---------|------------|-----------------|
| admin, manager | Yes | Yes | Edit |
| operations_manager | Yes | Yes | Edit |
| senior_supervisor, supervisor | No | No | Read-only |
| stakeholder | No | No | No |

## Sign-in

- Bookmark: `/login?next=/manager`
- **After login** preset: Settings → User accounts → **Manager hub**

## Desktop tile

Links to `/dashboard` (full app with sidebar). Use on laptop for roster, attendance admin, shifts, reports, and settings.

## Mobile section

Shown when the user has access to at least one mobile route. Label **On your phone** appears when Desktop is also available.
