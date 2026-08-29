"""All API views. Wire-compatible with the legacy Node backend (server/api.mjs):

- same routes (incl. aliases), status codes, `{error: ...}` bodies and
  `dev_otp` / `dev_reset_link` helpers;
- public reads / authenticated writes for invitations;
- extension-allowlisted uploads with per-kind size caps;
- stateless HMAC bearer tokens in the same wire format the Node server used.

Parity subtleties are noted inline where the Node behaviour is specific.
"""
import base64
import binascii
import functools
import hashlib
import json
import hmac
import logging
import os
import re
import secrets
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail
from django.http import FileResponse, Http404, HttpResponse
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth import issue_token
from .errors import MomentiError
from .models import (
    Invitation,
    OtpCode,
    PendingCheckout,
    PendingPasswordReset,
    PendingRegistration,
    Plan,
    Rsvp,
    Subscription,
    Upload,
    User,
)
from .billing import (
    active_subscription_for,
    billing_period_days,
    billing_payload,
    enforce_invitation_quota,
    enforce_storage_quota,
    grant_subscription,
    storage_allowance_bytes,
)
from .paymongo import (
    create_checkout_session,
    handle_webhook_event,
    paymongo_configured,
    verify_webhook_signature,
)
from .serializers import InvitationSerializer, RsvpSerializer, UserPublicSerializer
from .uploads import (
    ALLOWED_UPLOAD_EXT,
    EXT_TO_MIME,
    sanitize_filename,
    sniff_image_ext,
    upload_kind_for,
)

log = logging.getLogger("momenti")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Query-param / sort terms that map onto real columns; everything else filters
# against the JSONField payload (data__<key>) like Node's flat record lookup.
RESERVED_QUERY_COLUMNS = {
    "id": "pk",
    "owner_email": "owner_email",
    "created_date": "created_date",
    "updated_date": "updated_date",
}


def now():
    return timezone.now()


def sha256_hex(value):
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def require_email(body):
    email = str((body or {}).get("email") or "").strip().lower()
    if not EMAIL_RE.fullmatch(email):
        raise MomentiError("A valid email address is required", 400)
    return email


def body_dict(request):
    data = request.data
    return data if isinstance(data, dict) else {}


def create_otp(email):
    otp = f"{secrets.randbelow(1_000_000):06d}"
    OtpCode.objects.update_or_create(
        email=email,
        defaults={"code_hash": sha256_hex(otp), "expires_at": now() + settings.MOMENTI_OTP_TTL},
    )
    return otp


