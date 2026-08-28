#!/bin/sh
# momenti container entrypoint: apply migrations to the volume-backed SQLite
# database, then serve API + media + built SPA under gunicorn.
set -e
cd /app/backend

python manage.py migrate --noinput

exec gunicorn momenti.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --worker-tmp-dir /dev/shm \
  --workers "${GUNICORN_WORKERS:-2}" \
  --worker-class gthread \
  --threads "${GUNICORN_THREADS:-8}" \
  --timeout "${GUNICORN_TIMEOUT:-120}" \
  --access-logfile - \
  --error-logfile -
