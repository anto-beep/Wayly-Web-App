# Phase 1 — Password & Authentication Security — DELIVERY REPORT

Date: 2026-02-06
Scope: backend `auth.py`, `admin_auth.py`, `security_utils.py` (new), `server.py`
auth routes; frontend `AuthContext.jsx`, `api.js`, `Login.jsx`, `Settings.jsx`.

## What was shipped

| # | Item | Status |
|---|---|---|
| 1 | Kill `JWT_SECRET="dev-secret"` fallback — fail-fast if env missing | ✅ |
| 2 | Rotate `JWT_SECRET` in preview env (`/app/backend/.env`) | ✅ |
| 3 | New separate `ADMIN_JWT_SECRET` for admin realm | ✅ |
| 4 | TOTP secret encrypted at rest with Fernet (`TOTP_ENC_KEY`) | ✅ |
| 5 | Refresh tokens — 60-min access + 30-day refresh + one-shot rotation | ✅ |
| 6 | JWT blocklist (Mongo `revoked_tokens`, TTL index) on logout | ✅ |
| 7 | Per-user `token_invalid_before` sentinel — kills all tokens on password reset | ✅ |
| 8 | Generic 401 `Invalid email or password` (anti-enumeration) | ✅ |
| 9 | Caregiver lockout: 5 failures → 15-min lock, configurable via env | ✅ |
| 10 | HIBP k-Anonymity check blocks breached passwords on signup + reset | ✅ |
| 11 | Caregiver opt-in TOTP MFA (setup → enable → challenge → verify → disable) | ✅ |
| 12 | 8 single-use backup codes (bcrypt-hashed at rest) | ✅ |
| 13 | Admin TOTP secrets transparently migrate from legacy plaintext → encrypted | ✅ |
| 14 | `/auth/me` exposes `totp_enabled` to the Settings UI | ✅ |
| 15 | Frontend auto-refresh axios interceptor on 401 | ✅ |
| 16 | Pytest suite covering all of the above | ✅ 12/12 passing |

## Out-of-scope items deferred to later phases (explicit)

| Item | Phase |
|---|---|
| Redis-backed rate limiting on login / signup / reset | Phase 3 |
| HTTP security headers (HSTS, CSP, X-Frame-Options) | Phase 5 |
| ClamAV virus scan + magic-byte file upload validation | Phase 4 |
| Admin IP allowlist & new-device email alerts | Phase 8 |
| Switch from `localStorage` access tokens to `httpOnly` cookies | Phase 5 |

## Production rollout checklist for the user

**⚠️ Production rotation still required.** The preview env in `/app/backend/.env`
has fresh `JWT_SECRET`, `ADMIN_JWT_SECRET`, and `TOTP_ENC_KEY`. Production must
be updated by hand in the deployment dashboard:

1. Generate fresh secrets:
   ```bash
   python -c "import secrets; print('JWT_SECRET=' + secrets.token_hex(32)); print('ADMIN_JWT_SECRET=' + secrets.token_hex(32)); from cryptography.fernet import Fernet; print('TOTP_ENC_KEY=' + Fernet.generate_key().decode())"
   ```
2. Set in deployment env: `JWT_SECRET`, `ADMIN_JWT_SECRET`, `TOTP_ENC_KEY`,
   `JWT_ACCESS_MINUTES=60`, `JWT_REFRESH_DAYS=30`, `HIBP_BLOCK_COMPROMISED=true`,
   `USER_LOGIN_LOCKOUT_THRESHOLD=5`, `USER_LOGIN_LOCKOUT_MINUTES=15`.
3. ⚠️ All currently-signed-in users will be logged out on the next request.
4. The existing super-admin `hello@techglove.com.au` will keep working: their
   plaintext TOTP secret will be auto-encrypted on next successful 2FA verify.

## Testing — pytest

```
pytest /app/backend/tests/test_phase1_security.py -v
============================= 12 passed in 45.15s ==============================
```

## Testing — Playwright smoke

* Login + redirect to /app: PASS
* Settings → Security tab renders MFA panel: PASS
* Click "Enable two-factor" → QR + verify input appears: PASS

## Files changed

```
backend/
  .env                      rotated secrets + new keys
  auth.py                   rewrite (fail-fast, refresh, blocklist hooks, mfa-challenge helpers)
  admin_auth.py             uses ADMIN_JWT_SECRET; encrypts/decrypts TOTP
  security_utils.py         NEW — HIBP, Fernet, blocklist, lockout
  server.py                 /auth/signup, /login, /logout, /reset rewritten;
                            /auth/refresh + /mfa/{setup,enable,verify,disable} added;
                            _security_index_bootstrap startup
  models.py                 TokenResponse.refresh_token; UserPublic.totp_enabled
  tests/test_phase1_security.py  NEW — 12 tests, all passing

frontend/
  src/lib/api.js                  refresh-token storage + 401 auto-refresh interceptor
  src/context/AuthContext.jsx     login may return {requires_mfa, temp_token}; verifyMfa()
  src/pages/Login.jsx             added 2FA challenge sub-form
  src/pages/Settings.jsx          added <MfaPanel/> inside SecurityTab
```

## Risk register impact (Phase 0 baseline → now)

* **CRITICAL** `dev-secret` fallback → **FIXED**
* **HIGH** 7-day access token, no refresh → **FIXED** (60 min + 30-day refresh)
* **HIGH** admin & user share JWT secret → **FIXED**
* **HIGH** TOTP plaintext at rest → **FIXED** (Fernet AEAD)
* **MEDIUM** no blocklist on logout / pw change → **FIXED**
* **MEDIUM** no caregiver MFA → **FIXED**
* **MEDIUM** login email enumeration → **FIXED**

Remaining items move to subsequent phases per the agreed plan.
