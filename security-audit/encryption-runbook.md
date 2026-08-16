# Wayly — Encryption & Key Rotation Runbook

Last updated: 2026-02-06 (Phase 6 security hardening)
Owner: security@wayly.com.au

## 1. Data classification

Wayly handles **highly sensitive health information** under the Australian
Privacy Act 1988 and the NDB scheme. Two data categories drive every
storage / transport decision:

| Class | Examples | Required protection |
|---|---|---|
| **Tier 1 (Health/PII)** | Participant name, DOB, classification, statements, notes, photos, voice clips, family thread | Encrypted at rest (AES-256), TLS 1.2+ in transit, household-scoped queries only, 60-day hard-delete on account deletion |
| **Tier 2 (Account)** | User email, password hash (bcrypt), JWT secrets, TOTP secrets (Fernet-encrypted), billing tokens | Same as Tier 1; plus per-user `token_invalid_before` sentinel and HIBP-blocked passwords |

## 2. Encryption at rest

### 2.1 MongoDB
* **Production**: MongoDB Atlas with [Encryption at Rest](https://www.mongodb.com/docs/atlas/security/encryption-at-rest/) enabled at the cluster level. The provider key is AWS KMS in `ap-southeast-2`. AES-256 is the only supported cipher.
* **Storage engine**: WiredTiger (verified — `db.serverStatus().storageEngine.name == "wiredTiger"`).
* **Field-level encryption** (CSFLE / Queryable Encryption) is **not yet** in use. Considered for Tier 1 free-text fields (statement line items, notes) in a future phase — the prerequisite is moving every read path through the Mongo driver's automatic encryption (out of scope for the current 10-phase audit).
* **Local dev**: WiredTiger only — no at-rest encryption. Dev data is synthetic; no Tier-1 production data ever lives here.

### 2.2 S3 (reports storage)
* Every PDF uploaded by `reports_routes._upload_to_s3` carries
  `ServerSideEncryption=AES256` + `ACL=private` (enforced at the per-object
  level so even a misconfigured bucket policy can't expose objects).
* The bucket policy MUST also enforce:
  - `BlockPublicAcls = true`, `IgnorePublicAcls = true`, `BlockPublicPolicy = true`, `RestrictPublicBuckets = true`.
  - A bucket-level [SSE default](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html) of AES-256 as defence-in-depth.
* Presigned URLs are issued via `_presign_s3()` with a default TTL of **15 minutes**.

### 2.3 Application-level encryption
| Field | Cipher | Key env var | Notes |
|---|---|---|---|
| Caregiver TOTP secret | Fernet (AES-128-CBC + HMAC-SHA256) | `TOTP_ENC_KEY` | Encrypted-at-rest in `users.totp_secret`. Legacy plaintext values are transparently upgraded on next 2FA verify. |
| JWT tokens | HMAC-SHA256 signing | `JWT_SECRET`, `ADMIN_JWT_SECRET` | Stateless; revoked via `revoked_tokens` Mongo TTL collection. |
| User passwords | bcrypt (cost 12) | n/a (per-record salt) | Compared via `bcrypt.checkpw`; never logged. |

## 3. Encryption in transit

### 3.1 Internet ↔ user
* Cloudflare in front of `wayly.com.au` terminates TLS 1.2+ (TLS 1.3 preferred). Cloudflare Universal SSL covers the root and all subdomains.
* HSTS is set via Phase 5 middleware: `max-age=63072000; includeSubDomains; preload`. Submit to [hstspreload.org](https://hstspreload.org/) once HSTS has been live for 24h.

### 3.2 Backend ↔ MongoDB
* Production uses `mongodb+srv://` which forces TLS by default and rejects plaintext connections.
* Local dev uses `mongodb://localhost:27017` (no TLS) — synthetic data only.

### 3.3 Backend ↔ Redis (rate-limit store)
* Production should use `rediss://...` (TLS) — Upstash and Redis Cloud both expose this. The limit data is non-sensitive but TLS is the path of least resistance.

### 3.4 Backend ↔ ClamAV
* TCP localhost only (`127.0.0.1:3310`). Never expose clamd publicly.

## 4. Key rotation procedure

### 4.1 JWT secrets (`JWT_SECRET`, `ADMIN_JWT_SECRET`)
**Trigger**: scheduled (annually), or immediately after a suspected leak.
**Impact**: every active session is logged out on next request — the rotation
is the desired effect.

1. Generate a fresh secret:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
2. Update the env var in the deployment dashboard (one secret at a time).
3. Restart all backend replicas.
4. Watch the audit log for spikes in 401 — expected, transient.

### 4.2 TOTP encryption key (`TOTP_ENC_KEY`)
**Trigger**: scheduled (every 2 years), or immediately after a suspected leak.
**Impact**: ALL caregiver / admin 2FA secrets must be re-encrypted — this is
**destructive** to the old ciphertext.

Procedure (one-time migration script in `scripts/rotate_totp_key.py`):
1. Generate the new key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
2. Add it to env as `TOTP_ENC_KEY_NEXT`.
3. Run the rotation script — reads every `users.totp_secret`, decrypts with
   old key, re-encrypts with new key, writes back. Transaction-bounded.
4. Promote `TOTP_ENC_KEY_NEXT` → `TOTP_ENC_KEY` and remove the legacy var.
5. Restart backend.

*(Script is a Phase 6 deliverable but is queued behind the more urgent Phase 7
dependency bumps. Stub committed at `scripts/rotate_totp_key.py`.)*

### 4.3 Stripe / Resend / external API keys
* Stripe — rotate from the Stripe dashboard, paste the new key into env, redeploy. The old key keeps working for 24h (Stripe grace window).
* Resend — same flow via the Resend dashboard.

## 5. Audit / compliance checklist

Run quarterly:

* [ ] `aws s3api get-bucket-encryption --bucket wayly-reports-prod` returns `AES256`.
* [ ] `aws s3api get-bucket-policy-status --bucket wayly-reports-prod` returns `IsPublic: false`.
* [ ] MongoDB Atlas cluster: Settings → Security → "Encryption at Rest using your Key Management" is ON.
* [ ] `curl -I https://wayly.com.au` carries HSTS, CSP, X-Frame-Options, etc. (Phase 5 headers).
* [ ] `pip-audit -r backend/requirements.txt` reports zero **HIGH** / **CRITICAL**.
* [ ] `yarn audit` (frontend) reports zero **HIGH** / **CRITICAL**.

## 6. References
* Australian Privacy Act 1988 — APP 11.1 (Security of personal information).
* NDB scheme — `https://www.oaic.gov.au/privacy/notifiable-data-breaches/`.
* AWS S3 encryption guide — see §2.2 link above.
* MongoDB Atlas at-rest encryption — see §2.1 link above.
