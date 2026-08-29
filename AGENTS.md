# AGENTS.md

## Project Context

momenti is a fully self-hosted application (previously built on Base44; it has
been detached). It has two halves that live in one repo:

- **Frontend**: React 18 + Vite 6 + Tailwind 3 + shadcn/radix components under
  `src/`. Plain JavaScript (JSX); no TypeScript except `src/utils/index.ts`.
- **Backend**: Django REST Framework under `backend/` (primary). The React
  app talks to `/api/*` + `/uploads/*` on its own origin; `npm run dev`
  proxies those paths to Django (`manage.py runserver` on :8000), and Django
  can host the built `dist/` too (`MOMENTI_DIST_DIR`). A legacy
  zero-dependency Node backend lives under `server/` as a fallback — select
  it with `MOMENTI_BACKEND=node`.

Keep changes focused on the user's request and preserve existing conventions.

## Key Files

- `src/api/client.js` — local replacement for the old Base44 SDK. Exposes the
  identical call surface (`base44.auth.*`, `base44.entities.Invitation.*`,
  `base44.integrations.Core.UploadFile`); the historical `base44` export name
  is intentional. Do not reintroduce `@base44/*` packages.
- `src/lib/AuthContext.jsx` — boot sequence: fetch `/api/app/settings`, then
  validate any stored token via `/api/auth/me`. No platform gating exists.
- `src/lib/authReturnTo.js` — security-sensitive redirect sanitization shared
  by auth pages. Keep changes centralized here.
- `backend/core/urls.py` + `backend/core/views.py` — every API route and its
  handler. They are wire-compatible with the legacy `server/api.mjs`: same
  paths (incl. `/api/auth/login-with-email-password` style aliases), status
  codes, `{error: ...}` bodies, `dev_otp`/`dev_reset_link` helpers, sort /
  filter / limit semantics and upload caps. Keep both sides in sync when the
  API changes.
- `backend/core/models.py` — User (email login, UUID pk), Invitation
  (schemaless `data` JSONField + unique `slug` column + owner fields), Rsvp
  (guest replies, upserted per invitee email), OtpCode / PendingRegistration /
  PendingPasswordReset (hashed, TTL'd), Upload, Plan, Subscription (provider-agnostic
  entitlements; seeded free/pro in migration `0005_seed_plans`).
- `backend/core/billing.py` — plans/quotas core: `plan_for_user`,
  `enforce_invitation_quota`, `storage_allowance_bytes`, `grant_subscription`,
  `billing_payload`. Provider-agnostic by design — Phase 3 (PayMongo checkout/
  webhook) will call `grant_subscription` with `provider="paymongo"`.
- `backend/core/management/commands/billing_activate.py` — pre-PayMongo admin
  toggle: `manage.py billing_activate --email host@x.com --plan pro`.
- `backend/momenti/settings.py` — `MOMENTI_QUOTA_ENFORCEMENT` (default on) and
  `MOMENTI_BILLING_MANUAL_ACTIVATION` (default on) knobs.
- `backend/core/auth.py` — stateless HMAC bearer tokens (same wire format as
  the Node server; 30-day TTL) + DRF authentication class (401 with
  WWW-Authenticate).
- `backend/core/views.py` `GET /api/uploads?kind=` — the host's media library (auth required); paired with Studio's Library pickers.
- `backend/core/uploads.py` — extension allowlist, per-kind size caps
  (image 12 MB / audio 150 MB / video 750 MB), filename sanitization, MIME map.
- `backend/core/hashers.py` — legacy scrypt hasher for db.json imports
  (upgrades to PBKDF2 on first login).
- `backend/core/tests.py` — Django e2e suite mirroring `scripts/smoke-api.mjs`;
  extend it when adding backend endpoints.
- `backend/core/management/commands/import_momenti_json.py` — one-shot import
  of the legacy Node `db.json` (users, invitations, timestamps).
