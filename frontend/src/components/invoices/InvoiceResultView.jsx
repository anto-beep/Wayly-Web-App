import React from "react";
import { AlertTriangle, AlertOctagon, Info, CheckCircle2, Receipt, Building2, Calendar, Hash } from "lucide-react";

/**
 * InvoiceResultBanner — mirrors the Statement Decoder summary banner so the
 * two tools feel like one product. Renders period / provider / total /
 * refund-owed / disputed-lines / net-payable in a dark teal card.
 */
function aud(n) {
    const v = Number(n);
    if (!isFinite(v)) return "—";
    return `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function _findingImpact(f) {
    return Number(
        f?.financial_impact?.amount
            ?? f?.observed?.overcharge_amount
            ?? f?.observed?.refund_amount
            ?? f?.observed?.excess_amount
            ?? f?.observed?.difference
            ?? f?.observed?.gst_amount
            ?? f?.observed?.contribution_amount
            ?? 0
    );
}

function _sum(findings) {
    // Some checks fire twice on the same line (e.g. C11 duplicate reports
    // both sides), so we de-duplicate by line to avoid double counting the
    // refund. Findings without any line data are counted individually.
    const seen = new Set();
    let total = 0;
    for (const f of findings || []) {
        const impact = _findingImpact(f);
        if (!isFinite(impact) || impact <= 0) continue;
        const ids = (f?.line_ids || f?.affected_line_ids || []).slice().sort().join("|");
        const key = ids ? `${f?.check_id || ""}::${ids}` : `raw::${Math.random()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        total += impact;
    }
    return total;
}

// Human-friendly titles for the C1..C12 backend checks so a caregiver sees
// "Price cap exceeded" instead of the raw code.
const _CHECK_TITLES = {
    C1: "Clinical care contribution should be nil",
    C2: "Personal care contribution after 1 October 2026 should be nil",
    C3: "Rate looks asymmetric between weekday and weekend",
    C4: "Care management or prohibited fees",
    C5: "Charged after the service was delivered",
    C6: "Line arithmetic error (quantity × rate does not match total)",
    C7: "Invoice does not match statement side",
    C8: "GST charged on a GST-free service",
    C9: "Adjustment or refund line",
    C10: "Lifetime cap indicative check",
    C11: "Duplicate line",
    C12: "Rate exceeds published price",
};
function _titleForCheck(ref) {
    return _CHECK_TITLES[String(ref).toUpperCase()] || `Check ${ref}`;
}

