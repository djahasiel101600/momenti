from django.contrib import admin

from .models import Invitation, OtpCode, PendingPasswordReset, PendingRegistration, Upload, User


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


admin.site.register([OtpCode, PendingRegistration, PendingPasswordReset, Upload])
