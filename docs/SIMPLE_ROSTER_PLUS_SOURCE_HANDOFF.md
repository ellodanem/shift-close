# Simple Roster Plus — source handoff (Shift Close)

This document describes **where and how** Staff, Roster, and Attendance live in the **Westline / Shift Close** app so another repository (Simple Roster Plus) can **duplicate a minimal slice** (modules + thin dashboard) and evolve.

**Source app root:** `Shift Close/` (Next.js App Router, Prisma, PostgreSQL).

**How to use:** copy this file into the new repo’s `docs/` (or agent context). Implementers should treat paths below as relative to `Shift Close/` unless noted.

---

## 1. Stack and runtime

| Layer | Choice |
|--------|--------|
| Framework | Next.js (App Router), `app/` |
| DB | PostgreSQL via Prisma (`prisma/schema.prisma`, `prisma/migrations/`) |
| Auth | Cookie session JWT (`lib/session.ts`, cookie name `sc_token`), `middleware.ts` |
| Users | `AppUser` model (not the same as `Staff`) |

**Required env (minimal app):** `DATABASE_URL`, `AUTH_SECRET` (min 16 chars in production).  
**Attendance integrations (optional for v1):** `AGENT_SECRET` (ingest + agent routes), `CRON_SECRET` (cron routes), device/ADMS-related vars as referenced in `app/api/attendance/**` (e.g. `ZK_DEVICE_IP`, `ZK_DEVICE_PORT`, `WINDOWS_AGENT_INSTALLER_URL`, `EOD_EMAIL_TIMEZONE`, `VERCEL`).

---

## 2. Timezone and calendar semantics

- **Business / station IANA zone** is currently a **code constant**: `America/St_Lucia` in `lib/datetime-policy.ts` (`BUSINESS_TIME_ZONE`). Present/absence and “calendar day” logic assume this zone unless extended.
- Many domain fields are **strings** `YYYY-MM-DD` (not always `DateTime`): staff vacation, roster dates, day off, sick leave, public holidays, pay period bounds, overrides.
- **Roster week** is keyed by **Monday** `week_start` (unique per week); see `RosterWeek` in schema and migration `prisma/migrations/20260209120000_add_roster_models/migration.sql`.

---

## 3. Prisma: models to copy or stub

### Core (Staff + Roster)

- `Staff` — includes `deviceUserId`, `punchExempt`, vacation range, `role` / `roleId`, `sortOrder`, etc.
- `StaffRole` — optional if SR+ keeps string `role` only.
- `StaffDayOff` — single-day off; unique `(staffId, date)`.
- `StaffSickLeave` — date range; status `requested` | `approved` | `denied`.
- `StaffDocument` — sick-leave attachments and other files (optional for thin roster).
- `ShiftTemplate` — named shift with `start_time` / `end_time`, optional `color`.
- `RosterWeek` — `week_start`, `status` (`draft` | `published`), `notes`.
- `RosterEntry` — `roster_week_id`, `staff_id`, `date`, optional `shift_template_id`, `position`, `notes`; unique `(roster_week_id, staff_id, date)`.

### Attendance

- `AttendanceLog` — punches: `device_user_id`, optional `staff_id`, `punch_time`, `punch_type` (`in` | `out`), `source`, correction/extraction metadata, clock normalization fields.
- `AttendanceDeviceClock` — per-device serial drift learning (ADMS path).
- `AttendanceDayOverride` — per staff per calendar day: `manual_present`, `manual_absent` (punch-exempt), `late_reason`.
- `PayPeriod` — saved pay-period report JSON (`rows`), optional email sent timestamp; links to extracted punches on `AttendanceLog`.

### Cross-cutting (usually required with roster/attendance UI)

- `PublicHoliday` — `date`, `name`, `station_closed` (roster validation uses closed days).
- `AppSettings` — key/value; present/absence toggles and notify settings use keys defined in `lib/present-absence.ts` (e.g. `attendance_present_absence_enabled`, grace minutes, notify channels).
- `AppUser`, `PasswordResetToken` — if SR+ reuses the same auth model.

