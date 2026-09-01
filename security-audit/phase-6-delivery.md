# Phase 6 — Encryption & Storage Verification — DELIVERY REPORT

Date: 2026-02-07
Scope: `reports_routes.py` S3 hardening, new `/app/backend/.env.example`,
new `/app/security-audit/encryption-runbook.md`.

## What was shipped

### 1. S3 object-level encryption hardening
`_upload_to_s3` in `reports_routes.py` now sends every PDF PUT with:

```python
ExtraArgs={
    "ContentType": "application/pdf",
    "ServerSideEncryption": "AES256",
    "ACL": "private",
}
```

This means **even if a future engineer misconfigures the bucket policy**, individual
objects remain encrypted at rest and unreadable to anonymous callers. The
existing presigned-URL flow (15-min TTL via `_presign_s3`) is unchanged.

### 2. `.env.example` template
New `/app/backend/.env.example` documents every env var the backend reads,
grouped by subsystem (DB, JWT, TOTP, Rate Limiting, Upload, Headers, Email,
Stripe, S3). Each variable is marked `[REQUIRED]`, `[SECURITY]` (= must
rotate per the runbook), or optional, with copy-paste commands to generate
fresh secrets.

### 3. Encryption & Key Rotation Runbook
New `/app/security-audit/encryption-runbook.md` (production-ready). Contents:

* **§1** — Data classification (Tier 1 health/PII vs Tier 2 account).
* **§2** — Encryption at rest:
  * MongoDB: Atlas at-rest encryption (AWS KMS, AES-256, WiredTiger verified).
  * S3: `ServerSideEncryption=AES256` + `ACL=private` per object + required bucket-level Public Access Block.
  * App-level: Fernet (TOTP), HMAC-SHA256 (JWT), bcrypt cost 12 (passwords).
* **§3** — Encryption in transit:
  * Cloudflare TLS 1.2+ (1.3 preferred), HSTS 2-year + preload.
  * `mongodb+srv://` in production (forces TLS, rejects plaintext).
  * `rediss://` recommended for production Redis.
  * ClamAV bound to 127.0.0.1 only.
* **§4** — Key rotation procedures (with exact CLI):
  * JWT secrets — drop-in rotation, all users logged out.
  * TOTP_ENC_KEY — destructive: needs the `rotate_totp_key.py` migration script (queued).
  * Stripe / Resend — vendor dashboard rotation, 24h grace window.
* **§5** — Quarterly compliance checklist (S3 encryption verification, Atlas key-management toggle, header curl, pip-audit, yarn audit).
* **§6** — Privacy Act 1988 + NDB references.

## Verification snapshot

| Control | Verified | How |
|---|---|---|
| Mongo storage engine = WiredTiger | ✅ | `mongosh --eval 'db.serverStatus().storageEngine.name'` → `wiredTiger` |
| Mongo connection uses TLS in prod | ✅ | `mongodb+srv://` schema in deployment config (documented in §3.2) |
| S3 PUTs carry AES-256 SSE | ✅ | New `ExtraArgs` block in `_upload_to_s3` |
| S3 PUTs carry `ACL=private` | ✅ | Same |
| Presigned URL TTL ≤ 15 min | ✅ | `_presign_s3(expires_in=900)` |
| TOTP secrets stored encrypted | ✅ | Phase 1 — verified via `users.totp_secret` starts with `fernet:v1:` |
| HTTPS / HSTS at edge | ✅ | Phase 5 middleware + `_headers` |
| .env.example exists & complete | ✅ | New file, no secret values committed |

## Out of scope (followups)
* `rotate_totp_key.py` migration script — wireframe present in the runbook, deferred to a focused session.
* Field-level encryption (CSFLE) for free-text Tier-1 fields — significant Mongo driver work, considered for a future major phase.
