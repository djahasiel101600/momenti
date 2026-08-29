"""
Django settings for the momenti backend.

Environment knobs (all optional; mirroring the legacy Node server):

  MOMENTI_DATA_DIR       data dir holding the SQLite DB, uploaded media and the
                         signing secret (default: <repo>/server/data — shared
                         with the legacy Node backend so previously uploaded
                         media keeps working)
  DJANGO_SECRET_KEY      HMAC key for bearer tokens (default: generated once
                         and persisted to <DATA_DIR>/.django-secret)
  MOMENTI_DEBUG          "off"/"false"/"0" disables DEBUG (default on)
  MOMENTI_ALLOWED_HOSTS  comma-separated hosts (default localhost + testserver)
  MOMENTI_DEV_HELPERS    "off" stops surfacing OTP codes / reset links
  MOMENTI_PUBLIC_ORIGIN  origin used in generated password-reset links
  MOMENTI_DIST_DIR       when set, Django also hosts the built frontend (dist/)
                         with SPA fallback, replacing `npm start`
"""
import os
import secrets
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent      # backend/
REPO_ROOT = BASE_DIR.parent                            # repo root

DATA_DIR = Path(os.environ.get("MOMENTI_DATA_DIR") or (REPO_ROOT / "server" / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_secret_key():
    """Bearer tokens are HMAC-signed with SECRET_KEY. Persist one per install
    (like the Node backend's .session-secret) so sessions survive restarts."""
    from_env = os.environ.get("DJANGO_SECRET_KEY")
    if from_env:
        return from_env
    secret_file = DATA_DIR / ".django-secret"
    if secret_file.exists():
        stored = secret_file.read_text(encoding="utf-8").strip()
        if len(stored) >= 32:
            return stored
    generated = secrets.token_hex(48)
    try:
        secret_file.write_text(generated, encoding="utf-8")
        try:
            os.chmod(secret_file, 0o600)
        except OSError:
            pass
    except OSError:
        pass
    return generated


SECRET_KEY = _load_secret_key()
DEBUG = os.environ.get("MOMENTI_DEBUG", "").strip().lower() not in {"off", "false", "0", "no"}
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get(
        "MOMENTI_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1],testserver"
    ).split(",")
    if host.strip()
]

# Behind the Cloudflare tunnel: cloudflared always sends X-Forwarded-Proto,
# so Django can report request.is_secure()/absolute URLs as https. The header
# is only honored when present, so local development is unaffected.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Admin logins (and any cookie-based flow) POST through the tunnel — the
# browser's https Origin must be trusted explicitly. The app's own API is
# bearer-token based and does not use CSRF.
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("MOMENTI_CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "core",
]

MIDDLEWARE = [
    "core.middleware.MomentiCorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "momenti.urls"
WSGI_APPLICATION = "momenti.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# Database: SQLite by default (zero-config, single file in the data dir).
# Set MOMENTI_DB_ENGINE=postgres for the SaaS posture — docker-compose bundles
# a postgres service (see README for the SQLite -> Postgres data migration).
if os.environ.get("MOMENTI_DB_ENGINE", "").strip().lower() == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("MOMENTI_DB_NAME", "momenti"),
            "USER": os.environ.get("MOMENTI_DB_USER", "momenti"),
            "PASSWORD": os.environ.get("MOMENTI_DB_PASSWORD", ""),
            "HOST": os.environ.get("MOMENTI_DB_HOST", "postgres"),
            "PORT": os.environ.get("MOMENTI_DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": DATA_DIR / "django.sqlite3",
        }
    }

AUTH_USER_MODEL = "core.User"

# Django's PBKDF2 is the preferred (new) hashing scheme; the legacy scrypt
# hasher at the end verifies accounts imported from the Node db.json and
# transparently upgrades them to PBKDF2 on the next successful login.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
    "core.hashers.MomentiLegacyScryptPasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["core.auth.BearerAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["core.parsers.MomentiJSONParser"],
    "EXCEPTION_HANDLER": "core.exceptions.momenti_exception_handler",
    # Public endpoints (register / resend-otp / reset-password / rsvp) are
    # throttled per-IP to blunt email-bombing and RSVP spam. Anonymous for
    # unauthenticated callers, scoped for the authenticated ones.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("MOMENTI_THROTTLE_ANON", "20/minute"),
        "user": os.environ.get("MOMENTI_THROTTLE_USER", "60/minute"),
        "otp": os.environ.get("MOMENTI_THROTTLE_OTP", "5/minute"),
        "rsvp": os.environ.get("MOMENTI_THROTTLE_RSVP", "10/minute"),
        "login": os.environ.get("MOMENTI_THROTTLE_LOGIN", "10/minute"),
    },
}

