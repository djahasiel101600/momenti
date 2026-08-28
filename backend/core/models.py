"""Database models for the momenti backend.

The legacy Node backend stored everything in one JSON file; these models
mirror that wire format exactly so the React frontend needs no changes:

- User: email login, UUID pk, `created_date`/`role`/`full_name` exposed in API
  responses the same way `publicUser()` did.
- Invitation: the editor's flat, schemaless payload lives in `data` (JSONField)
  with `slug` promoted to a real unique column for conflict checks/filtering;
  `owner_email`, `created_date`, `updated_date` are stamped like Node did.
- OtpCode / PendingRegistration / PendingPasswordReset: transient auth state
  (codes and reset tokens are stored hashed, matching the Node behaviour).
- Upload: metadata registry for uploaded media (files themselves live under
  MEDIA_ROOT/uploads and are served by a dedicated view).
"""
import uuid

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", "admin")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("email_verified", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True, default="")
    role = models.CharField(max_length=50, default="member")
    created_date = models.DateTimeField(auto_now_add=True)
    email_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email


class Invitation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Full editor payload (sections, theme, music, gallery, ...). Kept
    # schemaless on purpose: the frontend's normalizeInvitation() owns the
    # migration of legacy records, so the backend must round-trip faithfully.
    data = models.JSONField(default=dict, blank=True)
    slug = models.CharField(max_length=255, blank=True, null=True, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="invitations",
    )
    owner_email = models.EmailField(blank=True, default="")
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.slug or str(self.pk)


class OtpCode(models.Model):
    """One pending verification code per email (resend overwrites, like the
    Node `pendingOtps` map). The plaintext code is never stored."""

    email = models.EmailField(unique=True)
    code_hash = models.CharField(max_length=64)  # sha256 hex
    expires_at = models.DateTimeField()

    def __str__(self):
        return self.email


class PendingRegistration(models.Model):
    """Credentials queued at /auth/register until the OTP is verified."""

    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)  # Django-encoded password
    expires_at = models.DateTimeField()

    def __str__(self):
        return self.email


class PendingPasswordReset(models.Model):
    token_hash = models.CharField(max_length=64, unique=True)  # sha256 hex
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_resets")
    expires_at = models.DateTimeField()

    def __str__(self):
        return f"reset:{self.user_id}"


class Rsvp(models.Model):
    """One guest's response to an invitation.

    Guests reply through the public API (no account needed); re-submitting
    with the same email for the same invitation UPDATES their response, so
    the host always sees each invitee's latest answer. The host reads
    responses through the authenticated list endpoint (dashboard).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invitation = models.ForeignKey(Invitation, on_delete=models.CASCADE, related_name="rsvps")
    name = models.CharField(max_length=255)
    email = models.EmailField()
    attending = models.BooleanField(default=True)
    guest_count = models.PositiveIntegerField(default=1)
    message = models.TextField(blank=True, default="")
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["invitation", "email"], name="uniq_rsvp_per_invitee"),
        ]
        ordering = ["-created_date"]

    def __str__(self):
        return f"{self.name} -> {self.invitation_id}"


class Upload(models.Model):
    KIND_CHOICES = [("image", "image"), ("audio", "audio"), ("video", "video")]

    name = models.CharField(max_length=255, unique=True)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, blank=True, default="")
    size = models.BigIntegerField(default=0)
    original_name = models.CharField(max_length=255, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploads",
    )
    created_date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
