from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Attach the admin log-tail ring buffer in every server worker so
        # /api/admin/logs captures lines from boot (idempotent).
        from . import logging_utils

        logging_utils.get_buffer()