def deliver_otp(email, otp):
    """Deliver the verification code: by email when SMTP is configured,
    otherwise as a dev helper (console + response). Returns the response
    payload for register/resend-otp."""
    resp = {"otp_sent": True}
    if settings.MOMENTI_EMAIL_HOST:
        try:
            send_mail(
                subject="Your momenti verification code",
                message=(
                    f"Your momenti verification code is:\n\n    {otp}\n\n"
                    "It expires in 10 minutes. If you didn't request it, ignore this email."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
            log.info("Verification code emailed to %s", email)
            return resp
        except Exception as exc:
            log.error("Could not email the verification code to %s: %s", email, exc)
            if not settings.MOMENTI_DEV_HELPERS:
                raise MomentiError(
                    "Could not send the verification email. Please try again later.", 500
                )
            # fall through to the dev helper so local testing isn't blocked
    if settings.MOMENTI_DEV_HELPERS:
        log.info("Verification code for %s: %s", email, otp)
        resp["dev_otp"] = otp
    return resp


def deliver_reset_link(email, link):
    """Deliver the reset link by email when SMTP is configured; otherwise
    surface it as a dev helper. Returns the response payload."""
    resp = {}
    if settings.MOMENTI_EMAIL_HOST:
        try:
            send_mail(
                subject="Reset your momenti password",
                message=(
                    "Someone requested a password reset for your momenti account.\n\n"
                    f"Open this link to choose a new password (valid for 1 hour):\n\n{link}\n\n"
                    "If you didn't request this, you can ignore this email."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
            log.info("Password reset link emailed to %s", email)
            return resp
        except Exception as exc:
            log.error("Could not email the reset link to %s: %s", email, exc)
            if not settings.MOMENTI_DEV_HELPERS:
                raise MomentiError("Could not send the reset email. Please try again later.", 500)
    if settings.MOMENTI_DEV_HELPERS:
        log.info("Password reset link for %s: %s", email, link)
        resp["dev_reset_link"] = link
    return resp


def consume_otp(email, otp):
    entry = OtpCode.objects.filter(email=email).first()
    if entry is None:
        raise MomentiError("No verification code found. Request a new one.", 400)
    if entry.expires_at < now():
        entry.delete()
        raise MomentiError("This verification code has expired. Request a new one.", 400)
    if not hmac.compare_digest(sha256_hex(otp), entry.code_hash):
        raise MomentiError("Incorrect verification code", 401)
    entry.delete()


def token_response(user):
    data = {"access_token": issue_token(user)}
    data.update(UserPublicSerializer(user).data)
    return Response(data)


# --- Health / settings --------------------------------------------------------


class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "ok": True,
                "service": "momenti",
                "time": timezone.now().isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            }
        )


class AppSettingsView(APIView):
    """Boot-time settings probe used by AuthContext; no platform gating."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "id": "local",
                "public_settings": {"app_name": "momenti.co", "auth_mode": "password"},
            }
        )


# --- Auth ---------------------------------------------------------------------


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        body = body_dict(request)
        email = require_email(body)
        password = body.get("password")
        if len(str(password if password is not None else "")) < 8:
            raise MomentiError("Password must be at least 8 characters", 400)
        if User.objects.filter(email__iexact=email).exists():
            raise MomentiError("An account with this email already exists", 409)
        # No mailer: queue the credentials until the OTP is verified and
        # surface the code via DEV_HELPERS (console + response).
        PendingRegistration.objects.update_or_create(
            email=email,
            defaults={
                "password_hash": make_password(str(password)),
                "expires_at": now() + settings.MOMENTI_OTP_TTL,
            },
        )
        otp = create_otp(email)
        return Response(deliver_otp(email, otp), status=201)


class VerifyOtpView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        body = body_dict(request)
        email = require_email(body)
        raw_otp = body.get("otpCode")
        if raw_otp is None:
            raw_otp = body.get("otp_code")
        if raw_otp is None:
            raw_otp = body.get("code")
        consume_otp(email, str(raw_otp if raw_otp is not None else ""))
        # Node reads + deletes the pending registration before branching.
        pending = PendingRegistration.objects.filter(email=email).first()
        pending_hash = pending.password_hash if pending else None
        pending_expired = bool(pending and pending.expires_at < now())
        if pending:
            pending.delete()

        user = User.objects.filter(email__iexact=email).first()
        if user:
            # Verifying an address that already belongs to an account (e.g. a
            # re-run of the register page): never clobber the password.
            if not user.email_verified:
                user.email_verified = True
                user.save(update_fields=["email_verified"])
        else:
            if pending is None or pending_expired or not pending_hash:
                raise MomentiError("Registration window expired. Please sign up again.", 400)
            user = User(email=email, email_verified=True, role="member")
            user.password = pending_hash  # already Django-encoded at register time
            user.save()
        return token_response(user)


class ResendOtpView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = require_email(body_dict(request))
        otp = create_otp(email)
        return Response(deliver_otp(email, otp))


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        body = body_dict(request)
        email = require_email(body)
        password = body.get("password")
        user = User.objects.filter(email__iexact=email).first()
        # check_password() transparently upgrades legacy (scrypt) hashes to
        # Django's preferred hasher on success.
        password_str = str(password if password is not None else "")
        if not user or not user.check_password(password_str):
            raise MomentiError("Invalid email or password", 401)
        return token_response(user)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserPublicSerializer(request.user).data)


class LogoutView(APIView):
    """Tokens are stateless client-side; clearing them is the whole logout."""

    permission_classes = [AllowAny]

    def post(self, request):
        return Response({"ok": True})


class ResetPasswordRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = require_email(body_dict(request))
        resp = {}  # always look successful regardless of account existence
        user = User.objects.filter(email__iexact=email).first()
        if user:
            token = secrets.token_urlsafe(24)
            PendingPasswordReset.objects.create(
                token_hash=sha256_hex(token),
                user=user,
                expires_at=now() + settings.MOMENTI_RESET_TTL,
            )
            origin = settings.MOMENTI_PUBLIC_ORIGIN
            if not origin:
                referer = request.headers.get("referer")
                if referer:
                    try:
                        split = urlsplit(referer)
                        origin = f"{split.scheme}://{split.netloc}"
                    except ValueError:
                        origin = ""
                origin = origin or "http://localhost:5173"
            link = f"{origin}/reset-password?token={token}"
            resp.update(deliver_reset_link(email, link))
        return Response(resp)


class ResetPasswordConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        body = body_dict(request)
        raw_token = body.get("resetToken")
        if raw_token is None:
            raw_token = body.get("reset_token")
        raw_password = body.get("newPassword")
        if raw_password is None:
            raw_password = body.get("new_password")
        token = str(raw_token if raw_token is not None else "")
        new_password = str(raw_password if raw_password is not None else "")
        if len(new_password) < 8:
            raise MomentiError("Password must be at least 8 characters", 400)
        entry = PendingPasswordReset.objects.filter(token_hash=sha256_hex(token)).first()
        if entry is None or entry.expires_at < now():
            if entry:
                entry.delete()
            raise MomentiError("This reset link is invalid or has expired", 400)
        try:
            user = entry.user
        except User.DoesNotExist:
            raise MomentiError("Account no longer exists", 400)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        entry.delete()
        return Response({"ok": True})


# --- Invitations ----------------------------------------------------------------


def _slug_from(data):
    """Extract the slug column value; absent -> None (multiple slug-less
    records stay allowed, matching Node's `hasOwnProperty` check)."""
    if "slug" not in data:
        return None
    value = data.get("slug")
    if value is None:
        return None
    return str(value)


def _get_invitation_or_404(invitation_id):
    try:
        inv_uuid = uuid.UUID(str(invitation_id))
    except (ValueError, AttributeError, TypeError):
        raise MomentiError("Invitation not found", 404)
    invitation = Invitation.objects.filter(pk=inv_uuid).first()
    if invitation is None:
        raise MomentiError("Invitation not found", 404)
    return invitation


def _get_owned_invitation_or_404(invitation_id, user):
    """Tenancy: hosts may only touch their own invitations. 404 (not 403) so
    other hosts' invitation ids aren't leaked."""
    invitation = _get_invitation_or_404(invitation_id)
    if invitation.owner_id != user.id:
        raise MomentiError("Invitation not found", 404)
    return invitation


def _js_str(value):
    """JS String() coercion for the Node list-filter parity fallback."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return str(value)


def _node_field_match(record, key, expected):
    """Node's filter predicate: `String(rec[k]) === v`, with arrays matching
    when any element stringifies to the value; null/undefined never match."""
    rv = record.get(key)
    if rv is None:
        return False
    if isinstance(rv, list):
        return any(_js_str(item) == expected for item in rv)
    return _js_str(rv) == expected


def _order_columns(sort_param):
    """Map `sort` terms onto ORM columns ("-created_date" default), like
    applyEntitySort (comma-separated terms, "-" = descending)."""
    fields = []
    for term in str(sort_param or "-created_date").split(","):
        if not term:
            continue
        desc = term.startswith("-")
        field = term[1:] if desc else term
        if not field or "__" in field:
            continue
        column = RESERVED_QUERY_COLUMNS.get(field)
        if column is None:
            column = f"data__{field}"
        fields.append(("-" + column) if desc else column)
    return fields or ["-created_date"]


def _node_record_compare(a, b, field, desc):
    """Node's comparator: nulls always sort last, strings compare via
    localeCompare (approximated by codepoint order), else < / >."""
    av, bv = a.get(field), b.get(field)
    if av == bv:
        return 0
    if av is None:
        return 1
    if bv is None:
        return -1
    if isinstance(av, str) and isinstance(bv, str):
        if desc:
            return -1 if av > bv else (1 if av < bv else 0)
        return 1 if av > bv else (-1 if av < bv else 0)
    if desc:
        return 1 if av < bv else -1
    return -1 if av < bv else 1


def _slice_page(items, params):
    """offset/limit semantics: offset >= 0, limit caps at 500, no limit
    param (or a non-positive one) returns everything from offset on."""
    try:
        offset = max(0, int(params.get("offset") or 0))
    except (TypeError, ValueError):
        offset = 0
    limit = None
    raw_limit = params.get("limit")
    if raw_limit is not None:
        try:
            parsed = int(raw_limit)
        except (TypeError, ValueError):
            parsed = None
        if parsed is not None and parsed > 0:
            limit = min(parsed, 500)
    end = offset + limit if limit is not None else None
    return items[offset:end]


class InvitationListCreate(APIView):
    def get_permissions(self):
        # Reads are public (guests open invitation pages logged out); writes
        # require the bearer token. No ownership scoping, like the Node server.
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        params = request.query_params
        filters = []
        for key in params.keys():
            if key in ("sort", "limit", "offset"):
                continue
            for value in params.getlist(key):
                filters.append((key, str(value)))

        queryset = Invitation.objects.all()

        # Tenancy: the studio lists the owner's invitations. Guests (no bearer
        # token) may only look up a single published invitation by slug - the
        # lookup the public invitation page performs. Drafts are invisible to
        # guests and cannot take RSVPs.
        if request.user.is_authenticated:
            queryset = queryset.filter(owner=request.user)
        elif not params.get("slug"):
            raise MomentiError("Authentication required", 401)
        else:
            queryset = queryset.filter(status="published")

        for key, value in filters:
            if "__" in key:
                # Flat payload keys can't contain "__"; nothing matches,
                # mirroring String(rec[k]) === v on a field that never exists.
                queryset = queryset.none()
                continue
            column = RESERVED_QUERY_COLUMNS.get(key)
            if column == "pk":
                try:
                    uuid.UUID(value)
                except ValueError:
                    queryset = queryset.none()
                    continue
                queryset = queryset.filter(pk=value)
            elif column:
                queryset = queryset.filter(**{column: value})
            else:
                queryset = queryset.filter(**{f"data__{key}": value})

        if filters and not queryset.exists() and request.user.is_authenticated:
            # DB-level exact match found nothing: replicate Node's predicate
            # verbatim (array membership + JS coercion) over the table. Data
            # volumes here are studio-scale, so this stays cheap.
            records = [
                InvitationSerializer(invitation).data
                for invitation in Invitation.objects.filter(owner=request.user).iterator()
                if all(
                    _node_field_match(InvitationSerializer(invitation).data, key, value)
                    for key, value in filters
                )
            ]
            field_terms = []
            for term in str(params.get("sort") or "-created_date").split(","):
                if not term:
                    continue
                field_terms.append((term[1:] if term.startswith("-") else term, term.startswith("-")))
            for field, desc in reversed(field_terms):
                if not field:
                    continue
                records.sort(
                    key=functools.cmp_to_key(
                        lambda a, b, f=field, d=desc: _node_record_compare(a, b, f, d)
                    )
                )
            return Response(_slice_page(records, params))

        page = _slice_page(queryset.order_by(*_order_columns(params.get("sort"))), params)
        return Response([InvitationSerializer(invitation).data for invitation in page])

    def post(self, request):
        serializer = InvitationSerializer(data=request.data)
        serializer.is_valid()
        data = serializer.validated_data["data"]
        status_value = str(data.get("status") or "published")
        if status_value not in ("draft", "published"):
            raise MomentiError("Status must be draft or published", 400)
        data["status"] = status_value
        slug = _slug_from(data)
        if slug is not None and Invitation.objects.filter(slug=slug).exists():
            raise MomentiError(f'An invitation with the slug "{slug}" already exists', 409)
        enforce_invitation_quota(request.user)
        try:
            invitation = Invitation.objects.create(
                data=data,
                slug=slug,
                status=status_value,
                owner=request.user,
                owner_email=request.user.email,
            )
        except Exception:
            if slug is not None and Invitation.objects.filter(slug=slug).exists():
                raise MomentiError(f'An invitation with the slug "{slug}" already exists', 409)
            raise
        return Response(InvitationSerializer(invitation).data, status=201)

    def put(self, request):
        raise MomentiError("Specify an invitation id", 405)

    def patch(self, request):
        raise MomentiError("Specify an invitation id", 405)

    def delete(self, request):
        raise MomentiError("Specify an invitation id", 405)


class InvitationDetail(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, invitation_id):
        invitation = _get_owned_invitation_or_404(invitation_id, request.user)
        return Response(InvitationSerializer(invitation).data)

    def _update(self, request, invitation_id):
        invitation = _get_owned_invitation_or_404(invitation_id, request.user)
        serializer = InvitationSerializer(data=request.data)
        serializer.is_valid()
        patch = serializer.validated_data["data"]

        if "status" in patch:
            status_value = str(patch.get("status") or "published")
            if status_value not in ("draft", "published"):
                raise MomentiError("Status must be draft or published", 400)
            invitation.status = status_value

        # Node checks the patch's slug only (assertSlugAvailable(id, patch)).
        if "slug" in patch and patch.get("slug") is not None:
            slug = str(patch["slug"])
            if Invitation.objects.filter(slug=slug).exclude(pk=invitation.pk).exists():
                raise MomentiError(f'An invitation with the slug "{slug}" already exists', 409)
        elif "slug" in patch:
            slug = None  # explicit null clears the column, like rec.slug = null
        else:
            slug = invitation.slug

        merged = {**(invitation.data or {}), **patch}  # shallow merge, like Node
        invitation.data = merged
        invitation.slug = slug
        if not invitation.owner_email:
            invitation.owner_email = request.user.email
        if invitation.owner_id is None:
            invitation.owner = request.user
        try:
            invitation.save()
        except Exception:
            if "slug" in patch and patch.get("slug") is not None:
                conflict = (
                    Invitation.objects.filter(slug=str(patch["slug"]))
                    .exclude(pk=invitation.pk)
                    .exists()
                )
                if conflict:
                    raise MomentiError(
                        f'An invitation with the slug "{patch["slug"]}" already exists', 409
                    )
            raise
        return Response(InvitationSerializer(invitation).data)

    def put(self, request, invitation_id):
        return self._update(request, invitation_id)

    def patch(self, request, invitation_id):
        return self._update(request, invitation_id)

    def delete(self, request, invitation_id):
        invitation = _get_owned_invitation_or_404(invitation_id, request.user)
        invitation.delete()
        return Response({"ok": True})


# --- RSVPs ----------------------------------------------------------------------


_TRUE_VALUES = {True, "true", "yes", "accepts", "accept", 1, "1"}
_FALSE_VALUES = {False, "false", "no", "declines", "decline", 0, "0"}


def _parse_attending(value):
    """Accept booleans plus the friendly strings guests/clients may send."""
    if isinstance(value, str):
        value = value.strip().lower()
    if value in _TRUE_VALUES:
        return True
    if value in _FALSE_VALUES:
        return False
    return None


def _rsvp_invitation_from_params(params):
    """Resolve ?invitation=<uuid> or ?slug=<slug>; None + error message when
    the params are missing or the invitation does not exist."""
    slug = str(params.get("slug") or "").strip()
    invitation_param = str(params.get("invitation") or "").strip()
    if not slug and not invitation_param:
        return None, MomentiError("Pass ?invitation=<id> or ?slug=<slug>", 400)
    if slug:
        invitation = Invitation.objects.filter(slug=slug).first()
    else:
        try:
            invitation = Invitation.objects.filter(pk=uuid.UUID(invitation_param)).first()
        except (ValueError, AttributeError):
            invitation = None
    if invitation is None:
        return None, MomentiError("Invitation not found", 404)
    return invitation, None


class RsvpListCreate(APIView):
    """POST /api/rsvps — guests reply publicly (upsert per invitee email);
    GET /api/rsvps?invitation=<id>|slug=<slug> — the host's guest ledger."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated()]
        return [AllowAny()]

    def post(self, request):
        body = body_dict(request)

        slug = str(body.get("slug") or "").strip()
        invitation_param = str(body.get("invitation") or body.get("invitation_id") or "").strip()
        if slug:
            invitation = Invitation.objects.filter(slug=slug).first()
            if invitation is None:
                raise MomentiError("Invitation not found", 404)
        elif invitation_param:
            invitation = _get_invitation_or_404(invitation_param)
        else:
            raise MomentiError("An invitation slug is required", 400)

        name = str(body.get("name") or "").strip()
        if not name:
            raise MomentiError("Your name is required", 400)
        name = name[:255]

        email = str(body.get("email") or "").strip().lower()
        if not EMAIL_RE.fullmatch(email):
            raise MomentiError("A valid email address is required", 400)

        attending = _parse_attending(body.get("attending"))
        if attending is None:
            raise MomentiError("Let us know whether you can make it (accepts/declines)", 400)

        raw_guests = body.get("guest_count", body.get("guests", 1))
        try:
            guest_count = int(raw_guests)
        except (TypeError, ValueError):
            raise MomentiError("Guest count must be a number between 1 and 10", 400)
        if not 1 <= guest_count <= 10:
            raise MomentiError("Guest count must be a number between 1 and 10", 400)

        message = str(body.get("message") or "")[:1000]

        if invitation.status == "draft":
            # Drafts are hidden from guests entirely.
            raise MomentiError("Invitation not found", 404)

        rsvp = Rsvp.objects.filter(invitation=invitation, email=email).first()
        updated = rsvp is not None
        if updated:
            rsvp.name = name
            rsvp.attending = attending
            rsvp.guest_count = guest_count
            rsvp.message = message
            rsvp.save(update_fields=["name", "attending", "guest_count", "message"])
        else:
            try:
                rsvp = Rsvp.objects.create(
                    invitation=invitation,
                    name=name,
                    email=email,
                    attending=attending,
                    guest_count=guest_count,
                    message=message,
                )
            except Exception:
                # Concurrent double-submit lost the race against the unique
                # (invitation, email) constraint: treat as an update.
                rsvp = Rsvp.objects.filter(invitation=invitation, email=email).first()
                if rsvp is None:
                    raise
                updated = True

        payload = RsvpSerializer(rsvp).data
        if updated:
            payload["updated"] = True
        return Response(payload, status=200 if updated else 201)

    def get(self, request):
        invitation, error = _rsvp_invitation_from_params(request.query_params)
        if error is not None:
            raise error
        if invitation.owner_id != request.user.id:
            raise MomentiError("Invitation not found", 404)
        rsvps = Rsvp.objects.filter(invitation=invitation).order_by("-created_date")
        return Response([RsvpSerializer(rsvp).data for rsvp in rsvps])


# --- Uploads --------------------------------------------------------------------


def _uploads_root():
    root = Path(settings.MEDIA_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    return root


class UploadView(APIView):
    """POST /api/uploads — {filename, data:<data-url>}; images only, decoded
    ceiling 12 MB (parity with the Node base64 endpoint)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """GET /api/uploads?kind=image|video|audio - the host's media library
        (auth required): previously uploaded images/videos/audio, newest first."""
        kind = str(request.query_params.get("kind") or "").strip()
        queryset = Upload.objects.filter(uploaded_by=request.user).order_by("-created_date")
        if kind:
            queryset = queryset.filter(kind=kind)
        return Response(
            [
                {
                    "name": up.name,
                    "kind": up.kind,
                    "size": up.size,
                    "url": f"/uploads/{up.name}",
                    "file_url": f"/uploads/{up.name}",
                    "original_name": up.original_name or "",
                    "created_date": up.created_date.isoformat().replace("+00:00", "Z"),
                }
                for up in queryset
            ]
        )

    def post(self, request):
        body = body_dict(request)
        data_url = str(body.get("data") or "")
        comma_index = data_url.find(",")
        raw_b64 = data_url[comma_index + 1:] if comma_index >= 0 else ""
        if not raw_b64:
            raise MomentiError("Missing file data", 400)
        try:
            buffer = base64.b64decode(raw_b64, validate=False)
        except (binascii.Error, ValueError):
            raise MomentiError("Malformed file data", 400)
        if not len(buffer):
            raise MomentiError("Empty file", 400)

        kind = upload_kind_for(body.get("filename"))
        if kind != "image":
            raise MomentiError("Use the streaming upload endpoint for non-image files", 415)
        image_cap = settings.MOMENTI_KIND_LIMIT_BYTES["image"]
        if len(buffer) > image_cap:
            raise MomentiError("Image exceeds the 12 MB limit", 413)
        enforce_storage_quota(request.user, len(buffer))

        try:
            name = sanitize_filename(body.get("filename"))
        except MomentiError:
            # Filename-less payloads (or unsupported extensions): fall back to
            # sniffing the binary signature so common image types still work.
            ext = sniff_image_ext(buffer)
            if not ext:
                raise
            name = f"{uuid.uuid4()}{ext}"

        root = _uploads_root()
        (root / name).write_bytes(buffer)
        Upload.objects.create(
            name=name,
            kind="image",
            size=len(buffer),
            original_name=str(body.get("filename") or "")[:255],
            uploaded_by=request.user,
        )
        return Response(
            {"file_url": f"/uploads/{name}", "url": f"/uploads/{name}"},
            status=201,
        )


class StreamUploadView(APIView):
    """PUT /api/uploads/stream?filename=<enc> — raw request body written
    straight to disk in chunks (no base64, no full-body buffering), then
    promoted atomically so partial uploads never become visible."""

    permission_classes = [IsAuthenticated]

    def put(self, request):
        raw_request = self.request._request  # underlying HttpRequest for streaming reads
        filename = request.query_params.get("filename") or ""
        kind = upload_kind_for(filename)
        if not kind:
            raise MomentiError(
                f"Unsupported file type. Allowed: {', '.join(ALLOWED_UPLOAD_EXT)}", 415
            )
        name = sanitize_filename(filename)
        limit = settings.MOMENTI_KIND_LIMIT_BYTES[kind]
        storage_allowance = storage_allowance_bytes(request.user)
        root = _uploads_root()
        final_path = root / name
        tmp_path = root / f"{name}.part"

        received = 0
        try:
            with open(tmp_path, "wb") as out:
                while True:
                    chunk = raw_request.read(1024 * 1024)
                    if not chunk:
                        break
                    received += len(chunk)
                    if received > limit:
                        raise MomentiError(
                            f"File exceeds the {round(limit / 1024 / 1024)} MB limit for {kind}s",
                            413,
                        )
                    if storage_allowance is not None and received > storage_allowance:
                        raise MomentiError(
                            "Media storage quota exceeded. Free up space or upgrade your plan.",
                            402,
                        )
                    out.write(chunk)
        except Exception:
            try:
                tmp_path.unlink()
            except OSError:
                pass
            raise

        if received == 0:
            try:
                tmp_path.unlink()
            except OSError:
                pass
            raise MomentiError("Empty upload", 400)

        os.replace(tmp_path, final_path)
        Upload.objects.create(
            name=name,
            kind=kind,
            size=received,
            original_name=str(filename)[:255],
            uploaded_by=request.user,
        )
        return Response(
            {
                "file_url": f"/uploads/{name}",
                "url": f"/uploads/{name}",
                "kind": kind,
                "bytes": received,
            },
            status=201,
        )


# --- Billing (SaaS Phase 2) -------------------------------------------------------


class BillingUsageView(APIView):
    """GET /api/billing/usage - the authenticated host's plan, usage meters and
    active subscription (null body.subscription when on the default free plan)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(billing_payload(request.user))


class BillingActivateView(APIView):
    """POST /api/billing/subscription/activate - the pre-PayMongo admin toggle.

    Body: {email, plan, days?}. Allowed only while MOMENTI_BILLING_MANUAL_ACTIVATION
    is on and the caller is staff/admin. Phase 3 adds a webhook that invokes
    grant_subscription() directly with provider='paymongo'.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not settings.MOMENTI_BILLING_MANUAL_ACTIVATION:
            raise MomentiError("Manual activation is disabled", 403)
        if not (request.user.is_staff or request.user.role == "admin"):
            raise MomentiError("Admin privileges required", 403)
        body = body_dict(request)
        email = str(body.get("email") or "").strip().lower()
        plan_code = str(body.get("plan") or "").strip()
        if not email or not plan_code:
            raise MomentiError("email and plan are required", 400)
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise MomentiError("User not found", 404)
        try:
            days = max(1, int(body.get("days") or 30))
        except (TypeError, ValueError):
            days = 30
        grant_subscription(user, plan_code, period_days=days)
        return Response(billing_payload(user))


class BillingCancelView(APIView):
    """POST /api/billing/subscription/cancel - stop renewal at period end."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        sub = active_subscription_for(request.user)
        if sub is None:
            raise MomentiError("No active subscription to cancel", 400)
        sub.cancel_at_period_end = True
        sub.save(update_fields=["cancel_at_period_end", "updated_date"])
        return Response(billing_payload(request.user))


class BillingCheckoutView(APIView):
    """POST /api/billing/checkout - create a PayMongo-hosted Checkout Session
    for a plan. The user pays on PayMongo's page; POST /api/billing/webhook
    grants the subscription when it is paid."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not paymongo_configured():
            raise MomentiError("Online billing is not configured yet", 503)
        body = body_dict(request)
        code = str(body.get("plan") or "").strip()
        plan = Plan.objects.filter(code=code).first()
        if plan is None:
            raise MomentiError("Unknown plan", 404)
        if plan.price_cents <= 0:
            raise MomentiError("This plan is free - no checkout needed", 400)
        sub = active_subscription_for(request.user)
        if sub is not None and sub.plan_id == plan.id and sub.status == "active":
            raise MomentiError("You are already on this plan", 400)
        reference = f"momenti-{uuid.uuid4().hex[:16]}"
        origin = settings.MOMENTI_PUBLIC_ORIGIN or f"{request.scheme}://{request.get_host()}"
        session = create_checkout_session(
            plan,
            request.user,
            reference,
            f"{origin}/studio/billing?status=success",
            f"{origin}/studio/billing?status=canceled",
        )
        session_data = (session.get("data") or {}).get("attributes") or {}
        checkout_url = session_data.get("checkout_url") or ""
        if not checkout_url:
            raise MomentiError("PayMongo did not return a checkout URL", 502)
        PendingCheckout.objects.create(
            reference=reference,
            user=request.user,
            plan=plan,
            provider_ref=str((session.get("data") or {}).get("id") or ""),
            period_days=billing_period_days(plan.billing_period),
        )
        return Response(
            {"checkout_url": checkout_url, "reference": reference, "plan": code}
        )


class BillingWebhookView(APIView):
    """POST /api/billing/webhook - PayMongo event delivery. Not bearer-auth'd:
    authenticity comes from the Paymongo-Signature header (HMAC-SHA256)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw = request.body or b""
        header = (
            request.headers.get("Paymongo-Signature")
            or request.headers.get("paymongo-signature")
            or ""
        )
        ok, reason = verify_webhook_signature(raw, header)
        if not ok:
            raise MomentiError(reason or "Invalid webhook signature", 400)
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            raise MomentiError("Malformed webhook payload", 400)
        handle_webhook_event(payload)
        return Response({"ok": True})


# --- Media / SPA hosting ----------------------------------------------------------


def serve_upload_media(request, rest=None):
    """GET /uploads/<name> — public, correct MIME, immutable caching, with the
    path-traversal guard from Node's serveUploads."""
    root = Path(settings.MEDIA_ROOT).resolve()
    rel = rest or ""
    if not rel:
        return HttpResponse('{"error": "Invalid path"}', status=400, content_type="application/json")
    try:
        target = (root / rel).resolve()
    except (ValueError, OSError):
        return HttpResponse('{"error": "Invalid path"}', status=400, content_type="application/json")
    if not str(target).startswith(str(root) + os.sep):
        return HttpResponse('{"error": "Invalid path"}', status=400, content_type="application/json")
    if not target.is_file():
        return HttpResponse('{"error": "File not found"}', status=404, content_type="application/json")

    mime = EXT_TO_MIME.get(target.suffix.lower(), "application/octet-stream")
    response = FileResponse(open(target, "rb"), content_type=mime)
    response["Cache-Control"] = "public, max-age=31536000, immutable"  # names carry a UUID prefix
    response["Content-Length"] = target.stat().st_size
    return response


SPA_MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json",
    ".txt": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json",
}


def _dist_not_found_response():
    return HttpResponse(
        "dist/ not found. Run `npm run build` first (or serve the built app separately).",
        status=503,
        content_type="text/plain; charset=utf-8",
    )


def spa_asset(request, path=None):
    """Optional single-port hosting of the built frontend (MOMENTI_DIST_DIR):
    serve real files out of dist/, everything else falls back to index.html —
    the same behaviour as `npm start`."""
    dist_dir = settings.MOMENTI_DIST_DIR
    if not dist_dir:
        if settings.DEBUG:
            raise Http404
        return _dist_not_found_response()

    root = Path(dist_dir).resolve()
    rel = (path or "").rstrip("/")
    try:
        target = (root / rel.lstrip("/")).resolve() if rel else root
    except (ValueError, OSError):
        return _dist_not_found_response()

    if str(target).startswith(str(root) + os.sep) and target.is_file():
        mime = SPA_MIME_TYPES.get(target.suffix.lower(), "application/octet-stream")
        response = FileResponse(open(target, "rb"), content_type=mime)
        response["Content-Length"] = target.stat().st_size
        return response

    index = root / "index.html"
    if index.is_file():
        response = FileResponse(open(index, "rb"), content_type="text/html; charset=utf-8")
        response["Content-Length"] = index.stat().st_size
        return response
    return _dist_not_found_response()








