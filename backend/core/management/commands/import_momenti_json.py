"""One-shot migration from the legacy Node backend's db.json.

Imports users (verifying their scrypt "salt:hash" password format through the
legacy hasher so existing passwords keep working) and invitations (preserving
ids, owner emails and timestamps). Uploaded files need no import: the default
MOMENTI_DATA_DIR is shared with the Node backend, so /uploads/<name> already
resolves.

    backend/.venv/Scripts/python backend/manage.py import_momenti_json
"""
import json
import uuid
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.hashers import MomentiLegacyScryptPasswordHasher
from core.models import Invitation, Rsvp, User
from core.serializers import RESERVED_FIELDS


def _parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


class Command(BaseCommand):
    help = "Import users and invitations from the legacy Node backend's db.json."

    def add_arguments(self, parser):
        parser.add_argument(
            "--db",
            default=None,
            help="Path to db.json (default: <MOMENTI_DATA_DIR>/db.json)",
        )
        parser.add_argument(
            "--skip-users",
            action="store_true",
            help="Import invitations only",
        )

    def handle(self, *args, **options):
        db_path = Path(options["db"]) if options["db"] else Path(settings.DATA_DIR) / "db.json"
        if not db_path.exists():
            raise CommandError(f"db.json not found at {db_path}")
        try:
            payload = json.loads(db_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"Could not parse {db_path}: {exc}")

        hasher = MomentiLegacyScryptPasswordHasher()

        if not options["skip_users"]:
            users = payload.get("users") or []
            for entry in users:
                email = str(entry.get("email") or "").strip().lower()
                if not email:
                    continue
                defaults = {
                    "role": entry.get("role") or "member",
                    "email_verified": bool(entry.get("email_verified", True)),
                    "full_name": entry.get("full_name") or "",
                }
                stored = entry.get("password_hash") or ""
                if ":" in stored:
                    salt, digest = stored.split(":", 1)
                    defaults["password"] = hasher.encode(digest, salt)
                user, created = User.objects.update_or_create(email=email, defaults=defaults)
                if created:
                    created_at = _parse_iso(entry.get("created_date"))
                    if created_at:
                        User.objects.filter(pk=user.pk).update(created_date=created_at)
            self.stdout.write(self.style.SUCCESS(f"Imported {len(users)} user(s)"))

        invitations = payload.get("invitations") or []
        for entry in invitations:
            try:
                invitation_id = uuid.UUID(str(entry.get("id")))
            except (ValueError, AttributeError, TypeError):
                invitation_id = uuid.uuid4()
            data = {k: v for k, v in entry.items() if k not in RESERVED_FIELDS}
            slug_value = data.get("slug")
            slug = str(slug_value) if slug_value is not None else None
            owner_email = entry.get("owner_email") or ""
            owner = User.objects.filter(email__iexact=owner_email).first() if owner_email else None
            invitation, created = Invitation.objects.get_or_create(
                pk=invitation_id,
                defaults={
                    "data": data,
                    "slug": slug,
                    "owner": owner,
                    "owner_email": owner_email,
                },
            )
            if created:
                created_at = _parse_iso(entry.get("created_date"))
                updated_at = _parse_iso(entry.get("updated_date")) or created_at
                updates = {}
                if created_at:
                    updates["created_date"] = created_at
                if updated_at:
                    updates["updated_date"] = updated_at
                if updates:
                    Invitation.objects.filter(pk=invitation_id).update(**updates)
        rsvps = payload.get("rsvps") or []
        for entry in rsvps:
            try:
                invitation_id = uuid.UUID(str(entry.get("invitation") or entry.get("invitation_id")))
            except (ValueError, AttributeError, TypeError):
                continue
            invitation = Invitation.objects.filter(pk=invitation_id).first()
            if invitation is None:
                continue
            email = str(entry.get("email") or "").strip().lower()
            if not email:
                continue
            try:
                guest_count = int(entry.get("guest_count") or 1)
            except (TypeError, ValueError):
                guest_count = 1
            Rsvp.objects.update_or_create(
                invitation=invitation,
                email=email,
                defaults={
                    "name": entry.get("name") or "Guest",
                    "attending": bool(entry.get("attending", True)),
                    "guest_count": guest_count,
                    "message": entry.get("message") or "",
                },
            )
        if rsvps:
            self.stdout.write(self.style.SUCCESS(f"Imported {len(rsvps)} RSVP(s)"))
        self.stdout.write(self.style.SUCCESS(f"Imported {len(invitations)} invitation(s)"))
