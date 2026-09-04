// Local replacement for the Base44 SDK client. Exposes the exact call surface
// the app was written against — base44.auth.*, base44.entities.Invitation.*,
// base44.integrations.Core.UploadFile — but everything talks to this repo's
// own Node backend (server/api.mjs) instead of Base44.
//
// The exported name stays `base44` so call sites only change their import
// path; method names stay identical for the same reason.

import { buildLoginRedirect } from "@/lib/authReturnTo";

const TOKEN_KEY = "momenti_token";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode): session lives for the tab only */
  }
}

export const clearToken = () => setToken(null);

/**
 * Low-level JSON fetch against the local API.
 *
 * @param {string} path Path under /api, e.g. "/auth/login"
 * @param {{ method?: string, body?: unknown, auth?: boolean }} [options]
 * @returns {Promise<any>} parsed JSON response
 */
async function request(path, { method = "GET", body, auth = false } = {}) {
  /** @type {Record<string, string>} */
  const headers = {};
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });

  let data = null;
  const raw = await res.text();
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { error: raw };
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
  }
  return data;
}

// --- Auth ---------------------------------------------------------------------

async function me() {
  // Throws an ApiError with status 401 when signed out — callers rely on it.
  return request("/auth/me", { auth: true });
}

/** Returns { access_token, ...user } after validating `email + otpCode`. */
async function verifyOtp({ email, otpCode }) {
  return request("/auth/verify-otp", { method: "POST", body: { email, otpCode } });
}

/** Signs in; the access token is stored automatically like the SDK did. */
async function loginViaEmailPassword(email, password) {
  const result = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (result?.access_token) setToken(result.access_token);
  return result;
}

/** Creates the account and emails-equivalent OTP; response may carry dev_otp. */
async function register({ email, password }) {
  return request("/auth/register", { method: "POST", body: { email, password } });
}

async function resendOtp(email) {
  return request("/auth/resend-otp", { method: "POST", body: { email } });
}

async function resetPasswordRequest(email) {
  // Response may carry dev_reset_link since there is no SMTP locally.
  return request("/auth/reset-password-request", { method: "POST", body: { email } });
}

async function resetPassword(resetToken, newPassword) {
  return request("/auth/reset-password", {
    method: "POST",
    body: { resetToken, newPassword },
  });
}

/**
 * Clears the local session. The optional argument mirrors the SDK signature:
 * when given, the browser lands on /login carrying ?returnTo=… so the
 * caller can resume there afterwards; without it nothing navigates (the
 * "clear token only" case). There is no platform logout page locally —
 * dropping the token IS the entire logout.
 */
async function logout(redirectTarget) {
  clearToken();
  let destination = null;
  if (typeof redirectTarget === "string") {
    try {
      const url = new URL(redirectTarget, window.location.origin);
      if (url.origin === window.location.origin && !url.pathname.startsWith("//")) {
        destination = url.pathname;
      }
    } catch {
      /* ignore malformed targets */
    }
  }
  if (!destination || destination === window.location.pathname) return;
  window.location.assign("/login?returnTo=" + encodeURIComponent(destination));
}

function redirectToLogin(currentLocation) {
  // Centralized in authReturnTo.js so the no-nesting rule (and the
  // open-redirect guards) live beside safeReturnTo().
  const target = buildLoginRedirect(currentLocation);
  window.location.assign(
    target ? "/login?returnTo=" + encodeURIComponent(target) : "/login"
  );
}

// Provider sign-in cannot exist detached from Base44 (no OAuth broker);
// kept as an explicit failure so accidental call sites fail loudly in dev.
async function loginWithProvider(provider) {
  throw new ApiError(
    400,
    `Provider sign-in (${provider}) is unavailable in self-hosted mode. Use email & password.`
  );
}
// --- Entities -------------------------------------------------------------------

function toQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/** CRUD over Invitation records, mirroring the Base44 entity API shape. */
const invitationEntity = {
  /** list("-created_date", 50) -> newest-first array (owner-scoped; auth). */
  async list(sort, limit) {
    const qs = toQuery({ sort, limit });
    return request(`/entities/invitations${qs ? `?${qs}` : ""}`, { auth: true });
  },

  /**
   * filter({ slug }, "-created_date", 1) -> matching array. Deliberately
   * public: the guest invitation page looks up published invitations by slug
   * without a token (the backend scopes anonymous lookups to published).
   */
  async filter(query, sort, limit) {
    const qs = toQuery({ ...(query || {}), sort, limit });
    return request(`/entities/invitations${qs ? `?${qs}` : ""}`);
  },

  /** get(id) -> the record (owner-scoped; used by the RSVP dashboard). */
  async get(id) {
    return request(`/entities/invitations/${encodeURIComponent(id)}`, { auth: true });
  },

  async create(payload) {
    return request("/entities/invitations", { method: "POST", body: payload, auth: true });
  },

  async update(id, payload) {
    return request(`/entities/invitations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: payload,
      auth: true,
    });
  },

  async delete(id) {
    return request(`/entities/invitations/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
  },
};

/**
 * Guest RSVPs. submit() is public — guests reply without accounts; the
 * server upserts per (invitation, email), so a guest re-submitting updates
 * their response (200 {updated:true}) instead of duplicating. list() needs
 * the host's bearer token (the RSVP dashboard).
 */
const rsvpEntity = {
  async submit(payload) {
    return request("/rsvps", { method: "POST", body: payload });
  },

  /** list({ invitation: id } | { slug }) -> responses, newest first */
  async list(query) {
    const qs = toQuery(query || {});
    return request(`/rsvps${qs ? `?${qs}` : ""}`, { auth: true });
  },
};

/** SaaS billing: usage/plan meters, PayMongo checkout, renewal cancel. */
const billingEntity = {
  /** GET /api/billing/usage -> { plan, plans, usage, subscription, billing } */
  usage() {
    return request("/billing/usage", { auth: true });
  },

  /** POST /api/billing/checkout {plan} -> { checkout_url, reference } */
  async checkout(plan) {
    return request("/billing/checkout", { method: "POST", body: { plan }, auth: true });
  },

  /** GET /api/billing/checkout/status?reference=... -> { status } (QR Ph poll) */
  checkoutStatus(reference) {
    return request(
      `/billing/checkout/status?reference=${encodeURIComponent(reference)}`,
      { auth: true }
    );
  },

  /** POST /api/billing/subscription/cancel -> { subscription: {cancel_at_period_end} } */
  cancel() {
    return request("/billing/subscription/cancel", { method: "POST", auth: true });
  },
};

/** The host's media library: previously uploaded images/videos/audio. */
const uploadEntity = {
  /** list({ kind: "image" | "video" | "audio" }?) -> [{name,kind,size,url,...}], newest first */
  async list({ kind } = {}) {
    const qs = toQuery(kind ? { kind } : {});
    return request(`/uploads${qs ? `?${qs}` : ""}`, { auth: true });
  },
};

// --- Integrations ---------------------------------------------------------------

/**
 * Drop-in for the old Core.UploadFile({ file }): images, audio and video.
 *
 * Routing mirrors the backend contract: POST /api/uploads accepts images
 * only (base64 JSON, 12 MB decoded ceiling), so audio/video always stream
 * via PUT /api/uploads/stream — which pipes the raw body straight to disk
 * with per-kind caps (image 12 MB / audio 150 MB / video 750 MB). Images
 * over the size threshold stream too, so a phone-shot video never inflates
 * to base64 or buffers in memory. Resolves to { file_url } either way.
 */
const STREAM_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;
// Extensions the backend's allowlist treats as audio/video (kind != image).
const MEDIA_STREAM_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac|mp4|m4v|webm|mov)$/i;

async function uploadFile({ file }) {
  if (!file) throw new ApiError(400, "No file provided");

  const name = String(file.name || "");
  const isMedia =
    MEDIA_STREAM_EXT.test(name) || /^(audio|video)\//i.test(String(file.type || ""));
  if (isMedia || file.size > STREAM_UPLOAD_THRESHOLD_BYTES) {
    const token = getToken();
    if (!token) throw new ApiError(401, "Authentication required");
    const res = await fetch(
      `${API_BASE}/uploads/stream?filename=${encodeURIComponent(file.name)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error || `Upload failed (${res.status})`, data);
    return { file_url: data.file_url || data.url, kind: data.kind };
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ApiError(400, "Could not read file"));
    reader.readAsDataURL(file);
  });
  const result = await request("/uploads", {
    method: "POST",
    body: { filename: file.name, data: dataUrl },
    auth: true,
  });
  return { file_url: result.file_url || result.url };
}

// --- Analytics (privacy-light view tracking) --------------------------------------
// Public track call — guests pinging this is how we count views. Auth is not
// required; the backend anonymizes the viewer via a salted IP hash.
async function trackView(slug) {
  if (!slug) return { ok: false };
  const res = await request(
    "/analytics/track",
    { method: "POST", body: { slug }, auth: false },
  );
  return res || { ok: true };
}

// Host-only: fetch the daily view series for one invitation.
async function fetchAnalytics(invitationId, days = 30) {
  return request(`/analytics/views?invitation=${encodeURIComponent(invitationId)}&days=${days}`, {
    auth: true,
  });
}

// --- Template gallery --------------------------------------------------------
async function listTemplates(source) {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return request(`/templates${qs}`, { auth: false });
}

async function getTemplate(slug) {
  return request(`/templates/${encodeURIComponent(slug)}`, { auth: false });
}

async function publishTemplate({ name, tagline, payload }) {
  return request("/templates/publish", {
    method: "POST",
    body: { name, tagline, payload },
    auth: true,
  });
}

const templateEntity = { list: listTemplates, get: getTemplate, publish: publishTemplate };

const analyticsEntity = { track: trackView, fetch: fetchAnalytics };

// --- Public surface (same shape the Base44 SDK exposed) -------------------------

export const api = {
  auth: {
    register,
    verifyOtp,
    resendOtp,
    loginViaEmailPassword,
    loginWithProvider,
    resetPasswordRequest,
    resetPassword,
    me,
    logout,
    redirectToLogin,
    setToken,
    getToken,
    clearToken,
  },
  billing: billingEntity,
  analytics: analyticsEntity,
  templates: templateEntity,
  entities: {
    Invitation: invitationEntity,
    Rsvp: rsvpEntity,
    Upload: uploadEntity,
  },
  integrations: {
    Core: {
      UploadFile: uploadFile,
    },
  },
};

// Historical export name — every call site imports `{ base44 }`. Kept so the
// migration off Base44 touches import paths only.
export { api as base44 };

export default api;



