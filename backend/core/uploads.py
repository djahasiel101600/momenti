"""Upload helpers: parity with server/api.mjs extension allowlist, size caps,
filename sanitization and image magic-byte sniffing."""
import os
import re
import uuid

from .errors import MomentiError

IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif")
AUDIO_EXT = (".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".flac")
VIDEO_EXT = (".mp4", ".m4v", ".webm", ".mov")
ALLOWED_UPLOAD_EXT = (*IMAGE_EXT, *AUDIO_EXT, *VIDEO_EXT)

EXT_TO_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".flac": "audio/flac",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}


def upload_kind_for(filename):
    ext = os.path.splitext(str(filename or ""))[1].lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in VIDEO_EXT:
        return "video"
    return None


def sanitize_filename(raw_name):
    """`<uuid>-<sanitized-base><ext>` exactly like Node's sanitizeFileName."""
    root, ext = os.path.splitext(str(raw_name or ""))
    ext = ext.lower()
    if ext not in ALLOWED_UPLOAD_EXT:
        raise MomentiError(
            f"Unsupported file type. Allowed extensions: {', '.join(ALLOWED_UPLOAD_EXT)}",
            415,
        )
    base = re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9-_]+", "-", root.lower()))[:80] or "image"
    return f"{uuid.uuid4()}-{base}{ext}"


def sniff_image_ext(buffer):
    """Magic-byte sniff used when the payload has no usable image filename."""
    if buffer[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if buffer[:2] == b"\xff\xd8":
        return ".jpg"
    if buffer[:3] == b"GIF":
        return ".gif"
    if buffer[:4] == b"RIFF" and buffer[8:12] == b"WEBP":
        return ".webp"
    return None
