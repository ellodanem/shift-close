# Quick Sharing to Mr. Elcock – Plan

**Goal:** From wherever Dane is (phone, tablet, laptop), quickly send Mr. Elcock the latest Shift Close / Fuel information via email or WhatsApp.

This doc splits **what Cursor can do** (code, config in repo) from **what you (Dane) need to do** (accounts, env vars, DNS, testing).

---

## Phase 1: Deploy so you have real-time access from anywhere

| Task | Cursor can | You (Dane) need to |
|------|------------|---------------------|
| **Database** | Add/config Prisma for PostgreSQL (e.g. Vercel Postgres, Neon, Supabase); update `DATABASE_URL` usage and any SQLite-specific code. | Sign up for a hosted Postgres provider, create a DB, and add `DATABASE_URL` to Vercel (or your host) env. |
| **File storage** | Add Vercel Blob (or S3) for uploads so day/shift files and any generated assets work in the cloud; update upload/read paths. | Enable Vercel Blob (or S3) in the dashboard and add the env vars Cursor tells you. |
| **Vercel project** | Add/config `vercel.json` and any build settings; ensure `prisma generate` and `prisma migrate` (or `db push`) run in build. | Connect the repo to Vercel, set env vars (`DATABASE_URL`, Blob keys), trigger deploy. |
| **Custom domain / HTTPS** | N/A (handled in Vercel UI). | In Vercel: add your domain, follow DNS instructions, confirm HTTPS. |
| **Mobile-friendly checks** | Review layout/viewport and fix obvious mobile breakpoints so Dashboard, Proposed/Paid Payment, and Monthly Report are usable on phone. | Test on your phone/tablet and report what’s broken or awkward; Cursor can then fix. |

**Summary:** Cursor handles code and config in the repo; you handle accounts, env vars, DNS, and real-device testing.

---

## Phase 2: One-tap email to Mr. Elcock

| Task | Cursor can | You (Dane) need to |
|------|------------|---------------------|
| **Email provider** | Integrate SendGrid (or Resend/Nodemailer SMTP): one API route that accepts report type + payload and sends email with PNG/PDF attached. | Sign up for SendGrid (or get SMTP credentials), create an API key, add to env (e.g. `SENDGRID_API_KEY`, `MR_ELCOCK_EMAIL`). |
| **“Email to Mr. Elcock” buttons** | Add buttons on: Proposed Payment page, Paid Payment share page, Monthly Fuel Report. Wire them to the send API (generate PNG/PDF server-side or reuse existing, then attach). | Decide exact button labels and where they should sit if you want them somewhere different. |
| **Simple send log** | Add a small table or log (e.g. `EmailLog`: to, reportType, sentAt, success); optional admin view to see “when, which report, success/fail”. | Nothing unless you want a specific place to view the log (e.g. Settings). |

**Summary:** Cursor builds the send API and UI; you provide the email service and recipient (and optional config like CC).

---

## Phase 3: One-tap WhatsApp sharing

| Task | Cursor can | You (Dane) need to |
|------|------------|---------------------|
| **Consistent PNG/PDF** | Ensure Proposed Payment and Paid Payment both have a stable PNG/PDF generation path; expose a “get shareable file” API or data URL if needed for Web Share. | Use it on mobile and confirm it looks right. |
| **Web Share API (mobile)** | Add “Share via WhatsApp” that uses the Web Share API with the PNG/PDF file; fallback message if not supported. | Test on your phone (and different browsers if needed). |
| **Desktop flow** | Add “Copy image” / “Download PDF” plus a small on-screen instruction: “Paste in WhatsApp Web to send to Mr. Elcock.” | Test on your machine; say if you prefer “copy” vs “download” or both. |

**Summary:** Cursor implements the share flow and copy/download + instructions; you validate on your devices.

---

## Phase 4: Optional read-only access for Mr. Elcock (later)

| Task | Cursor can | You (Dane) need to |
|------|------------|---------------------|
| **Auth** | Add simple auth (e.g. NextAuth or custom) with at least two roles: you (full), Mr. Elcock (read-only). Restrict write APIs and hide edit UI for read-only. | Decide: “just a shared password” vs “proper login for Mr. Elcock.” |
| **Read-only scope** | Restrict his access to specific routes (e.g. Dashboard, Monthly Report, Fuel Payment reports only). | Confirm which pages he should see. |

**Summary:** Cursor implements auth and read-only rules; you decide auth style and which reports he gets.

---

## Suggested order

1. **You:** Create Vercel account (if needed), Postgres DB, and (optional) Vercel Blob; connect repo and add env vars.
2. **Cursor:** PostgreSQL + Blob integration, Vercel config, mobile tweaks.
3. **You:** Deploy, add domain, test on phone.
4. **You:** SendGrid (or SMTP) signup + API key; add `MR_ELCOCK_EMAIL` (and any CC).
5. **Cursor:** Email API + “Email to Mr. Elcock” buttons + simple log.
6. **You:** Test email from each report.
7. **Cursor:** WhatsApp flow (Web Share + desktop copy/download + instructions).
8. **You:** Test on mobile and desktop.
9. **Later:** Read-only account for Mr. Elcock once you’re happy with sharing.

---

## Env vars you’ll add (reference)

- `DATABASE_URL` – Postgres connection string (from Vercel Postgres, Neon, Supabase, etc.)
- `BLOB_READ_WRITE_TOKEN` – Vercel Blob (if using Blob for uploads)
- `SENDGRID_API_KEY` – SendGrid API key (Phase 2)
- `MR_ELCOCK_EMAIL` – Default recipient for “Email to Mr. Elcock”

Optional: `EMAIL_FROM`, `CC_EMAIL`, etc. if you want them configurable.
