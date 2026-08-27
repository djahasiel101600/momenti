// Shared by the auth pages (Login, Register, and any page that resumes a
// flow after sign-in). Keep all redirect validation in one place — it is
// security-sensitive and easy to drift.

// Auth routes: redirects onto these are collapsed instead of wrapped, so a
// signed-out bounce while already signed-out cannot build a nested
// "?returnTo=%2Flogin%3FreturnTo%3D…" chain (an infinite reload loop).
export const AUTH_ROUTE_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

/** Shared open-redirect guard: exactly one leading slash, no "//", no "\". */
function sanitizePath(pathWithSearch) {
  if (
    !pathWithSearch.startsWith("/") ||
    pathWithSearch.startsWith("//") ||
    pathWithSearch.includes("\\")
  ) {
    return null;
  }
  return pathWithSearch;
}

// Resolve ?returnTo= to a safe same-origin path, else "/".
//
// The same-origin check alone is not enough: a value like /.//evil.com or
// /\evil.com parses same-origin but normalizes to a protocol-relative
// //evil.com when assigned to location.href — an open redirect. Bootstrap
// params from the old hosted-platform era are also stripped so a crafted
// returnTo can never smuggle credentials around.
export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    for (const p of ["access_token", "clear_access_token", "app_id", "app_base_url", "functions_version", "from_url"]) {
      url.searchParams.delete(p);
    }
    return sanitizePath(url.pathname + url.search) || "/";
  } catch {
    return "/";
  }
}

/**
 * Compute where a bounced user should be sent when authentication is
 * required, given the URL they were on.
 *
 * Rules:
 *  - From an auth page (or anywhere unparsable): return null — send them to
 *    a clean /login with NO returnTo at all. Never wrap an existing
 *    /login?returnTo=… chain inside another one.
 *  - Elsewhere: preserve the page as the resume target, minus any stale
 *    bootstrap/returnTo params, validated against the same open-redirect
 *    guards as safeReturnTo.
 *
 * Pure (no window access) so it is unit-testable and importable anywhere.
 *
 * @param {string} [currentHref] absolute or relative URL to evaluate
 * @returns {string|null} resume path for the login URL, or null for plain /login
 */
export function buildLoginRedirect(currentHref) {
  let url;
  try {
    url = new URL(currentHref || "/", typeof window !== "undefined" ? window.location.origin : "http://local");
  } catch {
    return null;
  }
  if (AUTH_ROUTE_PATHS.includes(url.pathname)) return null;
  for (const p of ["access_token", "clear_access_token", "app_id", "app_base_url", "functions_version", "from_url", "returnTo"]) {
    url.searchParams.delete(p);
  }
  const target = sanitizePath(url.pathname + url.search);
  return target && target !== "/" ? target : null;
}
