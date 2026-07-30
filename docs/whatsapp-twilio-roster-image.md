# WhatsApp Twilio roster image — agent handoff

How Shift Close builds the image that appears in the Twilio WhatsApp **Content Template** (`weeklyroster`), and how that image is delivered.

**Important:** There is no static AI-generated “template header” asset. The image staff see is a **live roster PNG** created at send time, uploaded to a public URL, then passed into the approved Twilio template as media variable `{{1}}`.

---

## End-to-end pipeline

```text
Hidden HTML roster table (browser)
        ↓  html2canvas (scale 2, white bg)
PNG data URL (base64)
        ↓  POST /api/roster/send-whatsapp
Vercel Blob public URL
        ↓  sendWhatsAppWithMedia → sendWhatsAppTemplate
Twilio Content Template (HX…)
  body: static “Your weekly roster is ready”
  media {{1}}: Blob URL
        ↓
WhatsApp message to staff
```

---

## Key files


| File                                    | Role                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `app/roster/page.tsx`                   | Hidden off-screen table (`imageRef`); `generateRosterImage()`; **WhatsApp (Direct)** send UI |
| `app/roster/mobile/page.tsx`            | Mobile share path also uses `html2canvas` on a similar hidden table                          |
| `app/api/roster/send-whatsapp/route.ts` | Accepts base64 PNG + phones; uploads Blob; calls Twilio helper                               |
| `lib/whatsapp.ts`                       | `sendWhatsAppWithMedia`, `sendWhatsAppTemplate`, phone/`From` normalization                  |
| `lib/roster-week-client.ts`             | Shared cell labeling (`rosterCellLabel` / share labels) so PNG matches grid rules            |


Dependency: `html2canvas` (see `package.json`). Storage: `@vercel/blob`.

---

## Step 1 — Render a capture-only HTML table (client)

On the desktop roster page (`app/roster/page.tsx`):

- A **hidden** container is positioned off-screen (`fixed -left-[9999px] -top-[9999px]`).
- Inside it, `ref={imageRef}` holds a display-only week table:
  - Title: week date range
  - Columns: Staff + Mon–Sun
  - Rows: active staff only (ghost/inactive excluded)
  - Cells: shift label, template color, vacation gray, birthday marker
- This is **not** a screenshot of the editable roster UI (no dropdowns/selects).

Mobile roster (`app/roster/mobile/page.tsx`) has an analogous hidden table + `shareImage` / capture path.

Cell labels should follow the same rules as the on-screen week grid (unassigned/blocked → `—`, explicit off → `Off`, assigned → shift name). Shared helpers live in `lib/roster-week-client.ts`.

---

## Step 2 — Capture PNG with html2canvas (client)

`generateRosterImage()` (desktop roster):

```ts
const canvas = await html2canvas(imageRef.current, {
  backgroundColor: '#ffffff',
  scale: 2,
  logging: false
})
return canvas.toDataURL('image/png')
```

- `scale: 2` improves sharpness on phone screens.
- Result is a `data:image/png;base64,...` string.

**WhatsApp (Direct)** then POSTs that string to the API with recipient phone digits and `weekStart`.

Other share modes (Web Share / clipboard / WhatsApp Web) reuse the same PNG generation but do **not** go through Twilio.

---

## Step 3 — Upload to Vercel Blob (server)

`POST /api/roster/send-whatsapp` (`app/api/roster/send-whatsapp/route.ts`):

1. Requires Twilio env configured (`isWhatsAppConfigured()`).
2. Body: `{ to: string | string[], imageBase64: string, weekStart?: string }`.
3. Strips any `data:image/...;base64,` prefix; builds a `Buffer`.
4. Uploads with:
  ```ts
   await put(`roster/${Date.now()}-roster.png`, buffer, {
     access: 'public',
     contentType: 'image/png'
   })
  ```
5. For each recipient phone, calls `sendWhatsAppWithMedia(phone, messageBody, blob.url, { weekStart })`.
6. Returns `{ success, sent, details, errors? }`.

**Requires** `BLOB_READ_WRITE_TOKEN` (Vercel Blob). Without it, upload fails before Twilio runs.