# --- momenti domain knobs (parity with server/api.mjs) ------------------------
MOMENTI_DEV_HELPERS = os.environ.get("MOMENTI_DEV_HELPERS", "").strip().lower() != "off"
MOMENTI_PUBLIC_ORIGIN = os.environ.get("MOMENTI_PUBLIC_ORIGIN", "").strip()
MOMENTI_DIST_DIR = os.environ.get("MOMENTI_DIST_DIR", "").strip()

MOMENTI_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000        # 30 days
MOMENTI_OTP_TTL = timedelta(minutes=10)                 # 10 minutes
MOMENTI_RESET_TTL = timedelta(hours=1)                  # 1 hour
MOMENTI_MAX_BODY_BYTES = 30 * 1024 * 1024               # headroom for base64 images
# Django rejects request bodies (incl. JSON) above DATA_UPLOAD_MAX_MEMORY_SIZE
# with a bare 400 — the 2.5 MB default would block base64 image uploads, which
# routinely exceed it. Raise it to our own 30 MB API body cap.
DATA_UPLOAD_MAX_MEMORY_SIZE = MOMENTI_MAX_BODY_BYTES
MOMENTI_KIND_LIMIT_BYTES = {
    "image": 12 * 1024 * 1024,
    "audio": 150 * 1024 * 1024,
    "video": 750 * 1024 * 1024,
}

# --- SaaS billing (Phase 2) ------------------------------------------------------
# Quota enforcement (plan limits). Defaults ON; the legacy Node backend does not
# enforce quotas, and local dev can disable via env.
MOMENTI_QUOTA_ENFORCEMENT = (
    os.environ.get("MOMENTI_QUOTA_ENFORCEMENT", "").strip().lower() not in {"off", "false", "0", "no"}
)
# Manual admin activation toggle (pre-PayMongo). Turn OFF once the checkout /

# --- PayMongo billing (SaaS Phase 3) ---------------------------------------
MOMENTI_PAYMONGO_SECRET_KEY = os.environ.get("MOMENTI_PAYMONGO_SECRET_KEY", "").strip()
MOMENTI_PAYMONGO_WEBHOOK_SECRET = os.environ.get("MOMENTI_PAYMONGO_WEBHOOK_SECRET", "").strip()
MOMENTI_PAYMONGO_MODE = os.environ.get("MOMENTI_PAYMONGO_MODE", "test").strip().lower() or "test"
MOMENTI_PAYMONGO_BASE_URL = (
    os.environ.get("MOMENTI_PAYMONGO_BASE_URL", "").strip()
    or "https://api.paymongo.com/v1"
)
# webhook path is live so only the provider can grant plans.
MOMENTI_BILLING_MANUAL_ACTIVATION = (
    os.environ.get("MOMENTI_BILLING_MANUAL_ACTIVATION", "").strip().lower()
    not in {"off", "false", "0", "no"}
)

# --- Email (SMTP) --------------------------------------------------------------
# When MOMENTI_EMAIL_HOST is set, verification codes and password-reset links
# are sent by email and the dev helpers (dev_otp / dev_reset_link) disappear
# from API responses. Without it, the dev helpers remain the delivery channel.
MOMENTI_EMAIL_HOST = os.environ.get("MOMENTI_EMAIL_HOST", "").strip()
if MOMENTI_EMAIL_HOST:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = MOMENTI_EMAIL_HOST
    EMAIL_PORT = int(os.environ.get("MOMENTI_EMAIL_PORT", "587"))
    EMAIL_HOST_USER = os.environ.get("MOMENTI_EMAIL_USER", "").strip()
    EMAIL_HOST_PASSWORD = os.environ.get("MOMENTI_EMAIL_PASSWORD", "")
    EMAIL_USE_TLS = os.environ.get("MOMENTI_EMAIL_USE_TLS", "true").strip().lower() not in {"off", "false", "0", "no"}
    EMAIL_USE_SSL = os.environ.get("MOMENTI_EMAIL_USE_SSL", "").strip().lower() in {"on", "true", "1", "yes"}
    EMAIL_TIMEOUT = 15
    DEFAULT_FROM_EMAIL = os.environ.get("MOMENTI_EMAIL_FROM", "").strip() or f"momenti <no-reply@{MOMENTI_EMAIL_HOST}>"
else:
    EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# --- Legal pages ------------------------------------------------------------------------
# Optional absolute URLs. When set, the SPA footer and auth pages link to them.
# When blank, those links hide themselves — safe for a self-hosted single-user
# install that doesn't need legal pages.
MOMENTI_TERMS_URL = os.environ.get("MOMENTI_TERMS_URL", "").strip()
MOMENTI_PRIVACY_URL = os.environ.get("MOMENTI_PRIVACY_URL", "").strip()

# --- i18n / tz / static / media ------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_ROOT = DATA_DIR / "uploads"
MEDIA_URL = "/uploads/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
APPEND_SLASH = False  # API routes are exact paths with no trailing slash

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "momenti": {"format": "[momenti] {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "momenti"},
    },
    "loggers": {
        "momenti": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

