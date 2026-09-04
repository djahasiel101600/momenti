"""Admin views — /api/admin/* endpoints. Admin-only (staff or role=admin).

Provides basic operational dashboards: overview counts, user management,
a database explorer, runtime config (redacted), and a log tail.
"""
import logging

from django.conf import settings
from django.db import connection
from django.db.models import Count, Sum

from rest_framework.response import Response
from rest_framework.views import APIView

from .admin_permissions import AdminOnly
from .errors import MomentiError
from .models import (
    Invitation,
    InvitationView,
    OtpCode,
    PendingCheckout,
    PendingPasswordReset,
    PendingRegistration,
    Plan,
    Rsvp,
    SiteSettings,
    Subscription,
    Template,
    Upload,
    User,
)

log = logging.getLogger("momenti")

CONFIG_KEYS = (
    "MOMENTI_DEBUG",
    "MOMENTI_QUOTA_ENFORCEMENT",
    "MOMENTI_BILLING_MANUAL_ACTIVATION",
    "MOMENTI_PAYMONGO_MODE",
    "MOMENTI_PAYMONGO_FLOW",
    "MOMENTI_PAYMONGO_METHODS",
    "MOMENTI_THROTTLE_ANON",
    "MOMENTI_THROTTLE_USER",
    "MOMENTI_THROTTLE_LOGIN",
    "MOMENTI_THROTTLE_OTP",
    "MOMENTI_THROTTLE_RSVP",
)


class AdminOverviewView(APIView):
    permission_classes = [AdminOnly]

    def get(self, request):
        total_users = User.objects.count()
        total_invitations = Invitation.objects.count()
        total_rsvps = Rsvp.objects.count()
        total_uploads = Upload.objects.count()
        total_storage = Upload.objects.aggregate(total=Sum("size"))["total"] or 0
        total_pending_checkouts = PendingCheckout.objects.filter(status="pending").count()
        total_plans = Plan.objects.count()
        active_subs = Subscription.objects.filter(status="active").count()
        paid = PendingCheckout.objects.filter(status="paid")
        paid_amount = sum(p.plan.price_cents for p in paid)
        recent_users = list(
            User.objects.order_by("-created_date")[:8].values(
                "id", "email", "role", "is_active", "created_date"
            )
        )
        users_with_invites = (
            User.objects.annotate(invite_count=Count("invitations", distinct=True))
            .filter(invite_count__gt=0)
            .count()
        )
        return Response(
            {
                "counts": {
                    "users": total_users,
                    "invitations": total_invitations,
                    "rsvps": total_rsvps,
                    "uploads": total_uploads,
                    "storage_bytes": total_storage,
                    "plans": total_plans,
                    "active_subscriptions": active_subs,
                    "pending_checkouts": total_pending_checkouts,
                    "paid_checkout_amount_cents": paid_amount,
                    "users_with_invitations": users_with_invites,
                },
                "recent_users": recent_users,
            }
        )
class AdminUsersView(APIView):
    permission_classes = [AdminOnly]

    def get(self, request):
        search = (request.query_params.get("search") or "").strip().lower()
        limit = min(int(request.query_params.get("limit", 50) or 50), 200)
        qs = User.objects.all().order_by("-created_date")
        if search:
            qs = qs.filter(email__icontains=search) | qs.filter(full_name__icontains=search)
        qs = qs.annotate(
            invite_count=Count("invitations", distinct=True),
            sub_count=Count("subscription"),
        )
        total = qs.count()
        users = []
        for u in qs[:limit]:
            users.append(
                {
                    "id": str(u.pk),
                    "email": u.email,
                    "full_name": u.full_name,
                    "role": u.role or "member",
                    "is_active": bool(u.is_active),
                    "is_staff": bool(u.is_staff),
                    "created_date": u.created_date.isoformat() if u.created_date else "",
                    "invitation_count": u.invite_count,
                    "subscription_count": u.sub_count,
                }
            )
        return Response({"total": total, "users": users})

    def patch(self, request, user_id):
        body = request.data
        try:
            target = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError):
            raise MomentiError("User not found", 404)
        if target.pk == request.user.pk:
            raise MomentiError("You cannot modify your own admin account here", 400)
        if "role" in body:
            new_role = str(body["role"] or "").strip().lower()
            if new_role not in ("member", "admin"):
                raise MomentiError("Role must be member or admin", 400)
            if new_role != "admin" and target.is_staff:
                active_admins = User.objects.filter(is_staff=True, is_active=True)
                if active_admins.count() <= 1:
                    raise MomentiError("Cannot demote the last active admin", 400)
            target.role = new_role
            target.is_staff = new_role == "admin"
        if "is_active" in body:
            new_active = bool(body["is_active"])
            if target.is_staff and target.is_active and not new_active:
                active_admins = User.objects.filter(is_staff=True, is_active=True)
                if active_admins.count() <= 1:
                    raise MomentiError("Cannot deactivate the last active admin", 400)
            target.is_active = new_active
        target.save(update_fields=["role", "is_staff", "is_active"])
        return Response(
            {
                "id": str(target.pk),
                "email": target.email,
                "role": target.role or "member",
                "is_active": bool(target.is_active),
                "is_staff": bool(target.is_staff),
            }
        )