export function InvoiceResultBanner({ result }) {
    const rec = result?.reconciliation || {};
    const findings = rec.findings || [];
    const lines = rec.lines || [];

    const invoiceTotal = Number(rec.invoice_total ?? result?.invoice_total ?? 0);
    const refundOwed = _sum(findings);
    const disputedLineIds = new Set(
        findings.flatMap((f) => f?.line_ids || f?.affected_line_ids || (f?.line_number ? [f.line_number] : []))
    );
    const disputedCount = disputedLineIds.size;
    const netPayable = Math.max(0, invoiceTotal - refundOwed);

    return (
        <section
            className="bg-primary-k text-white rounded-2xl p-6"
            data-testid="inv1-summary-banner"
        >
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/85">
                {result?.invoice_date ? new Date(result.invoice_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Invoice"}
                {result?.provider_name ? ` · ${result.provider_name}` : ""}
                {result?.document_shape && result.document_shape !== "invoice" ? ` · ${result.document_shape}` : ""}
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/70">Amount billed</div>
                    <div className="text-2xl mt-1 tabular-nums">{aud(invoiceTotal)}</div>
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/70">Potential refund</div>
                    <div className="text-2xl mt-1 tabular-nums text-gold">{aud(refundOwed)}</div>
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/70">Net payable</div>
                    <div className="text-2xl mt-1 tabular-nums">{aud(netPayable)}</div>
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/70">Issues</div>
                    <div className="text-2xl mt-1 tabular-nums">{findings.length}</div>
                </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/15 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-white/70" data-testid="inv1-summary-meta">
                {lines.length ? <span>{lines.length} line item{lines.length === 1 ? "" : "s"}</span> : null}
                {disputedCount ? <span>{disputedCount} disputed</span> : null}
                {result?.provider_abn ? <span>ABN {result.provider_abn}</span> : null}
                {result?.due_date ? <span>Due {new Date(result.due_date).toLocaleDateString("en-AU")}</span> : null}
            </div>
        </section>
    );
}

/**
 * InvoiceIssueRegister — the "Issue Register" section, mirrors the Statement
 * Decoder anomaly panel. Groups findings by severity, exposes the answer
 * key layout: refs, categories, financial impact, and recommended action.
 */
const SEVERITY_ORDER = ["blocker", "critical", "high", "medium", "low", "info"];

function _severityKey(f) {
    // Tier is the primary field on the Wayly INV-1 backend: 1 = critical
    // (definite issue), 2 = high (probable), 3 = medium (verify), 4/5 = watch.
    // Fall back to severity/priority for compatibility.
    const t = Number(f?.tier);
    if (isFinite(t) && t > 0) {
        if (t === 1) return "critical";
        if (t === 2) return "high";
        if (t === 3) return "medium";
        if (t === 4) return "low";
        return "info";
    }
    const s = String(f?.severity || f?.priority || "medium").toLowerCase();
    if (SEVERITY_ORDER.includes(s)) return s;
    if (s.includes("block") || s.includes("critical")) return "critical";
    if (s.includes("high")) return "high";
    if (s.includes("low")) return "low";
    if (s.includes("info") || s.includes("watch")) return "info";
    return "medium";
}

function _sevStyle(sev) {
    switch (sev) {
        case "blocker":
        case "critical":
            return { bg: "bg-terracotta-50", border: "border-terracotta-200", text: "text-terracotta-800", pill: "bg-terracotta text-white", Icon: AlertOctagon };
        case "high":
            return { bg: "bg-gold-50", border: "border-gold-200", text: "text-gold-800", pill: "bg-gold text-white", Icon: AlertTriangle };
        case "medium":
            return { bg: "bg-clay-50", border: "border-clay-200", text: "text-clay-dark", pill: "bg-clay text-white", Icon: AlertTriangle };
        case "low":
            return { bg: "bg-cream", border: "border-primary-k/15", text: "text-primary-k", pill: "bg-primary-k/70 text-white", Icon: Info };
        case "info":
        default:
            return { bg: "bg-primary-k/[0.04]", border: "border-primary-k/15", text: "text-primary-k", pill: "bg-primary-k/40 text-white", Icon: Info };
    }
}

export function InvoiceIssueRegister({ findings, onDraftLetter }) {
    if (!findings || findings.length === 0) {
        return (
            <section className="rounded-2xl border-2 border-dashed border-sage/40 bg-sage/5 p-8 text-center" data-testid="inv1-no-findings">
                <CheckCircle2 className="h-10 w-10 text-sage mx-auto" />
                <div className="mt-3 font-heading text-xl text-primary-k">Nothing worth raising</div>
                <p className="mt-1.5 text-sm text-muted-k max-w-md mx-auto">
                    Every check passed on this invoice. See the reconciliation below for the full list of what we looked at.
                </p>
            </section>
        );
    }
    const sorted = [...findings].sort(
        (a, b) => SEVERITY_ORDER.indexOf(_severityKey(a)) - SEVERITY_ORDER.indexOf(_severityKey(b))
    );
    const counts = SEVERITY_ORDER.map((s) => ({ s, n: sorted.filter((f) => _severityKey(f) === s).length })).filter((x) => x.n > 0);

    return (
        <section data-testid="inv1-issue-register" className="space-y-3">
            <header className="flex items-baseline justify-between flex-wrap gap-2">
                <h3 className="font-heading text-xl text-primary-k inline-flex items-center gap-2">
                    <Receipt className="h-5 w-5" /> Issue Register
                </h3>
                <div className="flex items-center gap-1.5 text-xs">
                    {counts.map(({ s, n }) => {
                        const st = _sevStyle(s);
                        return (
                            <span key={s} className={`inline-flex items-center gap-1 rounded-full ${st.pill} px-2 py-0.5 font-semibold uppercase tracking-wide`}>
                                <st.Icon className="h-3 w-3" /> {n} {s}
                            </span>
                        );
                    })}
                    <span className="text-muted-k ml-1">{sorted.length} total</span>
                </div>
            </header>
            <ol className="space-y-3" data-testid="inv1-issues-list">
                {sorted.map((f, i) => {
                    const sev = _severityKey(f);
                    const st = _sevStyle(sev);
                    const impact = _findingImpact(f);
                    const ref = f?.check_id || f?.rule_id || f?.code || `#${i + 1}`;
                    const lineIds = f?.line_ids?.length ? f.line_ids : (f?.affected_line_ids || (f?.line_number ? [f.line_number] : []));
                    const lineHints = lineIds && lineIds.length
                        ? (typeof lineIds[0] === "number"
                            ? `Line ${lineIds.join(", ")}`
                            : `Line ${lineIds.map((x) => String(x).slice(0, 8)).join(", ")}`)
                        : null;
                    const title = f?.title || f?.headline || f?.label || f?.narrative || _titleForCheck(ref);
                    const description = f?.description || (f?.narrative && f.narrative !== title ? f.narrative : null);
                    const action = f?.recommended_action || f?.suggested_question || f?.escalation || null;
                    return (
                        <li
                            key={f.id || i}
                            className={`rounded-xl border ${st.border} ${st.bg} p-4`}
                            data-testid={`inv1-issue-${i}`}
                        >
                            <div className="flex items-start gap-3">
                                <span className={`inline-flex items-center justify-center rounded-full ${st.pill} h-7 w-7 flex-none`}>
                                    <st.Icon className="h-4 w-4" />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${st.text}`}>{sev}</span>
                                        <span className="text-[11px] uppercase tracking-wide text-muted-k font-mono">{ref}</span>
                                        {lineHints && <span className="text-[11px] text-muted-k inline-flex items-center gap-1"><Hash className="h-3 w-3" /> {lineHints}</span>}
                                        {f?.confidence && (
                                            <span className="text-[10px] uppercase tracking-wide text-muted-k">
                                                {f.confidence} confidence
                                            </span>
                                        )}
                                    </div>
                                    <div className={`mt-1 font-medium ${st.text}`}>{title}</div>
                                    {description && <p className="text-sm text-primary-k/80 mt-1 leading-snug whitespace-pre-line">{description}</p>}
                                    {action && (
                                        <div className="mt-2 rounded-lg bg-white/70 border border-primary-k/10 px-3 py-2 text-[13px] text-primary-k" data-testid={`inv1-issue-action-${i}`}>
                                            <span className="font-semibold">What to do: </span>{action}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right flex-none">
                                    {impact > 0 && (
                                        <div className="text-xs uppercase tracking-wide text-muted-k">Refund</div>
                                    )}
                                    {impact > 0 && (
                                        <div className={`font-heading text-lg ${st.text} tabular-nums`}>{aud(impact)}</div>
                                    )}
                                    {onDraftLetter && (
                                        <button
                                            type="button"
                                            onClick={() => onDraftLetter(i)}
                                            data-testid={`inv1-issue-letter-${i}`}
                                            className="mt-2 text-xs inline-flex items-center gap-1 rounded-full border border-primary-k/25 bg-white px-2.5 py-1 text-primary-k hover:bg-primary-k hover:text-white"
                                        >
                                            Draft letter
                                        </button>
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

/**
 * InvoiceMetadataStrip — small provider/period/reference row that appears
 * under the summary banner, mirroring how the Statement Decoder header
 * shows key metadata.
 */
export function InvoiceMetadataStrip({ result }) {
    const items = [
        { icon: Building2, label: "Provider", value: result?.provider_name },
        { icon: Calendar, label: "Invoice date", value: result?.invoice_date ? new Date(result.invoice_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null },
        { icon: Calendar, label: "Due date", value: result?.due_date ? new Date(result.due_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null },
        { icon: Hash, label: "Invoice #", value: result?.invoice_number || result?.reconciliation?.invoice_number },
    ].filter((x) => x.value);
    if (items.length === 0) return null;
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="inv1-meta-strip">
            {items.map((it, i) => (
                <div key={i} className="rounded-xl border border-primary-k/10 bg-white p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-k inline-flex items-center gap-1"><it.icon className="h-3 w-3" /> {it.label}</div>
                    <div className="text-sm text-primary-k mt-1 truncate">{it.value}</div>
                </div>
            ))}
        </div>
    );
}
