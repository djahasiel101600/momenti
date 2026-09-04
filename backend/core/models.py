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
    STATUS_CHOICES = [("draft", "Draft"), ("published", "Published")]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="published")
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



class InvitationView(models.Model):
    """One row per invitation page view. Privacy-light: no fingerprint, no
    user-agent storage. A coarse per-day, per-ip bucket keeps hosts from
    accidentally identifying guests while still giving useful trend data."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invitation = models.ForeignKey(
        Invitation, on_delete=models.CASCADE, related_name="views"
    )
    viewer_hash = models.CharField(max_length=64, db_index=True)
    day = models.DateField(db_index=True)
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["invitation", "day"])]
        ordering = ["-created_date"]

    def __str__(self):
        return f"view:{self.invitation_id}:{self.day}"


class Plan(models.Model):
    """A billable tier. Price is in PHP centavos (0 = free); `None` limits mean
    unlimited. Feature flags drive Studio affordances (hide_branding will gate
    the 'Powered by momenti' badge; custom_domain is a future SaaS flag).
    """

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    price_cents = models.PositiveIntegerField(default=0)  # PHP centavos (0 = free)
    billing_period = models.CharField(max_length=10, default="month")  # month | year
    max_invitations = models.PositiveIntegerField(null=True, blank=True)  # None = unlimited
    max_storage_mb = models.PositiveIntegerField(null=True, blank=True)
    hide_branding = models.BooleanField(default=False)
    custom_domain = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "code"]

    def __str__(self):
        return self.code


class Subscription(models.Model):
    """A user's current plan entitlement. Provider-agnostic: `provider` names
    the billing source ('manual' before PayMongo, 'paymongo' in Phase 3) and
    `provider_ref` carries the provider's reference (checkout/webhook id). Only
    the checkout/webhook layer ever touches the provider, so swapping providers
    later means changing that layer, not this model.
    """

    STATUS_CHOICES = [
        ("active", "Active"),
        ("past_due", "Past due"),
        ("canceled", "Canceled"),
        ("trialing", "Trialing"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    provider = models.CharField(max_length=20, blank=True, default="manual")
    provider_ref = models.CharField(max_length=255, blank=True, default="")
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user_id}:{self.plan.code} ({self.status})"



class PendingCheckout(models.Model):
    """A checkout session created with PayMongo, keyed by its reference so the
    webhook can map payment success back to the user + plan (idempotent)."""

    reference = models.CharField(max_length=100, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="checkouts"
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="checkouts")
    status = models.CharField(max_length=10, default="pending")  # pending | paid | failed | expired
    provider_ref = models.CharField(max_length=255, blank=True, default="")
    period_days = models.PositiveIntegerField(default=30)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.reference} ({self.status})"


class Template(models.Model):
    """A shareable invitation design that any host can browse and import.

    `payload` is the flat invitation object (same shape the editor and API
    exchange) — identity fields are stripped on publish so importing always
    creates a fresh invitation owned by the importer. Built-in templates
    (wedding/birthday/gala) are seeded with ``source='built-in'``; designs
    shared by hosts use ``source='community'``.
    """

    SOURCE_CHOICES = [
        ("built-in", "Built-in"),
        ("community", "Community"),
    ]

    slug = models.CharField(max_length=120, unique=True)
    name = models.CharField(max_length=120)
    tagline = models.CharField(max_length=160, blank=True, default="")
    source = models.CharField(max_length=12, choices=SOURCE_CHOICES, default="community")
    accent_color = models.CharField(max_length=16, blank=True, default="")
    background_color = models.CharField(max_length=16, blank=True, default="")
    cover = models.CharField(max_length=255, blank=True, default="")
    payload = models.JSONField(default=dict)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shared_templates",
    )
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["source", "name"]

    def __str__(self):
        return f"{self.name} ({self.source})"


class SiteSettings(models.Model):
    """White-label overrides (admin console) layered over MOMENTI_* env defaults.

    Singleton row (pk=1). `data` holds only the values an admin has explicitly
    set from the Admin console's White-label tab; every read merges them on top
    of the env defaults (core.whitelabel), so an empty key falls back to env.
    """

    data = models.JSONField(default=dict, blank=True)
    updated_date = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="site_setting_updates",
    )

    def __str__(self):
        return "Site settings"
