// STMT-UI-1 v2, client-side helpers for the statement register + detail views.
// Derives fields the spec expects (period_start/end, provider_name, gross_total,
// closing_balance, decode_status, flags_count) from the persisted Statement
// document without a schema change. See docs/audits/STMT-UI-1-audit.md §0.B.

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDateSafe(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDay(d) {
    return d ? String(d.getUTCDate()) : null;
}

function fmtMonth(d) {
    return d ? MONTHS_SHORT[d.getUTCMonth()] : null;
}

function fmtYear(d) {
    return d ? String(d.getUTCFullYear()) : null;
}

/** Return the compact billing-period range per Decision 2, e.g.:
 *   "1-31 Oct 2025", "15 Sep,14 Oct 2025", or "1-31 Oct 2025"
 * Falls back to `period_label` when start/end aren't extractable. */
export function periodCompact(stmt) {
    const ex = stmt?.extracted_json || {};
    const s = toDateSafe(ex.period_start || ex.statement_period_start);
    const e = toDateSafe(ex.period_end || ex.statement_period_end);
    if (s && e) {
        const sYear = fmtYear(s);
        const eYear = fmtYear(e);
        const sMonth = fmtMonth(s);
        const eMonth = fmtMonth(e);
        if (sMonth === eMonth && sYear === eYear) {
            // "1-31 Oct 2025"
            return `${fmtDay(s)},${fmtDay(e)} ${eMonth} ${eYear}`;
        }
        if (sYear === eYear) {
            // "15 Sep,14 Oct 2025"
            return `${fmtDay(s)} ${sMonth},${fmtDay(e)} ${eMonth} ${eYear}`;
        }
        // Cross-year: "15 Dec 2025-14 Jan 2026"
        return `${fmtDay(s)} ${sMonth} ${sYear},${fmtDay(e)} ${eMonth} ${eYear}`;
    }
    return stmt?.period_label || stmt?.filename || ",";
}

/** Exact ISO range for hover / tooltips, e.g. "2025-10-01 → 2025-10-31" */
export function periodExact(stmt) {
    const ex = stmt?.extracted_json || {};
    const s = ex.period_start || ex.statement_period_start;
    const e = ex.period_end || ex.statement_period_end;
    if (s && e) return `${s} → ${e}`;
    return stmt?.period_label || "";
}

/** Provider name, sourced from extracted_json, fall back to a placeholder. */
export function providerName(stmt) {
    const ex = stmt?.extracted_json || {};
    return (
        ex.provider_name ||
        ex.provider?.name ||
        ex.header?.provider_name ||
        stmt?.provider_name ||
        "Unknown provider"
    );
}

/** Gross total (services subtotal + care management + AT-HM), decoder totals
 *  block preferred, falling back to a sum across line items. */
export function grossTotal(stmt) {
    const ex = stmt?.extracted_json || {};
    const t = ex.totals || ex.summary || {};
    const gross = Number(t.gross_total ?? t.total ?? t.grand_total);
    if (Number.isFinite(gross) && gross > 0) return gross;
    const rows = stmt?.line_items || [];
    return rows.reduce((a, li) => a + (Number(li.total) || 0), 0);
}

/** Closing balance, the "money still with your provider" figure. */
export function closingBalance(stmt) {
    const audit = stmt?.audit_json || {};
    const bal = audit.balance || audit.closing || {};
    const v = Number(bal.closing_balance ?? bal.closing ?? bal.balance);
    if (Number.isFinite(v)) return v;
    const ex = stmt?.extracted_json || {};
    const v2 = Number(ex.closing_balance ?? ex.totals?.closing_balance);
    return Number.isFinite(v2) ? v2 : null;
}

export function servicesSubtotal(stmt) {
    const t = stmt?.extracted_json?.totals || {};
    const v = Number(t.services_subtotal ?? t.services_total);
    if (Number.isFinite(v)) return v;
    return (stmt?.line_items || [])
        .filter((li) => li.stream !== "Care Management")
        .reduce((a, li) => a + (Number(li.total) || 0), 0);
}

export function careManagementFee(stmt) {
    const t = stmt?.extracted_json?.totals || {};
    const v = Number(t.care_management_fee ?? t.care_management);
    if (Number.isFinite(v)) return v;
    return (stmt?.line_items || [])
        .filter((li) => li.stream === "Care Management")
        .reduce((a, li) => a + (Number(li.total) || 0), 0);
}

/** Status is one of: "clean" | "flagged" | "processing" | "failed". */
export function decodeStatus(stmt) {
    if (!stmt) return "processing";
    const state = stmt.state;
    if (state === "processing") return "processing";
    if (state === "failed") return "failed";
    const warnings = stmt.parsing_warnings || [];
    if (warnings.length > 0 && (!stmt.line_items || stmt.line_items.length === 0)) return "failed";
    const flags = flagsCount(stmt);
    if (flags > 0) return "flagged";
    return "clean";
}

export function flagsCount(stmt) {
    const list = stmt?.anomalies || [];
    return list.filter((a) => a?.severity === "alert" || a?.severity === "warning").length;
}

/** For sorting: return a comparable epoch ms from the period range. */
export function periodSortKey(stmt) {
    const ex = stmt?.extracted_json || {};
    const end = toDateSafe(ex.period_end || ex.statement_period_end);
    if (end) return end.getTime();
    const up = toDateSafe(stmt?.uploaded_at);
    return up ? up.getTime() : 0;
}

/** Relative-then-absolute upload label. */
export function uploadedLabel(uploadedAt) {
    const d = toDateSafe(uploadedAt);
    if (!d) return ",";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days < 0) return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 14) return `${days} days ago`;
    return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** File-safe short YYYY-MM-DD for exports. */
export function isoDay(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
