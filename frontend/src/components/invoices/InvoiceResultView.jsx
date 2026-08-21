import React, { useState } from "react";
import { AlertTriangle, AlertOctagon, Info, CheckCircle2, Receipt, Building2, Calendar, Hash, ChevronDown, ChevronUp, FileDown, Download, Columns2, Loader2, ShieldAlert, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";
import { toast } from "sonner";

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

// Collapse the six raw severities into the three plain-English bands the
// user asked for (mirrors the Statement Decoder): High / Medium / Low.
const BANDS = ["high", "medium", "low"];
const BAND_META = {
    high:   { label: "High priority", bg: "bg-terracotta", fg: "text-white", Icon: AlertOctagon },
    medium: { label: "Medium",        bg: "bg-gold",       fg: "text-white", Icon: ShieldAlert },
    low:    { label: "Low",           bg: "bg-sage",       fg: "text-white", Icon: Shield },
};
function _bandOf(f) {
    const s = _severityKey(f);
    if (s === "blocker" || s === "critical" || s === "high") return "high";
    if (s === "medium") return "medium";
    return "low";
}

function IssueCard({ f, idx, band, onDraftLetter }) {
    const meta = BAND_META[band];
    const impact = _findingImpact(f);
    const ref = f?.check_id || f?.rule_id || f?.code || `#${idx + 1}`;
    const lineIds = f?.line_ids?.length ? f.line_ids : (f?.affected_line_ids || (f?.line_number ? [f.line_number] : []));
    const lineHints = lineIds && lineIds.length
        ? (typeof lineIds[0] === "number"
            ? `Line ${lineIds.join(", ")}`
            : `Line ${lineIds.map((x) => String(x).slice(0, 8)).join(", ")}`)
        : null;
    const title = f?.title || f?.headline || f?.label || _titleForCheck(ref);
    const description = f?.description || f?.narrative || null;
    const action = f?.recommended_action || f?.suggested_question || f?.escalation || null;
    return (
        <li className="bg-surface border border-kindred rounded-xl p-5" data-testid={`inv1-issue-${idx}`}>
            <div className="flex items-start gap-3">
                <span className={`inline-flex items-center justify-center rounded-full ${meta.bg} ${meta.fg} h-9 w-9 flex-none`}>
                    <meta.Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${meta.bg} ${meta.fg}`}>{meta.label}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-k font-mono">{ref}</span>
                        {lineHints && <span className="text-[11px] text-muted-k inline-flex items-center gap-1"><Hash className="h-3 w-3" /> {lineHints}</span>}
                    </div>
                    <div className="mt-2 font-medium text-primary-k">{title}</div>
                    {description && <p className="text-sm text-muted-k mt-1.5 leading-relaxed whitespace-pre-line">{description}</p>}
                    {action && (
                        <div className="mt-3 rounded-lg bg-surface-2 border border-kindred px-3 py-2 text-[13px] text-primary-k" data-testid={`inv1-issue-action-${idx}`}>
                            <span className="font-semibold">What to do: </span>{action}
                        </div>
                    )}
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                        {impact > 0 && (
                            <span className="text-sm text-primary-k">
                                Potential refund: <span className="font-semibold tabular-nums">{aud(impact)}</span>
                            </span>
                        )}
                        {onDraftLetter && (
                            <button
                                type="button"
                                onClick={() => onDraftLetter(idx)}
                                data-testid={`inv1-issue-letter-${idx}`}
                                className="text-xs inline-flex items-center gap-1 rounded-full border border-primary-k/25 bg-white px-3 py-1.5 text-primary-k hover:bg-primary-k hover:text-white transition-colors"
                            >
                                Draft letter
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
}

function SeverityGroup({ band, entries, onDraftLetter }) {
    const [open, setOpen] = useState(true);
    const meta = BAND_META[band];
    return (
        <div className="mt-4" data-testid={`inv1-severity-group-${band}`}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-surface-2 border border-kindred hover:bg-surface transition-colors"
                data-testid={`inv1-severity-toggle-${band}`}
            >
                <span className="flex items-center gap-2">
                    <span className={`h-6 w-6 rounded-full ${meta.bg} ${meta.fg} flex items-center justify-center flex-shrink-0`}>
                        <meta.Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-medium text-primary-k text-sm">{meta.label}</span>
                    <span className="text-xs text-muted-k">({entries.length})</span>
                </span>
                {open ? <ChevronUp className="h-4 w-4 text-muted-k" /> : <ChevronDown className="h-4 w-4 text-muted-k" />}
            </button>
            {open && (
                <ul className="mt-3 space-y-3" data-testid={`inv1-severity-items-${band}`}>
                    {entries.map(({ f, i }) => (
                        <IssueCard key={f.id || i} f={f} idx={i} band={band} onDraftLetter={onDraftLetter} />
                    ))}
                </ul>
            )}
        </div>
    );
}

export function InvoiceIssueRegister({ findings, onDraftLetter }) {
    if (!findings || findings.length === 0) {
        return (
            <section className="rounded-2xl border-2 border-dashed border-sage/40 bg-sage/5 p-8 text-center" data-testid="inv1-no-findings">
                <CheckCircle2 className="h-10 w-10 text-sage mx-auto" />
                <div className="mt-3 font-heading text-xl text-primary-k">Nothing worth raising</div>
                <p className="mt-1.5 text-sm text-muted-k max-w-md mx-auto">
                    Every check passed on this invoice. See the charges below for the full list of what we looked at.
                </p>
            </section>
        );
    }
    // Preserve the original finding index so the draft-letter callback keeps
    // pointing at the right backend finding, then group into High/Med/Low.
    const withIdx = findings.map((f, i) => ({ f, i }));
    const bandGroups = BANDS
        .map((band) => ({ band, entries: withIdx.filter(({ f }) => _bandOf(f) === band) }))
        .filter((g) => g.entries.length > 0);
    const topBand = bandGroups[0]?.band;
    const bannerMeta = topBand ? BAND_META[topBand] : BAND_META.low;
    const highCount = bandGroups.find((g) => g.band === "high")?.entries.length || 0;

    return (
        <section data-testid="inv1-issue-register" className="space-y-2">
            <header className="flex items-baseline justify-between flex-wrap gap-2">
                <h3 className="font-heading text-xl text-primary-k inline-flex items-center gap-2">
                    <Receipt className="h-5 w-5" /> Issue Register
                </h3>
                <span className="text-xs text-muted-k">{findings.length} total</span>
            </header>
            <div className={`border-l-4 rounded-r-lg p-4 flex items-start gap-3 ${highCount > 0 ? "bg-terracotta text-white border-terracotta" : topBand === "medium" ? "bg-gold/20 text-primary-k border-gold" : "bg-sage/15 text-[#0F5648] border-sage"}`} data-testid="inv1-issue-top-banner">
                <bannerMeta.Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div className="text-sm font-medium">
                    {highCount > 0
                        ? `${highCount} high-priority thing${highCount === 1 ? "" : "s"} to raise before you pay.`
                        : topBand === "medium"
                        ? `${bandGroups[0].entries.length} thing${bandGroups[0].entries.length === 1 ? "" : "s"} worth a closer look.`
                        : `${findings.length} small note${findings.length === 1 ? "" : "s"}, mostly informational.`}
                </div>
            </div>
            {bandGroups.map((g) => (
                <SeverityGroup
                    key={g.band}
                    band={g.band}
                    entries={g.entries}
                    onDraftLetter={onDraftLetter}
                />
            ))}
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

const _CATEGORY_LABEL = {
    clinical_care: "Clinical care",
    personal_care: "Personal care",
    everyday_living: "Everyday living",
    care_management: "Care management",
    assistive_technology: "Assistive technology",
    home_modifications: "Home modifications",
    nursing: "Nursing",
    allied_health: "Allied health",
    transport: "Transport",
    unknown: "Other",
};
function _catLabel(c) {
    if (!c) return "";
    return _CATEGORY_LABEL[String(c)] || String(c).replace(/_/g, " ");
}

/**
 * InvoiceChargesTable — the "what's been charged" breakdown, mirroring the
 * Statement Decoder line-item table. Collapsed by default. Renders every
 * extracted invoice line with qty, unit price, gross, GST, and contribution.
 */
export function InvoiceChargesTable({ result, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    const rec = result?.reconciliation || {};
    const lines = rec.lines || [];
    if (lines.length === 0) return null;
    const disputed = new Set(
        (rec.findings || []).flatMap((f) => f?.line_ids || f?.affected_line_ids || [])
    );
    return (
        <section data-testid="inv1-charges">
            <button
                type="button"
                onClick={() => setOpen((s) => !s)}
                data-testid="inv1-charges-toggle"
                className="inline-flex items-center gap-2 text-sm text-primary-k hover:underline"
            >
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {open ? "Hide" : "Show"} what&apos;s been charged ({lines.length} line{lines.length === 1 ? "" : "s"})
            </button>
            {open && (
                <div className="mt-3 overflow-x-auto bg-surface border border-kindred rounded-xl">
                    <table className="min-w-full text-xs" data-testid="inv1-charges-table">
                        <thead className="bg-surface-2">
                            <tr className="text-left text-muted-k uppercase tracking-wider text-[10px]">
                                <th className="p-2.5">Date</th>
                                <th className="p-2.5">Service</th>
                                <th className="p-2.5">Category</th>
                                <th className="p-2.5 text-right">Qty / hrs</th>
                                <th className="p-2.5 text-right">Unit price</th>
                                <th className="p-2.5 text-right">Gross</th>
                                <th className="p-2.5 text-right">GST</th>
                                <th className="p-2.5 text-right">Your contribution</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-kindred">
                            {lines.map((ln, i) => {
                                const isDisputed = ln.line_id && disputed.has(ln.line_id);
                                return (
                                    <tr key={ln.line_id || i} className={isDisputed ? "bg-terracotta/5 text-primary-k" : "text-primary-k"}>
                                        <td className="p-2.5 tabular-nums whitespace-nowrap">{formatDate(ln.service_date) || "—"}</td>
                                        <td className="p-2.5">
                                            <span className="inline-flex items-center gap-1.5">
                                                {isDisputed && <AlertTriangle className="h-3 w-3 text-terracotta flex-shrink-0" />}
                                                {ln.service_type || ln.raw_text?.slice(0, 40) || "Service"}
                                            </span>
                                        </td>
                                        <td className="p-2.5">{_catLabel(ln.service_category)}</td>
                                        <td className="p-2.5 text-right tabular-nums">{ln.units_or_hours ?? "—"}</td>
                                        <td className="p-2.5 text-right tabular-nums">{ln.unit_price != null ? aud(ln.unit_price) : "—"}</td>
                                        <td className="p-2.5 text-right tabular-nums font-medium">{ln.gross_cost != null ? aud(ln.gross_cost) : "—"}</td>
                                        <td className="p-2.5 text-right tabular-nums">{ln.gst_amount != null ? aud(ln.gst_amount) : "—"}</td>
                                        <td className="p-2.5 text-right tabular-nums">{ln.contribution_amount != null ? aud(ln.contribution_amount) : "—"}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

/**
 * InvoiceDownloadBar — mirrors the Statement Decoder download bar. Lets the
 * user download the original file, the Wayly check-report PDF, a CSV of the
 * decoded invoice, and open a side-by-side compare (original vs decoded).
 */
export function InvoiceDownloadBar({ invoiceId, onCompare, comparing }) {
    const [busy, setBusy] = useState(null);
    if (!invoiceId) return null;

    const download = async (kind) => {
        setBusy(kind);
        try {
            const isCsv = kind === "csv";
            const url = isCsv
                ? `/invoices/${invoiceId}/export.csv`
                : `/invoices/${invoiceId}/download?kind=${kind}`;
            const res = await api.get(url, { responseType: "blob" });
            const cd = res.headers?.["content-disposition"] || "";
            const m = /filename="?([^"]+)"?/.exec(cd);
            const fallback = isCsv ? "Wayly-Invoice-Check.csv" : kind === "report" ? "Wayly-Invoice-Report.pdf" : "invoice.pdf";
            const filename = m ? m[1] : fallback;
            const blob = new Blob([res.data], { type: res.data.type || (isCsv ? "text/csv" : "application/pdf") });
            const objUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(objUrl);
        } catch (e) {
            toast.error(e?.response?.status === 404 ? "That file is no longer available." : "Could not download. Please try again.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex items-center justify-between flex-wrap gap-3 bg-surface-2 border border-kindred rounded-lg px-4 py-3" data-testid="inv1-download-bar">
            <div className="text-sm text-muted-k">Save or compare this checked invoice.</div>
            <div className="flex items-center gap-2 flex-wrap">
                {onCompare && (
                    <button
                        onClick={onCompare}
                        className={`inline-flex items-center gap-1.5 text-sm border rounded-md px-3 py-1.5 transition-colors ${comparing ? "bg-primary-k text-white border-primary-k" : "border-primary-k text-primary-k hover:bg-primary-k hover:text-white"}`}
                        data-testid="inv1-compare-btn"
                    >
                        <Columns2 className="h-3.5 w-3.5" /> {comparing ? "Hide compare" : "Compare"}
                    </button>
                )}
                <button
                    onClick={() => download("original")}
                    disabled={busy === "original"}
                    className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 hover:bg-surface text-primary-k disabled:opacity-50"
                    data-testid="inv1-download-original-btn"
                >
                    {busy === "original" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Original
                </button>
                <button
                    onClick={() => download("csv")}
                    disabled={busy === "csv"}
                    className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 hover:bg-surface text-primary-k disabled:opacity-50"
                    data-testid="inv1-download-csv-btn"
                >
                    {busy === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} CSV
                </button>
                <button
                    onClick={() => download("report")}
                    disabled={busy === "report"}
                    className="inline-flex items-center gap-1.5 text-sm bg-primary-k text-white rounded-md px-3 py-1.5 hover:bg-[#091D33] disabled:opacity-50"
                    data-testid="inv1-download-pdf-btn"
                >
                    {busy === "report" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PDF
                </button>
            </div>
        </div>
    );
}

/**
 * InvoiceCompareView — side-by-side original file (left) vs decoded charges
 * table (right), mirroring the Statement Compare screen.
 */
export function InvoiceCompareView({ invoiceId, result }) {
    const [objUrl, setObjUrl] = useState(null);
    const [err, setErr] = useState(false);
    React.useEffect(() => {
        let revoked = null;
        (async () => {
            try {
                const res = await api.get(`/invoices/${invoiceId}/download?kind=original`, { responseType: "blob" });
                const blob = new Blob([res.data], { type: res.data.type || "application/pdf" });
                const url = window.URL.createObjectURL(blob);
                revoked = url;
                setObjUrl(url);
            } catch {
                setErr(true);
            }
        })();
        return () => { if (revoked) window.URL.revokeObjectURL(revoked); };
    }, [invoiceId]);
    return (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="inv1-compare-view">
            <div className="rounded-xl border border-kindred bg-surface overflow-hidden">
                <div className="overline px-4 py-2 border-b border-kindred bg-surface-2">Original invoice</div>
                {err ? (
                    <div className="p-6 text-sm text-muted-k">The original file is no longer available.</div>
                ) : objUrl ? (
                    <object data={objUrl} type="application/pdf" className="w-full h-[600px]" data-testid="inv1-compare-original">
                        <div className="p-6 text-sm text-muted-k">Preview not supported. Use the Original download button above.</div>
                    </object>
                ) : (
                    <div className="p-6 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div>
                )}
            </div>
            <div className="rounded-xl border border-kindred bg-surface p-4">
                <div className="overline mb-3">Decoded charges</div>
                <InvoiceChargesTable result={result} defaultOpen={true} />
            </div>
        </section>
    );
}