class AdminDatabaseView(APIView):
    """Schema + per-table row counts (a lightweight database explorer)."""

    permission_classes = [AdminOnly]

    def get(self, request):
        labels = {}
        for model in (
            User,
            Invitation,
            Rsvp,
            InvitationView,
            Upload,
            Plan,
            Subscription,
            PendingCheckout,
            Template,
            OtpCode,
            PendingRegistration,
            PendingPasswordReset,
        ):
            labels[model._meta.db_table] = model.__name__
        views = {}
        with connection.cursor() as cursor:
            if connection.vendor == "postgresql":
                cursor.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' ORDER BY table_name"
                )
                tables = [row[0] for row in cursor.fetchall()]
            else:
                # SQLite / dev — list app tables from sqlite_master.
                cursor.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
                tables = [row[0] for row in cursor.fetchall()]
            for table in tables:
                try:
                    cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
                    count = cursor.fetchone()[0]
                except Exception:
                    count = None
                views[table] = {"rows": count}
        tables_out = []
        for name in sorted(views.keys()):
            tables_out.append(
                {"name": name, "label": labels.get(name, name), "rows": views[name]["rows"]}
            )
        return Response({"tables": tables_out})


class AdminConfigView(APIView):
    """Live MOMENTI_* runtime config (names + values, secrets redacted)."""

    permission_classes = [AdminOnly]

    def get(self, request):
        cfg = {}
        for key in CONFIG_KEYS:
            raw = getattr(settings, key, None)
            if key.endswith("SECRET_KEY") or key.endswith("WEBHOOK_SECRET"):
                cfg[key] = "***" if raw else None
                continue
            if isinstance(raw, (list, tuple)):
                cfg[key] = list(raw)
            elif isinstance(raw, bool) or raw in (None,):
                cfg[key] = raw
            else:
                cfg[key] = str(raw) if raw not in ("", None) else None
        return Response({"config": cfg})


class AdminLogsView(APIView):
    """Tail the in-memory log ring buffer (see logging_utils.get_buffer)."""

    permission_classes = [AdminOnly]

    def get(self, request):
        from .logging_utils import get_buffer

        try:
            lines = list(get_buffer().lines)
        except Exception:
            lines = []
        return Response({"logs": lines[-200:]})


class SiteSettingsView(APIView):
    """White-label business + branding: admin overrides over env defaults."""

    permission_classes = [AdminOnly]

    def get(self, request):
        from . import whitelabel

        return Response(
            {
                "settings": whitelabel.resolved(),
                "overrides": whitelabel.current_overrides(),
                "defaults": {
                    "business": whitelabel.env_business(),
                    "branding": whitelabel.env_branding(),
                },
            }
        )

    def put(self, request):
        from . import whitelabel

        data = request.data if isinstance(request.data, dict) else {}
        try:
            cleaned = whitelabel.clean_overrides(data)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)
        obj, _ = SiteSettings.objects.get_or_create(pk=1)
        obj.data = cleaned
        obj.updated_by = request.user if request.user.is_authenticated else None
        obj.save()
        log.info("site settings updated by %s", getattr(request.user, "email", "anonymous"))
        return Response({"overrides": cleaned, "settings": whitelabel.resolved()})