**Explicitly out of scope for “roster clone” unless needed:** `ShiftClose` and the rest of fuel/vendor/financial models — they share `Staff` but are not required for roster grid behavior.

---

## 4. UI routes (App Router pages)

| Area | Path |
|------|------|
| Staff list / CRUD | `app/staff/page.tsx`, `app/staff/new/page.tsx`, `app/staff/[id]/page.tsx` |
| Staff roles admin | `app/settings/staff-roles/page.tsx` |
| Roster | `app/roster/page.tsx` (large client component), `app/roster/templates/page.tsx` |
| Attendance | `app/attendance/page.tsx`, `app/attendance/pay-period/page.tsx`, `app/attendance/settings/page.tsx` |
| Login | `app/login/page.tsx` (+ reset/forgot if copying auth) |
| Dashboard (for “thin shell”) | `app/dashboard/page.tsx` and related `app/dashboard/**` |

**Shared client context:** `app/components/AuthContext.tsx` (roster page uses `useAuth`).

---

## 5. API surface (route handlers)

Paths are `app/api/.../route.ts`. Grouped for copying.

### Staff & roles

- `api/staff/route.ts`, `api/staff/[id]/route.ts`, `api/staff/reorder/route.ts`
- `api/staff/day-off/route.ts`, `api/staff/day-off/[id]/route.ts`, `api/staff/[id]/day-off/route.ts`
- `api/staff/sick-leave/route.ts`, `api/staff/sick-leave/[id]/route.ts`, `api/staff/[id]/sick-leave/route.ts`, `api/staff/[id]/sick-leave/[sickLeaveId]/documents/route.ts`
- `api/staff/[id]/documents/route.ts`, `api/staff/[id]/generate-document/route.ts`
- `api/staff-roles/route.ts`, `api/staff-roles/[id]/route.ts`

### Roster

- `api/roster/weeks/route.ts` — week CRUD + bulk entry save; enforces vacation, sick leave, station closed days (see handler).
- `api/roster/templates/route.ts`, `api/roster/templates/[id]/route.ts`
- `api/roster/send-whatsapp/route.ts` — optional for v1.

### Attendance (representative; full tree under `app/api/attendance/`)

- Logs: `api/attendance/logs/route.ts`, `api/attendance/logs/[id]/route.ts`, `api/attendance/logs/bulk/route.ts`, `api/attendance/logs/bulk-add/route.ts`, `api/attendance/logs/last-punch/route.ts`, `api/attendance/logs/sync-hint/route.ts`
- Present/absence: `api/attendance/present-absence/route.ts`, `api/attendance/present-absence/override/route.ts`
- Pay period: `api/attendance/pay-period/route.ts`, `api/attendance/pay-period/[id]/route.ts`, `api/attendance/pay-period/generate/route.ts`, `api/attendance/pay-period/[id]/send-email/route.ts`, `api/attendance/pay-period/last-sent-cutoff/route.ts`
- Settings: `api/attendance/settings/route.ts`
- Device / ingest: `api/attendance/ingest/route.ts`, `api/attendance/adms/route.ts`, `api/attendance/adms-health/route.ts`, `api/attendance/device/map-users/route.ts`, `api/attendance/device/pending-staff/route.ts`, `api/attendance/sync/**`, `api/attendance/windows-agent/installer/route.ts`
- Email/cron helpers: `api/attendance/*-email/route.ts`, `api/cron/*` (cross-reference with `lib/access-control.ts`)

### Dependencies used by roster validation

- `api/public-holidays/route.ts`, `api/public-holidays/[id]/route.ts`
- Possibly `api/settings/route.ts` for global settings used by attendance UI

### Auth (if copying login)

- `api/auth/login`, `logout`, `me`, `forgot-password`, `reset-password`

### ZKTeco ADMS / device push (edge)

- `app/iclock/cdata/route.ts`, `app/iclock/getrequest/route.ts` — **public** via `middleware` + `isPublicPath` (see below).

---

## 6. Middleware, public paths, and RBAC

**File:** `middleware.ts`

