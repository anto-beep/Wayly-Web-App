/**
 * programReference.js, frontend client for Wayly Phase 1 reference data.
 *
 * Fetches the canonical Support at Home figures from
 *   GET /api/program-reference/public
 * on first use and caches them in localStorage for an hour. Falls back to
 * baked-in literals if the API is unreachable so the page never blanks.
 *
 * Indexation events (1 July classification budgets, 20 March / 20 September
 * lifetime caps) flow to clients automatically, no redeploy needed. The
 * fallback values listed below are kept in lockstep with
 * backend/seed_program_reference.py and serve as a last-resort safety net.
 */
const STORAGE_KEY = "wayly:program-reference:v1";
const TTL_MS = 60 * 60 * 1000; // one hour

// Lockstep with backend/seed_program_reference.py SEED_ROWS as of 20 March 2026.
const FALLBACK = Object.freeze({
    as_of: "2026-06-09",
    classifications: {
        "1": { annual: 10731.00, label: "Classification 1" },
        "2": { annual: 15910.00, label: "Classification 2" },
        "3": { annual: 22515.00, label: "Classification 3" },
        "4": { annual: 29696.00, label: "Classification 4" },
        "5": { annual: 39805.00, label: "Classification 5" },
        "6": { annual: 49906.00, label: "Classification 6" },
        "7": { annual: 60005.00, label: "Classification 7" },
        "8": { annual: 78106.00, label: "Classification 8" },
    },
    care_management: { cap_pct: 0.10 },
    rollover: { floor_aud: 1000.00, pct: 0.10 },
    lifetime_cap: {
        standard: 137917.01,        // post-20-March-2026 indexed value
        no_worse_off: 86185.23,
        time_limited_years: 4,
    },
    stream_proportion: {
        Clinical: 0.40,
        Independence: 0.35,
        "Everyday Living": 0.25,
    },
    policy_dates: {
        personal_care_free: "2026-10-01",
        // National provider price caps were originally scheduled for 2026-07-01
        // but the Australian Government deferred them indefinitely in May 2026.
        // The fallback keeps the historical date here for reference; the live
        // status is exposed via policy_status.price_caps below.
        price_caps_start: "2026-07-01",
        eol_second_round_start: "2027-02-01",
        chsp_transition_earliest: "2027-07-01",
    },
    policy_status: {
        price_caps: "deferred_indefinitely",
    },
});

let _memoryCache = null;
let _inflight = null;

function _read() {
    if (_memoryCache) return _memoryCache;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const { snapshot, fetched_at } = JSON.parse(raw);
        if (Date.now() - fetched_at < TTL_MS) {
            _memoryCache = snapshot;
            return snapshot;
        }
    } catch { /* ignore corrupted cache */ }
    return null;
}

function _write(snapshot) {
    _memoryCache = snapshot;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            snapshot, fetched_at: Date.now(),
        }));
    } catch { /* localStorage full / disabled */ }
}

/**
 * Asynchronously load the snapshot. Repeated calls within the TTL return the
 * cached value. Failures resolve with the FALLBACK so callers never need to
 * handle errors, the page renders with the last-known-good figures.
 */
export async function loadProgramReference() {
    const cached = _read();
    if (cached) return cached;
    if (_inflight) return _inflight;

    const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
    _inflight = (async () => {
        try {
            const r = await fetch(`${BACKEND}/api/program-reference/public`, {
                method: "GET", credentials: "omit", cache: "no-store",
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const snapshot = await r.json();
            _write(snapshot);
            return snapshot;
        } catch {
            return FALLBACK;
        } finally {
            _inflight = null;
        }
    })();
    return _inflight;
}

/**
 * Synchronous accessor, returns the latest snapshot we've already loaded,
 * or FALLBACK. Use loadProgramReference() in a useEffect once at app boot,
 * then call this from render paths.
 */
export function getProgramReferenceSync() {
    return _read() || FALLBACK;
}

/** Convenience: annual budget for a classification (1-8). */
export function classificationAnnual(c) {
    const snap = getProgramReferenceSync();
    const row = snap.classifications?.[String(c)];
    return row ? row.annual : (FALLBACK.classifications[String(c)]?.annual || 0);
}

/** Convenience: quarterly budget after the 10% care-management deduction. */
export function classificationQuarterly(c) {
    const snap = getProgramReferenceSync();
    const annual = snap.classifications?.[String(c)]?.annual || 0;
    const cm = snap.care_management?.cap_pct ?? 0.10;
    return +(annual / 4 * (1 - cm)).toFixed(2);
}

/** Convenience: lifetime contribution cap for the standard cohort. */
export function lifetimeCapStandard() {
    return getProgramReferenceSync().lifetime_cap?.standard ?? FALLBACK.lifetime_cap.standard;
}

/** Convenience: lifetime contribution cap for the no-worse-off cohort. */
export function lifetimeCapNoWorseOff() {
    return getProgramReferenceSync().lifetime_cap?.no_worse_off ?? FALLBACK.lifetime_cap.no_worse_off;
}
