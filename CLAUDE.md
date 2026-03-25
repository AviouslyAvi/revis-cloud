# Revis Cloud — Project Context

## What This Is

Revis is a multi-user music collaboration platform. It started as a single-user local app (`untitled-local/`) and has been rebuilt as a cloud-hosted multi-tenant platform (`revis-cloud/`).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Express.js on Railway |
| Database | SQLite via better-sqlite3 (migration path to PostgreSQL) |
| File Storage | Cloudflare R2 (S3-compatible, zero egress fees) |
| Auth | Clerk (Google + Email sign-in) |
| Frontend | Vanilla JS (single-file SPA, ~2600 lines in index.html) |

## Architecture

- **Multi-tenant**: Every DB table has `user_id`. Every query filters by authenticated user.
- **Audio streaming**: R2 presigned URLs (client streams directly from R2, not through server).
- **File uploads**: Client → Server → R2 (server validates auth + file type first).
- **Auth flow**: Clerk JS SDK on frontend → Bearer token in API calls → `@clerk/express` middleware on server.

## Project Structure

```
src/
  server.js          — Express app, middleware chain, route mounting
  middleware/auth.js  — Clerk requireAuth() + ensureUser (syncs Clerk users to local DB)
  routes/
    projects.js      — CRUD projects
    tracks.js        — CRUD tracks + upload + reorder
    versions.js      — Version history + upload + activate
    stems.js         — Stems CRUD + upload
    audio.js         — Presigned URL generation for streaming
    share.js         — Share links (mixed public/protected)
    download.js      — Bulk ZIP download
  db/
    index.js         — SQLite connection + schema init (WAL mode, foreign keys ON)
    schema.sql       — 6 tables: users, projects, tracks, versions, stems, share_links
    migrate.js       — Import from local JSON DB + files → SQLite + R2
  storage/r2.js      — R2 upload, delete, batch delete, presigned URLs
  utils/
    zip.js           — ZIP builder (no external deps, raw CRC32 + buffers)
    helpers.js       — genId, hashPass, MIME types
public/
  index.html         — Main app (Clerk auth gate, all features)
  share.html         — Public shared track player
  sign-in.html       — Clerk sign-in component
  sign-up.html       — Clerk sign-up component
```

## Features (all working in local version, ported to cloud)

- **Projects**: Create, rename, delete, color-code
- **Tracks**: Upload with BPM/Key (required), drag-drop reorder, multi-select + bulk download/delete
- **Version Control**: Every track iteration requires a comment. Version history in right pane. "Set Main Version" to revert.
- **Stems**: Upload per-track stems (vocal/drums/bass/guitar/synth/other). Drag-drop bulk upload. Multi-select + download.
- **Audio Player**: Play/pause, seek, speed control (0.25x-2x), pitch shift (-12 to +12 semitones), repeat, loop sections (Shift+click waveform), three visualizer modes (bars/oscilloscope/stereo), volume
- **Sharing**: Password-protected public links, listen count tracking
- **Identity**: Clerk user profile (replaces localStorage name system)
- **UI**: Dark theme, collapsible sidebar (hamburger), right pane with Versions/Stems tabs, keyboard shortcuts (?), slide-in animations, backdrop blur modals

## Environment Variables (.env)

```
PORT, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
DATABASE_PATH
```

## Setup Status

- [x] All code written and syntax-verified
- [x] Dependencies installed (npm install)
- [x] SQLite database auto-creates on first run
- [ ] Clerk API keys needed (clerk.com → create app → API Keys)
- [ ] Cloudflare R2 bucket needed (Cloudflare dashboard → R2 → Create bucket)
- [ ] Railway deployment (railway up or GitHub connect)

## The Local Version (untitled-local/)

The original single-user version lives alongside this project. It uses:
- Native Node.js HTTP server (no Express)
- JSON file database (data/db.json)
- Local filesystem for audio storage (uploads/)
- No auth (single user, localStorage identity)

The migration script (`npm run migrate:from-local /path/to/untitled-local`) imports all data from the local version into the cloud version.

## Key Decisions

- Express over native HTTP: needed for Clerk middleware, multer, clean routing
- R2 presigned URLs: zero egress fees, client streams directly, no server bandwidth cost
- SQLite over PostgreSQL: zero config to start, Railway volume for persistence, easy upgrade path
- Clerk prebuilt components: no custom auth UI, handles Google OAuth + email/password
- Server-side uploads (not presigned PUT): simpler, allows auth + validation before storage
