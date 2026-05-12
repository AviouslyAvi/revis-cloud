# Revis Cloud — Setup & Deployment Guide

> Completed on March 25, 2026. This document records every step taken to set up Clerk authentication, Cloudflare R2 storage, and Railway deployment for the Revis Cloud music collaboration platform.

---

## 1. Clerk Authentication

### 1.1 Create Clerk Application
- Signed in at [dashboard.clerk.com](https://dashboard.clerk.com)
- Created a new application called **Revis-Cloud**
- Selected **Development** instance (test mode)
- Enabled **Email** sign-in/sign-up with email verification code

### 1.2 Retrieve API Keys
From the Clerk dashboard under **Configure > Developers > API keys**, copied:
- `CLERK_PUBLISHABLE_KEY` — the `pk_test_...` key (public, safe for frontend)
- `CLERK_SECRET_KEY` — the `sk_test_...` key (server-side only)

### 1.3 Code Changes for Clerk Integration
Since the frontend is served as static HTML (no server-side rendering), we couldn't inject environment variables at build time. Solution: created a lightweight API endpoint.

**Added to `src/server.js`:**
```javascript
// === Clerk Publishable Key (public) ===
app.get('/api/clerk-key', (req, res) => {
  res.json({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY });
});
```

**Updated `public/index.html` (main app)** — the `init()` function now fetches the key at runtime:
```javascript
const { publishableKey } = await fetch('/api/clerk-key').then(r => r.json());
clerkInstance = new window.Clerk(publishableKey);
await clerkInstance.load();
```

**Updated `public/sign-in.html`** — same pattern:
```javascript
async function initClerk() {
  const { publishableKey } = await fetch('/api/clerk-key').then(r => r.json());
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
  script.crossOrigin = 'anonymous';
  script.onload = async () => {
    const clerk = new window.Clerk(publishableKey);
    await clerk.load();
    if (clerk.user) { window.location.href = '/'; return; }
    clerk.mountSignIn(document.getElementById('sign-in'), {
      routing: 'path', path: '/sign-in', signUpUrl: '/sign-up', afterSignInUrl: '/',
    });
  };
  document.head.appendChild(script);
}
initClerk();
```

**Updated `public/sign-up.html`** — same pattern as sign-in, using `mountSignUp`.

### 1.4 Configure Clerk Redirect URLs
In the Clerk dashboard under **Configure > Developers > Paths**:

| Setting | Value |
|---------|-------|
| Fallback development host | `https://revis-cloud-production.up.railway.app` |
| SignIn component | Development host → `/sign-in` |
| SignUp component | Development host → `/sign-up` |
| Signing Out | Development host → `/sign-in` |

This tells Clerk to redirect users to your app's own sign-in/sign-up pages (instead of Clerk's hosted Account Portal pages).

---

## 2. Cloudflare R2 Storage

