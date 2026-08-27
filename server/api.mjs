// Zero-dependency local backend for momenti.
//
// One connect-compatible middleware serves everything under /api/* and
// /uploads/* so the app runs fully self-hosted:
//
//   - Auth: register -> OTP verification -> bearer token, login, me, logout,
//     password reset request/confirm (OTP codes + reset links surface as dev
//     helpers because there is no email provider locally).
//   - Entities: /api/entities/invitations CRUD with the list/filter, sort
//     ("-created_date") and limit semantics the frontend was built on.
//     Reads are public (invitation pages are viewable logged out); writes
//     require a valid bearer token.
//   - Uploads: images posted as base64 JSON land in server/data/uploads and
//     are served back at /uploads/<name> like the Core.UploadFile flow did.
//
// Mounted into the Vite dev server by vite.config.js (`npm run dev` = full
// stack) and driven standalone by server/index.mjs (`npm start`). Configure:
//   MOMENTI_DATA_DIR    where db.json / uploads / secret live
//   MOMENTI_PORT        port for the standalone server (default 8787)
//   MOMENTI_DIST_DIR    override the dist folder the standalone server hosts
//   MOMENTI_DEV_HELPERS set to "off" to hide OTP codes / reset links

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.MOMENTI_DATA_DIR || path.join(__dirname, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SECRET_FILE = path.join(DATA_DIR, ".session-secret");

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_BODY_BYTES = 30 * 1024 * 1024; // headroom for base64 image payloads
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // decoded upload ceiling
const DEV_HELPERS = process.env.MOMENTI_DEV_HELPERS !== "off";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"];
const AUDIO_EXT = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".flac"];
const VIDEO_EXT = [".mp4", ".m4v", ".webm", ".mov"];
const ALLOWED_UPLOAD_EXT = [...IMAGE_EXT, ...AUDIO_EXT, ...VIDEO_EXT];
// Kind-specific ceilings: base64 JSON uploads stay small; large audio/video
// must go through PUT /api/uploads/stream which pipes straight to disk.
const KIND_LIMIT_BYTES = {
  image: 12 * 1024 * 1024,
  audio: 150 * 1024 * 1024,
  video: 750 * 1024 * 1024,
};
function uploadKindFor(filename) {
  const ext = path.parse(String(filename || "")).ext.toLowerCase();
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (VIDEO_EXT.includes(ext)) return "video";
  return null;
}
const EXT_TO_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

// --- Storage plumbing -------------------------------------------------------

function ensureDirs() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function loadSecret() {
  if (fs.existsSync(SECRET_FILE)) {
    const secret = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (secret.length >= 32) return secret;
  }
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_FILE, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

let DB = { users: [], invitations: [], pendingOtps: {}, pendingRegs: {}, pendingResets: {} };
function loadDb() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    DB = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
      pendingOtps: parsed.pendingOtps || {},
      pendingRegs: parsed.pendingRegs || {},
      pendingResets: parsed.pendingResets || {},
    };
  } catch {
    /* first boot or corrupted file: start fresh */
  }
}

// Atomic write: temp + rename so a crash mid-write cannot corrupt db.json.
function saveDb() {
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(DB, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

ensureDirs();
loadDb();
const SECRET = loadSecret();

// --- Crypto / tokens ---------------------------------------------------------

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256Hex = (value) => crypto.createHash("sha256").update(value).digest("hex");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueToken(userId) {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (!a.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claims || typeof claims.uid !== "string" || typeof claims.exp !== "number") return null;
  if (claims.exp < Date.now()) return null;
  return claims;
}

const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

function userFromToken(token) {
  const claims = verifyToken(token);
  if (!claims) return null;
  return DB.users.find((u) => u.id === claims.uid) || null;
}

function userFromReq(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return userFromToken(token);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name || "",
    role: user.role || "member",
  };
}

// --- HTTP plumbing -----------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Invalid JSON body"));
      }
    });
    req.on("error", () => reject(new HttpError(400, "Failed to read request body")));
  });
}

async function requireUser(req) {
  const user = userFromReq(req);
  if (!user) throw new HttpError(401, "Authentication required");
  return user;
}
// --- Domain helpers -----------------------------------------------------------

