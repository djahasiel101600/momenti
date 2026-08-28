"""WSGI entrypoint for hosting the momenti Django backend (e.g. waitress/gunicorn)."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "momenti.settings")

application = get_wsgi_application()