- `backend/momenti/settings.py` — env knobs (`MOMENTI_*`, `DJANGO_SECRET_KEY`);
  `DATA_DIR` defaults to `<repo>/server/data` (shared with the Node backend).
- `vite.config.js` — owns the `@` -> `./src` alias explicitly; also owns the
  backend selection (Django proxy vs embedded Node middleware).
- `server/api.mjs` — legacy Node middleware: all routes, auth/crypto, storage
  and upload handling. Mounted by `vite.config.js` when `MOMENTI_BACKEND=node`.
- `scripts/smoke-api.mjs` — end-to-end checks for the Node fallback
  (`npm run smoke`).
- `src/lib/templates.js` — template catalog plus the invitation customization
  schema: `templateDefaults`, `normalizeInvitation` (legacy-record migration),
  `SECTION_DEFS` / `DEFAULT_HEADINGS` / `SECTION_DEFAULT_EYEBROWS`,
  `emphasizedHeading`, `STYLE_PRESETS` and `LOOP_TRANSITIONS` (video loop
  fade/crossfade options). Extend here when adding editor knobs.
- `src/components/studio/InvitationEditor.jsx` — tabbed editor (Content /
  Sections / Style / Media); shared primitives in `./EditorControls.jsx`.
  New customization fields must round-trip through buildForm → payload →
  normalizeInvitation and default cleanly for old records.
- `vite.config.js` — owns the `@` -> `./src` alias explicitly.
- `jsconfig.json` — paths only; `checkJs` is deliberately `false` (the vendored
  JSX emits hundreds of false positives under strict checking). ESLint
  (`npm run lint`) is the static-quality gate.
- `public/media/` — localized copies of formerly CDN-hosted images.
- `.env.local` is not required; runtime knobs are `MOMENTI_*` env vars
  (documented in README.md). Never commit secrets.

## Commands

```bash
npm install        # once (frontend)
python -m venv backend/.venv                                  # once (backend)
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python backend/manage.py migrate        # once, then after model changes
backend/.venv/Scripts/python backend/manage.py makemigrations core

backend/.venv/Scripts/python backend/manage.py runserver   # Django API on :8000
npm run dev                                                # Vite + proxy on :5173
npm run build                                              # production bundle -> dist/
backend/.venv/Scripts/python backend/manage.py test core   # Django e2e suite (must pass)
npm run smoke                                              # legacy Node backend suite
npm run lint                                               # eslint --quiet (must pass before finishing)
npm run typecheck                                          # tsc paths validation (must pass)
docker compose build && docker compose up -d               # production container (joins external jdp-network)
```

Run `lint`, `typecheck` and either `build`/`smoke` (frontend/Node change) or
`manage.py test core` (Django change) before finishing.

## Working Notes

- The Django backend is the source of truth for the API. Its contract is
  parity with `server/api.mjs`: route-for-route, alias-for-alias, `{error}`
  bodies, public reads + authenticated writes, unique slugs (409), upload
  allowlist/caps, traversal guard. Don't break these without explicit
  direction.
- The legacy Node backend stays dependency-free: use `node:` builtins
  (crypto, fs, path, url). Don't add Express/Fastify without explicit
  direction. Django dependencies are pinned in `backend/requirements.txt`.
- `server/data/` (db.json, django.sqlite3, uploads, secrets) is runtime state
  and gitignored — never commit it; deleting it resets the app to empty. Both
  backends share that directory, so uploads and the `import_momenti_json`
  hand-off work without copying files.
- Invitation reads are public; writes require the bearer token. Keep uploads
  extension-allowlisted and the traversal guard intact (both backends).
- Slugs are unique across invitations (409 on conflict) and drive the public
  route `/:slug`; sample content falls back via `src/lib/eventData.js`.
- Registration needs no email provider: OTP codes / reset links are surfaced
  as dev helpers (UI + console), controlled by `MOMENTI_DEV_HELPERS`.
