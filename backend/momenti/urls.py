"""URL configuration for the momenti Django backend.

Order matters: Django admin first, then the API/media routes from core.urls,
then the optional SPA catch-all that hosts the built frontend (dist/) the way
`npm start` used to.
"""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve as django_static_serve

from core.views import spa_asset

urlpatterns = [
    path("admin/", admin.site.urls),
]

if settings.STATIC_ROOT:
    urlpatterns.append(
        re_path(
            r"^static/(?P<path>.*)$",
            django_static_serve,
            {"document_root": str(settings.STATIC_ROOT)},
        )
    )

urlpatterns += [
    path("", include("core.urls")),
]

# SPA fallback last: serves dist/ assets + index.html when MOMENTI_DIST_DIR is
# configured, so a single Django process can host UI + API + media.
urlpatterns.append(re_path(r"^(?P<path>.*)$", spa_asset))
