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
}

# --- momenti domain knobs (parity with server/api.mjs) ------------------------
MOMENTI_DEV_HELPERS = os.environ.get("MOMENTI_DEV_HELPERS", "").strip().lower() != "off"
MOMENTI_PUBLIC_ORIGIN = os.environ.get("MOMENTI_PUBLIC_ORIGIN", "").strip()
MOMENTI_DIST_DIR = os.environ.get("MOMENTI_DIST_DIR", "").strip()

MOMENTI_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000        # 30 days
MOMENTI_OTP_TTL = timedelta(minutes=10)                 # 10 minutes
MOMENTI_RESET_TTL = timedelta(hours=1)                  # 1 hour
MOMENTI_MAX_BODY_BYTES = 30 * 1024 * 1024               # headroom for base64 images
MOMENTI_KIND_LIMIT_BYTES = {
    "image": 12 * 1024 * 1024,
    "audio": 150 * 1024 * 1024,
    "video": 750 * 1024 * 1024,
}

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

