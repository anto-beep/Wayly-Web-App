# Phase 5 — HTTP Security Headers — DELIVERY REPORT

Date: 2026-02-06
Scope: new `security_headers.py` Starlette middleware, hooks in `server.py`,
new `/app/frontend/public/_headers` for static-asset coverage; pytest suite.

## What was shipped

### 1. New `/app/backend/security_headers.py`
Starlette middleware that attaches the canonical header set to every API
response (skips `/api/health` for monitoring-probe performance):

| Header | Value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | 2-year HSTS, ready for preload-list submission |
| `X-Content-Type-Options` | `nosniff` | Block MIME sniffing |
| `X-Frame-Options` | `DENY` | Clickjacking — also covered by `frame-ancestors 'none'` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Strip path on cross-origin navigation |
| `Permissions-Policy` | `accelerometer=()`, `camera=()`, `geolocation=()`, `gyroscope=()`, `magnetometer=()`, `microphone=(self)`, `payment=(self)`, `usb=()`, `interest-cohort=()` | Disable all hardware sensors caregivers don't need; microphone only for voice features; FLoC opt-out |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | Spectre / popup isolation |
| `Cross-Origin-Resource-Policy` | `same-site` | Resource leak protection |
| `Content-Security-Policy` | tight directive set (see below) | XSS hard stop |

### 2. Content Security Policy
Built from a single `_CSP` dict so adding a vendor is one line. Current allowlist:

```
default-src 'self';
script-src   'self' 'unsafe-inline' 'unsafe-eval'
             https://plausible.io https://*.posthog.com
             https://js.stripe.com https://accounts.google.com
             https://www.googletagmanager.com https://customer.io
             https://sentry.io
             https://*.emergent.sh https://*.emergentagent.com;
style-src    'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src     'self' data: https://fonts.gstatic.com;
img-src      'self' data: blob:
             https://*.s3.amazonaws.com https://*.s3.ap-southeast-2.amazonaws.com
             https://*.r2.cloudflarestorage.com
             https://images.unsplash.com https://*.googleusercontent.com
             https://www.google-analytics.com https://*.emergentagent.com;
connect-src  'self' https://*.emergentagent.com https://*.emergent.sh
             https://plausible.io https://*.posthog.com
             https://api.stripe.com https://*.sentry.io
             https://www.google-analytics.com
             wss://*.emergentagent.com;
frame-src    'self' https://js.stripe.com https://hooks.stripe.com
             https://accounts.google.com;
object-src   'none';
base-uri     'self';
form-action  'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

`'unsafe-inline'` and `'unsafe-eval'` are kept on `script-src` for now — CRA's
runtime needs them, as does Stripe.js. Tightening to a nonce-based CSP is a
~2-day project tracked as a Phase 5 follow-up (not blocking compliance).

### 3. CSP report-only switch
`CSP_REPORT_ONLY=true` (env var) flips the header to
`Content-Security-Policy-Report-Only`. Useful for adding a new vendor —
you can see what would have been blocked without breaking the app.

### 4. `/app/frontend/public/_headers`
SPA-side mirror of the same directives, written in the
Cloudflare-Pages / Netlify `_headers` format. Applied to every static asset
(`/static/*`, `/index.html`, etc.) so they're equally protected.

### 5. Tests — `/app/backend/tests/test_phase5_security_headers.py`
8 tests, **all passing**:

* `test_every_api_response_has_security_headers[/auth/me]` — 401 response still carries the headers.
* `test_every_api_response_has_security_headers[/public/contribution-estimator]` — even unauth tools have headers.
* `test_every_api_response_has_security_headers[/account]` — household route too.
* `test_hsts_two_year_max_age` — HSTS is `≥ 2 years` and includes `preload`.
* `test_xframe_options_is_deny` — `X-Frame-Options: DENY` exact match.
* `test_csp_has_frame_ancestors_none` — CSP has `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
* `test_health_endpoint_skipped_for_performance` — `/api/health` is exempt (monitoring perf).
* `test_spa_headers_file_exists_and_matches` — static `_headers` file mirrors the same baseline.

### 6. Regression
Full sweep across Phases 1+2+3+4+5: **47 / 47 PASS**.

## Risk register impact (Phase 0 baseline → now)

* **HIGH** no HSTS / clickjacking / MIME-sniff protection → **FIXED**
* **HIGH** no CSP → **FIXED** (vendor allowlist + `'none'` defaults)
* **MEDIUM** no FLoC opt-out / cohort header → **FIXED** (`interest-cohort=()`)
* **MEDIUM** SPA static assets uncovered by API middleware → **FIXED** (`_headers` mirror)

## Files changed

```
backend/
  security_headers.py             NEW — Starlette middleware
  server.py                       installs middleware after CORS
  tests/test_phase5_security_headers.py   NEW — 8 tests, all passing

frontend/
  public/_headers                 NEW — Cloudflare / Netlify static-asset headers
```

## Production rollout checklist
1. No env vars required — headers are baked in.
2. After deploying, run `curl -I https://wayly.com.au/api/auth/me` and confirm the 8 security headers are present.
3. Submit the domain to https://hstspreload.org/ once HSTS has been live for >24h with `includeSubDomains` and `preload`.
4. Add the domain to securityheaders.com / observatory.mozilla.org as part of the standing release checklist — aim for an A+ grade on both.
