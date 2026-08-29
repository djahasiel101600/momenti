"""Seed the default SaaS plans (free / pro).

Phase 2 ships with two tiers. `billing_activate --plan <code>` and the admin
panel let the host grant a plan before the PayMongo checkout path exists.
RunPython is idempotent (get_or_create) so re-applying is a no-op.
"""
from django.db import migrations


def seed_plans(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    defaults = {
        "free": {
            "name": "Free",
            "price_cents": 0,
            "billing_period": "month",
            "max_invitations": 1,
            "max_storage_mb": 200,
            "hide_branding": False,
            "custom_domain": False,
            "sort_order": 0,
        },
        "pro": {
            "name": "Pro",
            "price_cents": 49900,  # PHP 499.00 / month — tune here or in /admin
            "billing_period": "month",
            "max_invitations": 10,
            "max_storage_mb": 5 * 1024,  # 5 GB
            "hide_branding": True,
            "custom_domain": False,
            "sort_order": 10,
        },
    }
    for code, fields in defaults.items():
        Plan.objects.get_or_create(code=code, defaults=fields)


def unseed_plans(apps, schema_editor):
    Plan = apps.get_model("core", "Plan")
    Plan.objects.filter(code__in=("free", "pro")).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_plan_subscription"),
    ]

    operations = [
        migrations.RunPython(seed_plans, unseed_plans),
    ]