### 2.1 Create R2 Bucket
- Signed in at [dash.cloudflare.com](https://dash.cloudflare.com)
- Navigated to **Storage & databases > R2 Object Storage**
- Created a bucket named **`revis-audio`**
  - Default storage class: Standard
  - Public access: Disabled (files served via presigned URLs)

### 2.2 Create R2 API Token
- Went to **R2 > Manage R2 API Tokens > Create API Token**
- Permissions: **Object Read & Write** on the `revis-audio` bucket
- Generated credentials:
  - `R2_ACCOUNT_ID` — your Cloudflare account ID
  - `R2_ACCESS_KEY_ID` — the API token access key
  - `R2_SECRET_ACCESS_KEY` — the API token secret key
  - `R2_BUCKET_NAME` — `revis-audio`

### 2.3 How R2 Integrates with the App
- **Upload flow**: Client → Express server (validates auth + file type via multer) → R2 via S3-compatible SDK
- **Streaming flow**: Server generates a presigned URL → Client streams audio directly from R2 (zero egress fees)
- **Delete flow**: Server deletes objects from R2 when tracks/versions/stems are removed

---

## 3. Railway Deployment

### 3.1 Push Code to GitHub
Created a new GitHub repository and pushed the codebase:

```bash
# From the revis-cloud project directory
git init
git add .
git commit -m "Initial commit - Revis Cloud"
git remote add origin https://github.com/AviouslyAvi/revis-cloud.git
git branch -M main
git push -u origin main
```

**Note:** GitHub no longer accepts password authentication for HTTPS. We used `gh auth login` (GitHub CLI) to authenticate via browser OAuth instead.

### 3.2 Create Railway Project
- Signed up at [railway.com](https://railway.com) (Trial plan — 30 days or $5.00 free credit)
- Created a new project named **zealous-celebration** (auto-generated)
- Connected to the GitHub repo **AviouslyAvi/revis-cloud**
  - Required installing the Railway GitHub App at `github.com/apps/railway-app`
  - Granted access to the `revis-cloud` repository specifically

### 3.3 Configure Environment Variables
In Railway's **Variables** tab, added all 8 service variables:

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `development` |
| `CLERK_PUBLISHABLE_KEY` | Clerk frontend key (`pk_test_...`) |
| `CLERK_SECRET_KEY` | Clerk server key (`sk_test_...`) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | `revis-audio` |
| `DATABASE_PATH` | `/data/revis.db` |

Railway also auto-generates 11 system variables (PORT, RAILWAY_* vars, etc.).

### 3.4 Configure Networking
- Enabled **Public Networking** to generate a public domain
- Domain assigned: **`revis-cloud-production.up.railway.app`**
- Internal port: `3000` (matches the Express server's PORT)

### 3.5 Attach Persistent Volume
- Right-clicked the service on the project canvas → **Attach volume**
- Mount path: **`/data`**
- Volume name: `revis-cloud-volume`

This ensures the SQLite database at `/data/revis.db` persists across deployments and container restarts. Without this, Railway's ephemeral filesystem would wipe the database on every deploy.

### 3.6 Deploy
- Clicked **Deploy** to apply all 15 pending changes (variables, networking, volume, source config)
- Build process (Nixpacks): ~1 minute to detect Node.js, install dependencies (including native `better-sqlite3`), create Docker image
- Healthcheck passed at `/api/health`
- Service status: **ACTIVE / Online**

### 3.7 Pre-existing Configuration Files

**`railway.json`** (already in repo):
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node src/server.js",
    "healthcheckPath": "/api/health"
  }
}
```

---

## 4. Architecture Summary

```
User's Browser
     │
     ├── Clerk JS SDK (auth UI components)
     │     └── Loads publishable key from /api/clerk-key
     │
     ├── Static assets from Express (index.html, sign-in.html, sign-up.html)
     │
     └── API calls with Bearer token
           │
           ▼
   Express.js on Railway
     ├── Clerk middleware (validates JWT, syncs user to local DB)
     ├── SQLite on persistent volume (/data/revis.db)
     ├── R2 uploads (server validates, then streams to R2)
     └── Presigned URL generation (client streams directly from R2)
           │
           ▼
   Cloudflare R2 (revis-audio bucket)
     └── Audio files (tracks, versions, stems)
```

---

## 5. Dashboard URLs

| Service | URL |
|---------|-----|
| **Live App** | https://revis-cloud-production.up.railway.app |
| **Railway Dashboard** | https://railway.com/project/064b29fb-43d6-4f48-810d-37e4ab2c8d64 |
| **Clerk Dashboard** | https://dashboard.clerk.com (Revis-Cloud app) |
| **Cloudflare R2** | https://dash.cloudflare.com → Storage & databases → R2 → revis-audio |
| **GitHub Repo** | https://github.com/AviouslyAvi/revis-cloud |

---

## 6. Next Steps

- [ ] Visit the live app and sign up as the first user
- [ ] Upload a test track to verify R2 storage is working
- [ ] Test audio playback (presigned URL streaming)
- [ ] When ready for production: switch Clerk from Development to Production instance
- [ ] Consider adding a custom domain (Railway supports this in Settings > Networking)
