#!/bin/sh
# momenti container entrypoint.
#
# Starts as root ONLY to bootstrap the mounted data directory's ownership
# (Docker creates missing host bind-mount dirs as root — that made SQLite
# fail with "unable to open database file"), then drops to the unprivileged
# runtime user (uid 1000) for the actual server — the same pattern the
# official postgres image uses.
set -e

DATA_DIR="${MOMENTI_DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  # The dir itself always (covers freshly created mounts); contents only
  # when the runtime user actually cannot write (cheap write probe).
  chown momenti:momenti "$DATA_DIR" 2>/dev/null || true
  if ! gosu momenti test -w "$DATA_DIR"; then
    echo "[momenti] fixing ownership of $DATA_DIR"
    chown -R momenti:momenti "$DATA_DIR"
  fi
  exec gosu momenti /bin/sh "$0"
fi

cd /app/backend

if [ -n "$MOMENTI_DIST_DIR" ] && [ ! -f "$MOMENTI_DIST_DIR/index.html" ]; then
  echo "[momenti] WARNING: MOMENTI_DIST_DIR=$MOMENTI_DIST_DIR has no index.html — the SPA will return 503"
fi

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

