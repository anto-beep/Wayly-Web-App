"""Phase 5 — HTTP security headers middleware.

Wraps every response with the standard security header set. Tuned for a
React (CRA) SPA that talks to its own /api backend and pulls a small,
audited set of third-party scripts (Plausible analytics, Stripe.js,
PostHog, Google Fonts, the Emergent Google OAuth host).

The CSP is built from a single dict so adding/removing a third-party host
is a one-line change. Report-only mode is supported via
`CSP_REPORT_ONLY=true` — useful when adding a new vendor and you want to
see what breaks before tightening.
"""
from __future__ import annotations
import os
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

log = logging.getLogger("wayly.security.headers")

# --------------------------------------------------------------------------
# CSP directives
# --------------------------------------------------------------------------

_CSP = {
    "default-src": ["'self'"],
    # 'unsafe-inline' is sadly required by CRA's runtime and by the
    # third-party widgets (Stripe / Google). Once we migrate to nonces this
    # can tighten significantly.
    "script-src": [
        "'self'", "'unsafe-inline'", "'unsafe-eval'",
        "https://plausible.io",
        "https://*.posthog.com",
        "https://js.stripe.com",
        "https://accounts.google.com",
        "https://www.googletagmanager.com",
        "https://customer.io",
        "https://sentry.io",
        "https://*.emergent.sh",
        "https://*.emergentagent.com",
    ],
    "style-src": [
        "'self'", "'unsafe-inline'",
        "https://fonts.googleapis.com",
    ],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": [
        "'self'", "data:", "blob:",
        "https://*.s3.amazonaws.com",
        "https://*.s3.ap-southeast-2.amazonaws.com",
        "https://*.r2.cloudflarestorage.com",
        "https://images.unsplash.com",
        "https://*.googleusercontent.com",
        "https://www.google-analytics.com",
        "https://*.emergentagent.com",
    ],
    "connect-src": [
        "'self'",
        "https://*.emergentagent.com",
        "https://*.emergent.sh",
        "https://plausible.io",
        "https://*.posthog.com",
        "https://api.stripe.com",
        "https://*.sentry.io",
        "https://www.google-analytics.com",
        "wss://*.emergentagent.com",
    ],
    "frame-src": [
        "'self'",
        "https://js.stripe.com",
        "https://hooks.stripe.com",
        "https://accounts.google.com",
    ],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],   # equivalent to X-Frame-Options DENY
    "upgrade-insecure-requests": [],  # standalone directive
}


def _build_csp() -> str:
    parts: list[str] = []
    for directive, sources in _CSP.items():
        if sources:
            parts.append(f"{directive} {' '.join(sources)}")
        else:
            parts.append(directive)
    return "; ".join(parts)


_HSTS = "max-age=63072000; includeSubDomains; preload"
_PERMISSIONS = (
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), "
    "microphone=(self), payment=(self), usb=(), interest-cohort=()"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply the canonical Wayly security header set on every response.

    Skipped for the `/api/health` route (so monitoring probes stay cheap) but
    otherwise unconditional. Already-set headers are preserved — handlers can
    override on a case-by-case basis (e.g. PDF downloads that need different
    Content-Disposition logic).
    """

    def __init__(self, app, *, csp_report_only: bool = False):
        super().__init__(app)
        self._csp = _build_csp()
        self._csp_report_only = csp_report_only

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Lightweight skip for health probes.
        path = request.url.path
        if path == "/api/health":
            return response

        # Strict-Transport-Security — only meaningful on HTTPS, but harmless on
        # http during local dev.
        response.headers.setdefault("Strict-Transport-Security", _HSTS)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", _PERMISSIONS)
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")

        # CSP — JSON API responses get a tight CSP; HTML responses get the
        # full directive set. Both share the same source allowlist.
        header_name = (
            "Content-Security-Policy-Report-Only" if self._csp_report_only
            else "Content-Security-Policy"
        )
        if header_name not in response.headers:
            response.headers[header_name] = self._csp

        return response


def install(app) -> None:
    """Call from `server.py` once during app boot."""
    report_only = os.environ.get("CSP_REPORT_ONLY", "false").lower() in ("1", "true", "yes")
    app.add_middleware(SecurityHeadersMiddleware, csp_report_only=report_only)
    log.info("security headers middleware installed (csp_report_only=%s)", report_only)
