/**
 * CONV-1 v2 · Feature flags (spec Section 10).
 *
 * Every CONV-1 workstream ships behind its own flag. The spec defaults each to
 * OFF for production rollout gating; in THIS environment they default ON so the
 * whole build is testable in preview. Production rollout can force any flag OFF
 * via the build-time REACT_APP_CONV1_FLAGS_OFF env (comma-separated flag names)
 * or a host-injected window.__CONV1_FLAGS__ override. Nothing user-controllable
 * is ever read.
 */

const FLAG_NAMES = [
    "conv1_truth_pass",       // A — truth pass
    "conv1_analytics",        // K — measurement
    "conv1_anon_invoice_check", // B — anonymous invoice check
    "conv1_result_capture",   // C — capture at moment of value
    "conv1_free_tier",        // D — free account tier + metering
    "conv1_trial_compliance", // E — trial redesign + reminders
    "conv1_signup_reduced",   // F — four-field signup
    "conv1_article_cta",      // G — contextual offers in resources
    "conv1_trust_layer",      // H — trust & identity
    "conv1_lifecycle_email",  // I — return triggers
    "conv1_prompt",           // J — on-page prompt
];

function offSet() {
    const raw = (process.env.REACT_APP_CONV1_FLAGS_OFF || "").trim();
    return new Set(raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : []);
}

const OFF = offSet();

export function isConv1FlagOn(name) {
    if (!FLAG_NAMES.includes(name)) return false;
    if (OFF.has(name)) return false;
    try {
        const o = typeof window !== "undefined" ? window.__CONV1_FLAGS__ : null;
        if (o && Object.prototype.hasOwnProperty.call(o, name)) return Boolean(o[name]);
    } catch (_) { /* ignore */ }
    return true;
}

export const CONV1_FLAGS = FLAG_NAMES;
export default isConv1FlagOn;