function findUserByEmail(email) {
  return DB.users.find((u) => u.email.toLowerCase() === String(email || "").toLowerCase());
}

function requireEmail(body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "A valid email address is required");
  }
  return email;
}

function createOtp(email) {
  const otp = generateOtp();
  DB.pendingOtps[email] = { otpHash: sha256Hex(otp), expiresAt: Date.now() + OTP_TTL_MS };
  saveDb();
  if (DEV_HELPERS) console.log(`[momenti] Verification code for ${email}: ${otp}`);
  return otp;
}

function consumeOtp(email, otp) {
  const entry = DB.pendingOtps[email];
  if (!entry) throw new HttpError(400, "No verification code found. Request a new one.");
  if (entry.expiresAt < Date.now()) {
    delete DB.pendingOtps[email];
    saveDb();
    throw new HttpError(400, "This verification code has expired. Request a new one.");
  }
  if (sha256Hex(String(otp || "")) !== entry.otpHash) {
    throw new HttpError(401, "Incorrect verification code");
  }
  delete DB.pendingOtps[email];
  saveDb();
}

function slugTaken(slug, excludeId) {
  return DB.invitations.some((rec) => rec.slug === slug && rec.id !== excludeId);
}

function assertSlugAvailable(recordId, payload) {
  if (Object.prototype.hasOwnProperty.call(payload, "slug") && slugTaken(String(payload.slug), recordId)) {
    throw new HttpError(409, `An invitation with the slug "${payload.slug}" already exists`);
  }
}

function applyEntitySort(list, sortParam) {
  for (const term of String(sortParam || "-created_date").split(",")) {
    const desc = term.startsWith("-");
    const field = desc ? term.slice(1) : term;
    if (!field) continue;
    list.sort((a, b) => {
      const av = a?.[field];
      const bv = b?.[field];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return desc ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      return desc ? (av < bv ? 1 : -1) : av < bv ? -1 : 1;
    });
  }
}

function sanitizeFileName(rawName) {
  const parsed = path.parse(String(rawName || ""));
  const ext = ALLOWED_UPLOAD_EXT.includes(parsed.ext.toLowerCase()) ? parsed.ext.toLowerCase() : null;
  if (!ext) {
    throw new HttpError(415, `Unsupported file type. Allowed extensions: ${ALLOWED_UPLOAD_EXT.join(", ")}`);
  }
  const base =
    parsed.name.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "image";
  return `${crypto.randomUUID()}-${base}${ext}`;
}

const sniffImageExt = (buffer) => {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return ".jpg";
  if (buffer.subarray(0, 3).toString("ascii") === "GIF") return ".gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  return null;
};

// --- Auth handlers ------------------------------------------------------------

async function handleRegister(req, res) {
  const body = await readJsonBody(req);
  const email = requireEmail(body);
  if (String(body.password ?? "").length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }
  if (findUserByEmail(email)) throw new HttpError(409, "An account with this email already exists");
  // No mailer exists locally, so verification cannot deliver an emailed code
  // through a hosted flow â€” queue the credentials until the OTP is verified
  // (handleVerifyOtp), surfacing the code via DEV_HELPERS meanwhile.
  DB.pendingRegs[email] = { passwordHash: hashPassword(String(body.password)), expiresAt: Date.now() + OTP_TTL_MS };
  const otp = createOtp(email);
  const resp = { otp_sent: true };
  if (DEV_HELPERS) resp.dev_otp = otp;
  sendJson(res, 201, resp);
}

