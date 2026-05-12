# Revis-Cloud — router (Layer 1)

Multi-user music collaboration platform. Express on Railway, SQLite (better-sqlite3), Cloudflare R2 for audio storage, Clerk for auth, vanilla-JS single-file SPA frontend. Multi-tenant — every table has `user_id` and every query filters by the authenticated user.

## Floor plan

| Folder      | What lives there                                                          | Room file                |
| ----------- | ------------------------------------------------------------------------- | ------------------------ |
| `src/`      | Express server, routes, middleware, db, R2 storage, utils                 | `src/CONTEXT.md`         |
| `public/`   | Frontend SPA: `index.html` (~2600 lines), `share.html`, Clerk sign-in/up  | `public/CONTEXT.md`      |
| `data/`     | SQLite DB files (`revis.db`, `-wal`, `-shm`). Gitignored.                 | —                        |

Root-level: `Revis-Cloud-Setup-Guide.md` / `.pdf` (setup walkthrough), `revis-cloud.md` (long-form notes), `railway.json`, `package.json`, `.env` (gitignored), `.env.example`.

## Routing table

| Task                                       | Read                                                                | Skip                          |
| ------------------------------------------ | ------------------------------------------------------------------- | ----------------------------- |
| Add / change an HTTP endpoint              | `src/CONTEXT.md`, `src/server.js`, the relevant `src/routes/*.js`   | `public/`, `node_modules/`    |
| Touch auth or user-sync logic              | `src/CONTEXT.md`, `src/middleware/auth.js`                          | `public/`                     |
| Change DB schema / migrations              | `src/CONTEXT.md`, `src/db/schema.sql`, `src/db/index.js`            | `public/`                     |
| Migrate data from the legacy local version | `src/db/migrate.js`                                                 | `public/`                     |
| R2 upload / presign / batch-delete         | `src/CONTEXT.md`, `src/storage/r2.js`                               | `public/`                     |
| Frontend feature / SPA UI                  | `public/CONTEXT.md`, `public/index.html`                            | `src/`, `node_modules/`       |
| Setup / deploy walkthrough                 | `Revis-Cloud-Setup-Guide.md`                                        | —                             |

## Naming conventions

- One route file per resource in `src/routes/<resource>.js` (`projects`, `tracks`, `versions`, `stems`, `audio`, `share`, `download`).
- All routes mount under their resource name in `src/server.js`.
- Migration entrypoint: `npm run migrate:from-local /path/to/untitled-local`.

## Commands

```bash
npm start                  # node src/server.js
npm run dev                # node --watch src/server.js
npm run migrate:from-local # import JSON DB + files into SQLite + R2
```

## Hard rules

- **Every** query must filter by `user_id`. No exceptions.
- Audio is **never** streamed through the server. Generate an R2 presigned URL and return it; client streams direct from R2.
- File uploads go client → server → R2 (server validates auth + MIME first). Do not switch to presigned PUT without an explicit decision.
- `.env` is gitignored — confirmed. Don't commit it. `.env.example` is the template; keep it in sync when adding required vars.
- Required env vars: `PORT`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `DATABASE_PATH`.
- SQLite runs with WAL mode + foreign keys ON. Don't disable either.
