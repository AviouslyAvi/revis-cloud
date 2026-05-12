# src/ — Express server

## Load

- `server.js` — app entry: middleware chain, CORS, Clerk, route mounting.
- `middleware/auth.js` — `requireAuth()` (Clerk) + `ensureUser` (sync Clerk users → local `users` table).
- `routes/projects.js` — CRUD projects (color, rename, delete).
- `routes/tracks.js` — CRUD tracks, upload (with required BPM/Key), reorder, bulk download/delete.
- `routes/versions.js` — version history, upload (comment required), activate as "main".
- `routes/stems.js` — per-track stems CRUD + drag-drop bulk upload.
- `routes/audio.js` — generates R2 presigned URLs for streaming.
- `routes/share.js` — public share links, password-protected, listen-count tracking.
- `routes/download.js` — bulk ZIP download.
- `db/index.js` — SQLite connection, WAL mode, foreign keys ON, schema init.
- `db/schema.sql` — 6 tables: `users`, `projects`, `tracks`, `versions`, `stems`, `share_links`.
- `db/migrate.js` — import legacy `untitled-local/` JSON DB + files into SQLite + R2.
- `storage/r2.js` — R2 upload, delete, batch-delete, presigned URL generation.
- `utils/zip.js` — zero-dep ZIP builder (raw CRC32 + buffers).
- `utils/helpers.js` — `genId`, `hashPass`, MIME-type table.

## Skip

`node_modules/`, `../data/` (binary DB files), `../public/` (frontend room).

## Pipeline (request)

1. CORS → Clerk middleware (`@clerk/express`) → `requireAuth()` → `ensureUser` (upsert into `users`).
2. Route handler scopes the query: `WHERE user_id = ?` always present.
3. For uploads: `multer` buffers the file → handler validates MIME → `storage/r2.js` PUTs to R2 → row inserted with the R2 key.
4. For streams: handler issues an S3 presigned GET URL via `@aws-sdk/s3-request-presigner`, returns it to the client.

## Rules

- Never bypass `requireAuth` on any route except `share.js` public endpoints (and even there, the shared row is fetched by its share token, never by `user_id` of the caller).
- Never proxy audio bytes through the server. Always presign + redirect.
- Schema changes: edit `schema.sql` and add a migration. Don't `ALTER TABLE` in code without a migration record.

## Skills/MCP

None required.