async function handleVerifyOtp(req, res) {
  const body = await readJsonBody(req);
  const email = requireEmail(body);
  consumeOtp(email, String(body.otpCode ?? body.otp_code ?? body.code ?? ""));

  const pendingReg = DB.pendingRegs[email];
  delete DB.pendingRegs[email];

  let user = findUserByEmail(email);
  if (user) {
    // Verifying an address that already belongs to an account (e.g. re-run of
    // the register page): never clobber the existing password.
    user.email_verified = true;
  } else {
    const expiresAt = pendingReg?.expiresAt || 0;
    if (!pendingReg || expiresAt < Date.now()) {
      throw new HttpError(400, "Registration window expired. Please sign up again.");
    }
    user = {
      id: crypto.randomUUID(),
      email,
      password_hash: pendingReg.passwordHash,
      role: "member",
      created_date: new Date().toISOString(),
      email_verified: true,
    };
    DB.users.push(user);
  }
  saveDb();
  sendJson(res, 200, { access_token: issueToken(user.id), ...publicUser(user) });
}
async function handleResendOtp(req, res) {
  const body = await readJsonBody(req);
  const email = requireEmail(body);
  const otp = createOtp(email);
  const resp = { otp_sent: true };
  if (DEV_HELPERS) resp.dev_otp = otp;
  sendJson(res, 200, resp);
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const email = requireEmail(body);
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(body.password, user.password_hash)) {
    throw new HttpError(401, "Invalid email or password");
  }
  sendJson(res, 200, { access_token: issueToken(user.id), ...publicUser(user) });
}

function handleMe(req, res) {
  const user = userFromReq(req);
  if (!user) throw new HttpError(401, "Authentication required");
  sendJson(res, 200, publicUser(user));
}

function handleLogout(res) {
  // Tokens are stateless client-side; clearing them is sufficient locally.
  sendJson(res, 200, { ok: true });
}

async function handleResetRequest(req, res) {
  const body = await readJsonBody(req);
  const email = requireEmail(body);
  const resp = {}; // Always look successful regardless of account existence.
  const user = findUserByEmail(email);
  if (user) {
    const token = crypto.randomBytes(24).toString("base64url");
    DB.pendingResets[token] = { userId: user.id, expiresAt: Date.now() + RESET_TTL_MS };
    saveDb();
    const origin =
      process.env.MOMENTI_PUBLIC_ORIGIN ||
      (req.headers.referer ? new URL(req.headers.referer).origin : "http://localhost:5173");
    const link = `${origin}/reset-password?token=${token}`;
    if (DEV_HELPERS) {
      console.log(`[momenti] Password reset link for ${email}: ${link}`);
      resp.dev_reset_link = link; // no mailer locally: surface the link
    }
  }
  sendJson(res, 200, resp);
}

async function handleResetConfirm(req, res) {
  const body = await readJsonBody(req);
  const token = String(body.resetToken ?? body.reset_token ?? "");
  const newPassword = String(body.newPassword ?? body.new_password ?? "");
  if (newPassword.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }
  const entry = DB.pendingResets[token];
  if (!entry || entry.expiresAt < Date.now()) {
    delete DB.pendingResets[token];
    saveDb();
    throw new HttpError(400, "This reset link is invalid or has expired");
  }
  const user = DB.users.find((u) => u.id === entry.userId);
  if (!user) throw new HttpError(400, "Account no longer exists");
  user.password_hash = hashPassword(newPassword);
  delete DB.pendingResets[token];
  saveDb();
  sendJson(res, 200, { ok: true });
}
// --- Invitation entity handlers -------------------------------------------------

const INVITATION_PATH = /^\/api\/entities\/(?:invitation|invitations)(?:\/([^/]+))?$/i;

