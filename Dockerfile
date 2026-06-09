# Wayly production image — adds ClamAV (clamd + freshclam) to the Emergent base
# image so the upload-security pipeline in /app/backend/upload_security.py can
# stream every uploaded file (statements, family-wall photos, document vault) to
# a local virus scanner before it touches MongoDB / disk.
#
# The base image already contains: Python 3.11, Node 20, MongoDB client tools,
# nginx + supervisord, the React build, and the FastAPI app under /app.
# We extend it with the ClamAV stack and a small entrypoint that bootstraps a
# signature database before supervisord starts.
#
# Build:   docker build -t wayly:prod .
# Healthcheck: GET /api/health/clamav  →  {"ready": true, ...}

ARG BASE_IMAGE=fastapi_react_mongo_shadcn_base_image_cloud_arm:release-17042026-1
FROM ${BASE_IMAGE}

# Avoid interactive apt prompts.
ENV DEBIAN_FRONTEND=noninteractive

# --- ClamAV install ---------------------------------------------------------
# clamav-daemon  → /usr/sbin/clamd
# clamav-freshclam → /usr/bin/freshclam
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        clamav-daemon \
        clamav-freshclam \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The Debian package ships clamav-daemon already running on socket /var/run/clamav/clamd.ctl
# under the `clamav` user. We want clamd to also accept TCP loopback traffic so
# Python (clamd library) can probe both transports (matches CLAMAV_HOST / CLAMAV_PORT in .env).
COPY deploy/clamav/clamd.conf          /etc/clamav/clamd.conf
COPY deploy/clamav/freshclam.conf      /etc/clamav/freshclam.conf

# Supervisor programmes — clamd + freshclam — sit alongside backend/frontend.
COPY deploy/clamav/supervisor-clamd.conf       /etc/supervisor/conf.d/clamd.conf
COPY deploy/clamav/supervisor-freshclam.conf   /etc/supervisor/conf.d/freshclam.conf

# Make sure the socket directory exists and is writable by the clamav user even
# on a fresh container (tmpfs mounts can wipe /var/run on boot).
RUN install -d -o clamav -g clamav -m 0775 /var/run/clamav \
    && install -d -o clamav -g clamav -m 0755 /var/lib/clamav \
    && install -d -o clamav -g clamav -m 0755 /var/log/clamav \
    && chown -R clamav:clamav /etc/clamav

# Entrypoint that:
#   1. Re-creates /var/run/clamav (the bind-mounted tmpfs is wiped on boot).
#   2. Runs freshclam once (synchronous) so the signature DB exists before
#      supervisord starts clamd — otherwise clamd refuses to listen.
#   3. Hands off to the base image's CMD (which exec's supervisord).
COPY deploy/clamav/entrypoint.sh /usr/local/bin/wayly-entrypoint.sh
RUN chmod +x /usr/local/bin/wayly-entrypoint.sh

# Backend reads CLAMAV_ENABLED / CLAMAV_SOCKET / CLAMAV_HOST / CLAMAV_PORT from
# the runtime .env; we surface sane defaults here so a self-hosted operator
# doesn't need to set them. The .env file in /app/backend/.env takes precedence.
ENV CLAMAV_ENABLED=true \
    CLAMAV_SOCKET=/var/run/clamav/clamd.ctl \
    CLAMAV_HOST=127.0.0.1 \
    CLAMAV_PORT=3310 \
    CLAMAV_READY_FILE=/var/lib/clamav/main.cvd

ENTRYPOINT ["/usr/local/bin/wayly-entrypoint.sh"]
# Defer the actual command to the base image (typically `supervisord -n`).
CMD ["supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
