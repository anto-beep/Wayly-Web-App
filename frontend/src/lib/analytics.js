/**
 * Phase 9 — Plausible + PostHog goal-event helpers.
 *
 * Both libraries are loaded in /app/frontend/public/index.html. This module
 * is the single place we call them so we have:
 *   - One naming convention across both providers.
 *   - One null-safe wrapper that handles ad-blocked plausible/posthog
 *     globals without throwing.
 *   - One source of truth for the small set of business goals we care
 *     about (signup, decode, upgrade, trial-start, login, free-decode-used).
 *
 * Usage:
 *   import { track } from "@/lib/analytics";
 *   track.signup({ plan: "family" });
 *   track.decode({ rules: 18, anomalies: 3 });
 */

function plausible(eventName, props) {
    if (typeof window === "undefined") return;
    try {
        if (typeof window.plausible === "function") {
            window.plausible(eventName, props ? { props } : undefined);
        }
    } catch (_) {
        // Best-effort. Never throw from analytics.
    }
}

function posthog(eventName, props) {
    if (typeof window === "undefined") return;
    try {
        if (window.posthog && typeof window.posthog.capture === "function") {
            window.posthog.capture(eventName, props || {});
        }
    } catch (_) {
        // Best-effort. Never throw from analytics.
    }
}

function identifyUser(user) {
    if (typeof window === "undefined" || !user) return;
    try {
        if (window.posthog && typeof window.posthog.identify === "function") {
            window.posthog.identify(user.id || user.email, {
                email: user.email,
                plan: user.plan,
                role: user.role,
            });
        }
    } catch (_) {}
}

function resetUser() {
    if (typeof window === "undefined") return;
    try {
        if (window.posthog && typeof window.posthog.reset === "function") {
            window.posthog.reset();
        }
    } catch (_) {}
}

// Send to both providers using the same event name so dashboards align.
function emit(event, props) {
    plausible(event, props);
    posthog(event, props);
}

export const track = {
    // Auth / lifecycle
    signup: (props = {}) => emit("signup", props),
    login: (props = {}) => emit("login", props),
    logout: () => emit("logout"),

    // Trial + upgrade funnel
    trialStart: (props = {}) => emit("trial_start", props),
    upgradeClick: (props = {}) => emit("upgrade_click", props),
    upgradeSuccess: (props = {}) => emit("upgrade_success", props),
    cancelSubscription: (props = {}) => emit("cancel_subscription", props),

    // Core product usage
    decode: (props = {}) => emit("statement_decode", props),
    freeDecodeUsed: (props = {}) => emit("free_decode_used", props),
    toolRun: (toolSlug, props = {}) => emit("tool_run", { tool: toolSlug, ...props }),

    // Marketing / SEO funnel
    ctaClick: (location, props = {}) => emit("cta_click", { location, ...props }),
    contactSubmit: (props = {}) => emit("contact_submit", props),

    // Identify / reset (PostHog only)
    identify: identifyUser,
    reset: resetUser,
};

export default track;
