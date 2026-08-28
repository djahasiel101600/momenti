# syntax=docker/dockerfile:1
#
# momenti — single-container production build.
#
#   Stage 1 (node):  builds the React/Vite frontend into dist/
#   Stage 2 (python): Django + DRF + gunicorn serves the API, the uploaded
#                     media (volume at /data) AND the built SPA (MOMENTI_DIST_DIR),
#                     all behind one port — the shape cloudflared expects.
#
#   docker build -t momenti:latest .
#   docker compose up -d        (joins the external jdp-network)

########## 1) Frontend build ####################################################
FROM node:22-alpine AS web
WORKDIR /app

# Dependencies first so source edits don't bust the npm cache layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

########## 2) Python runtime ####################################################
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    MOMENTI_DATA_DIR=/data \
    MOMENTI_DIST_DIR=/app/dist \
    MOMENTI_DEBUG=off \
    PORT=8000

WORKDIR /app/backend

# Dependencies first (same layer-caching principle).
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./

# Admin static assets are baked into the image; runtime state (SQLite DB,
# uploaded media, the token-signing secret) lives in /data — mount a volume.
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput \
 && useradd --uid 1000 --create-home momenti \
 && mkdir -p /data \
 && chown -R momenti:momenti /app /data

COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

USER momenti
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
