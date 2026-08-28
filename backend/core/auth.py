"""Stateless bearer tokens, wire-compatible with server/api.mjs.

Token format: base64url(JSON {uid, exp}) + "." + base64url(HMAC-SHA256 of the
payload, keyed by SECRET_KEY). The frontend stores this in
localStorage["momenti_token"] and sends `Authorization: Bearer <token>`.
"""
import base64
import hashlib
import hmac
import json
import time

from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import User


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def issue_token(user) -> str:
    claims = {
        "uid": str(user.pk),
        "exp": int(time.time() * 1000) + settings.MOMENTI_TOKEN_TTL_MS,
    }
    payload = _b64url(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    signature = _b64url(
        hmac.new(settings.SECRET_KEY.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{payload}.{signature}"


def verify_token(token):
    """Returns the claims dict when the token is well-formed, correctly signed
    and unexpired; None otherwise (mirrors Node's verifyToken)."""
    if not token or not isinstance(token, str):
        return None
    dot = token.rfind(".")
    if dot <= 0:
        return None
    payload, signature = token[:dot], token[dot + 1:]
    expected = _b64url(
        hmac.new(settings.SECRET_KEY.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    )
    sig_bytes = signature.encode("ascii", errors="ignore")
    expected_bytes = expected.encode("ascii")
    if (
        not sig_bytes
        or len(sig_bytes) != len(expected_bytes)
        or not hmac.compare_digest(sig_bytes, expected_bytes)
    ):
        return None
    try:
        padded = payload + "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (ValueError, TypeError):
        return None
    if not isinstance(claims, dict):
        return None
    if not isinstance(claims.get("uid"), str) or not isinstance(claims.get("exp"), (int, float)):
        return None
    if claims["exp"] < time.time() * 1000:
        return None
    return claims


class BearerAuthentication(BaseAuthentication):
    """`Authorization: Bearer <token>` -> User, or 401 AuthenticationFailed.

    Implementing authenticate_header() makes DRF answer unauthenticated
    requests with 401 (matching Node) instead of 403.
    """

    def authenticate(self, request):
        header = get_authorization_header(request).decode("utf-8", errors="ignore").strip()
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise AuthenticationFailed("Authentication required")
        claims = verify_token(parts[1])
        if not claims:
            raise AuthenticationFailed("Authentication required")
        try:
            user = User.objects.get(pk=claims["uid"])
        except (User.DoesNotExist, ValueError):
            raise AuthenticationFailed("Authentication required")
        if not user.is_active:
            raise AuthenticationFailed("Authentication required")
        return user, None

    def authenticate_header(self, request):
        return 'Bearer realm="momenti"'