function handleListInvitations(res, searchParams) {
  const filters = [];
  for (const [key, value] of searchParams.entries()) {
    if (!["sort", "limit", "offset"].includes(key)) filters.push([key, value]);
  }

  const matched = filters.length
    ? DB.invitations.filter((rec) =>
        filters.every(([k, v]) => {
          const rv = rec?.[k];
          if (rv === undefined || rv === null) return false;
          return Array.isArray(rv)
            ? rv.some((x) => String(x) === v)
            : String(rv) === v;
        })
      )
    : [...DB.invitations];

  applyEntitySort(matched, searchParams.get("sort"));

  const offset = Math.max(0, parseInt(searchParams.get("offset"), 10) || 0);
  const limitRaw = parseInt(searchParams.get("limit"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : matched.length;
  sendJson(res, 200, matched.slice(offset, offset + limit));
}

async function handleCreateInvitation(req, res, user) {
  const payload = await readJsonBody(req);
  assertSlugAvailable(null, payload);
  const now = new Date().toISOString();
  const record = { ...payload, id: crypto.randomUUID(), owner_email: user.email, created_date: now, updated_date: now };
  DB.invitations.push(record);
  saveDb();
  sendJson(res, 201, record);
}

async function handleUpdateInvitation(req, res, user, id) {
  const idx = DB.invitations.findIndex((rec) => rec.id === id);
  if (idx === -1) throw new HttpError(404, "Invitation not found");
  const patch = await readJsonBody(req);
  assertSlugAvailable(id, patch);
  const previous = DB.invitations[idx];
  DB.invitations[idx] = {
    ...previous,
    ...patch,
    id: previous.id, // identity fields are immutable
    owner_email: previous.owner_email || user.email,
    updated_date: new Date().toISOString(),
  };
  saveDb();
  sendJson(res, 200, DB.invitations[idx]);
}

function handleDeleteInvitation(res, id) {
  const idx = DB.invitations.findIndex((rec) => rec.id === id);
  if (idx === -1) throw new HttpError(404, "Invitation not found");
  DB.invitations.splice(idx, 1);
  saveDb();
  sendJson(res, 200, { ok: true });
}

async function handleGetInvitation(res, id) {
  const record = DB.invitations.find((rec) => rec.id === id);
  if (!record) throw new HttpError(404, "Invitation not found");
  sendJson(res, 200, record);
}
// --- Uploads ---------------------------------------------------------------------

async function handleUpload(req, res) {
  const user = await requireUser(req);
  const body = await readJsonBody(req);
  const dataUrl = String(body.data || "");
  const commaIdx = dataUrl.indexOf(",");
  const raw = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : "";
  if (!raw) throw new HttpError(400, "Missing file data");

  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    throw new HttpError(400, "Malformed file data");
  }
  if (!buffer.length) throw new HttpError(400, "Empty file");
  const kind = uploadKindFor(body.filename);
  if (kind !== "image") throw new HttpError(415, "Use the streaming upload endpoint for non-image files");
  if (buffer.length > KIND_LIMIT_BYTES.image) throw new HttpError(413, "Image exceeds the 12 MB limit");

  let name;
  try {
    name = sanitizeFileName(body.filename);
  } catch (err) {
    // Filename-less payloads (or unsupported extensions): fall back to
    // sniffing the binary signature so common image types still work.
    const ext = sniffImageExt(buffer);
    if (!ext) throw err instanceof HttpError ? err : new HttpError(415, "Unsupported file type");
    name = `${crypto.randomUUID()}${ext}`;
  }

  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer, { mode: 0o644 });
  void user; // recorded implicitly via the auth requirement
  sendJson(res, 201, { file_url: `/uploads/${name}`, url: `/uploads/${name}` });
}

/**
 * Streaming upload: PUT /api/uploads/stream?filename=<enc>
 * Raw request body is piped straight to disk (no base64, no buffering), so
 * videos up to hundreds of megabytes upload with constant memory usage.
 */
async function handleStreamUpload(req, res, url) {
  const user = await requireUser(req);
  const filename = String(url.searchParams.get("filename") || "");
  const kind = uploadKindFor(filename);
  if (!kind) {
    throw new HttpError(415, `Unsupported file type. Allowed: ${ALLOWED_UPLOAD_EXT.join(", ")}`);
  }
  const name = sanitizeFileName(filename);
  const limit = KIND_LIMIT_BYTES[kind];
  const finalPath = path.join(UPLOADS_DIR, name);
  const tmpPath = `${finalPath}.part`;
  let received = 0;

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath);
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      out.destroy();
      fs.unlink(tmpPath, () => {});
      reject(err);
    };
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > limit) {
        req.destroy();
        fail(new HttpError(413, `File exceeds the ${Math.round(limit / 1024 / 1024)} MB limit for ${kind}s`));
      }
    });
    req.on("error", fail);
    out.on("error", fail);
    out.on("finish", () => {
      if (settled) return;
      settled = true;
      if (received === 0) {
        out.close();
        fs.unlink(tmpPath, () => {});
        reject(new HttpError(400, "Empty upload"));
        return;
      }
      try {
        // Promote the fully-written temp file atomically so partial uploads
        // never become visible under their public name.
        fs.renameSync(tmpPath, finalPath);
      } catch (err) {
        fs.unlink(tmpPath, () => {});
        reject(err);
        return;
      }
      resolve();
    });
    req.pipe(out);
  });

  void user;
  sendJson(res, 201, { file_url: `/uploads/${name}`, url: `/uploads/${name}`, kind, bytes: received });
}
function serveUploads(res, pathname) {
  const rel = decodeURIComponent(pathname.replace(/^\/uploads\//, ""));
  const root = path.resolve(UPLOADS_DIR);
  const target = path.resolve(root, rel);
  // Path-traversal guard: resolved target must stay inside UPLOADS_DIR.
  if (!target.startsWith(root + path.sep)) {
    return sendJson(res, 400, { error: "Invalid path" });
  }
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return sendJson(res, 404, { error: "File not found" });
  }
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    "Content-Type": EXT_TO_MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "public, max-age=31536000, immutable", // names carry a UUID prefix
  });
  fs.createReadStream(target).pipe(res);
}
// --- Router -------------------------------------------------------------------

