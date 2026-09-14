#!/bin/sh
# Wayly container entrypoint — bootstraps ClamAV before supervisord starts.
#
# Why this script exists:
#   * /var/run is typically a tmpfs and is wiped between container restarts,
#     so /var/run/clamav/clamd.ctl's parent directory may not exist.
#   * clamd refuses to start without a signature database. On a fresh container
#     the database directory is empty, so we must run freshclam at least once
#     (synchronously) before supervisord brings clamd up.
#   * The backend waits on /var/lib/clamav/main.cvd (or daily.cvd) before
#     accepting uploads, so the first freshclam fetch must complete before
#     uvicorn starts taking traffic. supervisord starts in priority order so
#     this entrypoint just needs to ensure the file exists before exec'ing
#     supervisord.

set -e

CLAMAV_DB_DIR="${CLAMAV_DB_DIR:-/var/lib/clamav}"
CLAMAV_RUN_DIR="${CLAMAV_RUN_DIR:-/var/run/clamav}"
CLAMAV_USER="${CLAMAV_USER:-clamav}"

# Skip everything if explicitly disabled (preview / staging may opt out).
if [ "${CLAMAV_ENABLED:-true}" = "false" ]; then
    echo "[wayly-entrypoint] CLAMAV_ENABLED=false — skipping ClamAV bootstrap"
    exec "$@"
fi

# 1) Recreate the socket directory if tmpfs wiped it.
if [ ! -d "$CLAMAV_RUN_DIR" ]; then
    install -d -o "$CLAMAV_USER" -g "$CLAMAV_USER" -m 0775 "$CLAMAV_RUN_DIR"
    echo "[wayly-entrypoint] recreated $CLAMAV_RUN_DIR"
fi

# 2) Make sure the DB directory is writable by the clamav user.
if [ ! -d "$CLAMAV_DB_DIR" ]; then
    install -d -o "$CLAMAV_USER" -g "$CLAMAV_USER" -m 0755 "$CLAMAV_DB_DIR"
fi
chown -R "$CLAMAV_USER:$CLAMAV_USER" "$CLAMAV_DB_DIR" || true

# 3) Initial signature fetch — only if no DB present. Subsequent updates are
#    handled by the supervisor-managed freshclam daemon.
if [ ! -f "$CLAMAV_DB_DIR/main.cvd" ] && [ ! -f "$CLAMAV_DB_DIR/main.cld" ] \
   && [ ! -f "$CLAMAV_DB_DIR/daily.cvd" ] && [ ! -f "$CLAMAV_DB_DIR/daily.cld" ]; then
    echo "[wayly-entrypoint] no ClamAV signatures found — running first freshclam fetch (this can take ~60s)"
    su -s /bin/sh "$CLAMAV_USER" -c "/usr/bin/freshclam --stdout --config-file=/etc/clamav/freshclam.conf" \
        || echo "[wayly-entrypoint] freshclam initial fetch failed — supervisor will retry in the background"
fi

echo "[wayly-entrypoint] ClamAV bootstrap complete — handing off to: $*"
exec "$@"
