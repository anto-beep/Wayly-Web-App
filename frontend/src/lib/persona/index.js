/**
 * Wayly PERSONA-1, Frontend persona hook.
 *
 * Client-side mirror of the backend registry so components can resolve
 * copy without a round-trip. For Tier-1 empathy-critical strings we
 * defer to the backend resolver (single source of truth); for Tier-2
 * label templates we render locally after fetching the token bundle
 * once from `GET /api/persona`.
 *
 * Admin preview override: when the current user is an admin, values
 * stored in ``localStorage["wayly.persona_preview"]`` (JSON:
 * ``{persona, pronouns, first_name}``) are:
 * - sent along on every `/persona/resolve` POST so Tier-1 lookups render
 *   the previewed persona;
 * - and applied client-side to the Tier-2 token map so labels reflect
 *   the preview without a round trip.
 * Non-admin users have their override silently ignored server-side.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const PREVIEW_KEY = "wayly.persona_preview";

let _bundleCache = null;   // { persona, pronouns, tokens, flag_enabled, care_recipient_first_name }
let _bundlePromise = null;

const TOKEN_RE = /\{([a-z_][a-z0-9_]*)\}/gi;

/** Read the admin-preview override from localStorage. Returns null when unset. */
export function readPersonaPreview() {
    try {
        const raw = window.localStorage.getItem(PREVIEW_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || (!parsed.persona && !parsed.pronouns && !parsed.first_name)) return null;
        return parsed;
    } catch { return null; }
}

/** Persist or clear the admin-preview override. */
export function setPersonaPreview(next) {
    try {
        if (!next) window.localStorage.removeItem(PREVIEW_KEY);
        else window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
        // Bust the module-level cache and let listeners refresh.
        _bundleCache = null;
        window.dispatchEvent(new Event("wayly:persona-preview-changed"));
    } catch { /* localStorage blocked, noop */ }
}

function _applyPreviewToTokens(bundleTokens, preview) {
    if (!preview) return bundleTokens || {};
    // Best-effort local Tier-2 substitution: we don't have the full
    // conjugation table on the frontend, but the values that change most
    // visibly ({subject}, {subject_possessive}) can be derived cheaply.
    const first = preview.first_name || "";
    const possessive = first ? (first.endsWith("s") ? `${first}'` : `${first}'s`) : "the care recipient's";
    if (preview.persona === "participant") {
        return {
            ...(bundleTokens || {}),
            subject: "you",
            subject_possessive: "your",
            subject_subjective: "you",
            subject_objective: "you",
            subject_reflexive: "yourself",
            be_present: "are",
            have_present: "have",
            was_past: "were",
        };
    }
    // caregiver
    return {
        ...(bundleTokens || {}),
        subject: first || "the care recipient",
        subject_possessive: possessive,
    };
}

async function _loadBundle() {
    if (_bundleCache) return _bundleCache;
    if (_bundlePromise) return _bundlePromise;
    _bundlePromise = api.get("/persona")
        .then((r) => {
            const preview = readPersonaPreview();
            const server = r.data?.resolver || {
                persona: "caregiver",
                pronouns: "unknown",
                tokens: {},
                flag_enabled: false,
                care_recipient_first_name: null,
            };
            _bundleCache = {
                ...server,
                tokens: _applyPreviewToTokens(server.tokens, preview),
                preview,
            };
            return _bundleCache;
        })
        .catch(() => {
            _bundleCache = {
                persona: "caregiver",
                pronouns: "unknown",
                tokens: {},
                flag_enabled: false,
                care_recipient_first_name: null,
                preview: null,
            };
            return _bundleCache;
        })
        .finally(() => { _bundlePromise = null; });
    return _bundlePromise;
}

/**
 * Substitute Tier-2 tokens in `template` using an already-loaded bundle.
 * Unknown tokens are left as `{token}` so upstream code can spot leaks.
 */
