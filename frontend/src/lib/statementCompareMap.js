// STMT-UI-1 v2 · Phase 3b/3c, Divergence map + sync-scroll helpers.
// Purely client-side per Decision 8/9. Uses the pdf.js text layer surfaced by
// react-pdf's `onGetTextSuccess` callback.
//
// Public API:
//   decodedDollarFigures(stmt)      → list of decoded {id, label, value, category}
//   extractPdfDollarTokens(text)    → normalise a text-layer item list into tokens
//   buildDivergenceMap(decoded, tokensByPage)
//                                   → { agree, differ, missing }
//
// Matching heuristic (conservative, never fabricate matches):
//   • For each decoded figure, scan every dollar-shaped PDF token.
//   • Prefer exact numeric equality (rounded to cents).
//   • If no exact hit, fall back to a within-1c tolerance AND a description
//     proximity check (the decoded label's first meaningful word must appear
//     within the same or previous 6 tokens in the PDF text layer).
//   • If still no confident match → figure lands in `missing` and DOES NOT
//     get a highlight (spec: "never guess").

function num(n) {
    const v = Number(n);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** Extract decoded dollar figures from the persisted statement. */
export function decodedDollarFigures(stmt) {
    if (!stmt) return [];
    const out = [];
    const ex = stmt.extracted_json || {};
    const audit = stmt.audit_json || {};

    const totals = ex.totals || {};
    const push = (id, label, value, category) => {
        const v = num(value);
        if (v == null || v === 0) return;
        out.push({ id, label, value: v, category });
    };

    push("gross_total", "Gross total", totals.gross_total ?? totals.total ?? totals.grand_total, "services");
    push("services_subtotal", "Services subtotal", totals.services_subtotal ?? totals.services_total, "services");
    push("care_management_fee", "Care management fee", totals.care_management_fee ?? totals.care_management, "care_management");
    push("gov_contribution", "Government contribution", totals.government_contribution ?? totals.gov_contribution, "government_contribution");
    push("participant_contribution", "Your contribution", totals.participant_contribution ?? totals.contribution_total, "government_contribution");
    push("opening_balance", "Opening balance", (audit.balance || {}).opening_balance ?? totals.opening_balance, "balance");
    push("closing_balance", "Closing balance", (audit.balance || {}).closing_balance ?? totals.closing_balance, "balance");

    // Line items, up to 30 (limit to keep the divergence pane light).
    const lines = stmt.line_items || [];
    lines.slice(0, 30).forEach((li, idx) => {
        push(`li_${li.id || idx}`, li.service_name || li.service_code || "Line item", li.total, "services");
    });

    return out;
}

/** Match a decoded figure against tokens across all pages.
 *  Returns { token: { page, value, x, y, w, h, label } } or null. */
function findConfidentMatch(figure, tokensByPage) {
    const target = num(figure.value);
    if (target == null) return null;

    const targetCents = Math.round(target * 100);
    const firstWord = (figure.label || "").split(/\s+/)[0]?.toLowerCase() || "";

    // Pass 1, exact equality anywhere
    for (const pageStr of Object.keys(tokensByPage)) {
        const page = Number(pageStr);
        const tokens = tokensByPage[page] || [];
        for (let i = 0; i < tokens.length; i += 1) {
            const t = tokens[i];
            if (!t.isDollar) continue;
            const tv = num(t.value);
            if (tv == null) continue;
            if (Math.round(tv * 100) === targetCents) {
                return { token: { page, ...t } };
            }
        }
    }

    // Pass 2, within-1c tolerance AND description proximity
    for (const pageStr of Object.keys(tokensByPage)) {
        const page = Number(pageStr);
        const tokens = tokensByPage[page] || [];
        for (let i = 0; i < tokens.length; i += 1) {
            const t = tokens[i];
            if (!t.isDollar) continue;
            const tv = num(t.value);
            if (tv == null) continue;
            if (Math.abs(Math.round(tv * 100) - targetCents) > 1) continue;
            // Description proximity: previous 6 tokens
            let found = false;
            for (let j = Math.max(0, i - 6); j < i; j += 1) {
                if (String(tokens[j].str || "").toLowerCase().includes(firstWord)) {
                    found = true;
                    break;
                }
            }
            if (found) return { token: { page, ...t } };
        }
    }
    return null;
}

/** Find a "divergent" PDF value close to the decoded figure (label match but
 *  numeric mismatch). Only fires if description proximity is confident. */
function findDivergentMatch(figure, tokensByPage) {
    const targetCents = Math.round(num(figure.value) * 100);
    const firstWord = (figure.label || "").split(/\s+/)[0]?.toLowerCase() || "";
    if (!firstWord) return null;

    let best = null;
    let bestDelta = Infinity;

    for (const pageStr of Object.keys(tokensByPage)) {
        const page = Number(pageStr);
        const tokens = tokensByPage[page] || [];
        for (let i = 0; i < tokens.length; i += 1) {
            const t = tokens[i];
            if (!t.isDollar) continue;
            const tv = num(t.value);
            if (tv == null) continue;
            const cents = Math.round(tv * 100);
            if (cents === targetCents) continue;
            // Only accept dollar values that are "same order of magnitude", skip
            // 5-cent GST tokens when we're looking for a $3,000 subtotal.
            if (Math.abs(cents - targetCents) > Math.max(500, targetCents * 0.5)) continue;
            // Description proximity: previous 6 tokens must include label first word
            let found = false;
            for (let j = Math.max(0, i - 6); j < i; j += 1) {
                if (String(tokens[j].str || "").toLowerCase().includes(firstWord)) {
                    found = true;
                    break;
                }
            }
            if (!found) continue;
            const delta = Math.abs(cents - targetCents);
            if (delta < bestDelta) {
                bestDelta = delta;
                best = { token: { page, ...t } };
            }
        }
    }
    return best;
}

/** Public: given decoded figures + tokens-by-page → { agree, differ, missing } */
export function buildDivergenceMap(decoded, tokensByPage) {
    const agree = [];
    const differ = [];
    const missing = [];
    for (const f of decoded) {
        const hit = findConfidentMatch(f, tokensByPage);
        if (hit) {
            agree.push({ decoded: f, token: hit.token });
            continue;
        }
        const diff = findDivergentMatch(f, tokensByPage);
        if (diff) {
            differ.push({ decoded: f, token: diff.token });
            continue;
        }
        missing.push(f);
    }
    return { agree, differ, missing };
}

/** Convenience: legacy shim (in case other callers use the plural extract). */
export function extractPdfDollarTokens(items) {
    return items;
}
