"""Manually activate a plan for a user — the pre-PayMongo admin toggle.

Phase 2 lets the host grant/refresh plans from the CLI or the Django admin
(Subscription model) before the PayMongo checkout/webhook path exists. The
same entry point is used by the billing smoke test.

    manage.py billing_activate --email host@example.com --plan pro [--days 30]
"""
from django.core.management.base import BaseCommand, CommandError

from core.billing import grant_subscription
from core.models import Plan, User


class Command(BaseCommand):
    help = "Manually activate a plan for a user (pre-PayMongo admin toggle)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Account email to grant the plan to.")
        parser.add_argument("--plan", default="pro", help="Plan code (see core.models.Plan).")
        parser.add_argument("--days", type=int, default=30, help="Billing period length in days.")

    def handle(self, *args, **options):
        try:
            user = User.objects.get(email__iexact=options["email"])
        except User.DoesNotExist:
            raise CommandError(f"No account with email {options['email']}")
        if not Plan.objects.filter(code=options["plan"]).exists():
            raise CommandError(
                f"Unknown plan '{options['plan']}' — run `manage.py migrate` first "
                "(the data migration seeds the free/pro plans)."
            )
        sub = grant_subscription(user, options["plan"], period_days=max(1, options["days"]))
        self.stdout.write(
            self.style.SUCCESS(
                f"{user.email} -> {sub.plan.code} ({sub.status}), "
                f"period ends {sub.current_period_end}"
            )
        )