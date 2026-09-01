# Phase 4 — File Upload Security — DELIVERY REPORT

Date: 2026-02-06
Scope: new `upload_security.py` module, ClamAV daemon, hooks in `server.py`,
`vault.py`, `documents_routes.py`, `batch2_routes.py`; pytest suite.

## What was shipped

### 1. New `/app/backend/upload_security.py`
Single reusable helper combining 5 defence layers:

| Layer | What it does | Where |
|---|---|---|
| **Size cap** | Hard 20 MB ceiling (`MAX_UPLOAD_BYTES`, env-tunable); per-route overrides for image (8 MB) and audio (15 MB). | `assert_size()` |
| **Magic-byte validator** | Sniff first bytes against an allowlist per route. Filename + Content-Type are NEVER trusted (both attacker-controlled). | `assert_signature()` |
| **UUID rename** | Original filename discarded; a fresh `secrets.token_urlsafe(16).ext` name is written. Eliminates `../../etc/passwd`, null-byte tricks, double-extensions. | `safe_filename()` |
| **ClamAV virus scan** | Streamed scan via `clamd.instream()` over TCP socket (127.0.0.1:3310). **Fail-CLOSED** — refuses uploads if clamd is unreachable. | `virus_scan()` |
| **Prompt-injection sanitiser** | Soft-redacts 6 attack patterns ("ignore previous instructions", "<\|im_start\|>", role-play jailbreaks) from extracted text before LLM sees it. | `sanitize_for_prompt()` |

Public surface:
* `secure_read_upload(file, *, allowed_profiles, ...)` — drop-in for `await file.read()` on any FastAPI `UploadFile`.
* `secure_validate_b64(b64, *, allowed_profiles, ...)` — same contract for JSON-body endpoints (family wall photo / voice).
* Allowed-profile presets: `PROFILE_STATEMENT`, `PROFILE_IMAGE`, `PROFILE_AUDIO`, `PROFILE_DOCUMENT`.

### 2. ClamAV daemon
* Installed via `apt-get install -y clamav clamav-daemon`.
* Configured to listen on TCP `127.0.0.1:3310` (no systemd in container).
* Virus DB fetched via `freshclam` (main.cvd, daily.cvd, bytecode.cvd — total ~112 MB).
* Wired into supervisord at `/etc/supervisor/conf.d/clamd.conf` so it auto-starts and auto-restarts.
* EICAR test pattern correctly detected as `Eicar-Test-Signature` ✅.

### 3. Endpoints patched

| Endpoint | Profile | Before | After |
|---|---|---|---|
| `/api/statements/upload` | `PROFILE_STATEMENT` | `file.read()` raw | `secure_read_upload()` + `sanitize_for_prompt()` on extracted text |
| `/api/public/decode-statement` | `PROFILE_STATEMENT` | `file.read()` raw | `secure_read_upload()` + sanitiser |
| `/api/vault/upload` | `PROFILE_DOCUMENT` | MIME-only check | `secure_read_upload()` |
| `/api/documents` POST | `PROFILE_DOCUMENT` | MIME-only check, raw filename stored | `secure_read_upload()` + UUID-renamed stored |
| `/api/wall/posts` (photo) | `PROFILE_IMAGE` | size-only cap on b64 | `secure_validate_b64()` |
| `/api/wall/posts` (voice) | `PROFILE_AUDIO` | size-only cap on b64 | `secure_validate_b64()` |

### 4. Tests — `/app/backend/tests/test_phase4_upload_security.py`
7 tests, **all passing**:

* `test_public_decoder_rejects_extension_spoof` — `.pdf` filename + bogus bytes → 400 (magic-byte caught it).
* `test_public_decoder_accepts_real_pdf` — minimal valid PDF passes the signature gate.
* `test_oversize_file_rejected` — 22 MB → 413 (before any other processing).
* `test_eicar_csv_is_blocked` — EICAR pattern in `.csv` → 400 "this file was flagged as potentially harmful". ClamAV-detected as `Eicar-Test-Signature`.
* `test_sanitizer_redacts_ignore_previous_instructions` — 7 attack patterns redacted.
* `test_sanitizer_leaves_normal_text_alone` — normal invoice text untouched.
* `test_wall_photo_rejects_non_image_bytes` — base64 garbage with `image/png` MIME → 400 from magic-byte check.

### 5. Regression
Full sweep across all five phases (47 tests): **47 / 47 PASS**.

## Operational notes
* The first call to `/upload-*` after a backend restart pays a ~50 ms clamd handshake. Subsequent calls reuse the cached socket.
* `freshclam` should be re-run via cron in production (we don't have a cron yet — manual `freshclam` once a week is fine for v1; logged in delivery follow-ups).
* `CLAMAV_ENABLED=false` env var fully disables the scan layer — useful for local-dev environments that can't run clamd.

## Risk register impact (Phase 0 baseline → now)

* **HIGH** no magic-byte validation on uploads → **FIXED**
* **HIGH** no virus scan → **FIXED** (ClamAV daemon + fail-closed)
* **HIGH** no upload size limit (`extract_document` had per-format limits but the API itself didn't pre-check) → **FIXED** (20 MB hard ceiling)
* **MEDIUM** original filename trusted and stored → **FIXED** (UUID rename)
* **LOW** no prompt-injection sanitisation → **FIXED** (defence-in-depth alongside system-prompt isolation)

## Files changed

```
backend/
  upload_security.py        NEW — 5-layer secure-upload helper
  server.py                 /statements/upload, /public/decode-statement now use it
  vault.py                  /vault/upload now uses it
  documents_routes.py       POST /documents now uses it; filename stored is UUID
  batch2_routes.py          /wall/posts photo + voice now use secure_validate_b64
  tests/test_phase4_upload_security.py  NEW — 7 tests, all passing
/etc/supervisor/conf.d/clamd.conf     NEW — keeps clamd alive
/etc/clamav/clamd.conf               edited — TCP 127.0.0.1:3310
```
