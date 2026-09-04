"""Apply env-driven plan pricing to the seeded plans.

MOMENTI_PRO_PRICE_CENTS (monthly price in centavos, PHP 499.00 = 49900)
overrides the Pro plan's price. The container entrypoint runs this right
after `migrate` so /studio/billing and the PayMongo checkout always agree on
the amount being charged. When set, the env value wins over price edits made
under /admin/ on every boot; leave it unset to manage the price via /admin
only.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import Plan


class Command(BaseCommand):
    help = (
        "Apply MOMENTI_PRO_PRICE_CENTS to the seeded Pro plan "
        "(monthly price in centavos; PHP 499.00 = 49900)."
    )

    def handle(self, *args, **options):
        raw = (getattr(settings, "MOMENTI_PRO_PRICE_CENTS", "") or "").strip()
        if not raw:
            self.stdout.write(
                "billing: MOMENTI_PRO_PRICE_CENTS unset - plan prices untouched"
            )
            return

        try:
            cents = int(raw)
        except ValueError:
            raise CommandError(
                "MOMENTI_PRO_PRICE_CENTS must be an integer in centavos "
                f"(PHP 499.00 = 49900), got {raw!r}"
            )
        if cents <= 0:
            raise CommandError(
                f"MOMENTI_PRO_PRICE_CENTS must be a positive amount in centavos, got {cents}"
            )

        plan = Plan.objects.filter(code="pro").first()
        if plan is None:
            raise CommandError(
                "No 'pro' plan found - run `manage.py migrate` first "
                "(the data migration seeds the free/pro plans)."
            )

        if plan.price_cents == cents:
            self.stdout.write(f"billing: pro already priced at {cents} centavos")
            return

        previous = plan.price_cents
        plan.price_cents = cents
        plan.save(update_fields=["price_cents"])
        self.stdout.write(
            self.style.SUCCESS(
                f"billing: pro price updated {previous} -> {cents} centavos "
                f"(PHP {cents / 100:.2f}/month)"
            )
        )
