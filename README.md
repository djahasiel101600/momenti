# momenti.co

Editorial, animated digital invitations — weddings, birthdays, galas. A
self-contained web app: React 18 + Vite 6 frontend and a **Django REST
Framework** backend under `backend/` that serves the REST API, auth and
uploaded media (and can host the built UI too). The frontend talks to the same
`/api/*` + `/uploads/*` surface it always has, so switching backends touches
configuration only. A legacy zero-dependency Node backend (`server/`) is kept
as a fallback — set `MOMENTI_BACKEND=node` to use it. There is **no external
platform dependency** (the project was detached from Base44; see "Migration
notes" below).

## Prerequisites

- Node.js 18+
- Python 3.12+ (Django + DRF; dependencies in `backend/requirements.txt`)

## Quick Start

```bash
npm install

# once: backend virtualenv + database
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt   # Windows
# backend/.venv/bin/python -m pip install -r backend/requirements.txt     # macOS/Linux
backend/.venv/Scripts/python backend/manage.py migrate

# terminal 1: Django API + media on http://localhost:8000
backend/.venv/Scripts/python backend/manage.py runserver

# terminal 2: Vite dev server on http://localhost:5173 (proxies /api + /uploads)
npm run dev
```

Open http://localhost:5173.

Sign up at `/register`: the 6-digit verification code is shown directly under
the input (and logged by the dev server) because no SMTP provider is wired up.
After verifying, you land back in the app and can manage invitations at
`/studio`.

Public invitation pages are served at `/<slug>` (e.g. `/john-doe-jane-doe`),
falling back to the built-in sample content in `src/lib/eventData.js` when no
record matches.

Coming from the Node backend? Import the old data:

```bash
backend/.venv/Scripts/python backend/manage.py import_momenti_json
# users keep their passwords (legacy scrypt hashes verify and upgrade to
# PBKDF2 on first login); invitations keep their ids, owners and timestamps;
# uploaded files resolve as-is because both backends share server/data/uploads.
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server; proxies `/api/*` and `/uploads/*` to the Django backend on `:8000` (or embeds the legacy Node middleware when `MOMENTI_BACKEND=node`) |
| `npm run build` | Production bundle into `dist/` |
| `npm start` / `npm run server` | Legacy standalone Node server: serves `dist/`, the API and SPA fallback on `:8787` |
| `npm run preview` | Static preview of `dist/` (no API) |
| `npm run lint` | ESLint (`--quiet`) over pages/components |
| `npm run typecheck` | `tsc -p jsconfig.json` (paths/alias validation; JS checking intentionally off — see below) |
| `npm run smoke` | End-to-end test for the *Node* backend: boots it on an isolated data dir and exercises auth, CRUD, guards and uploads |
| `manage.py test core` | End-to-end tests for the *Django* backend (the same surface, via DRF's test client) |
| `manage.py runserver` | Django API + uploaded media; also hosts `dist/` with SPA fallback when `MOMENTI_DIST_DIR` is set |

(`manage.py` commands run through the venv, e.g.
`backend/.venv/Scripts/python backend/manage.py test core`.)

Typical production host flows:

```bash
npm run build && backend/.venv/Scripts/python backend/manage.py runserver  # Django hosts dist/ + API (set MOMENTI_DIST_DIR)
npm run build && npm start                                                 # legacy Node: -> http://localhost:8787
```

## Docker deployment

The whole app ships as **one container**: gunicorn serves the Django API, the
uploaded media (volume) and the built SPA (`MOMENTI_DIST_DIR`) behind port
8000. The container joins your existing external Docker network
(`jdp-network`) so the cloudflared tunnel — which also lives in Docker —
reaches it by name; no host ports are published.

```bash
docker compose build
docker compose up -d
```

Tunnel ingress (cloudflared config) — the container's DNS name on the shared
network is `momenti`:

```yaml
ingress:
  - hostname: invites.example.com
    service: http://momenti:8000
```

Notes:

- **Data** lives in `./server/data` on the host (SQLite DB, uploaded media,
  token-signing secret) — gitignored, survives rebuilds, and shared with the
  legacy Node backend, so importing old data needs no copying:
  `docker compose exec momenti python manage.py import_momenti_json`
- **Host header**: cloudflared forwards your public hostname
  (`momenti.jdp-homelab.space`) as the Host header — it is pre-wired into
  `MOMENTI_ALLOWED_HOSTS` in docker-compose.yml (all defaults are overridable
  via a `.env` file or shell env without editing the compose file). If your
  tunnel hostname ever changes, update `MOMENTI_ALLOWED_HOSTS` — a Host not
  in the list makes Django answer every request with a 400 (`DisallowedHost`).
- **Admin/CSRF**: `MOMENTI_CSRF_TRUSTED_ORIGINS` (default: your tunnel domain)
  makes `/admin/` logins work behind the proxy. The app's own API is
  bearer-token based and needs no CSRF. Django also honors
  `X-Forwarded-Proto: https` from cloudflared (`SECURE_PROXY_SSL_HEADER`).
- **Reset links**: `MOMENTI_PUBLIC_ORIGIN` pins password-reset links to your
  tunnel domain (a Referer-based fallback covers it either way).
- **Tuning**: `GUNICORN_WORKERS` (2), `GUNICORN_THREADS` (8),
  `GUNICORN_TIMEOUT` (120s). Gunicorn (gthread) streams large uploads
  straight to disk — the 750 MB video cap applies as usual.
- Optional Django admin: `docker compose exec momenti python manage.py
  createsuperuser` → `/admin/`.
- **Permissions are self-healing**: on first boot the entrypoint starts as
  root only to fix the data directory's ownership (Docker creates missing
  host bind-mount dirs as `root:root`, which otherwise makes SQLite fail
  with `unable to open database file`) and then drops to the unprivileged
  runtime user (uid 1000). No manual `chown` needed.

### Environment variables

All optional:

- `MOMENTI_DATA_DIR` — where the SQLite DB, uploads and signing secret live
  (default `<repo>/server/data`, shared with the legacy Node backend)
- `DJANGO_SECRET_KEY` — HMAC key for bearer tokens (default: generated once
  and persisted to `<DATA_DIR>/.django-secret`)
- `MOMENTI_DEBUG` — set `off` in production (default on for development)
- `MOMENTI_ALLOWED_HOSTS` — comma-separated hosts (default localhost + testserver)
- `MOMENTI_CSRF_TRUSTED_ORIGINS` — comma-separated origins trusted for admin/CSRF behind a proxy
- `MOMENTI_DIST_DIR` — have Django host the built frontend (SPA fallback)
- `MOMENTI_PUBLIC_ORIGIN` — origin used in generated password-reset links
- `MOMENTI_DEV_HELPERS` — set `off` to stop surfacing OTP codes / reset links
- `MOMENTI_BACKEND` — set `node` to restore the embedded Node API in `npm run dev`
- `MOMENTI_DJANGO_ORIGIN` — proxy target for `npm run dev` (default `http://127.0.0.1:8000`)
- `MOMENTI_PORT`, `MOMENTI_DIST_DIR` (Node) — legacy standalone-server knobs

## Data & Auth Model (Django)

- Storage is SQLite (`server/data/django.sqlite3` by default) plus uploaded
  media under `server/data/uploads/`. The directory is fully gitignored;
  delete it to reset users/invitations/media.
- Invitations are stored schemaless in a JSON column (with `slug` promoted to
  a unique indexed column), so the editor's flat payload round-trips exactly
  like it did against the Node/Base44 stores; `normalizeInvitation` on the
  frontend keeps migrating legacy records.
- Sessions are stateless HMAC bearer tokens stored client-side
  (`localStorage["momenti_token"]`), signed with a per-install secret that
  persists across restarts. TTL: 30 days. Wire format is identical to the
  Node backend's.
- Reads are public (guests must be able to open invitations while logged out);
  all writes require a bearer token. Slugs are unique (409 on conflict).
- Password hashing uses Django's PBKDF2; accounts imported from the Node
  `db.json` keep their scrypt hashes via a legacy hasher and upgrade
  transparently on the next successful login. Verification codes and reset
  tokens are stored hashed.
- Google/provider sign-in was removed with the platform detach — there is no
  OAuth broker locally. The button is gone from the login/register pages.

Legacy Node model (still accurate when `MOMENTI_BACKEND=node`):

- Storage is a single JSON file (`server/data/db.json`) written atomically,
  plus uploaded images under `server/data/uploads/`.
- Password hashing uses scrypt with per-user salts; verification codes and
  reset tokens are stored hashed.

## API Reference

This surface is implemented twice, identically: by the Django backend
(`backend/core/`) and by the legacy Node middleware (`server/api.mjs`).
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
- `POST /api/uploads` — `{filename,data:<data-url>}` (base64 JSON, images only) → `{file_url:"/uploads/<name>"}`
- `PUT /api/uploads/stream?filename=<enc>` — raw-body streaming upload for large audio/video (auth required; extension allowlist; per-kind size caps: images 12 MB, audio 150 MB, video 750 MB) → `{file_url}`
- `GET /uploads/<name>` — uploaded media with correct MIME types
- `GET /api/rsvps?invitation=<id>|slug=<slug>` — the host's guest ledger (auth required) → `[{id,invitation_id,slug,name,email,attending,guest_count,message,created_date}]`
- `POST /api/rsvps` — public guest reply `{slug|invitation,name,email,attending,guest_count,message}` → `201` new / `200 {…,updated:true}` on re-submit (upserted per invitee email)
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
backend/               # Django REST Framework backend (primary)
  manage.py
  requirements.txt
  momenti/             # project: settings.py, urls.py, wsgi/asgi
  core/                # models, auth (bearer tokens), views, serializers,
                       # uploads (allowlist/caps), tests, import_momenti_json
server/
  api.mjs              # legacy connect-compatible API middleware (Node)
  index.mjs            # legacy production HTTP host for dist/ + SPA fallback
scripts/smoke-api.mjs  # end-to-end verification for the Node backend
public/media/          # images downloaded from the old hosted CDN
```

The API reference above describes the shared surface: the Django backend
(`backend/core/urls.py`) implements every route, status code and payload
shape the Node backend defined.

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