- Default: all non-static paths require session cookie; unauthenticated API → 401, pages → redirect `/login?next=…`.
- **Public / unauthenticated** exceptions include:
  - `/iclock/*` (device ADMS callbacks)
  - `/api/attendance/adms*`
  - `POST` (and matching) ` /api/attendance/ingest` — validated with `AGENT_SECRET` header in route
  - `GET` ` /api/attendance/device/pending-staff` — used by pairing flow
  - Selected ` /api/cron/*` — validated inside route with `CRON_SECRET`
  - Auth endpoints for login/password reset

**File:** `lib/access-control.ts`

- Role-aware path allow/deny (e.g. `stakeholder` limited to dashboard/insights subset).
- **Supervisor-like roles:** cannot manage roster templates, cannot **POST** ` /api/roster/weeks` (save week), cannot send WhatsApp roster, cannot write settings/users — see `apiWriteAllowedForRole`.

SR+ can simplify to a single admin role initially, but this file documents **production** constraints.

---

## 7. Shared libraries (high value to port or re-read)

| File | Role |
|------|------|
| `lib/present-absence.ts` | Builds expected presence from roster + vacation + sick + day off + punches + overrides; uses `prisma` + `BUSINESS_TIME_ZONE` |
| `lib/present-absence-notify.ts` | Late notifications (email/WhatsApp), idempotency log in `AppSettings` |
| `lib/datetime-policy.ts` | Station TZ, YMD helpers |
| `lib/device-user-id.ts` | Matching device user IDs to staff |
| `lib/prisma.ts` | Prisma client singleton |
| `lib/session.ts` | JWT session |
| `lib/roles.ts` | Role normalization (referenced by access control) |

---

## 8. Data-flow notes (for a second agent)

1. **Roster save:** Client → `POST /api/roster/weeks` with week + entries payload → Prisma transaction; server validates holidays, vacation, sick leave for assigned shifts.
2. **Punch ingest:** Device/agent → ` /api/attendance/ingest` or ADMS → normalization (clock offset, serial) → `AttendanceLog`; staff link via `deviceUserId` / mapping.
3. **Present/absence:** For a given calendar `YYYY-MM-DD` in station TZ, logic combines scheduled roster row, exemptions, punches within grace, overrides → status for UI and notifications.
4. **Pay period:** Generated report rows stored in `PayPeriod.rows` (JSON); extracting punches sets `extractedAt` / `extractedPayPeriodId` on logs.

---

## 9. Suggested v1 scope for Simple Roster Plus (default)

**In:**

- Prisma subset: `Staff`, `StaffRole` (optional), `StaffDayOff`, `StaffSickLeave`, `ShiftTemplate`, `RosterWeek`, `RosterEntry`, `PublicHoliday`, `AppUser` + session auth, `AppSettings` keys you need.
- Pages: minimal dashboard + staff CRUD + roster grid + optional read-only attendance / manual punches only.

**Out (defer):**

- Pay period email pipeline, Windows agent installer, full ADMS/iclock surface, WhatsApp roster broadcast, stakeholder role matrix, Shift Close financial modules.

Document any **deliberate** behavior changes (e.g. configurable timezone instead of `America/St_Lucia`).

---

## 10. Verification checklist (after port)

- Create staff; set vacation; create sick leave; create day off request → roster save respects blocks on shift assignment.
- Create `ShiftTemplate`; create week with Monday `week_start`; assign entries; unique constraint prevents duplicate staff/day in same week.
- Station-closed public holiday prevents shift on that date (match current API errors).
- Present/absence for today matches roster expectation + grace + override.
- Auth: protected API returns 401 without cookie; role restrictions if retained.

---

## 11. Optional inputs from product owner (not required to start doc)

- Target **timezone policy** (keep constant vs `AppSettings`).
- Whether SR+ needs **device ingest** on day one.
- Single **admin** user vs full role matrix.
- Hosting (Vercel vs self-hosted) affects cron and ADMS URL layout.

---

*Generated from repository inventory; when schema or routes drift, prefer `prisma/schema.prisma` and `app/api/**/route.ts` as source of truth.*
