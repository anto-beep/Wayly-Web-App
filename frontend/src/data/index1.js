/**
 * INDEX-1 monetary constants for Support at Home (2026 baseline).
 *
 * Loaded verbatim from `/app/data/index1.json` at build time so blog
 * articles and tools can render dynamic dollar figures with a visible
 * "effective from" date. Bump the JSON, re-run build, and every article
 * that references INDEX-1 updates in one pass.
 *
 * Usage from an article component:
 *
 *   import INDEX1, { fmtAud, effectiveLabel } from "@/data/index1";
 *   const cap = fmtAud(INDEX1.lifetime_cap_aud);
 *   // → "$137,917"
 *   const effectiveFrom = effectiveLabel(INDEX1);
 *   // → "effective from 01/01/2026"
 */
import INDEX1 from "./index1.json";

export default INDEX1;

/** Format an AUD figure with thousands separators, no cents by default. */
export function fmtAud(value, { cents = false } = {}) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "$0";
    const n = Number(value);
    return cents
        ? `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${Math.round(n).toLocaleString("en-AU")}`;
}

/** DD/MM/YYYY effective date + version tag for the "effective from" footnote. */
export function effectiveLabel(idx = INDEX1) {
    const iso = idx?.effective_from || "";
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `effective from ${d}/${m}/${y}`;
}

/** Convenience, pull a classification block by numeric level (1..8). */
export function classificationLevel(level, idx = INDEX1) {
    return idx?.classifications?.[`level_${level}`] || null;
}
