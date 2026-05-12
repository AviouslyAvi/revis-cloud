# public/ — frontend SPA

Vanilla JS + HTML + CSS. No bundler, no framework. Served directly by Express.

## Load

- `index.html` — the main app (~2600 lines). Clerk auth gate, projects/tracks/versions/stems UI, player, share modal, keyboard shortcuts, three visualizer modes.
- `share.html` — public shared-track player. No auth, takes a share token in the URL.
- `sign-in.html` / `sign-up.html` — Clerk prebuilt components.

## Skip

`../node_modules/`, `../data/`, `../src/`.

## Auth flow (frontend)

1. Page loads `@clerk/clerk-js` from CDN, mounts the auth gate.
2. On every API call: grab `await Clerk.session.getToken()`, send as `Authorization: Bearer <token>`.
3. Server's `requireAuth()` validates; `ensureUser` syncs the Clerk identity into the local `users` row.

## Audio player capabilities

Play/pause, seek, speed 0.25×–2×, pitch ±12 semitones, repeat, loop sections (Shift+click waveform), three visualizer modes (bars/oscilloscope/stereo), volume.

## Rules

- No build step. Edit HTML/CSS/JS directly and reload.
- Don't introduce a framework here without an explicit decision — the single-file SPA is intentional.
- Never embed secrets in `index.html`. Clerk publishable key is fine (it's public by design); R2 keys are server-only.
- Streaming uses presigned URLs returned by `/audio/...`. Don't try to fetch audio through the server.

## Skills/MCP

None required.
