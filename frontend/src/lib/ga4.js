/**
 * Google Tag Manager (GTM-MVLXCD7D) dataLayer bridge for Wayly.
 *
 * The GTM container is loaded (PRODUCTION-HOST-GATED) from public/index.html.
 * GA4 (G-1E3HYT8R91) is configured INSIDE GTM — this module NEVER calls gtag
 * for GA4. It only pushes well-named, non-PII events onto window.dataLayer,
 * which GTM maps to GA4 events:
 *
 *   wayly_page_view         → GA4 page_view
 *   wayly_sign_up_success   → GA4 sign_up
 *   wayly_trial_started     → GA4 trial_started
 *   wayly_decoder_started   → GA4 decoder_started
 *   wayly_decoder_completed → GA4 decoder_completed
 *   wayly_decoder_failed    → GA4 decoder_failed
 *
 * RULES
 *  - PRODUCTION ONLY (wayly.com.au). Off-prod every push is a console.debug
 *    dry-run so wiring is observable on preview without sending data.
 *  - NO PII. Only a fixed allow-list of params is ever pushed: plan_type,
 *    signup_method, input_method, surface, is_sample, authenticated,
 *    environment — plus sanitized page fields for page_view.
 *  - EXACTLY ONCE. Conversion/funnel events dedupe on a stable id via
 *    localStorage so refresh / rerender / retry / repeated callbacks never
 *    double-count. The id is a LOCAL dedupe key only — never pushed to GA4.
 *
 * Campaign attribution (utm params / gclid) is captured natively by the GA4
 * tag in GTM on the landing page_view and persists across the session to the
 * sign_up / trial_started events — no PII and nothing extra to do here.
 */

const PROD_HOSTS = new Set(["wayly.com.au", "www.wayly.com.au"]);
const SENT_PREFIX = "wayly_ga4_sent_v1:";
const CTRL = /^[a-z0-9_-]{1,40}$/i;

const ALLOWED_EVENTS = new Set([
    "wayly_page_view",
    "wayly_sign_up_success",
    "wayly_trial_started",
    "wayly_decoder_started",
    "wayly_decoder_completed",
    "wayly_decoder_failed",
]);

function isProduction() {
    return typeof window !== "undefined" && PROD_HOSTS.has(window.location.hostname);
}

function token(v) {
    return typeof v === "string" && CTRL.test(v) ? v : undefined;
}

// Push to dataLayer on production; dry-run log elsewhere.
function dlPush(obj) {
    if (typeof window === "undefined") return false;
    if (!ALLOWED_EVENTS.has(obj.event)) return false;
    if (isProduction()) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(obj);
        return true;
    }
    try { console.debug("[GTM:dry-run] dataLayer.push", obj); } catch (_) { /* ignore */ }
    return false;
}

// Build an event payload from the allow-list only (never any PII).
function buildParams(fields = {}) {
    const p = { environment: "production" };
    const pt = token(fields.plan_type); if (pt) p.plan_type = pt;
    const sm = token(fields.signup_method); if (sm) p.signup_method = sm;
    const im = token(fields.input_method); if (im) p.input_method = im;
    const sf = token(fields.surface); if (sf) p.surface = sf;
    if (typeof fields.is_sample === "boolean") p.is_sample = fields.is_sample;
    if (typeof fields.authenticated === "boolean") p.authenticated = fields.authenticated;
    return p;
}

// Fire exactly once per stable id. `successId` is a LOCAL dedupe key only.
function pushOnce(event, successId, fields = {}) {
    if (typeof window === "undefined" || !successId) return false;
    const key = `${SENT_PREFIX}${event}:${successId}`;
    try { if (window.localStorage.getItem(key) === "1") return false; } catch (_) { /* storage may be blocked */ }
    dlPush({ event, ...buildParams(fields) });
    try { window.localStorage.setItem(key, "1"); } catch (_) { /* best-effort */ }
    return true;
}

// Sanitize a route path so record ids never reach analytics, e.g.
// /app/statements/665f1c… → /app/statements/:id
function safePath(pathname) {
    let path = String(pathname || "/").split("?")[0].split("#")[0];
    path = path
        .replace(/\/[0-9a-f]{8,}(?:-[0-9a-f-]+)?(?=\/|$)/gi, "/:id")
        .replace(/\/\d{3,}(?=\/|$)/g, "/:id");
    return path.slice(0, 120);
}

// Map a backend input_method onto our 4 non-sensitive buckets.
export function decoderInputMethod(raw) {
    switch (raw) {
        case "text_paste": return "paste";
        case "email_attachment": return "email";
        case "text_file":
        case "word_document":
        case "pdf_text":
        case "pdf_scanned":
        case "image_vision": return "upload";
        default: return undefined;
    }
}

// page_view fires once per route change (NOT deduped — revisits should count).
export function gtmPageView(pathname) {
    if (typeof window === "undefined") return;
    const page_path = safePath(pathname || window.location.pathname);
    dlPush({
        event: "wayly_page_view",
        page_path,
        page_title: (typeof document !== "undefined" ? document.title : "").slice(0, 120),
        page_location: `${window.location.origin}${page_path}`,
        environment: "production",
    });
}

export const ga4Track = {
    // Account CONFIRMED created (never on click/submit/failed).
    signUp: (id, o = {}) => pushOnce("wayly_sign_up_success", id, { signup_method: o.signup_method, plan_type: o.plan_type }),
    // Free trial CONFIRMED active — the primary marketing conversion.
    trialStarted: (id, o = {}) => pushOnce("wayly_trial_started", id, { plan_type: o.plan_type, signup_method: o.signup_method }),
    // Decoder funnel — product-engagement, measured separately from trials.
    decoderStarted: (id, o = {}) => pushOnce("wayly_decoder_started", id, { input_method: o.input_method, is_sample: o.is_sample, surface: o.surface, authenticated: o.authenticated }),
    decoderCompleted: (id, o = {}) => pushOnce("wayly_decoder_completed", id, { input_method: o.input_method, is_sample: o.is_sample, surface: o.surface, authenticated: o.authenticated, plan_type: o.plan_type }),
    decoderFailed: (id, o = {}) => pushOnce("wayly_decoder_failed", id, { input_method: o.input_method, is_sample: o.is_sample, surface: o.surface, authenticated: o.authenticated }),
};

export default ga4Track;
