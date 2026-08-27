# momenti.co

Editorial, animated digital invitations — weddings, birthdays, galas. A
self-contained web app: React 18 + Vite 6 frontend and a zero-dependency
Node.js backend that serves the UI, the REST API, auth, and uploaded media
behind one port. There is **no external platform dependency** (the project was
detached from Base44; see "Migration notes" below).

## Prerequisites

- Node.js 18+ (only dependency of the backend is the standard library)

## Quick Start

```bash
npm install
npm run dev          # full stack: API + frontend in one process
```

Open http://localhost:5173.

Sign up at `/register`: the 6-digit verification code is shown directly under
the input (and logged by the dev server) because no SMTP provider is wired up.
After verifying, you land back in the app and can manage invitations at
`/studio`.

Public invitation pages are served at `/<slug>` (e.g. `/john-doe-jane-doe`),
falling back to the built-in sample content in `src/lib/eventData.js` when no
record matches.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with the local API embedded (`/api/*`, `/uploads/*`) |
| `npm run build` | Production bundle into `dist/` |
| `npm start` / `npm run server` | Standalone Node server: serves `dist/`, the API and SPA fallback on `:8787` |
| `npm run preview` | Static preview of `dist/` (no API) |
| `npm run lint` | ESLint (`--quiet`) over pages/components |
| `npm run typecheck` | `tsc -p jsconfig.json` (paths/alias validation; JS checking intentionally off — see below) |
| `npm run smoke` | End-to-end test: boots the server on an isolated data dir and exercises auth, CRUD, guards and uploads |

Typical production host flow:

```bash
npm run build && npm start     # -> http://localhost:8787
```

### Environment variables

All optional:

- `MOMENTI_PORT` — standalone server port (default `8787`)
- `MOMENTI_DATA_DIR` — where `db.json`, uploads and the session secret live
  (default `<repo>/server/data`)
- `MOMENTI_DIST_DIR` — override which folder `npm start` hosts (default `dist/`)
- `MOMENTI_PUBLIC_ORIGIN` — origin used in generated password-reset links
- `MOMENTI_DEV_HELPERS` — set `off` to stop surfacing OTP codes / reset links

## Data & Auth Model

- Storage is a single JSON file (`server/data/db.json`) written atomically,
  plus uploaded images under `server/data/uploads/`. The directory is fully
  gitignored; delete it to reset users/invitations/sessions.
- Sessions are stateless HMAC tokens stored client-side
  (`localStorage["momenti_token"]`), signed with a per-install secret that
  persists across restarts. TTL: 30 days.
- Reads are public (guests must be able to open invitations while logged out);
  all writes require a bearer token. Slugs are unique.
- Password hashing uses scrypt with per-user salts; verification codes and
  reset tokens are stored hashed.
- Google/provider sign-in was removed with the platform detach — there is no
  OAuth broker locally. The button is gone from the login/register pages.

## API Reference

Auth (prefix `/api/auth`):

| Method & path | Purpose |
| --- | --- |
| `POST /register` | `{email,password}` → queues account, returns `{dev_otp}` |
| `POST /verify-otp` | `{email,otpCode}` → `{access_token,user}` |
| `POST /resend-otp` | `{email}` → new code |
| `POST /login` | `{email,password}` → `{access_token,user}` |
| `GET /me` | Bearer token → current user |
| `POST /logout` | Acknowledges (token removal happens client-side) |
| `POST /reset-password-request` | `{email}` → `{dev_reset_link}` when the account exists |
| `POST /reset-password` | `{resetToken,newPassword}` |

Entities & misc:

- `GET /api/entities/invitations?sort=-created_date&limit=N&<field>=value` — list/filter
- `GET/POST /api/entities/invitations` · `PATCH|DELETE /api/entities/invitations/:id`
- `POST /api/uploads` — `{filename,data:<data-url>}` (base64 JSON, images & small files) → `{file_url:"/uploads/<name>"}`
- `PUT /api/uploads/stream?filename=<enc>` — raw-body streaming upload for large audio/video (auth required; extension allowlist; per-kind size caps: images 12 MB, audio 150 MB, video 750 MB) → `{file_url}`
- `GET /uploads/<name>` — uploaded media with correct MIME types
- `GET /api/app/settings` — boot-time app settings probe used by the frontend
- `GET /api/health`

## Where Things Live

```
src/
  api/client.js        # local SDK replacement (see Migration notes)
  lib/AuthContext.jsx  # session bootstrap: settings probe -> token -> me()
  lib/templates.js     # templates, section schema & normalization helpers
  lib/eventData.js     # mock/sample invitations keyed by slug
  pages/ components/   # marketing site, studio editor, invitation renderer
server/
  api.mjs              # connect-compatible API middleware (auth, entities, uploads)
  index.mjs            # production HTTP host for dist/ + SPA fallback
scripts/smoke-api.mjs  # end-to-end verification (npm run smoke)
public/media/          # images downloaded from the old hosted CDN
```

## Customizing a Template

The Studio editor has four tabs: **Content** (kicker, page title, hero
sub-line, hosts, venue details, per-card notes, story, RSVP settings),
**Sections** (reorder, hide/show, eyebrow labels and heading overrides for
Story/Details/Gallery/RSVP), **Style** (accent/background/text colors,
curated palette presets, serif-vs-sans display typeface) and **Media**
(music track with autoplay/loop toggles, hero & story backdrop accepting
images *or* videos, and a gallery manager where each photo slot also takes
video clips). Public pages render sections in the chosen order; every knob
degrades gracefully for records saved before a given field existed — see
`normalizeInvitation`.

**Heading overrides**: each section's big display heading is yours to change;
leave the field blank to keep the built-in copy ("How we met.", "When &
where.", …). The field's hint shows exactly which built-in line applies.

## Migration Notes (Base44 detachment)

The app previously used the Base44 platform for hosting, its SDK, auth,
entity storage and file uploads. Everything now runs from this repo:

- `src/api/client.js` exposes the same call surface the codebase was written
  against (`base44.auth.*`, `base44.entities.Invitation.*`,
  `base44.integrations.Core.UploadFile`). The historical export name `base44`
  was kept so migration touched import paths only.
- The Vite plugin provided the `@` path alias implicitly — it is now an
  explicit `resolve.alias` in `vite.config.js`.
- All `media.base44.com` / `static.wixstatic.com` images were downloaded into
  `public/media/` and referenced via `/media/...`.
- Platform-only pieces were deleted: MCP OAuth consent page, URL-app-param
  bootstrap, the "user not registered" gating screen.
- Email delivery never ran locally; registration/reset flows surface their
  codes/links as documented above instead.

If you later want real email, cloud storage or OAuth, wire them into
`server/api.mjs` handlers (registration/reset) and `src/pages/Register.jsx`.
