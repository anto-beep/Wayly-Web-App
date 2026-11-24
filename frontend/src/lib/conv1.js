/**
 * CONV-1 v2 · Workstream K measurement bridge.
 *
 * Fires the exact GA4 key-event taxonomy from K1 onto the GTM dataLayer
 * (production host only; dry-run logged elsewhere, mirroring lib/ga4.js) and
 * mirrors every event to PostHog (K4) so session replay can attach to drop-off
 * in all environments.
 *
 * K2: every event carries source_page, device_category, persona (where known)
 * and plan (where relevant). No PII is ever sent, source_page is route
 * sanitised so record ids never reach analytics.
 */

import { isConv1FlagOn } from "@/config/conv1Flags";

const PROD_HOSTS = new Set(["wayly.com.au", "www.wayly.com.au"]);

// The K1 key events plus the three Workstream J prompt events.
const CONV1_EVENTS = new Set([
    "anon_check_started",
    "anon_check_completed",
    "result_emailed",
    "free_account_created",
    "signup_started",
    "plan_selected",
    "card_step_reached",
    "trial_started",
    "trial_converted",
    "article_cta_clicked",
    "prompt_shown",
    "prompt_converted",
    "prompt_dismissed",
]);

function isProduction() {
    return typeof window !== "undefined" && PROD_HOSTS.has(window.location.hostname);
}

function safePath(pathname) {
    const base = pathname || (typeof window !== "undefined" ? window.location.pathname : "/");
    let path = String(base).split("?")[0].split("#")[0];
    path = path
        .replace(/\/[0-9a-f]{8,}(?:-[0-9a-f-]+)?(?=\/|$)/gi, "/:id")
        .replace(/\/\d{3,}(?=\/|$)/g, "/:id");
    return path.slice(0, 120);
}

function deviceCategory() {
    if (typeof navigator === "undefined") return "unknown";
    const ua = navigator.userAgent || "";
    if (/\b(iPad|Tablet)\b/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
    if (/Mobi|iPhone|Android.*Mobile|Windows Phone/i.test(ua)) return "mobile";
    return "desktop";
}

function persona() {
    try {
        const p = window.localStorage.getItem("wayly_persona_intent");
        return p === "caregiver" || p === "participant" ? p : undefined;
    } catch (_) { return undefined; }
}

// K2 standard params merged into every event (null/empty values dropped).
function baseParams(extra = {}) {
    const p = { source_page: safePath(), device_category: deviceCategory() };
    const per = persona(); if (per) p.persona = per;
    Object.keys(extra).forEach((k) => {
        const v = extra[k];
        if (v !== undefined && v !== null && v !== "") p[k] = v;
    });
    return p;
}

function toDataLayer(event, params) {
    if (typeof window === "undefined") return;
    if (isProduction()) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event, ...params });
    } else {
        try { console.debug("[conv1:dry-run] dataLayer.push", event, params); } catch (_) { /* ignore */ }
    }
}

function toPostHog(event, params) {
    if (typeof window === "undefined") return;
    try {
        if (window.posthog && typeof window.posthog.capture === "function") {
            window.posthog.capture(event, params);
        }
    } catch (_) { /* best-effort, never throw from analytics */ }
}

/** Fire a CONV-1 measurement event to GA4 (via GTM) + PostHog. */
export function conv1Track(event, extra = {}) {
    if (!isConv1FlagOn("conv1_analytics")) return;
    if (!CONV1_EVENTS.has(event)) return;
    const params = baseParams(extra);
    toDataLayer(event, params);
    toPostHog(event, params);
}

// Named helpers, one per K1 row, so call-sites read cleanly.
export const conv1 = {
    anonCheckStarted: (o) => conv1Track("anon_check_started", o),
    anonCheckCompleted: (o) => conv1Track("anon_check_completed", o),
    resultEmailed: (o) => conv1Track("result_emailed", o),
    freeAccountCreated: (o) => conv1Track("free_account_created", o),
    signupStarted: (o) => conv1Track("signup_started", o),
    planSelected: (plan, o = {}) => conv1Track("plan_selected", { plan, ...o }),
    cardStepReached: (o) => conv1Track("card_step_reached", o),
    trialStarted: (o) => conv1Track("trial_started", o),
    trialConverted: (o) => conv1Track("trial_converted", o),
    articleCtaClicked: (slug, o = {}) => conv1Track("article_cta_clicked", { article_slug: slug, ...o }),
    promptShown: (o) => conv1Track("prompt_shown", o),
    promptConverted: (o) => conv1Track("prompt_converted", o),
    promptDismissed: (o) => conv1Track("prompt_dismissed", o),
};

export default conv1;
