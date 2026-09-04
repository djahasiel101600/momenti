"""White-label resolution: MOMENTI_* env defaults + admin DB overrides.

Layering (later wins):
1. Env defaults from django.conf.settings (MOMENTI_BUSINESS_*, MOMENTI_BRAND_*)
2. DB overrides (SiteSettings singleton) set from /admin -> White-label

Blank override values are skipped, so clearing a field in the admin console
falls back to the env default (or the built-in fallback when env is blank
too). All free-text is length-capped; URL fields only accept http(s) URLs or
root-relative paths and accent colors must be hex — both go into href/src or
CSS custom properties, so they are validated rather than trusted.
"""
import re

from django.conf import settings

BUSINESS_TEXT_KEYS = ("name", "tagLine", "contactEmail", "sampleLink")
BRANDING_KEYS = ("accentColor", "accentHoverColor", "faviconUrl", "logoUrl")

_HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

MAX_TEXT = 280
MAX_URL = 500


def env_business():
    """Business defaults from environment (never None — blanks stay blank)."""
    return {
        "name": settings.MOMENTI_BUSINESS_NAME,
        "tagLine": settings.MOMENTI_BUSINESS_TAGLINE,
        "contactEmail": settings.MOMENTI_BUSINESS_CONTACT_EMAIL,
        "locations": list(settings.MOMENTI_BUSINESS_LOCATIONS),
        "socials": [dict(s) for s in settings.MOMENTI_BUSINESS_SOCIALS],
        "sampleLink": settings.MOMENTI_HERO_SAMPLE_LINK,
    }


def env_branding():
    return {
        "accentColor": settings.MOMENTI_BRAND_ACCENT_COLOR,
        "accentHoverColor": settings.MOMENTI_BRAND_ACCENT_HOVER_COLOR,
        "faviconUrl": settings.MOMENTI_BRAND_FAVICON_URL,
        "logoUrl": settings.MOMENTI_BRAND_LOGO_URL,
    }


def current_overrides():
    """What admins have explicitly set ({} when never touched).

    Groups whose stored values are all blank are omitted, mirroring the PUT
    response shape — so a reset leaves {} rather than empty placeholder dicts.
    """
    from .models import SiteSettings

    try:
        obj = SiteSettings.objects.get(pk=1)
    except SiteSettings.DoesNotExist:
        return {}
    data = obj.data if isinstance(obj.data, dict) else {}
    overrides = {}
    for group in ("business", "branding"):
        values = data.get(group)
        if isinstance(values, dict) and values:
            overrides[group] = dict(values)
    return overrides


def resolved():
    """Env defaults merged with DB overrides — the public truth."""
    business = env_business()
    branding = env_branding()
    overrides = current_overrides()
    ob = overrides.get("business") or {}
    obb = overrides.get("branding") or {}

    for key in BUSINESS_TEXT_KEYS:
        val = str(ob.get(key) or "").strip()
        if val:
            business[key] = val

    locs = ob.get("locations")
    if isinstance(locs, list):
        cleaned = [str(x).strip() for x in locs if str(x).strip()]
        if cleaned:
            business["locations"] = cleaned

    socials = ob.get("socials")
    if isinstance(socials, list):
        cleaned = []
        for item in socials:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            url = str(item.get("url") or "").strip()
            if name and url:
                cleaned.append({"name": name[:80], "url": url[:MAX_URL]})
        if cleaned:
            business["socials"] = cleaned

    for key in BRANDING_KEYS:
        val = str(obb.get(key) or "").strip()
        if val:
            branding[key] = val

    return {"business": business, "branding": branding}


# --- PUT validation ------------------------------------------------------------


def _clean_text(value, cap=MAX_TEXT):
    return str(value if value is not None else "").strip()[:cap]


def _clean_url(value, field):
    s = _clean_text(value, MAX_URL)
    if not s:
        return ""
    if not (s.startswith("http://") or s.startswith("https://") or s.startswith("/")):
        raise ValueError(f"{field} must be an http(s) URL or a /relative path")
    return s


def _clean_color(value, field):
    s = _clean_text(value, 32)
    if not s:
        return ""
    if not _HEX_COLOR_RE.match(s):
        raise ValueError(f"{field} must be a hex color like #C58A58")
    return s.lower()


def clean_overrides(data):
    """Validate a PUT body -> overrides dict containing only non-blank values.

    Raises ValueError with a user-facing message on bad input.
    """
    if not isinstance(data, dict):
        raise ValueError("Body must be a JSON object")
    business_in = data.get("business") if isinstance(data.get("business"), dict) else {}
    branding_in = data.get("branding") if isinstance(data.get("branding"), dict) else {}

    business = {}
    for key in BUSINESS_TEXT_KEYS:
        val = _clean_text(business_in.get(key))
        if key == "contactEmail" and val and ("@" not in val or " " in val):
            raise ValueError("contactEmail must be an email address")
        if key == "sampleLink":
            val = _clean_url(val, "sampleLink")
        if val:
            business[key] = val

    raw_locs = business_in.get("locations")
    if isinstance(raw_locs, str):
        raw_locs = raw_locs.split(",")
    if isinstance(raw_locs, list):
        locs = [_clean_text(x, 120) for x in raw_locs]
        locs = [x for x in locs if x]
        if locs:
            business["locations"] = locs

    raw_socials = business_in.get("socials")
    if isinstance(raw_socials, list):
        socials = []
        for item in raw_socials[:12]:
            if not isinstance(item, dict):
                continue
            name = _clean_text(item.get("name"), 80)
            url = _clean_url(item.get("url"), "social URL")
            if name and url:
                socials.append({"name": name, "url": url})
        if socials:
            business["socials"] = socials

    branding = {}
    for key in BRANDING_KEYS:
        val = (
            _clean_color(branding_in.get(key), key)
            if key in ("accentColor", "accentHoverColor")
            else _clean_url(branding_in.get(key), key)
        )
        if val:
            branding[key] = val

    # A group appears in the stored overrides when the request included it
    # (explicitly clearing fields), and is omitted when the group itself was
    # empty — so an all-empty PUT resets to env defaults instead of shadowing
    # them with empty dicts.
    overrides = {}
    if business_in:
        overrides["business"] = business
    if branding_in:
        overrides["branding"] = branding
    return overrides