export function renderTier2(template, tokens) {
    if (!template) return template;
    if (!tokens) return template;
    return String(template).replace(TOKEN_RE, (m, key) => (tokens[key] !== undefined ? tokens[key] : m));
}

/**
 * React hook, returns a stable `persona` object with:
 *   .bundle         (latest resolver bundle)
 *   .tier2(tmpl)    (synchronous local substitution)
 *   .tier1(key)     (async, hits /api/persona/resolve, respects preview)
 *   .refresh()      (re-fetches after account edits)
 */
export function usePersona() {
    const [bundle, setBundle] = useState(_bundleCache);

    useEffect(() => {
        let cancelled = false;
        if (!_bundleCache) {
            _loadBundle().then((b) => { if (!cancelled) setBundle(b); });
        }
        const onChange = () => {
            _loadBundle().then((b) => { if (!cancelled) setBundle(b); });
        };
        window.addEventListener("wayly:persona-preview-changed", onChange);
        return () => {
            cancelled = true;
            window.removeEventListener("wayly:persona-preview-changed", onChange);
        };
    }, []);

    const tier2 = useCallback(
        (template) => renderTier2(template, bundle?.tokens || _bundleCache?.tokens || {}),
        [bundle],
    );

    const tier1 = useCallback(async (key) => {
        try {
            const preview = readPersonaPreview();
            const body = { tier1_keys: [key] };
            if (preview?.persona) body.override_persona = preview.persona;
            if (preview?.pronouns) body.override_pronouns = preview.pronouns;
            if (preview?.first_name !== undefined) body.override_first_name = preview.first_name || null;
            const { data } = await api.post("/persona/resolve", body);
            const value = data?.tier1?.[key];
            if (value) return value;
            if (data?.tier1_missing?.includes(key)) return null;
        } catch { /* fall through */ }
        return null;
    }, []);

    const refresh = useCallback(async () => {
        _bundleCache = null;
        const next = await _loadBundle();
        setBundle(next);
        return next;
    }, []);

    return { bundle, tier2, tier1, refresh };
}

/**
 * Batch-fetch a bag of Tier-1 keys and keep them fresh across preview
 * changes. Returns ``{ copy, ready }`` where ``copy`` is a key→string map
 * seeded with ``defaults`` and updated once the server responds. Handy
 * for tool result views that render several Tier-1 strings at once.
 */
export function usePersonaTier1(keys, defaults = {}) {
    const [copy, setCopy] = useState(defaults);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const keyList = Array.isArray(keys) ? keys : [];
        if (keyList.length === 0) { setReady(true); return; }
        const fetchCopy = async () => {
            try {
                const preview = readPersonaPreview();
                const body = { tier1_keys: keyList };
                if (preview?.persona) body.override_persona = preview.persona;
                if (preview?.pronouns) body.override_pronouns = preview.pronouns;
                if (preview?.first_name !== undefined) body.override_first_name = preview.first_name || null;
                const { data } = await api.post("/persona/resolve", body);
                if (cancelled) return;
                const t = data?.tier1 || {};
                setCopy((cur) => {
                    const next = { ...cur };
                    for (const k of keyList) if (t[k]) next[k] = t[k];
                    return next;
                });
            } catch { /* keep defaults */ }
            finally { if (!cancelled) setReady(true); }
        };
        fetchCopy();
        const onChange = () => { setReady(false); fetchCopy(); };
        window.addEventListener("wayly:persona-preview-changed", onChange);
        return () => {
            cancelled = true;
            window.removeEventListener("wayly:persona-preview-changed", onChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [Array.isArray(keys) ? keys.join("|") : ""]);

    return { copy, ready };
}

/** Clear the module-level cache. Call from the logout path so a role
 * switch inside the same tab can't briefly show cached tokens. */
export function clearPersonaCache() {
    _bundleCache = null;
    _bundlePromise = null;
}
