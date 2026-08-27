// End-to-end smoke test for the local momenti backend.
//
// Spawns server/index.mjs against an isolated temp data dir, then exercises
// the whole public surface: health/settings, register -> OTP -> token -> me,
// invitation CRUD with sort/filter semantics, slug-uniqueness and auth
// guards, plus an upload round-trip and the uploads path-traversal guard.
//
//   node scripts/smoke-api.mjs
//
// Exits 0 when every check passes, 1 otherwise.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8791;
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "momenti-smoke-"));

let failures = 0;
function check(label, actual, expected) {
  const pass =
    typeof expected === "function" ? expected(actual) : Object.is(actual, expected);
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

async function jsonFetch(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, data, headers: res.headers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(__dirname, "..", "server", "index.mjs")], {
  env: { ...process.env, MOMENTI_DATA_DIR: DATA_DIR, MOMENTI_PORT: String(PORT) },
  stdio: ["ignore", "inherit", "inherit"],
});

try {
  // Wait for boot.
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      await fetch(`${BASE}/api/health`);
      up = true;
    } catch {
      await sleep(250);
    }
  }
  if (!up) throw new Error("server did not become healthy in time");
  // --- invitation CRUD + guards ----------------------------------------------
  const anonCreate = await jsonFetch("/api/entities/invitations", {
    method: "POST",
    body: { slug: "x" },
  });
  check("create.anonymous_status", anonCreate.status, 401);

  const fakeAuth = await jsonFetch("/api/entities/invitations", {
    method: "POST",
    body: { slug: "x" },
    headers: { Authorization: "Bearer not.a.token" },
  });
  check("create.bad_token_status", fakeAuth.status, 401);

  const recA = await jsonFetch("/api/entities/invitations", {
    method: "POST",
    headers: authHeaders,
    body: { slug: "alpha-wedding", couple: "Alpha", eventType: "Wedding" },
  });
  check("create.a.status", recA.status, 201);
  await sleep(20); // ensure distinct created_date for sort assertions
  const recB = await jsonFetch("/api/entities/invitations", {
    method: "POST",
    headers: authHeaders,
    body: { slug: "beta-gala", couple: "Beta", eventType: "Gala" },
  });
  check("create.b.status", recB.status, 201);

  const list = (await jsonFetch("/api/entities/invitations?sort=-created_date&limit=10")).data;
  check("list.newest_first", list[0]?.slug, "beta-gala");
  check("list.count", list.length, 2);

  const filtered = (await jsonFetch("/api/entities/invitations?slug=beta-gala")).data;
  check("filter.slug_only_match", filtered.length === 1 && filtered[0].slug, "beta-gala");

  const dupeSlug = await jsonFetch("/api/entities/invitations", {
    method: "POST",
    headers: authHeaders,
    body: { slug: "alpha-wedding", couple: "Dup" },
  });
  check("create.duplicate_slug_status", dupeSlug.status, 409);

  const updated = await jsonFetch(`/api/entities/invitations/${recB.data.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: { couple: "Beta Prime" },
  });
  check("update.couple", updated.data.couple, "Beta Prime");
  check("update.created_date_preserved", updated.data.created_date === recB.data.created_date, true);

  const del = await jsonFetch(`/api/entities/invitations/${recB.data.id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  check("delete.ok", del.data.ok, true);
  const afterDelete = (await jsonFetch("/api/entities/invitations?sort=-created_date")).data;
  check("list.after_delete_count", afterDelete.length, 1);
/*__MORE_SMOKE_2__*/
