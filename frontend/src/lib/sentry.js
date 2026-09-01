// Wayly frontend observability, Sentry init (Phase 1)
// No-op when REACT_APP_SENTRY_DSN is blank, matching backend behaviour.
// PII scrub: emails, tokens, raw request bodies are dropped before transport.

import * as Sentry from "@sentry/react";

const DSN = process.env.REACT_APP_SENTRY_DSN || "";
const ENV = process.env.REACT_APP_SENTRY_ENV || "preview";
const RELEASE = process.env.REACT_APP_SENTRY_RELEASE || undefined;
const TRACES_SAMPLE_RATE = Number(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || 0.1);

// Strip PII-ish keys from anything we send.
const PII_KEYS = new Set([
  "email", "password", "token", "secret", "authorization",
  "session_token", "refresh_token", "access_token", "id_token",
  "totp", "totp_secret", "backup_code", "card", "card_number",
  "cvv", "ssn", "tfn", "medicare", "abn", "phone",
]);

function scrub(obj, depth = 0) {
  if (obj == null || depth > 6) return obj;
  if (Array.isArray(obj)) return obj.map((v) => scrub(v, depth + 1));
  if (typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = scrub(v, depth + 1);
    }
  }
  return out;
}

function beforeSend(event, hint) {
  // Drop emails / pii in user object
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }
  // Scrub headers / data
  if (event.request) {
    if (event.request.headers) event.request.headers = scrub(event.request.headers);
    if (event.request.data) event.request.data = scrub(event.request.data);
    if (event.request.cookies) event.request.cookies = "[redacted]";
    if (event.request.query_string) {
      event.request.query_string = String(event.request.query_string)
        .replace(/([?&](token|session|email|password)=)[^&]*/gi, "$1[redacted]");
    }
  }
  if (event.extra) event.extra = scrub(event.extra);
  if (event.contexts) event.contexts = scrub(event.contexts);
  // Drop breadcrumb form data
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((bc) => {
      if (bc.data) bc.data = scrub(bc.data);
      return bc;
    });
  }
  return event;
}

export function initSentry() {
  if (!DSN) {
    console.info("[wayly] Sentry disabled (REACT_APP_SENTRY_DSN not set)");
    return false;
  }
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    replaysSessionSampleRate: 0, // never auto-record sessions (PHI risk)
    replaysOnErrorSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    beforeSend,
    // Sentry adds breadcrumbs for fetch/xhr, strip URL query strings
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
        if (breadcrumb.data && breadcrumb.data.url) {
          breadcrumb.data.url = String(breadcrumb.data.url).split("?")[0];
        }
      }
      return breadcrumb;
    },
  });
  return true;
}

// Tag a Sentry event with the backend's X-Request-ID for cross-stack correlation.
export function tagRequestId(requestId) {
  if (!DSN || !requestId) return;
  Sentry.getCurrentScope().setTag("request_id", requestId);
}

// Attach a hashed user id (never raw email) to subsequent events.
export function setSentryUser(userId) {
  if (!DSN || !userId) return;
  Sentry.setUser({ id: userId });
}

export function clearSentryUser() {
  if (!DSN) return;
  Sentry.setUser(null);
}

export { Sentry };
