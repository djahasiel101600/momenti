"""CORS + response-header parity with server/api.mjs.

- OPTIONS preflights on /api/* answer 204 with the same Allow-* headers the
  Node middleware sent (same-origin Vite proxying makes this moot in practice,
  but it keeps split-origin deployments working).
- JSON API responses carry Cache-Control: no-store like Node's sendJson did.
"""
from django.conf import settings
from django.http import HttpResponse

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


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
        response = self.get_response(request)
        if _is_api(request) and "Cache-Control" not in response:
            response["Cache-Control"] = "no-store"
        return response