async function dispatch(req, res, url) {
  const method = req.method.toUpperCase();
  const p = url.pathname.replace(/\/+$/, "") || "/";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  if (p === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "momenti", time: new Date().toISOString() });
  }
  if (p === "/api/app/settings" && method === "GET") {
    // Replaces the boot-time public-settings probe against the Base44-hosted
    // platform. No platform-level "auth required" gate exists locally.
    return sendJson(res, 200, {
      id: "local",
      public_settings: { app_name: "momenti.co", auth_mode: "password" },
    });
  }

  if (p === "/api/auth/register" && method === "POST") return handleRegister(req, res);
  if ((p === "/api/auth/verify-otp" || p === "/api/auth/register/verify") && method === "POST") {
    return handleVerifyOtp(req, res);
  }
  if (p === "/api/auth/resend-otp" && method === "POST") return handleResendOtp(req, res);
  if ((p === "/api/auth/login" || p === "/api/auth/login-with-email-password") && method === "POST") {
    return handleLogin(req, res);
  }
  if (p === "/api/auth/me" && method === "GET") return handleMe(req, res);
  if (p === "/api/auth/logout" && method === "POST") return handleLogout(res);
  if ((p === "/api/auth/reset-password-request" || p === "/api/auth/forgot-password") && method === "POST") {
    return handleResetRequest(req, res);
  }
  if (p === "/api/auth/reset-password" && method === "POST") return handleResetConfirm(req, res);

  const invMatch = INVITATION_PATH.exec(p);
  if (invMatch) {
    const id = invMatch[1];
    if (method === "GET") {
      return id ? handleGetInvitation(res, id) : handleListInvitations(res, url.searchParams);
    }
    const user = await requireUser(req);
    if (method === "POST") return handleCreateInvitation(req, res, user);
    if (!id) throw new HttpError(405, "Specify an invitation id");
    if (method === "PUT" || method === "PATCH") return handleUpdateInvitation(req, res, user, id);
    if (method === "DELETE") return handleDeleteInvitation(res, id);
    throw new HttpError(405, "Method not allowed");
  }

  if (p === "/api/uploads" && method === "POST") return handleUpload(req, res);
  if (p === "/api/uploads/stream" && method === "PUT") {
    return handleStreamUpload(req, res, url);
  }

  throw new HttpError(404, `No route for ${method} ${p}`);
}

/**
 * Connect-compatible middleware handling /api/* and /uploads/*.
 * Anything else falls through to Vite (or the static server).
 */
export function momentiMiddleware(req, res, next) {
  let url;
  try {
    url = new URL(req.url, "http://internal");
  } catch {
    return next();
  }
  if (url.pathname.startsWith("/api/")) {
    Promise.resolve(dispatch(req, res, url)).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error("[momenti] Unhandled error:", err);
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? "Internal server error" : err.message });
      else res.destroy();
    });
    return;
  }
  if (url.pathname.startsWith("/uploads/") || url.pathname === "/uploads") {
    try {
      serveUploads(res, url.pathname);
    } catch (err) {
      console.error("[momenti] Upload serving failed:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Failed to serve file" });
      else res.destroy();
    }
    return;
  }
  next();
}






