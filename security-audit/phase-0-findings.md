# Wayly Security Audit — Phase 0 Findings

**Date:** 5 June 2026
**Auditor:** automated (E1 agent)
**Scope:** complete codebase under `/app` (preview + production deployment at https://wayly.com.au)
**Status:** read-only discovery. **Nothing has been changed.**

---

## Stack reality check vs. the brief

The audit brief was written for a Next.js / PostgreSQL / Airwallex / iOS stack. Wayly's actual stack is different. The findings below reflect the actual stack:

| Brief assumed | Wayly actually uses |
|---|---|
| Next.js | **React 19 (Create React App)** |
| `next.config.js` headers | needs FastAPI middleware + CRA `public/_headers` (Cloudflare) |
| PostgreSQL | **MongoDB only** (no Postgres anywhere) |
| Airwallex | **Stripe** |
| iOS App Store | web only — no App Store, no Apple policy 5.1.2(i) |
| Redis | **no Redis** — rate limit bucket is a Python in-memory `defaultdict` (handoff flagged this as a known follow-up) |
| S3 buckets storing uploads | **uploads are stored inline in MongoDB** (`vault_documents.binary` field) — there is no real S3 bucket for user uploads. `boto3` is loaded only by `reports_routes.py` for optional PDF report upload, gated by `S3_BUCKET` env var that is not set in production. |

These differences materially change what's possible in Phases 3, 4, 5, 6 and 9. Specific impact called out in each section below.

---

## 1. Authentication layer

### 1.1 Library and password storage — **PASS**

- Hashing library: `passlib.hash.bcrypt` (auto-detect rounds, default cost 12). Source: `/app/backend/auth.py` line 14-21.
- Stored field: `users.password_hash`. No plain text, no MD5, no SHA1, no unsalted hash anywhere.
- Verification: `passlib.bcrypt.verify(password, hash)`. Constant-time.

### 1.2 JWT signing — **FAIL (multiple gaps)**

`/app/backend/auth.py` lines 7-9:
```python
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
```

Gaps found:

| Concern | Finding | Severity |
|---|---|---|
| Default secret if env var missing | `"dev-secret"` (8 chars, totally guessable) | **CRITICAL** |
| Production `.env` secret strength | `JWT_SECRET=kindred-dev-secret-change-in-prod-9f8e7d6c5b4a3` — looks like a never-rotated dev placeholder | **HIGH** |
| Algorithm | HS256 (acceptable) | OK |
| Access token expiry | 7 days (`JWT_EXPIRE_DAYS=7` in `auth.py`) — too long, brief requires ≤60 min | **HIGH** |
| Refresh tokens | **none exist** — there is only a single long-lived access token | **HIGH** |
| Token blocklist on logout | **none** — `/auth/logout` deletes the client cookie only, doesn't invalidate the JWT | **MEDIUM** |
| Token invalidation on password change | **not implemented** | **MEDIUM** |
| Token invalidation on account delete | **not implemented** | **MEDIUM** |

### 1.3 Admin JWT realm — **PARTIAL**

`/app/backend/admin_auth.py` line 47-49: imports `JWT_SECRET` and `JWT_ALGORITHM` directly from `auth.py`.

| Concern | Finding | Severity |
|---|---|---|
| Admin JWT signing secret | **SAME secret as user JWT** — a compromised user JWT secret breaks admin auth too | **HIGH** |
| Admin access token expiry | 30 minutes (constant `SESSION_MAX_HOURS = 12` for max session; pre-2FA token 5 min) — OK | OK |
| Admin login endpoint | `/api/admin/auth/login` — separate route ✓ | OK |
| Different audience claim | Tokens have `type` field (`admin_access`, `admin_pre2fa`) and decoder enforces it ✓ | OK |

### 1.4 MFA — **PARTIAL**

| Concern | Finding | Severity |
|---|---|---|
| Admin MFA | TOTP (RFC 6238) implemented via `pyotp`, mandatory on admin login. Backup codes (8) generated. Verified in `admin_auth.py` lines 250-330. ✓ | OK |
| TOTP secret storage | Stored **in plain text** in `users.totp_secret` field (not encrypted at rest) | **HIGH** |
| Caregiver MFA | **none** — no setting, no QR code, no enrol flow | **MEDIUM** (brief makes it optional) |

### 1.5 Account lockout — **PARTIAL**

- Admin lockout: 5 failed attempts → 30 min lock. `admin_auth.py` line 62-63. ✓ stored in `users.failed_login_count` + `users.lockout_until` (MongoDB).
- User (caregiver) lockout: **none implemented**. `/api/auth/login` does not track failed attempts.
- IP-based lockout: **none anywhere**.

### 1.6 Login error messages — **FAIL**

`/api/auth/login` returns distinct messages:
- Email not found → `"User not found"` (HTTP 401)
- Wrong password → `"Invalid credentials"` (HTTP 401)

Enables email enumeration. Severity **MEDIUM**.

### 1.7 Password reset brute-force protection — **FAIL**

`/api/auth/forgot-password` accepts unlimited POSTs with no rate limit, returns different responses for found vs unknown email. Enables enumeration + flooding.

### 1.8 Session regeneration on login — **N/A**

Wayly uses stateless JWTs, not server-side sessions. Each login issues a fresh JWT regardless of prior state; there is no session-fixation vector.

### 1.9 Have I Been Pwned check — **FAIL**

No HIBP integration on signup or password change.

---

## 2. Authorisation layer — participant data isolation

### 2.1 Pattern audit

- 456 references to `participant_id` across 14 backend files.
- **No central scope helper exists.** No `get_participant_scope()`, no `verify_participant_access()`, no decorator. Every endpoint open-codes its own access check.
- Pattern most endpoints use:
  ```python
  participant = await db.participants.find_one({"id": participant_id})
  household_id = participant["household_id"]
  await _verify_household_member(user_id, household_id)
  ```
  This pattern is correct **when applied**, but inconsistent. A few endpoints check `household_id` directly from the request body without verifying the participant belongs to that household.

### 2.2 Endpoints handling participant data (initial inventory — needs Phase 2 to complete)

Discovered files containing participant-scoped endpoints:
- `server.py` (largest, ~3835 lines) — participants, statements, accounts, billing, public AI tools, mock-decode pipeline
- `extended_routes.py` — care team, calendar, concerns, wellbeing
- `vault.py` — document vault
- `documents_routes.py` — alternate document flow
- `reports_routes.py` — PDF report generation + presigned URL
- `batch2_routes.py`, `batch3_routes.py` — Phase B/C endpoints
- `adviser_routes.py` — adviser plan
- `admin_phase_e.py` — admin participant impersonation
- `digest_service.py` — weekly digest

**Phase 2 needs:** enumerate every endpoint method/path that accepts a participant identifier, then either rewrite each to use a single `assert_participant_access(user_id, participant_id) -> Participant` helper, or audit each in place.

### 2.3 Participant switcher

Server-side: `GET /api/participants/active` returns the active participant for the user. Switch is via `POST /api/participants/{id}/activate` which only updates the user's `active_participant_id` field — it does **not** invalidate any in-flight or cached data on the server. Cache invalidation lives in React Query on the client. Phase 2 to verify whether stale data could leak.

---

## 3. Rate limiting

### 3.1 Current state — **MINIMAL**

Only one rate limit exists site-wide:

| Endpoint | Limit | Where |
|---|---|---|
| Public AI tools (`/api/public/decode`, etc.) | 5 / hour / IP | `server.py:1488` in-memory `defaultdict` |

| Endpoint | Status |
|---|---|
| `/api/auth/login` | **no rate limit** |
| `/api/auth/forgot-password` | **no rate limit** |
| `/api/auth/signup` | **no rate limit** |
| Authenticated tool endpoints | **no rate limit** |
| File uploads | **no rate limit** |
| Admin endpoints | **no rate limit** |
| All other API endpoints | **no rate limit** |

### 3.2 Library

- `slowapi` is **not installed**. No FastAPI rate-limit middleware exists.
- The single existing bucket is a Python `dict` — **does not survive backend restart, does not work across workers/replicas**, and is the known follow-up flagged in the iteration handoff (P1: "Move rate-limit bucket from in-memory dictionary to Redis").

### 3.3 Redis

**Redis is not in the stack.** Adding it is a precondition for Phase 3.

---

## 4. File upload handling

### 4.1 Where uploads land

- Document vault uploads: stored inline as raw bytes in `vault_documents` MongoDB collection (`vault.py` reads `await file.read()` and writes to Mongo).
- Statement decoder uploads: text-paste workflow, no binary upload path discovered (decoder accepts a `text` field, not a file).
- PDF report generation: writes to local disk under `/app/backend/storage/reports/<id>.pdf`. Optional S3 upload via `S3_BUCKET` env var, not configured in production.

### 4.2 Validation gaps — **FAIL on several**

`/app/backend/vault.py` lines 88-99 (upload endpoint):

| Check | Implemented? | Issue |
|---|---|---|
| Magic-bytes / signature sniff | **no** | only `file.content_type` (client-supplied) is checked against an allowlist | **HIGH** |
| Size limit enforced before read | **partial** | `data = await file.read()` is called first, then `len(data)` is checked. Memory exhaustion possible. | **MEDIUM** |
| Original filename used as storage key | **stored** in `original_filename`. Storage key is `id = secrets.token_urlsafe(12)` so the file body itself is not addressable by user-supplied name. ✓ | OK |
| Content-Length pre-check | **none** | a malicious 100 MB upload reaches the worker memory before rejection | **MEDIUM** |
| Virus scan | **none** | no ClamAV, no scanning of any sort | **HIGH** (per brief; lower in practice since files never execute and only Anthropic Claude reads them) |
| Prompt-injection sanitisation | **none** | files are passed to LLM as-is | **HIGH** |
| Upload audit log | **partial** | document record is written to Mongo, but no separate audit log entry for "file uploaded by X at Y, scanned, OK" | **LOW** |

### 4.3 Pre-signed URL hygiene

`reports_routes.py` line 78-89: presigned URL expiry `expires_in=900` (15 min). ✓ matches brief.

### 4.4 S3 public-access check

Cannot verify from inside the container. Boto3 is only loaded conditionally; bucket policy must be inspected via the AWS console.

---

## 5. Environment variables and secret hygiene

### 5.1 Hardcoded-secret grep — **PASS**

Patterns checked: `sk-ant`, `sk-proj`, `sk_live`, `pk_live`, `rk_live`, `whsec_`, `mongodb://`, `mongodb+srv://`, `password = "..."`, `secret = "..."`.

**No matches found in `.py`, `.ts`, `.js`, `.jsx` source files.** All secrets live in `.env` files.

### 5.2 `.env` contents (keys only, redacted values)

`/app/backend/.env` declares:
- `MONGO_URL`
- `DB_NAME`
- `CORS_ORIGINS`
- `EMERGENT_LLM_KEY`
- `JWT_SECRET` ← **value is a dev placeholder, see 1.2**
- `JWT_ALGORITHM`
- `RESEND_API_KEY`
- `SENDER_EMAIL`
- `TEAM_INBOX`
- `STRIPE_API_KEY`

`/app/frontend/.env` declares:
- `REACT_APP_BACKEND_URL`
- `WDS_SOCKET_PORT`
- `ENABLE_HEALTH_CHECK`

### 5.3 `.gitignore` — **PASS**

Covers `.env`, `.env.*`, `*.env`, `credentials.json`, `.credentials`, and `memory/test_credentials.md`. (File has many duplicate entries — harmless but should be cleaned up.)

### 5.4 `.env.example` — **MISSING**

There is no `.env.example` in the repo. Phase 6 deliverable.

---

## 6. Encryption and storage

| Item | Finding |
|---|---|
| MongoDB at-rest encryption | Managed by the Emergent platform / cloud provider. **Cannot verify from inside the container.** Flag for the Emergent dashboard. |
| S3 at-rest encryption | No S3 buckets in active use (uploads are Mongo-inline). The optional reports S3 bucket would need SSE-S3 / SSE-KMS enabled in AWS console. |
| TLS version | Terminated at Cloudflare (production) and Emergent ingress (preview). Both default to TLS 1.2 + 1.3 with TLS 1.0/1.1 disabled. **Cannot verify from inside the container** — should be confirmed at the edge. |
| In-transit between backend and Mongo | Connection string uses `mongodb+srv://` (TLS by default). ✓ |

---

## 7. HTTP security headers — **FAIL**

Searched FastAPI middleware setup in `/app/backend/server.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    ...
)
```

**Only CORS middleware is registered.** None of these headers are set on any response:

- ❌ `Strict-Transport-Security`
- ❌ `X-Content-Type-Options`
- ❌ `X-Frame-Options`
- ❌ `Referrer-Policy`
- ❌ `Permissions-Policy`
- ❌ `Content-Security-Policy`
- ❌ `X-DNS-Prefetch-Control`
- ❌ `Cross-Origin-Opener-Policy`
- ❌ `Cross-Origin-Resource-Policy`

CORS `allow_origins` defaults to `"*"` if `CORS_ORIGINS` env is missing, which is dangerous in production.

---

## 8. Dependency security

### 8.1 npm audit (frontend, yarn 1)

```
199 vulnerabilities — 8 Low | 88 Moderate | 103 High | 0 Critical
```

Almost all are transitive (CRA's `react-scripts` chain — `picomatch`, `webpack-dev-server`, `nth-check`, `postcss`, etc.). The two newest high-severity items are picomatch CVEs (CVE-2026-33671 ReDoS and CVE-2026-33672 method injection) reachable only through `tailwindcss` and `react-scripts` build-time deps — **not runtime-reachable in production**. Production-runtime dependencies (React, axios, lucide-react, react-helmet-async, etc.) show no high-severity findings.

### 8.2 pip-audit (backend)

```
20 known vulnerabilities in 8 packages
```

| Package | Current | Fix | CVE summary |
|---|---|---|---|
| aiohttp | 3.13.5 | 3.14.0 | CVE-2026-34993, 47265 |
| urllib3 | 2.6.3 | 2.7.0 | PYSEC-2026-141/142 |
| starlette | 0.37.2 | 0.40.0 / 0.47.2 / 1.0.1 | CVE-2024-47874, 2025-54121, PYSEC-2026-161 |
| idna | 3.11 | 3.15 | CVE-2026-45409 |
| litellm | 1.80.0 | 1.83.7 | CVE-2026-35029/30/42271, GHSA-69x8-hrgq-fjj8 |
| pymongo | 4.5.0 | 4.6.3 | CVE-2024-5629 |
| pyjwt | 2.12.1 | 2.13.0 | PYSEC-2026-175/177/178/179 |
| python-multipart | 0.0.24 | 0.0.27 | CVE-2026-40347, 42561 |

**pyjwt** is the most important to patch — it's used by both user and admin auth.

### 8.3 Dependabot

No `.github/dependabot.yml` exists. Phase 7 deliverable.

---

## 9. Session and token lifecycle

| Event | Token invalidation? |
|---|---|
| Logout | Clears cookie client-side. **JWT remains valid until natural expiry (7 days).** |
| Password change | **JWT remains valid.** |
| Account delete | Account flagged deleted, JWT not invalidated until natural expiry. |
| Email change | JWT remains valid. |
| Admin logout | Same — cookie clear only. |
| Admin password change | Same. |
| Inactivity timeout | Admin has `SESSION_INACTIVE_HOURS=4`, user has none. |

---

## 10. Admin-specific security

| Control | Finding | Severity |
|---|---|---|
| Admin URL hidden | `/admin/login` returns the React SPA HTML (200) to any visitor — anyone can see an admin panel exists | **MEDIUM** |
| IP allowlist | **none** | **HIGH** (brief requirement) |
| New-device login email | **none** — admin can sign in from any IP without notification to other admins | **MEDIUM** |
| Audit log immutability | `audit_log()` exists (in `admin_auth.py`) and writes to `admin_audit_logs` collection. **No DB-level constraint prevents update/delete.** A super-admin with shell access to Mongo could rewrite history. | **MEDIUM** |
| Admin impersonation banner | Exists (per prior iteration) | OK |
| Impersonation write-block | Exists (per prior iteration) | OK |
| Impersonation timeout | `SESSION_INACTIVE_HOURS=4` — brief asks for 30 min on impersonation specifically | **LOW** |
| Maintenance mode confirmation | Exists per prior iteration — verify in Phase 8 | flag |

---

## 11. NDB / Privacy Act readiness

| Item | Finding |
|---|---|
| Account deletion flow | Exists (`/api/account/delete`). Phase 9 to verify it cascades to participants, vault, statements, calendar, care team, AT-HM, reports. |
| 60-day participant retention | Field `participants.removed_at` exists. A cron must hard-delete after 60 days — needs verification in Phase 9. |
| Data export | Exists at `/api/account/export`. Phase 9 to verify completeness. |
| Breach response runbook | **does not exist**. `/docs/breach-response.md` is a Phase 9 deliverable. |
| Privacy policy accuracy | Lives at `/legal/privacy`. Needs review in Phase 9 against the actual data practices. |

---

## Summary risk register

| Severity | Count | Examples |
|---|---|---|
| **CRITICAL** | 1 | JWT default secret `"dev-secret"` if env var missing (1.2) |
| **HIGH** | 11 | JWT prod secret looks like dev placeholder; 7-day access token; admin + user share JWT secret; TOTP plaintext; no HTTP security headers; no rate limit on login/signup/reset/uploads; no upload magic-byte / virus scan; no IP allowlist for admin; CORS wildcard default; pyjwt + starlette CVEs; npm audit 103 high (mostly dev-only) |
| **MEDIUM** | 12 | enumeration via login/reset error messages; no token blocklist on logout/password-change/delete; no caregiver MFA; no Content-Length precheck on uploads; no upload audit log; no Redis; admin URL not hidden; no new-device email; audit log mutable; impersonation timeout too long; participant-data isolation inconsistent (no central helper); env example missing |
| **LOW** | 4 | `.gitignore` duplicates; no Dependabot; no CI security checks; prompt-injection sanitisation missing |

---

## Phase 0 outcome

**Nothing has been changed.** All findings above are the result of static inspection and dependency audits.

**Recommended Phase 1 priority order:**

1. **CRITICAL** — Remove `"dev-secret"` fallback in `auth.py`. Fail-fast if `JWT_SECRET` missing.
2. **CRITICAL** — Rotate the production `JWT_SECRET` to a fresh 256-bit value. **This logs every user out** — needs your sign-off before I do it.
3. **HIGH** — Separate admin JWT secret from user JWT secret.
4. **HIGH** — Encrypt TOTP secrets at rest using a separate `TOTP_ENC_KEY` env var.
5. **HIGH** — Implement refresh tokens (60-min access, 30-day refresh) + token blocklist on logout/password-change/delete.
6. **HIGH** — Caregiver login: account lockout, generic error messages, HIBP password check.
7. Then move to Phase 2 (participant data isolation audit + test suite).

Waiting for your approval before starting Phase 1.
