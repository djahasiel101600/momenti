"""PayMongo provider adapter (SaaS Phase 3).

All provider-specific code lives here: checkout session creation, webhook
signature verification, and event handling. The rest of the app stays
provider-agnostic via core.billing.grant_subscription.

Signature: PayMongo signs webhooks with a ``Paymongo-Signature`` header of the
form ``<unix-seconds>.<hex>`` where ``hex = HMAC-SHA256(webhook_secret,
b"<unix-seconds>." + raw_body)``; we also enforce a timestamp window.
"""
import base64
import hashlib
import hmac
import json
import logging
import time
import urllib.error
import urllib.request

from django.conf import settings

from .errors import MomentiError

log = logging.getLogger("momenti")

_REQUEST_TIMEOUT = 10
_WEBHOOK_DRIFT_SECONDS = 300


def paymongo_configured():
    return bool(getattr(settings, "MOMENTI_PAYMONGO_SECRET_KEY", ""))


def _base_url():
    return getattr(settings, "MOMENTI_PAYMONGO_BASE_URL", "") or "https://api.paymongo.com/v1"


def _auth_header():
    secret = getattr(settings, "MOMENTI_PAYMONGO_SECRET_KEY", "")
    token = base64.b64encode((secret + ":").encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def paymongo_request(method, path, payload=None, timeout=_REQUEST_TIMEOUT):
    """Minimal JSON client for the PayMongo API. Raises MomentiError (with the
    provider's error detail when available) so views surface a clean message."""
    url = f"{_base_url()}/{path.lstrip('/')}"
    body = None
    headers = {"Authorization": _auth_header(), "Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            parsed = json.loads(exc.read().decode("utf-8"))
            errors = parsed.get("errors") or []
            if errors:
                detail = "; ".join(
                    str(e.get("detail") or e.get("message") or "") for e in errors
                )
        except Exception:
            pass
        raise MomentiError(detail or f"PayMongo request failed ({exc.code})", 502)
    except (urllib.error.URLError, TimeoutError, OSError):
        raise MomentiError("Could not reach PayMongo", 502)


def create_checkout_session(plan, user, reference, success_url, cancel_url):
    """Create a PayMongo-hosted Checkout Session (GCash / Maya / cards).

    The reference is supplied by the caller so the PendingCheckout row can be
    written before payment starts (the webhook maps it back to user + plan).
    """
    attributes = {
        "billing": {"email": user.email},
        "line_items": [
            {
                "currency": "PHP",
                "amount": plan.price_cents,
                "name": plan.name,
                "quantity": 1,
                "description": f"momenti {plan.name} - {plan.billing_period}ly",
            }
        ],
        "payment_method_types": ["gcash", "maya", "card"],
        "description": f"momenti {plan.name}",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "reference_number": reference,
        "show_line_items": True,
        "send_email_receipt": True,
        "statement_descriptor": "MOMENTI",
    }
    return paymongo_request(
        "POST", "checkout_sessions", {"data": {"attributes": attributes}}
    )


def verify_webhook_signature(raw_body, header_value):
    """Validate the Paymongo-Signature header for ``raw_body``.

    Returns ``(ok: bool, reason: str | None)`` and never raises, so callers
    pick the response shape.
    """
    secret = getattr(settings, "MOMENTI_PAYMONGO_WEBHOOK_SECRET", "")
    if not secret:
        return False, "Webhook verification is not configured"
    if not header_value or "." not in header_value:
        return False, "Missing or malformed Paymongo-Signature"
    timestamp, signature = header_value.split(".", 1)
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False, "Invalid signature timestamp"
    if abs(time.time() - ts) > _WEBHOOK_DRIFT_SECONDS:
        return False, "Signature timestamp outside the allowed window"
    message = f"{timestamp}.".encode("ascii") + bytes(raw_body)
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return False, "Signature mismatch"
    return True, None


def handle_webhook_event(body):
    """Process a verified PayMongo event. Idempotent: retries return an ack
    without re-granting. Returns a small dict for logging."""
    from .billing import billing_period_days, grant_subscription
    from .models import PendingCheckout

    data = (body or {}).get("data") or {}
    attributes = data.get("attributes") or {}
    event_type = attributes.get("type")
    resource = attributes.get("data") or {}
    attrs = resource.get("attributes") or {}

    if event_type == "checkout_session.payment.paid":
        reference = str(attrs.get("reference_number") or "")
        session_id = str(resource.get("id") or "")
        pending = PendingCheckout.objects.filter(reference=reference).first()
        if pending is None:
            log.warning("PayMongo webhook: unknown reference %r", reference)
            return {"ok": True, "ignored": "unknown_reference"}
        if pending.status == "paid":
            return {"ok": True, "ignored": "already_processed"}
        pending.status = "paid"
        pending.provider_ref = session_id or pending.provider_ref
        pending.save(update_fields=["status", "provider_ref", "updated_date"])
        grant_subscription(
            pending.user,
            pending.plan.code,
            period_days=billing_period_days(pending.plan.billing_period),
            provider="paymongo",
            provider_ref=session_id,
        )
        log.info("PayMongo webhook: granted %s -> %s", pending.user.email, pending.plan.code)
        return {"ok": True, "granted": True}

    if event_type == "payment.failed":
        reference = str(attrs.get("reference_number") or "")
        updated = PendingCheckout.objects.filter(reference=reference, status="pending").update(
            status="failed"
        )
        if updated:
            log.info("PayMongo webhook: marked %s failed", reference)
        return {"ok": True, "ignored": "payment.failed"}

    log.info("PayMongo webhook: unhandled event %s", event_type)
    return {"ok": True, "ignored": event_type or None}