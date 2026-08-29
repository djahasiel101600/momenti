from django.contrib import admin

from .models import (
    Invitation,
    OtpCode,
    PendingPasswordReset,
    PendingRegistration,
    PendingCheckout,
    Plan,
    Subscription,
    Upload,
    User,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "role", "email_verified", "created_date")
    search_fields = ("email",)
    list_filter = ("role", "email_verified")


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("slug", "owner_email", "created_date", "updated_date")
    search_fields = ("slug", "owner_email")
    readonly_fields = ("created_date", "updated_date")


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "price_cents", "max_invitations", "max_storage_mb", "sort_order")
    ordering = ("sort_order", "code")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "status", "provider", "current_period_end", "cancel_at_period_end")
    search_fields = ("user__email",)
    list_filter = ("status", "provider", "plan")


@admin.register(PendingCheckout)
class PendingCheckoutAdmin(admin.ModelAdmin):
    list_display = ("reference", "user", "plan", "status", "created_date")
    search_fields = ("reference", "user__email")
    list_filter = ("status", "plan")


admin.site.register([OtpCode, PendingRegistration, PendingPasswordReset, Upload])
