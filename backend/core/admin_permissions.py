from rest_framework.permissions import BasePermission


class AdminOnly(BasePermission):
    """Allow only staff or role=admin callers (mirrors BillingActivateView)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_staff or getattr(user, "role", "") == "admin")
        )