# Vercel deployment – step by step

You already have a Vercel account. Follow these steps in order. Do one section at a time.

---

## Part A: Put your project on Vercel

### Step 1: Open Vercel
1. Go to [vercel.com](https://vercel.com) in your browser.
2. Click **Log in** (or **Sign in**) if you’re not already logged in.
3. You should see your **Dashboard** (a list of projects, or “Create your first project”).

### Step 2: Start “Import” a new project
1. Click the button that says **Add New…** (or **Import Project**).
2. Choose **Project** (or **Import Git Repository**).
3. If you use **GitHub**: connect GitHub if asked, then find your **Shift Close** repo in the list and click **Import** next to it.
4. If your code is **only on your PC** (no GitHub):
   - You’ll need to push it to GitHub first (create a repo on GitHub, then push from your PC). Say if you want a separate “push to GitHub” guide.
   - Then come back and Import that repo as above.

### Step 3: Configure the project (first screen)
1. **Project Name:** Leave as-is (e.g. `shift-close`) or type a name you like.
2. **Framework Preset:** Should say **Next.js**. If it doesn’t, pick **Next.js** from the dropdown.
3. **Root Directory:** Leave as **./** (dot slash) unless your Next.js app is inside a subfolder.
4. **Build and Output Settings:** Leave defaults for now.
5. Do **not** add any Environment Variables yet. Click **Deploy** at the bottom.

### Step 4: Wait for the first deploy
1. Vercel will build and deploy. Wait until you see **Congratulations** or **Your project has been deployed**.
2. Click **Visit** to open the site. It will **not** work properly yet (no database, no file storage). That’s expected.
3. You now have the project on Vercel. Next we add the database and storage.

---

## Part B: Add a database (Postgres)

### Step 5: Open your project in Vercel
1. In Vercel, go to your **Dashboard**.
2. Click on your **Shift Close** project (the one you just imported).

### Step 6: Add the Postgres database
1. At the top of the project page, click the **Storage** tab (or **Create Database** / **Add Database** – wording can vary).
2. Click **Create Database** (or **Add** → **Database**).
3. Choose **Postgres** (often “Vercel Postgres” or “Neon”).
4. Pick a **name** (e.g. `shift-close-db`) and a **region** (choose one close to you).
5. Click **Create** (or **Continue**).
6. When it’s created, you’ll see a **Connection string** or **DATABASE_URL**. Vercel often asks: **“Add to Project?”** or **“Inject env vars”** – click **Yes** / **Add to Project** so it automatically adds `DATABASE_URL` to your project’s environment variables.
7. If it doesn’t ask: go to **Settings** → **Environment Variables** and add one:
   - **Name:** `DATABASE_URL`
   - **Value:** paste the connection string they gave you (starts with `postgres://` or `postgresql://`).
   - **Environment:** check **Production**, **Preview**, and **Development**.
   - Save.

### Step 7: Redeploy so the app uses the database
1. Go to the **Deployments** tab.
2. Click the **⋯** (three dots) on the latest deployment.
3. Click **Redeploy**.
4. Wait for the new deploy to finish. The app still might not be fully working until we add file storage and fix the code for Postgres – that’s the next part (Cursor will do the code; you’re just doing the Vercel setup).

---

## Part C: Add file storage (Vercel Blob)

### Step 8: Create a Blob store
1. Still in your project on Vercel, go to the **Storage** tab again.
2. Click **Create Database** (or **Add** → **Store**).
3. Choose **Blob** (Vercel Blob).
4. Give it a name (e.g. `shift-close-uploads`).
5. Click **Create**.
6. When it’s created, Vercel will show **BLOB_READ_WRITE_TOKEN** (or similar). Click **Add to Project** / **Inject into project** so it’s added as an environment variable.
7. If you have to add it by hand: **Settings** → **Environment Variables**:
   - **Name:** `BLOB_READ_WRITE_TOKEN`
   - **Value:** the token they give you.
   - **Environment:** Production, Preview, Development.
   - Save.

### Step 9: Redeploy again
1. **Deployments** → **⋯** on latest deploy → **Redeploy**.
2. Wait for it to finish.

---

## Part D: Environment variables checklist

### Step 10: Confirm your variables
1. Go to **Settings** → **Environment Variables**.
2. You should see at least:
   - **DATABASE_URL** (from Postgres).
   - **BLOB_READ_WRITE_TOKEN** (from Blob).
3. If either is missing, add it (names and values from the Storage setup above).
4. For **Production**, **Preview**, and **Development**, make sure the variables are enabled for the environments you use (usually all three).

---

## Part E: Custom domain (optional, do later if you want)

### Step 11: Add your own domain (when you’re ready)
1. In the project, go to **Settings** → **Domains**.
2. Type your domain (e.g. `shiftclose.yourcompany.com`).
3. Click **Add**.
4. Vercel will show **DNS records** to add at your domain provider (e.g. where you bought the domain).
5. At your domain provider, add exactly the records Vercel shows (usually an **A** record or **CNAME**).
6. Wait a few minutes (up to an hour). Vercel will show a checkmark when the domain is working.
7. HTTPS is automatic; no extra step.

---

## Quick recap

| Step | What you did |
|------|------------------|
| 1–4 | Logged in, imported project, first deploy |
| 5–7 | Added Postgres, added `DATABASE_URL`, redeployed |
| 8–9 | Added Vercel Blob, added `BLOB_READ_WRITE_TOKEN`, redeployed |
| 10 | Checked env vars |
| 11 | (Optional) Added custom domain |

When you’ve done **Parts A, B, and C** (and the app code is updated for Postgres and Blob), Cursor can help you verify the deploy and fix any remaining errors. If any step doesn’t match what you see on screen, tell me exactly what you see and we’ll adjust the steps.
