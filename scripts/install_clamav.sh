#!/bin/sh
# install_clamav.sh — bring ClamAV (clamd + freshclam) up inside an already-
# running Debian/Ubuntu-based container without rebuilding the image.
#
# Use this when you cannot redeploy from the Dockerfile (e.g. the production
# pod is managed by Emergent and a full image rebuild is non-trivial). It is
# IDEMPOTENT — re-running it on a host that already has ClamAV installed will
# only reload supervisord with the latest configs.
#
# Run as root:
#   sudo /app/scripts/install_clamav.sh
#
# What it does:
#   1. apt-installs clamav-daemon + clamav-freshclam (if missing).
#   2. Drops the Wayly clamd.conf / freshclam.conf into /etc/clamav.
#   3. Ensures /var/run/clamav and /var/lib/clamav exist + are writable by clamav.
#   4. Runs freshclam ONCE synchronously to seed the signature DB.
#   5. Installs supervisor configs for clamd + freshclam.
#   6. Reloads supervisord and starts both programmes.
#   7. Verifies clamd is listening (unix socket + TCP loopback).

set -e

DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)/deploy/clamav"
SUPERVISOR_DIR="/etc/supervisor/conf.d"

if [ ! -d "$DEPLOY_DIR" ]; then
    echo "[install_clamav] ERROR: $DEPLOY_DIR not found — run from /app or update DEPLOY_DIR" >&2
    exit 1
fi

echo "[install_clamav] step 1/7 — apt install"
if ! command -v clamd >/dev/null 2>&1 || ! command -v freshclam >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        clamav-daemon clamav-freshclam ca-certificates
else
    echo "[install_clamav]   already installed — skipping"
fi

echo "[install_clamav] step 2/7 — drop Wayly clamd.conf and freshclam.conf"
install -m 0644 "$DEPLOY_DIR/clamd.conf"      /etc/clamav/clamd.conf
install -m 0644 "$DEPLOY_DIR/freshclam.conf"  /etc/clamav/freshclam.conf
chown -R clamav:clamav /etc/clamav

echo "[install_clamav] step 3/7 — ensure socket + DB directories exist"
install -d -o clamav -g clamav -m 0775 /var/run/clamav
install -d -o clamav -g clamav -m 0755 /var/lib/clamav
install -d -o clamav -g clamav -m 0755 /var/log/clamav

echo "[install_clamav] step 4/7 — initial freshclam fetch (synchronous)"
# If a freshclam daemon is already running (from a prior install) it will hold
# a lock; stop it before the synchronous fetch.
supervisorctl stop freshclam >/dev/null 2>&1 || true
if [ ! -f /var/lib/clamav/main.cvd ] && [ ! -f /var/lib/clamav/main.cld ] \
   && [ ! -f /var/lib/clamav/daily.cvd ] && [ ! -f /var/lib/clamav/daily.cld ]; then
    su -s /bin/sh clamav -c "/usr/bin/freshclam --stdout --config-file=/etc/clamav/freshclam.conf" \
        || echo "[install_clamav]   WARNING: freshclam fetch failed — supervisor will retry"
else
    echo "[install_clamav]   signatures already present — skipping initial fetch"
fi

echo "[install_clamav] step 5/7 — install supervisor configs"
install -m 0644 "$DEPLOY_DIR/supervisor-clamd.conf"      "$SUPERVISOR_DIR/clamd.conf"
install -m 0644 "$DEPLOY_DIR/supervisor-freshclam.conf"  "$SUPERVISOR_DIR/freshclam.conf"

echo "[install_clamav] step 6/7 — reload supervisord and start clamd + freshclam"
supervisorctl reread
supervisorctl update
supervisorctl restart clamd freshclam || supervisorctl start clamd freshclam || true

echo "[install_clamav] step 7/7 — wait for clamd to listen + verify"
ATTEMPTS=0
MAX_ATTEMPTS=30   # 30 × 2s = 60s
while [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; do
    if [ -S /var/run/clamav/clamd.ctl ] && nc -z 127.0.0.1 3310 2>/dev/null; then
        break
    fi
    sleep 2
    ATTEMPTS=$((ATTEMPTS + 1))
done

if [ -S /var/run/clamav/clamd.ctl ]; then
    echo "[install_clamav] ✅ unix socket up: /var/run/clamav/clamd.ctl"
else
    echo "[install_clamav] ⚠️  unix socket NOT up at /var/run/clamav/clamd.ctl"
fi
if nc -z 127.0.0.1 3310 2>/dev/null; then
    echo "[install_clamav] ✅ TCP loopback up: 127.0.0.1:3310"
else
    echo "[install_clamav] ⚠️  TCP loopback NOT up on 127.0.0.1:3310"
fi

# Probe with a real PING.
if command -v clamdscan >/dev/null 2>&1; then
    if clamdscan --version >/dev/null 2>&1; then
        echo "[install_clamav] ✅ clamdscan reports version OK"
    fi
fi

echo "[install_clamav] done — set CLAMAV_ENABLED=true in /app/backend/.env and restart backend"