---

## Step 4 — Twilio Content Template (server)

`lib/whatsapp.ts` → `sendWhatsAppWithMedia`:

- If `TWILIO_WHATSAPP_ROSTER_TEMPLATE_SID` is set (Content SID `HX…`):
  ```ts
  // Template body is static; media slot is variable "1"
  await sendWhatsAppTemplate(to, templateSid, { '1': mediaUrl })
  ```
- If unset: falls back to a normal Twilio WhatsApp message with `body` + `mediaUrl: [mediaUrl]` (session / non-template path).

`sendWhatsAppTemplate` uses Twilio `messages.create` with:

- `contentSid` — approved template SID  
- `contentVariables` — `JSON.stringify({ "1": "<public blob url>" })`  
- `from` / `to` — `whatsapp:+E164...`

Twilio/Meta fetch the public Blob URL and attach the image to the WhatsApp message.

### Template contract (production)


| Piece                          | Expected value                                         |
| ------------------------------ | ------------------------------------------------------ |
| Twilio template name (example) | `weeklyroster`                                         |
| Content type                   | Media                                                  |
| Body                           | Static text, e.g. “Your weekly roster is ready”        |
| Media variable                 | `{{1}}` = public HTTPS URL of the PNG                  |
| Env var                        | `TWILIO_WHATSAPP_ROSTER_TEMPLATE_SID` = full `HX…` SID |


Do **not** change variable index without updating both the Twilio template and `{ '1': mediaUrl }` in code.

---

## Environment variables (Vercel)

All Twilio values must be from the **same** Twilio account as the WhatsApp sender.


| Variable                              | Purpose                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `TWILIO_ACCOUNT_SID`                  | Twilio account                                            |
| `TWILIO_AUTH_TOKEN`                   | Twilio auth token                                         |
| `TWILIO_WHATSAPP_FROM`                | WhatsApp sender, e.g. `whatsapp:+15558085661`             |
| `TWILIO_WHATSAPP_ROSTER_TEMPLATE_SID` | Optional but used in production; `HX…` for media template |
| `BLOB_READ_WRITE_TOKEN`               | Public PNG upload for template media URL                  |


Phone normalization in `whatsapp.ts`: 10-digit numbers get a leading `1` (US/CA assumption). Non-US numbers should be stored/sent with full country code.

---

## UI entry points


| Action                | Path                      | Uses Twilio?                                                       |
| --------------------- | ------------------------- | ------------------------------------------------------------------ |
| **WhatsApp (Direct)** | Desktop roster share menu | Yes — Blob + template/media API                                    |
| **WhatsApp (Image)**  | Desktop roster            | No — Web Share or clipboard + WhatsApp Web                         |
| **WhatsApp (Text)**   | Desktop roster            | No — text only                                                     |
| Mobile share image    | `/roster/mobile`          | Typically device share; Direct send uses same API pattern if wired |


---

## What this is *not*

- Not an AI `GenerateImage` / branding logo asset.
- Not a fixed sample image baked into the Twilio template at approval time for every send (approval may need a sample once; **runtime** media is always the fresh Blob URL).
- Not a PDF; staff receive a **PNG** of the week grid.

---

## Checklist for another agent reimplementing or debugging

- Hidden table exists and matches grid labeling rules (including inactive/unassigned).
- `html2canvas` produces a non-empty PNG data URL.
- Blob upload succeeds and URL is publicly reachable over HTTPS.
- Template SID set → variables use `"1"` = media URL.
- `TWILIO_WHATSAPP_FROM` matches an approved WhatsApp sender on the same account as SID/Token.
- Staff mobiles are valid E.164 (or 10-digit US/CA as assumed by normalizer).
- After env changes, redeploy so Vercel picks them up.

---

## Related context (optional)

- Setup plan notes: WhatsApp sandbox vs production WABA, Meta Embedded Signup, and “Channel with the specified From address” mismatches are configuration issues, not image-pipeline bugs.
- Display name staff see in chat (e.g. business profile name) comes from Meta/WhatsApp Business profile, not from this PNG pipeline.

