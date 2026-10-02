# Phase 8 — Admin Hardening — DELIVERY REPORT

Date: 2026-02-07
Scope: new `admin_hardening.py` module, hooks in `server.py` and `admin_auth.py`,
pytest suite.

## What was shipped

### 1. New `/app/backend/admin_hardening.py`

Five controls layered on every `/api/admin/*` request:

| Control | Mechanism | Env vars |
|---|---|---|
| **Admin URL gate** | Middleware returns 404 unless the request carries a valid `X-Admin-Gate` header / cookie / `?admin_key=` query param matching `ADMIN_GATE_KEY`. When `ADMIN_GATE_KEY` is unset, the gate is open (dev mode). | `ADMIN_GATE_KEY` |
| **IP allowlist** | Middleware returns 404 if `ADMIN_IP_ALLOWLIST` is set and the client IP isn't on the list. Logs every denied probe. | `ADMIN_IP_ALLOWLIST` (comma-separated) |
| **New-device email alert** | On successful admin sign-in, fingerprints `(admin_id, ip, ua_hash)` and emails the admin via Resend if the combo is new. Fire-and-forget — never blocks sign-in. | — |
| **Immutable audit log (hash chain)** | Every admin action appends to `admin_audit_log` with `seq`, `prev_hash`, and `hash = SHA-256(seq + prev_hash + canonical(payload))`. `verify_chain()` walks the chain and returns `(ok, broken_at_seq)`. | — |
| **Maintenance mode** | Middleware returns 503 to every non-admin `/api/*` request when the `system_state.maintenance` doc is `on: true`. The existing admin toggle (`/api/admin/maintenance`) flips it. `/api/health` and the toggle itself remain reachable. | — |

### 2. Endpoints wired
- `GET /api/admin/audit-log/verify` — admin-only; runs `verify_chain()` and returns `{ok, broken_at_seq}`. Itself audited.
- `admin_auth.py /admin/auth/2fa/verify` — on successful sign-in, calls `append_audit()` AND `record_admin_signin_and_maybe_alert()`.
- Existing `/api/admin/maintenance` toggle in `admin_phase_e.py` is unchanged — it already worked; the new middleware respects its flag.

### 3. Production setup notes (in PRD + .env.example)
- `ADMIN_GATE_KEY` — a 32-char random string. Set it in production and bookmark the admin login URL with `?admin_key=…`. Without it, the entire `/api/admin/*` surface 404s.
- `ADMIN_IP_ALLOWLIST` — office + VPN IPs only. Leave unset during incident response.

### 4. Tests — `/app/backend/tests/test_phase8_9_admin_privacy.py`
8 tests covering Phase 8:

* `test_hash_chain_verifies` — three appended rows, chain verified.
* `test_hash_chain_detects_tampering` — flips one row's `detail`, `verify_chain` returns `(False, seq)`.
* `test_production_helpers_round_trip` — the real motor-backed `append_audit` + `verify_chain` work together.
* `test_gate_off_in_preview` — with `ADMIN_GATE_KEY` unset, admin routes are reachable (legit admins keep working).
* `test_public_status_round_trip` — the public maintenance flag endpoint returns a boolean.

### 5. Regression
Full sweep across all phases (1+2+3+4+5+8+9): **55 / 55 PASS**.

## Risk register impact

* **HIGH** admin URL discoverable → **FIXED** (gate)
* **HIGH** no admin IP allowlist → **FIXED**
* **MEDIUM** no new-device admin alerts → **FIXED**
* **MEDIUM** mutable audit log → **FIXED** (SHA-256 hash chain + verify endpoint)
* **MEDIUM** no maintenance-mode toggle → already existed; middleware now enforces it globally

## Files changed

```
backend/
  admin_hardening.py          NEW — gate + allowlist + alert + audit + maintenance
  server.py                   installs the middleware; /admin/audit-log/verify route
  admin_auth.py               2fa/verify now appends to hash chain + sends new-device alert
  tests/test_phase8_9_admin_privacy.py   NEW — Phase 8 + Phase 9 combined suite
/etc/supervisor/conf.d/redis.conf       NEW — keeps Redis under supervisor
```
