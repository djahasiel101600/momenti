"""Assign existing invitations/uploads to a host account (SaaS backfill).

Because invitations were previously global, records created before the
tenancy switch have no `owner` set. Run once to claim them for the host:

    manage.py backfill_owner_home --email you@example.com
"""
from django.core.management.base import BaseCommand, CommandError

from core.models import Invitation, Upload, User


class Command(BaseCommand):
    help = "Claim unowned invitations/uploads for a host account (SaaS migration)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Host email to claim records for.")
        parser.add_argument(
            "--dry-run", action="store_true", help="Report what would change without writing."
        )

    def handle(self, *args, **options):
        try:
            user = User.objects.get(email__iexact=options["email"])
        except User.DoesNotExist:
            raise CommandError(f"No account with email {options['email']}")
        dry = options["dry_run"]
        if dry:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes written"))

        inv_qs = Invitation.objects.filter(owner__isnull=True)
        # Also claim records that only carry an owner_email string (pre-FK data).
        inv_qs = inv_qs | Invitation.objects.filter(owner__isnull=True, owner_email="")
        inv_qs = inv_qs.exclude(owner_email=user.email)
        inv_count = inv_qs.count()
        if inv_count and not dry:
            for inv in inv_qs:
                inv.owner = user
                inv.owner_email = user.email
                inv.save(update_fields=["owner", "owner_email"])
        self.stdout.write(f"Invitations claimed: {inv_count}")

        up_qs = Upload.objects.filter(uploaded_by__isnull=True)
        up_count = up_qs.count()
        if up_count and not dry:
            up_qs.update(uploaded_by=user)
        self.stdout.write(f"Uploads claimed: {up_count}")

        if not dry:
            self.stdout.write(self.style.SUCCESS("Backfill complete."))
