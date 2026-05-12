# Revis Cloud

Multi-user music collaboration platform. Users sign in, create projects, upload track versions and stems, and share read-only links to specific versions for review. Audio files live in Cloudflare R2; metadata lives in SQLite. The app is multi-tenant — every record carries a `user_id` and every query filters by the authenticated Clerk user.

The frontend is a single-file vanilla-JS SPA (`public/index.html`, ~2600 lines), served by the same Express process that hosts the API. Audio never streams through the server: the server hands the client an R2 presigned URL and the browser pulls audio directly from R2.

## Quick start

1. Copy the environment template and fill in your own values:

   ```bash
   cp .env.example .env
   ```

   See `.env.example` for the full list of required keys (Clerk publishable + secret keys, R2 credentials, bucket name, DB path, port). Never commit `.env`.

2. Install and run:

   ```bash
   npm install
   npm run dev      # node --watch src/server.js (auto-reload)
   npm start        # plain node src/server.js
   ```

3. Optional — import data from the older local-only version of the app:

   ```bash
   npm run migrate:from-local /path/to/untitled-local
   ```

The longer walkthrough (Clerk setup, R2 bucket setup, Railway deploy) lives in `Revis-Cloud-Setup-Guide.md` (also rendered as a PDF in the repo).

## Project structure

```
src/          Express server, routes, middleware, db, R2 storage, utils
public/       Frontend SPA (index.html, share.html, Clerk sign-in/up)
data/         SQLite DB files (gitignored)
```

For the full routing map — which folder/file to read for a given task — see `CLAUDE.md` at the repo root and the per-folder `CONTEXT.md` files. Long-form design notes are in `revis-cloud.md`.

## Stack

- **Runtime**: Node + Express 4, deployed on Railway (`railway.json`)
- **DB**: SQLite via `better-sqlite3` (WAL mode, foreign keys ON)
- **Auth**: Clerk (`@clerk/express`)
- **Storage**: Cloudflare R2 via the AWS S3 SDK + presigned URLs
- **Uploads**: Multer (client -> server validates auth/MIME -> R2)
- **Frontend**: Vanilla JS / HTML / CSS, single-file SPA

## Status

Production-ish. Multi-tenant rules and audio-through-presigned-URL are load-bearing — see the "Hard rules" section of `CLAUDE.md` before changing query patterns or upload flow.
