"""Billing: plans, subscriptions, quota enforcement, and manual activation.

Provider-agnostic by construction: `Subscription.provider` names the source
('manual' pre-PayMongo; 'paymongo' once the checkout/webhook layer lands) and
`provider_ref` holds the provider's reference. Nothing in this module calls a
provider — Phase 3 (checkout + webhook) sits on top of `grant_subscription`.

Quota enforcement is centralized here so every create/upload path shares one
implementation and the Phase 3 self-serve flows reuse it unchanged.
"""
from datetime import timedelta

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from .errors import MomentiError

_ONE_MB = 1024 * 1024


def billing_period_days(billing_period):
    return {"month": 30, "year": 365}.get(billing_period, 30)


def get_plan(code):
    from .models import Plan

    return Plan.objects.filter(code=code).first()


def default_plan():
    return get_plan("free")


def active_subscription_for(user):
    """The user's current entitlement, if any (None -> default free plan)."""
    from .models import Subscription

    return (
        Subscription.objects.filter(user=user, status__in=("active", "past_due"))
        .select_related("plan")
        .first()
    )


def plan_for_user(user):
    sub = active_subscription_for(user)
    return sub.plan if sub else default_plan()


def usage_for_user(user):
    from .models import Invitation, Upload

    invitations = Invitation.objects.filter(owner=user).count()
    storage_bytes = (
        Upload.objects.filter(uploaded_by=user).aggregate(total=Sum("size"))["total"] or 0
    )
    return {"invitations": invitations, "storage_bytes": storage_bytes}


def grant_subscription(user, plan_code, period_days=30, provider="manual", provider_ref=""):
    """Activate (or refresh) a plan for a user.

    This is the manual admin toggle used before the provider path exists; the
    webhook layer will call it too (with provider='paymongo' and the checkout's
    reference) once Phase 3 lands.
    """
    from .models import Plan, Subscription

    plan = Plan.objects.filter(code=plan_code).first()
    if plan is None:
        raise MomentiError(f"Unknown plan: {plan_code}", 400)
    now = timezone.now()
    sub, _created = Subscription.objects.update_or_create(
        user=user,
        defaults={
            "plan": plan,
            "status": "active",
            "provider": provider,
            "provider_ref": provider_ref or "",
            "current_period_start": now,
            "current_period_end": now + timedelta(days=period_days),
            "cancel_at_period_end": False,
        },
    )
    return sub


def enforce_invitation_quota(user):
    """402 when the user is at/over their invitation cap."""
    if not settings.MOMENTI_QUOTA_ENFORCEMENT:
        return
    plan = plan_for_user(user)
    if not plan or plan.max_invitations is None:
        return
    if usage_for_user(user)["invitations"] >= plan.max_invitations:
        raise MomentiError(
            f"You've reached the {plan.max_invitations} invitation limit on the "
            f"{plan.name} plan. Upgrade to create more invitations.",
            402,
        )


def storage_allowance_bytes(user):
    """Additional media bytes this user may upload right now, or None when
    unlimited (enforcement off / plan has no storage cap)."""
    if not settings.MOMENTI_QUOTA_ENFORCEMENT:
        return None
    plan = plan_for_user(user)
    if not plan or plan.max_storage_mb is None:
        return None
    max_bytes = plan.max_storage_mb * _ONE_MB
    used = usage_for_user(user)["storage_bytes"]
    return max(0, max_bytes - used)


def enforce_storage_quota(user, additional_bytes=0):
    allowance = storage_allowance_bytes(user)
    if allowance is not None and additional_bytes > allowance:
        plan = plan_for_user(user)
        raise MomentiError(
            f"Media storage quota exceeded on the {plan.name} plan "
            f"({plan.max_storage_mb} MB). Free up space or upgrade.",
            402,
        )


def billing_payload(user):
    """GET /api/billing/usage shape: current plan, usage meters, subscription."""
    from .serializers import iso_z

    plan = plan_for_user(user)
    usage = usage_for_user(user)
    sub = active_subscription_for(user)
    sub_payload = None
    if sub is not None:
        sub_payload = {
            "status": sub.status,
            "plan": sub.plan.code,
            "provider": sub.provider,
            "provider_ref": sub.provider_ref,
            "current_period_start": (
                iso_z(sub.current_period_start) if sub.current_period_start else None
            ),
            "current_period_end": (
                iso_z(sub.current_period_end) if sub.current_period_end else None
            ),
            "cancel_at_period_end": sub.cancel_at_period_end,
        }
    from .models import Plan as _Plan

    plans = [
        {
            "code": p.code,
            "name": p.name,
            "price_cents": p.price_cents,
            "billing_period": p.billing_period,
            "limits": {
                "max_invitations": p.max_invitations,
                "max_storage_mb": p.max_storage_mb,
            },
            "features": {
                "hide_branding": p.hide_branding,
                "custom_domain": p.custom_domain,
            },
        }
        for p in _Plan.objects.all()
    ]
    return {
        "plans": plans,
        "billing": {
            "provider": "paymongo",
            "mode": getattr(settings, "MOMENTI_PAYMONGO_MODE", "test"),
            "configured": bool(getattr(settings, "MOMENTI_PAYMONGO_SECRET_KEY", "")),
        },
        "plan": {
            "code": plan.code,
            "name": plan.name,
            "price_cents": plan.price_cents,
            "billing_period": plan.billing_period,
            "limits": {
                "max_invitations": plan.max_invitations,
                "max_storage_mb": plan.max_storage_mb,
            },
            "features": {
                "hide_branding": plan.hide_branding,
                "custom_domain": plan.custom_domain,
            },
        },
        "usage": {
            "invitations": usage["invitations"],
            "invitations_max": plan.max_invitations,
            "storage_bytes": usage["storage_bytes"],
            "storage_max_bytes": (plan.max_storage_mb or 0) * _ONE_MB,
        },
        "subscription": sub_payload,
    }