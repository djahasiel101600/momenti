# AGENTS.md

## Project Context

momenti is a fully self-hosted application (previously built on Base44; it has
been detached). It has two halves that live in one repo:

- **Frontend**: React 18 + Vite 6 + Tailwind 3 + shadcn/radix components under
  `src/`. Plain JavaScript (JSX); no TypeScript except `src/utils/index.ts`.
- **Backend**: zero-dependency Node (standard library only) under `server/`.
  `npm run dev` embeds the API into Vite so one command runs everything;
  `npm start` hosts a production build on its own port.

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
- `server/api.mjs` — all routes, auth/crypto, storage and upload handling.
  Mounted by `vite.config.js` (`configureServer`) and reused by `server/index.mjs`.
- `scripts/smoke-api.mjs` — end-to-end checks (`npm run smoke`). Extend it
  when adding backend endpoints.
- `src/lib/templates.js` — template catalog plus the invitation customization
  schema: `templateDefaults`, `normalizeInvitation` (legacy-record migration),
  `SECTION_DEFS` / `DEFAULT_HEADINGS` / `SECTION_DEFAULT_EYEBROWS`,
  `emphasizedHeading` and `STYLE_PRESETS`. Extend here when adding editor knobs.
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
npm install        # once
npm run dev        # full stack on http://localhost:5173
npm run build      # production bundle -> dist/
npm start          # host dist/ + API on :8787
npm run smoke      # end-to-end backend verification
npm run lint       # eslint --quiet (must pass before finishing work)
npm run typecheck  # tsc paths validation (must pass)
```

Run `lint`, `typecheck` and either `build` or `smoke` (whichever matches your
change) before finishing.

## Working Notes

- Backend stays dependency-free: use `node:` builtins (crypto, fs, path, url).
  Don't add Express/Fastify without explicit direction.
- `server/data/` (db.json, uploads, session secret) is runtime state and
  gitignored — never commit it; deleting it resets the app to empty.
- Invitation reads are public; writes require the bearer token. Keep uploads
  extension-allowlisted and the traversal guard intact.
- Slugs are unique across invitations (409 on conflict) and drive the public
  route `/:slug`; sample content falls back via `src/lib/eventData.js`.
- Registration needs no email provider: OTP codes / reset links are surfaced
  as dev helpers (UI + console), controlled by `MOMENTI_DEV_HELPERS`.
