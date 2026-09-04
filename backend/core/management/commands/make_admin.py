"""Grant (or revoke) administrator access for an account.

Bootstrap path for the operations console at /admin: the API never grants
admin on its own — registration always creates members and role/staff fields
are ignored on PATCH /api/auth/me — so the first administrator must be made
from the server shell (or via Django's built-in `createsuperuser`):

    manage.py make_admin --email host@example.com
    manage.py make_admin --email host@example.com --password s3cret!
    manage.py make_admin --email host@example.com --revoke
"""
from django.core.management.base import BaseCommand, CommandError

from core.models import User


class Command(BaseCommand):
    help = "Grant or revoke administrator access for an account (bootstrap for /admin)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Account email to promote.")
        parser.add_argument(
            "--password",
            default=None,
            help="Create the account with this password if it does not exist yet.",
        )
        parser.add_argument(
            "--revoke",
            action="store_true",
            help="Demote the account to a regular member instead.",
        )

    def handle(self, *args, **options):
        email = (options["email"] or "").strip().lower()
        if not email:
            raise CommandError("--email is required")
        if options["revoke"] and options["password"]:
            raise CommandError("--revoke and --password are mutually exclusive")

        user = User.objects.filter(email__iexact=email).first()
        created = False
        if user is None:
            if not options["password"]:
                raise CommandError(
                    f"No account with email {email}. Register it in the app first, "
                    "or pass --password to create it here."
                )
            user = User.objects.create_user(
                email, password=options["password"], role="member", email_verified=True
            )
            created = True

        if options["revoke"]:
            user.role = "member"
            user.is_staff = False
            user.is_superuser = False
            action = "revoked admin access from"
        else:
            user.role = "admin"
            user.is_staff = True
            action = "granted admin access to"

        user.save()
        self.stdout.write(
            self.style.SUCCESS(
                f"{'created' if created else 'updated'} {user.email}: {action} "
                f"(role={user.role}, is_staff={user.is_staff})"
            )
        )
