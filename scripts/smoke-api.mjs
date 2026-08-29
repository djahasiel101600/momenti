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
import { normalizeInvitation } from "../src/lib/templates.js";

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
  let healthy = false;
  for (let i = 0; i < 40 && !healthy; i++) {
    try {
      await fetch(`${BASE}/api/health`);
      healthy = true;
    } catch {
      await sleep(250);
    }
  }
  if (!healthy) throw new Error("server did not become healthy in time");

  // --- settings -------------------------------------------------------------
  const settings = await jsonFetch("/api/app/settings");
  check("settings.app_name", settings.data.public_settings.app_name, "momenti.co");

  // --- register -> OTP -> verify -> me --------------------------------------
  const reg = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { email: "smoke@test.dev", password: "secret123" },
  });
  check("register.status", reg.status, 201);
  check("register.dev_otp_len", String(reg.data.dev_otp).length, 6);

  const badOtp = await jsonFetch("/api/auth/verify-otp", {
    method: "POST",
    body: { email: "smoke@test.dev", otpCode: "000000" },
  });
  check("verify.wrong_otp_status", badOtp.status, 401);

  const ver = await jsonFetch("/api/auth/verify-otp", {
    method: "POST",
    body: { email: "smoke@test.dev", otpCode: reg.data.dev_otp },
  });
  check("verify.status", ver.status, 200);
  const token = ver.data.access_token;
  check("verify.token_present", typeof token === "string" && token.includes("."), true);

  const authHeaders = { Authorization: `Bearer ${token}` };
  const me = await jsonFetch("/api/auth/me", { headers: authHeaders });
  check("me.email", me.data.email, "smoke@test.dev");
  check("me.role", me.data.role, "member");

  const badLogin = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: { email: "smoke@test.dev", password: "wrong-password" },
  });
  check("login.wrong_password_status", badLogin.status, 401);
  const goodLogin = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: { email: "smoke@test.dev", password: "secret123" },
  });
  check("login.status", goodLogin.status, 200);

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

  const list = (await jsonFetch("/api/entities/invitations?sort=-created_date&limit=10", { headers: authHeaders })).data;
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
  const afterDelete = (await jsonFetch("/api/entities/invitations?sort=-created_date", { headers: authHeaders })).data;
  check("list.after_delete_count", afterDelete.length, 1);

  // --- uploads ----------------------------------------------------------------
  const PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const up = await jsonFetch("/api/uploads", {
    method: "POST",
    headers: authHeaders,
    body: { filename: "dot.png", data: PNG },
  });
  check("upload.file_url_prefix", String(up.data.file_url).startsWith("/uploads/"), true);
  const imgRes = await fetch(BASE + up.data.file_url);
  check("upload.served_content_type", imgRes.headers.get("content-type"), "image/png");

  const anonUpload = await jsonFetch("/api/uploads", {
    method: "POST",
    body: { filename: "dot.png", data: PNG },
  });
  check("upload.anonymous_status", anonUpload.status, 401);
  const upList = await jsonFetch("/api/uploads?kind=image", { headers: authHeaders });
  check("library.list_status", upList.status, 200);
  check("library.contains_upload", (upList.data || []).some((u) => u.name === up.data.file_url.split("/").pop()), true);


  const traversal = await fetch(`${BASE}/uploads/..%2Fdb.json`);
  check("traversal.blocked", [400, 404].includes(traversal.status), true);

  // --- streamed media uploads -------------------------------------------------
  const mp3Bytes = new Uint8Array([
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]); // minimal "ID3" header
  const anonStream = await fetch(
    `${BASE}/api/uploads/stream?filename=${encodeURIComponent("q.mp3")}`,
    { method: "PUT", headers: { "Content-Type": "audio/mpeg" }, body: mp3Bytes }
  );
  check("stream.anonymous_status", anonStream.status, 401);

  const stream = await fetch(
    `${BASE}/api/uploads/stream?filename=${encodeURIComponent("loop.mp3")}`,
    {
      method: "PUT",
      headers: {
        Authorization: authHeaders.Authorization,
        "Content-Type": "audio/mpeg",
      },
      body: mp3Bytes,
    }
  );
  const streamData = await stream.json().catch(() => null);
  check("stream.audio.status", stream.status, 201);
  check("stream.audio.url_suffix", String(streamData?.file_url || "").endsWith(".mp3"), true);
  const servedAudio = await fetch(BASE + streamData.file_url);
  check("stream.served_content_type", servedAudio.headers.get("content-type"), "audio/mpeg");

  const badExt = await fetch(
    `${BASE}/api/uploads/stream?filename=evil.txt`,
    { method: "PUT", headers: { Authorization: authHeaders.Authorization }, body: "x" }
  );
  check("stream.badext_status", badExt.status, 415);

  // --- invitation carrying music + video gallery item --------------------------
  const mediaInvite = await jsonFetch("/api/entities/invitations", {
    method: "POST",
    headers: authHeaders,
    body: {
      slug: "media-invite",
      couple: "M & V",
      coupleShort: "M&V",
      eventType: "Wedding",
      date: "2027-02-02T10:00",
      venueName: "", venueAddress: "", mapUrl: "",
      time: "", dressCode: "", story: "",
      heroImage: "/media/a2a00eea3_generated_131f7848.png",
      heroImageMobile: "/uploads/clip-mobile.mp4",
      storyImage: "/media/acb2ce145_generated_60229421.png",
      gallery: [{ url: "/uploads/clip.mp4", alt: "highlight reel", span: "wide" }],
      accentColor: "#C58A58", backgroundColor: "#101014", countdownVisible: true,
      heroKicker: "", heroSubline: "", timeNote: "", dressCodeNote: "",
      detailsNote: "", rsvpNote: "", rsvpMaxGuests: "5",
      headings: {},
      sections: [
        { id: "countdown", label: "Countdown", visible: true },
        { id: "story", label: "Our Story", visible: true },
        { id: "details", label: "Details", visible: true },
        { id: "gallery", label: "Gallery", visible: true },
        { id: "rsvp", label: "RSVP", visible: true },
      ],
      sectionStyles: {},
      music: { url: streamData.file_url, autoplay: false },
      theme: { textColor: "#F2F0ED", paperColor: "#F2F0ED", displayFont: "serif" },
    },
  });
  check("media.invite_create_status", mediaInvite.status, 201);

  const fetchedMedia = (
    await jsonFetch("/api/entities/invitations?slug=media-invite")
  ).data;
  const normalizedMedia = normalizeInvitation(fetchedMedia[0]);
  check("norm.music.url", normalizedMedia.music.url, streamData.file_url);
  check("norm.music.autoplay_off_respected", normalizedMedia.music.autoplay, false);
  check("norm.music.loop_default_true", normalizedMedia.music.loop, true);
  check("norm.hero_mobile_roundtrip", fetchedMedia[0].heroImageMobile, "/uploads/clip-mobile.mp4");

  // --- RSVPs ----------------------------------------------------------------------
  const rsvpPost = await jsonFetch("/api/rsvps", {
    method: "POST",
    body: {
      slug: "media-invite",
      name: "Ada Guest",
      email: "ada@guest.dev",
      attending: true,
      guest_count: 3,
      message: "Wouldn't miss it!",
    },
  });
  check("rsvp.guest_submit_status", rsvpPost.status, 201);
  check("rsvp.invitation_resolved", rsvpPost.data.slug, "media-invite");

  const rsvpAnonList = await jsonFetch(`/api/rsvps?invitation=${mediaInvite.data.id}`);
  check("rsvp.list_anonymous_status", rsvpAnonList.status, 401);

  const rsvpList = await jsonFetch(`/api/rsvps?invitation=${mediaInvite.data.id}`, {
    headers: authHeaders,
  });
  check("rsvp.list_status", rsvpList.status, 200);
  check("rsvp.list_count", rsvpList.data.length, 1);

  const rsvpResubmit = await jsonFetch("/api/rsvps", {
    method: "POST",
    body: {
      slug: "media-invite",
      name: "Ada Guest",
      email: "ada@guest.dev",
      attending: false,
      guest_count: 1,
    },
  });
  check("rsvp.upsert_status", rsvpResubmit.status, 200);
  check("rsvp.upsert_flag", rsvpResubmit.data.updated, true);
  check("rsvp.upsert_same_id", rsvpResubmit.data.id, rsvpPost.data.id);

  const rsvpListAfter = await jsonFetch("/api/rsvps?slug=media-invite", {
    headers: authHeaders,
  });
  check("rsvp.upsert_no_duplicate", rsvpListAfter.data.length, 1);
  check("rsvp.upsert_latest_answer", rsvpListAfter.data[0].attending, false);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
} catch (err) {
  console.error("SMOKE ERROR:", err);
  process.exitCode = 1;
} finally {
  server.kill();
}
