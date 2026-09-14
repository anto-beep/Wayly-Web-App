/**
 * UXF-1 v3 feature flags.
 *
 * Per-surface rollout controls so the new state library can ship behind
 * flags without breaking existing tools. Each flag defaults to OFF until
 * a surface is migrated + tested per spec Section 10.
 *
 * Wire an override by setting `localStorage.setItem("uxf_flags", JSON.stringify({...}))`
 * or by pushing an env-driven override at build time via
 * `process.env.REACT_APP_UXF_FLAGS`.
 */

const DEFAULTS = {
    "uxf_v3.tokens": true,       // tokens ship enabled (no visual change on their own)
    "uxf_v3.library": true,      // library available, individual surfaces pick which use
    "uxf_v3.theme_toggle": true, // Settings dark-mode toggle visible

    // Per-surface state rollouts, ALL ENABLED after Wave 2 sign-off (Jul 2026)
    "uxf_v3.decoder": true,
    "uxf_v3.ce2": true,
    "uxf_v3.lf1": true,
    "uxf_v3.care_plan": true,
    "uxf_v3.ppc": true,
    "uxf_v3.family_coordinator": true,
    "uxf_v3.dashboard": true,
    "uxf_v3.settings": true,

    // Cross-cutting features, Wave 3
    "uxf_v3.artifacts": true,
    "uxf_v3.provenance": true,
    "uxf_v3.disclosure": true,
    "uxf_v3.session_and_offline": true,
};

function readEnvOverride() {
    try {
        const raw = process.env.REACT_APP_UXF_FLAGS;
        if (!raw) return {};
        return JSON.parse(raw);
    } catch { return {}; }
}

function readLocalOverride() {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem("uxf_flags");
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

let _cache = null;

/**
 * Merged flag map. Order of precedence (highest wins):
 *   localStorage > env > defaults
 */
export function flags() {
    if (_cache) return _cache;
    _cache = { ...DEFAULTS, ...readEnvOverride(), ...readLocalOverride() };
    return _cache;
}

/**
 * Boolean helper used at render time.
 *
 * @example
 *   if (isEnabled("uxf_v3.decoder")) { ... }
 */
export function isEnabled(flag) {
    return Boolean(flags()[flag]);
}

/**
 * Test-only setter. Sets a flag in localStorage and clears the cache so
 * the next call to `flags()` picks it up.
 */
export function _setFlagForTest(flag, value) {
    const overrides = readLocalOverride();
    overrides[flag] = value;
    try { window.localStorage.setItem("uxf_flags", JSON.stringify(overrides)); } catch { /* ignore */ }
    _cache = null;
}
