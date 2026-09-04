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


def payment_method_types():
    """Payment methods offered at checkout, env-configurable via
    MOMENTI_PAYMONGO_METHODS (comma-separated). Per PayMongo's docs the type
    strings are gcash / paymaya / card / grab_pay / qrph / billease / brankas
    — Maya is "paymaya" (the "maya" string is not a documented type). New
    accounts often start with GCash/Maya only — remove 'card' until card
    payments are activated, or session creation is rejected with a 400."""
    methods = getattr(settings, "MOMENTI_PAYMONGO_METHODS", None) or ["gcash", "paymaya", "card"]
    return [str(m).strip() for m in methods if str(m).strip()]


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
        "payment_method_types": payment_method_types(),
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


def create_qrph_intent(plan, user, reference):
    """Native QR Ph flow (SariStore-POS style): create a PaymentIntent limited
    to "qrph", create the QR Ph payment method, attach it, and hand back the
    Base64 QR code image so the buyer can scan it directly on our Billing
    page — no redirect to PayMongo's hosted checkout.

    Returns (payment_intent_id, attach_response). The caller stores the
    intent id as PendingCheckout.provider_ref so the payment.paid webhook can
    map the payment back to the plan grant."""
    intent = paymongo_request(
        "POST",
        "payment_intents",
        {
            "data": {
                "attributes": {
                    "amount": plan.price_cents,
                    "currency": "PHP",
                    "payment_method_allowed": ["qrph"],
                    "description": f"momenti {plan.name}",
                    "statement_descriptor": "MOMENTI",
                    "metadata": {"reference": reference},
                }
            }
        },
    )
    intent_data = intent.get("data") or {}
    intent_id = str(intent_data.get("id") or "")
    if not intent_id:
        raise MomentiError("PayMongo did not return a payment intent", 502)

    method = paymongo_request(
        "POST", "payment_methods", {"data": {"attributes": {"type": "qrph"}}}
    )
    method_id = str(((method.get("data") or {}).get("id")) or "")
    if not method_id:
        raise MomentiError("PayMongo did not return a payment method", 502)

    attached = paymongo_request(
        "POST",
        f"payment_intents/{intent_id}/attach",
        {"data": {"attributes": {"payment_method": method_id}}},
    )
    return intent_id, attached


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
    without re-granting. Returns a small dict for logging.

    Accepts both webhook payload shapes: the legacy one with the event type
    at ``data.attributes.type`` and the resource at ``data.attributes.data``,
    and the current Hosted Checkout one (docs.paymongo.com) with them at
    ``data.type`` and ``data.data``."""
    from .billing import billing_period_days, grant_subscription
    from .models import PendingCheckout

    data = (body or {}).get("data") or {}
    outer_attrs = data.get("attributes") or {}
    event_type = str(outer_attrs.get("type") or data.get("type") or "")
    resource = outer_attrs.get("data") or data.get("data") or {}
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

    if event_type == "payment.paid":
        # Payment Intent flow (native QR Ph on the Billing page). The payment
        # resource links back via payment_intent_id, which we stored as
        # PendingCheckout.provider_ref when the QR was generated; the intent
        # metadata reference is the fallback.
        intent_id = str(attrs.get("payment_intent_id") or "")
        reference = str((attrs.get("metadata") or {}).get("reference") or "")
        pending = None
        if intent_id:
            pending = PendingCheckout.objects.filter(provider_ref=intent_id).first()
        if pending is None and reference:
            pending = PendingCheckout.objects.filter(reference=reference).first()
        if pending is None:
            log.warning(
                "PayMongo webhook: payment.paid for unknown intent %r", intent_id
            )
            return {"ok": True, "ignored": "unknown_reference"}
        if pending.status == "paid":
            return {"ok": True, "ignored": "already_processed"}
        payment_id = str(resource.get("id") or "")
        pending.status = "paid"
        if payment_id:
            pending.provider_ref = payment_id
        pending.save(update_fields=["status", "provider_ref", "updated_date"])
        grant_subscription(
            pending.user,
            pending.plan.code,
            period_days=billing_period_days(pending.plan.billing_period),
            provider="paymongo",
            provider_ref=payment_id or intent_id,
        )
        log.info(
            "PayMongo webhook: granted %s -> %s (payment.paid)",
            pending.user.email,
            pending.plan.code,
        )
        return {"ok": True, "granted": True}

    if event_type in ("payment.failed", "checkout_session.payment.failed"):
        reference = str(attrs.get("reference_number") or "")
        intent_id = str(attrs.get("payment_intent_id") or "")
        updated = 0
        if reference:
            updated = PendingCheckout.objects.filter(
                reference=reference, status="pending"
            ).update(status="failed")
        elif intent_id:
            updated = PendingCheckout.objects.filter(
                provider_ref=intent_id, status="pending"
            ).update(status="failed")
        if updated:
            log.info("PayMongo webhook: marked %s%s failed", reference, intent_id)
        return {"ok": True, "ignored": event_type}

    log.info("PayMongo webhook: unhandled event %s", event_type)
    return {"ok": True, "ignored": event_type or None}