"""CORS + CSRF exemption + response-header parity with server/api.mjs.

- OPTIONS preflights on /api/* answer 204 with the same Allow-* headers the
  Node middleware sent (split-origin deployments, moot under Vite proxying).
- JSON API responses carry Cache-Control: no-store like Node's sendJson did.
- The /api/* and /uploads/* surfaces are authenticated with stateless bearer
  tokens (or are public reads) — never session cookies — so Django's CSRF
  check does not apply. The exemption flag is set here, before Django's
  CsrfViewMiddleware runs later in the chain, so token-only POST/PATCH/DELETE
  API requests are never rejected with a CSRF 400. Cookie-based /admin/
  remains fully CSRF-protected.
"""
from django.conf import settings  # noqa: F401  (imported for parity/documentation)
from django.http import HttpResponse

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

# These prefixes are bearer-token / public JSON and never carry CSRF tokens.
_CSRF_EXEMPT_PREFIXES = ("/api/", "/uploads/")


def _is_api(request):
    return request.path_info.startswith("/api/")


class MomentiCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "OPTIONS" and _is_api(request):
            response = HttpResponse(status=204)
            for header, value in CORS_HEADERS.items():
                response[header] = value
            return response

        if request.path_info.startswith(_CSRF_EXEMPT_PREFIXES):
            # Read by django.middleware.csrf.CsrfViewMiddleware.process_view
            # (this middleware runs before it in MIDDLEWARE). The API is
            # bearer-token/public JSON, so it never sends CSRF tokens.
            request._dont_enforce_csrf_checks = True

        response = self.get_response(request)
        if _is_api(request) and "Cache-Control" not in response:
            response["Cache-Control"] = "no-store"
        return response
