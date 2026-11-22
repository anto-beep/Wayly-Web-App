# ClamAV deployment for Wayly

This directory contains everything needed to run the **clamd** virus daemon
and **freshclam** signature updater alongside the Wayly backend in production.

## Why

`backend/upload_security.py` streams every uploaded file (statement PDFs,
family-wall photos, document-vault attachments, voice-journal audio) to a
local clamd instance before persistence. The pipeline is **fail-closed** —
if clamd is unreachable, the upload is refused. That's the right security
stance, but it means the daemon must actually be running.

## Two ways to deploy

### Option A — full container rebuild (preferred for self-hosted)

The repo root has a `Dockerfile` that extends the Emergent base image with
clamav-daemon + clamav-freshclam, drops in the configs from this directory,
and uses `deploy/clamav/entrypoint.sh` to seed the signature database
before supervisord starts.

```bash
docker build -t wayly:prod .
docker run -d -p 80:80 --env-file backend/.env wayly:prod
```

Health-check after boot:

```bash
curl https://<your-host>/api/health/clamav
# → {"enabled":true,"ready":true,"db_loaded":true,"transport":"unix:/var/run/clamav/clamd.ctl","detail":"ok"}
```

### Option B — install into an already-running pod (preferred for managed Emergent)

If you can't rebuild the production image, run the live install script. It is
idempotent — re-running on a host that already has ClamAV will only reload
supervisord with the latest configs.

```bash
sudo /app/scripts/install_clamav.sh
```

This is the script to hand to **Emergent Support** for the
`https://wayly.com.au` pod. They can SSH in (or `kubectl exec` into the
backend container), run the script as root, and the daemon will come up
within ~60s (the time freshclam takes to fetch the initial signature DB).

After it runs, set in `/app/backend/.env`:

```ini
CLAMAV_ENABLED=true
CLAMAV_SOCKET=/var/run/clamav/clamd.ctl
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
```

and restart the backend:

```bash
sudo supervisorctl restart backend
```

## Files in this directory

| File | Destination on container | Purpose |
| --- | --- | --- |
| `clamd.conf` | `/etc/clamav/clamd.conf` | Daemon config — listens on the unix socket **and** TCP 127.0.0.1:3310 so the Python client can use either transport. Tuned for our 100 MB max scan size (the app-side cap is 20 MB but clamd needs headroom). |
| `freshclam.conf` | `/etc/clamav/freshclam.conf` | Signature updater config — fetches from `database.clamav.net` every 24h. |
| `supervisor-clamd.conf` | `/etc/supervisor/conf.d/clamd.conf` | Supervisor programme for clamd. Runs as root (clamd internally drops to the `clamav` user). `priority=5` so it starts before the FastAPI backend. |
| `supervisor-freshclam.conf` | `/etc/supervisor/conf.d/freshclam.conf` | Supervisor programme for the freshclam daemon. Runs as the `clamav` user. `priority=4`. |
| `entrypoint.sh` | `/usr/local/bin/wayly-entrypoint.sh` | Container entrypoint — recreates `/var/run/clamav` (tmpfs gets wiped on boot), runs `freshclam` once synchronously to seed the DB, then exec's supervisord. |

## Backend readiness gate

`backend/upload_security.py` exposes `_signature_db_ready()` and a
`clamav_status()` helper. The `virus_scan()` function now distinguishes
three states:

| State | HTTP response | When |
| --- | --- | --- |
| Signatures still downloading | **503** with the *"still loading its virus database"* message | First ~60s of every cold start |
| clamd unreachable | **503** with the *"temporarily unavailable"* message | clamd crashed / socket missing |
| Malware detected | **400** with the threat name | Always |
| OK | (no exception) | The happy path |

The frontend can poll `GET /api/health/clamav` to render an inline
"uploads ready / loading / down" indicator on file-pickers.

## Operational checks

```bash
# Is clamd accepting connections?
echo PING | nc -U /var/run/clamav/clamd.ctl    # → "PONG"
echo PING | nc 127.0.0.1 3310                  # → "PONG"

# Test EICAR (a safe known-malicious file).
curl -X POST https://wayly.com.au/api/wall/posts \
     -H "Authorization: Bearer $TOKEN" \
     -F "kind=document" \
     -F "media=@./eicar.com;type=application/octet-stream"
# → 400 "This file was flagged as potentially harmful…"

# Force freshclam to refresh now.
sudo supervisorctl stop freshclam
sudo -u clamav /usr/bin/freshclam --stdout
sudo supervisorctl start freshclam
```

## Environment-variable reference

These come from `/app/backend/.env` (the **PROTECTED_VARIABLES** policy
applies — only change values, never remove keys):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLAMAV_ENABLED` | `true` | Set to `false` to make `virus_scan()` a no-op (preview / staging only). |
| `CLAMAV_SOCKET` | `/var/run/clamav/clamd.ctl` | Preferred transport — Unix socket. |
| `CLAMAV_HOST` | `127.0.0.1` | TCP fallback host. |
| `CLAMAV_PORT` | `3310` | TCP fallback port. |
| `CLAMAV_DB_DIR` | `/var/lib/clamav` | Where freshclam writes signatures. |
| `CLAMAV_READY_FILE` | *(unset)* | Optional override — if set, the readiness check waits for this exact file rather than the default `main.cvd`/`daily.cvd` probe. |

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Uploads return `503 "File-scanning service is temporarily unavailable"` | clamd is down or socket lost | `sudo supervisorctl restart clamd`; check `/var/log/supervisor/clamd.err.log` |
| Uploads return `503 "File scanner is still loading its virus database"` | freshclam hasn't seeded the DB yet | Wait 1-2 min; check `/var/log/supervisor/freshclam.log` for download progress |
| `clamd: ERROR: Can't load database` in logs | DB missing or corrupted | `sudo rm -rf /var/lib/clamav/*.cvd /var/lib/clamav/*.cld && sudo -u clamav /usr/bin/freshclam` then `sudo supervisorctl restart clamd` |
| `/var/run/clamav/clamd.ctl: Permission denied` | socket dir owned by root after a restart | `sudo install -d -o clamav -g clamav -m 0775 /var/run/clamav` then restart clamd |
| TCP 3310 unreachable but socket works | `TCPSocket` not enabled in clamd.conf | Confirm `/etc/clamav/clamd.conf` contains `TCPSocket 3310` + `TCPAddr 127.0.0.1`; reload clamd |
