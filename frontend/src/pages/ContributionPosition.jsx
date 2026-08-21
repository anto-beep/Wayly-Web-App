/**
 * CE-3 v1 · Contribution Position page.
 *
 * Route: /app/participants/:id/contribution-position
 *
 * Three cards on one screen:
 *   1. Lifetime cap accumulator (the flagship)
 *   2. Annual projection with confidence band
 *   3. Contribution reconciliation month-by-month
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { formatDate } from "@/lib/formatDate";
import { ChevronLeft, RefreshCw, Info, TrendingUp, AlertTriangle, ArrowRightLeft, X } from "lucide-react";
import PageIntro from "@/components/PageIntro";

const AUD = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n || 0);
const AUD2 = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const CONFIDENCE_TINT = {
    high: "bg-emerald-50 text-emerald-700 border-emerald-100",
    medium: "bg-amber-50 text-amber-700 border-amber-100",
    low: "bg-primary-k/5 text-primary-k/70 border-primary-k/10",
};

const FLAG_TINT = {
    minor_variance: "bg-emerald-50 text-emerald-700 border-emerald-100",
    notable_variance: "bg-amber-50 text-amber-700 border-amber-100",
    significant_variance: "bg-orange-50 text-orange-700 border-orange-100",
    step_change_variance: "bg-red-50 text-red-700 border-red-100",
    none_reconciled: "bg-primary-k/5 text-primary-k/50 border-primary-k/10",
};

const FLAG_LABEL = {
    minor_variance: "Minor",
    notable_variance: "Notable",
    significant_variance: "Significant",
    step_change_variance: "Step change",
    none_reconciled: "No data",
};

function LifetimeCapCard({ cap, onRefresh, refreshing }) {
    const usedPct = cap.total_cap ? Math.min(100, (cap.used_to_date / cap.total_cap) * 100) : 0;
    const years = cap.years_at_current_pace;
    const bucket = cap.years_at_current_pace_bucket;
    const tone = bucket === "gt_50" || bucket === "20_to_50"
        ? "border-emerald-200 bg-emerald-50/40"
        : bucket === "10_to_20"
            ? "border-primary-k/15 bg-white"
            : bucket === "5_to_10"
                ? "border-amber-200 bg-amber-50/40"
                : bucket === "lt_5"
                    ? "border-red-200 bg-red-50/40"
                    : "border-primary-k/10 bg-white";

    return (
        <section className={`rounded-2xl border p-6 ${tone}`} data-testid="ce3-lifetime-cap-card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Lifetime cap</p>
                    <h2 className="text-lg font-heading text-primary-k mt-1">Your contribution position</h2>
                </div>
                <button
                    onClick={onRefresh}
                    disabled={refreshing}
                    data-testid="ce3-lifetime-cap-refresh"
                    className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary-k/20 text-primary-k hover:bg-primary-k/[0.03] disabled:opacity-50"
                >
                    <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
                </button>
            </div>

            <div className="mt-4">
                <p className="text-sm text-primary-k/70" data-testid="ce3-lifetime-cap-headline">
                    You&apos;ve paid <strong>{AUD2(cap.used_to_date)}</strong> toward your <strong>{AUD(cap.total_cap)}</strong> lifetime cap.
                </p>
                <div className="mt-3 h-2 rounded-full bg-primary-k/[0.08] overflow-hidden">
                    <div
                        className="h-full bg-primary-k transition-all"
                        style={{ width: `${Math.max(0.5, usedPct)}%` }}
                        data-testid="ce3-lifetime-cap-progress"
                    />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-primary-k/60">
                    <span>{usedPct.toFixed(2)}% used</span>
                    <span data-testid="ce3-lifetime-cap-remaining">Remaining {AUD(cap.remaining)}</span>
                </div>
            </div>

            {years !== null && years !== undefined ? (
                <div className="mt-5 pt-5 border-t border-primary-k/10">
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Years at current pace</p>
                    <p className="text-4xl font-heading text-primary-k mt-1" data-testid="ce3-lifetime-cap-years">
                        approximately {Math.round(years)} years
                    </p>
                    <p className="text-xs text-primary-k/60 mt-2">
                        Based on {cap.based_on_statement_ids?.length || 0} decoded statement{(cap.based_on_statement_ids?.length || 0) !== 1 ? "s" : ""} over {cap.days_since_program_entry} days.
                    </p>
                    {(bucket === "gt_50" || bucket === "20_to_50") && (
                        <p className="mt-3 text-sm text-emerald-800" data-testid="ce3-cap-reassuring-msg">
                            The lifetime cap is the most Australia asks anyone to contribute toward aged care over a lifetime. For most people, this figure is a very long way off.
                        </p>
                    )}
                    {bucket === "lt_5" && (
                        <p className="mt-3 text-sm text-red-800" data-testid="ce3-cap-approaching-msg">
                            Approaching the lifetime cap. Reaching the cap is a good thing, it means you won&apos;t have to contribute further.
                        </p>
                    )}
                </div>
            ) : (
                <div className="mt-5 pt-5 border-t border-primary-k/10">
                    <p className="text-sm text-primary-k/60" data-testid="ce3-lifetime-cap-warmup">
                        <Info className="inline w-4 h-4 mr-1" /> We need at least 30 days of statement data before we can project years at current pace.
                    </p>
                </div>
            )}
        </section>
    );
}

function AnnualProjectionCard({ ap }) {
    const conf = ap.annual_estimate_range?.confidence || "low";
    const showConfidence = (ap.annual_estimate || 0) > 0;
    return (
        <section className="rounded-2xl border border-primary-k/10 bg-white p-6" data-testid="ce3-annual-card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Annual projection · {ap.financial_year_label}</p>
                    <h2 className="text-lg font-heading text-primary-k mt-1">Estimated for the year</h2>
                </div>
                {showConfidence && (
                    <span
                        className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_TINT[conf]}`}
                        data-testid="ce3-annual-confidence"
                    >
                        {conf} confidence
                    </span>
                )}
            </div>
            <div className="mt-4">
                <p className="text-4xl font-heading text-primary-k" data-testid="ce3-annual-estimate">
                    {AUD(ap.annual_estimate)}
                </p>
                <p className="text-xs text-primary-k/60 mt-1" data-testid="ce3-annual-range">
                    Range {AUD(ap.annual_estimate_range?.low || 0)}, {AUD(ap.annual_estimate_range?.high || 0)} (±{ap.annual_estimate_range?.band_percent || 0}%)
                </p>
                <p className="text-sm text-primary-k/70 mt-3">
                    {ap.annual_estimate_range?.range_explanation_tokens?.caregiver}
                </p>
            </div>
            <div className="mt-4 pt-4 border-t border-primary-k/10 grid grid-cols-3 gap-3 text-xs">
                <div>
                    <p className="text-primary-k/50 uppercase">Weekly</p>
                    <p className="text-primary-k mt-0.5 font-medium">{AUD2(ap.weekly_estimate)}</p>
                </div>
                <div>
                    <p className="text-primary-k/50 uppercase">Quarterly</p>
                    <p className="text-primary-k mt-0.5 font-medium">{AUD2(ap.quarterly_estimate)}</p>
                </div>
                <div>
                    <p className="text-primary-k/50 uppercase">Gov. share/yr</p>
                    <p className="text-primary-k mt-0.5 font-medium">{AUD(ap.government_share_annual)}</p>
                </div>
            </div>
        </section>
    );
}

function ReconciliationCard({ pid, rows, onReconcile, reconciling }) {
    const [month, setMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    return (
        <section className="rounded-2xl border border-primary-k/10 bg-white p-6" data-testid="ce3-reconciliation-card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Reconciliation</p>
                    <h2 className="text-lg font-heading text-primary-k mt-1">Estimated vs actual, month by month</h2>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        data-testid="ce3-reconcile-month-picker"
                        className="text-xs px-2 py-1 border border-primary-k/20 rounded-lg"
                    />
                    <button
                        onClick={() => onReconcile(month)}
                        disabled={reconciling}
                        data-testid="ce3-reconcile-btn"
                        className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-k text-white disabled:opacity-50"
                    >
                        {reconciling ? "…" : "Reconcile"}
                    </button>
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-primary-k/20 p-6 text-center" data-testid="ce3-reconcile-empty">
                    <TrendingUp className="w-6 h-6 text-primary-k/40 mx-auto" />
                    <p className="text-sm text-primary-k/60 mt-2">
                        Reconciliation compares what you were estimated to pay against what you were actually charged.
                        Pick a month above and click Reconcile to start.
                    </p>
                </div>
            ) : (
                <ul className="mt-4 space-y-3" data-testid="ce3-reconcile-list">
                    {rows.map((r) => (
                        <li
                            key={r.id}
                            data-testid={`ce3-reconcile-row-${r.reconciliation_period_month}`}
                            className={`rounded-xl border p-4 ${r.variance_flag === "step_change_variance" ? "border-red-200 bg-red-50/30" : "border-primary-k/10 bg-white"}`}
                        >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <p className="text-sm font-medium text-primary-k">
                                        {new Date(r.month_start).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
                                    </p>
                                    <p className="text-xs text-primary-k/60 mt-1">
                                        Estimated {AUD2(r.estimated_contribution)} · Actual {AUD2(r.actual_contribution)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${FLAG_TINT[r.variance_flag]}`}>
                                        {FLAG_LABEL[r.variance_flag]}
                                    </span>
                                    {r.variance_flag !== "none_reconciled" && (
                                        <span className="text-xs text-primary-k/60">
                                            {r.variance_percentage > 0 ? "+" : ""}{r.variance_percentage?.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                            {r.automated_explanation_tokens?.caregiver && (
                                <p className="mt-2 text-xs text-primary-k/70">{r.automated_explanation_tokens.caregiver}</p>
                            )}
                            {r.case_id && (
                                <div className="mt-2 text-xs">
                                    <AlertTriangle className="inline w-3 h-3 text-red-600 mr-1" />
                                    <Link
                                        to={`/app/participants/${pid}/cases/${r.case_id}`}
                                        className="text-red-700 underline"
                                        data-testid={`ce3-reconcile-case-link-${r.id}`}
                                    >
                                        Open follow-up case →
                                    </Link>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

const PENSION_LABELS = {
    full_pension: "Full age pension",
    part_pension: "Part age pension",
    cshc: "Commonwealth Seniors Health Card",
    self_funded: "Self-funded (no pension)",
};

const PENSION_REASONS = [
    { key: "", label: "Prefer not to say" },
    { key: "voluntary_reassessment", label: "Voluntary reassessment" },
    { key: "income_changed", label: "Income changed" },
    { key: "assets_changed", label: "Assets changed" },
    { key: "partner_no_longer_receiving_pension", label: "Partner no longer receiving pension" },
    { key: "partner_deceased", label: "Partner has passed away" },
    { key: "other", label: "Other" },
];

function PensionChangeModal({ pid, currentStatus, onClose, onCommitted }) {
    const [step, setStep] = useState(1);
    const [newStatus, setNewStatus] = useState("");
    const [reason, setReason] = useState("");
    const [reasonNotes, setReasonNotes] = useState("");
    const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [priorPdfHandling, setPriorPdfHandling] = useState("mark_superseded");

    async function fetchPreview() {
        setLoading(true); setError(null);
        try {
            const r = await api.post(`/ce3/participants/${pid}/pension-change/preview`, {
                new_pension_status: newStatus,
                effective_date: effectiveDate,
                reason: reason || null,
                reason_notes: reasonNotes || null,
            });
            setPreview(r.data);
            setStep(2);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to preview");
        } finally { setLoading(false); }
    }

    async function commit() {
        setLoading(true); setError(null);
        try {
            const r = await api.post(`/ce3/participants/${pid}/pension-change/commit`, {
                new_pension_status: newStatus,
                effective_date: effectiveDate,
                reason: reason || null,
                reason_notes: reasonNotes || null,
                prior_pdf_handling: priorPdfHandling,
                confirmed: true,
            });
            onCommitted?.(r.data);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to commit");
        } finally { setLoading(false); }
    }

    return (
        <div
            className="fixed inset-0 z-50 bg-primary-k/40 flex items-center justify-center p-4"
            data-testid="ce3-pension-wizard-modal"
        >
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-primary-k/10">
                    <h2 className="text-lg font-heading text-primary-k">
                        Change pension status · Step {step} of 3
                    </h2>
                    <button
                        onClick={onClose}
                        data-testid="ce3-pension-wizard-close"
                        className="text-primary-k/50 hover:text-primary-k"
                        aria-label="Close"
                    ><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    {error && (
                        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" data-testid="ce3-pension-wizard-error">{String(error)}</p>
                    )}

                    {step === 1 && (
                        <div className="space-y-4" data-testid="ce3-pension-wizard-step-1">
                            <div>
                                <p className="text-xs text-primary-k/50 uppercase tracking-wide">Current status</p>
                                <p className="text-sm text-primary-k font-medium mt-1">{PENSION_LABELS[currentStatus] || currentStatus || "Not set"}</p>
                            </div>
                            <div>
                                <label className="text-xs text-primary-k/50 uppercase tracking-wide">New pension status</label>
                                <select
                                    value={newStatus}
                                    onChange={(e) => setNewStatus(e.target.value)}
                                    data-testid="ce3-pension-wizard-new-status"
                                    className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                >
                                    <option value="">Pick one…</option>
                                    {Object.entries(PENSION_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-primary-k/50 uppercase tracking-wide">Effective date</label>
                                <input
                                    type="date"
                                    value={effectiveDate}
                                    onChange={(e) => setEffectiveDate(e.target.value)}
                                    data-testid="ce3-pension-wizard-effective-date"
                                    className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-primary-k/50 uppercase tracking-wide">Reason (optional)</label>
                                <select
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    data-testid="ce3-pension-wizard-reason"
                                    className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                >
                                    {PENSION_REASONS.map((r) => (
                                        <option key={r.key} value={r.key}>{r.label}</option>
                                    ))}
                                </select>
                            </div>
                            {reason === "partner_deceased" && (
                                <p className="text-xs text-primary-k/60 bg-primary-k/[0.03] p-3 rounded-lg" data-testid="ce3-pension-wizard-bereavement-msg">
                                    Take the time you need. You can pause and return to this at any time.
                                    Lifeline is on 13 11 14 if you&apos;d like to talk to someone.
                                </p>
                            )}
                            <button
                                onClick={fetchPreview}
                                disabled={!newStatus || loading}
                                data-testid="ce3-pension-wizard-next"
                                className="w-full py-2.5 rounded-full bg-primary-k text-white text-sm disabled:opacity-50"
                            >{loading ? "…" : "Preview impact"}</button>
                        </div>
                    )}

                    {step === 2 && preview && (
                        <div className="space-y-4" data-testid="ce3-pension-wizard-step-2">
                            <p className="text-sm text-primary-k">
                                {PENSION_LABELS[preview.current_pension_status]} → <strong>{PENSION_LABELS[preview.new_pension_status]}</strong>
                            </p>
                            {preview.no_prior_projection ? (
                                <p className="text-xs text-primary-k/60 bg-amber-50 border border-amber-100 p-3 rounded-lg" data-testid="ce3-pension-wizard-no-projection">
                                    You haven&apos;t saved a contribution estimate yet, so we can&apos;t show an exact impact.
                                    Save an estimate first using the Contribution Estimator, then come back here.
                                </p>
                            ) : (
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div className="col-span-3 grid grid-cols-3 gap-2 border-b border-primary-k/10 pb-2">
                                        <p className="text-primary-k/50">Period</p>
                                        <p className="text-primary-k/50 text-right">Prior</p>
                                        <p className="text-primary-k/50 text-right">New</p>
                                    </div>
                                    {["weekly", "quarterly", "annual"].map((k) => {
                                        const priorKey = `contribution_${k}`;
                                        return (
                                            <div key={k} className="col-span-3 grid grid-cols-3 gap-2">
                                                <p className="text-primary-k capitalize">{k}</p>
                                                <p className="text-primary-k/70 text-right">{AUD2(preview.prior[priorKey])}</p>
                                                <p className={`text-right font-medium ${preview.delta[k] > 0 ? "text-red-700" : "text-emerald-700"}`}>
                                                    {AUD2(preview.new[priorKey])}
                                                    <span className="ml-1 text-[10px]">
                                                        ({preview.delta[k] >= 0 ? "+" : ""}{AUD(preview.delta[k])})
                                                    </span>
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {preview.lifetime_cap_impact?.new_years_at_current_pace && (
                                <p className="text-xs text-primary-k/70">
                                    New pace: <strong>approximately {Math.round(preview.lifetime_cap_impact.new_years_at_current_pace)} years</strong> until the lifetime cap.
                                </p>
                            )}
                            {preview.support_resources && (
                                <div className="text-xs bg-primary-k/[0.03] p-3 rounded-lg" data-testid="ce3-pension-wizard-support-resources">
                                    <p className="text-primary-k font-medium mb-1">Support available</p>
                                    <ul className="space-y-0.5 text-primary-k/70">
                                        {preview.support_resources.resources.map((r, i) => (
                                            <li key={i}>{r.name} · {r.phone}, {r.when}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {preview.backdated && (
                                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 p-3 rounded-lg">
                                    This change is backdated to {preview.effective_date}. Prior contributions may have been calculated at an older rate; you may want to check with your provider.
                                </p>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setStep(1)}
                                    className="flex-1 py-2 rounded-full border border-primary-k/20 text-primary-k text-sm"
                                    data-testid="ce3-pension-wizard-back"
                                >Back</button>
                                <button
                                    onClick={() => setStep(3)}
                                    className="flex-1 py-2 rounded-full bg-primary-k text-white text-sm"
                                    data-testid="ce3-pension-wizard-continue"
                                >Continue</button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4" data-testid="ce3-pension-wizard-step-3">
                            <p className="text-sm text-primary-k">Confirm this change. We&apos;ll snapshot your prior estimate and update the participant&apos;s pension status.</p>
                            <div>
                                <label className="text-xs text-primary-k/50 uppercase tracking-wide">Prior estimate PDFs</label>
                                <div className="mt-2 space-y-2">
                                    {[
                                        {key: "mark_superseded", label: "Mark superseded (recommended, kept but flagged)"},
                                        {key: "keep_unmarked", label: "Keep unmarked (not recommended)"},
                                        {key: "delete", label: "Flag for deletion after retention window"},
                                    ].map((opt) => (
                                        <label key={opt.key} className="flex items-start gap-2 text-xs text-primary-k">
                                            <input
                                                type="radio"
                                                name="pdf_handling"
                                                value={opt.key}
                                                checked={priorPdfHandling === opt.key}
                                                onChange={() => setPriorPdfHandling(opt.key)}
                                                data-testid={`ce3-pension-wizard-pdf-${opt.key}`}
                                            />
                                            <span>{opt.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setStep(2)}
                                    className="flex-1 py-2 rounded-full border border-primary-k/20 text-primary-k text-sm"
                                >Back</button>
                                <button
                                    onClick={commit}
                                    disabled={loading}
                                    className="flex-1 py-2 rounded-full bg-primary-k text-white text-sm disabled:opacity-50"
                                    data-testid="ce3-pension-wizard-commit"
                                >{loading ? "Saving…" : "Confirm change"}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ContributionPosition() {
    const { id: participantId } = useParams();
    const [cap, setCap] = useState(null);
    const [ap, setAp] = useState(null);
    const [rows, setRows] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [reconciling, setReconciling] = useState(false);
    const [error, setError] = useState(null);
    const [pensionModalOpen, setPensionModalOpen] = useState(false);
    const [participant, setParticipant] = useState(null);
    const [hardshipTriggers, setHardshipTriggers] = useState([]);

    const load = useCallback(async () => {
        setError(null);
        try {
            const [capR, apR, listR, partR, hardR] = await Promise.all([
                api.get(`/ce3/participants/${participantId}/lifetime-cap`),
                api.get(`/ce3/participants/${participantId}/annual-projection`),
                api.get(`/ce3/participants/${participantId}/reconciliations?months_back=12`),
                api.get(`/core/participants/${participantId}`).catch(() => ({data: null})),
                api.get(`/ce3/participants/${participantId}/hardship/triggers?only_open=true`).catch(() => ({data: {triggers: []}})),
            ]);
            setCap(capR.data);
            setAp(apR.data);
            setRows(listR.data?.reconciliations || []);
            setParticipant(partR?.data);
            setHardshipTriggers(hardR.data?.triggers || []);
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to load");
        }
    }, [participantId]);

    useEffect(() => { load(); }, [load]);

    async function refreshCap() {
        setRefreshing(true);
        try {
            const r = await api.post(`/ce3/participants/${participantId}/lifetime-cap/refresh`);
            setCap(r.data);
        } finally { setRefreshing(false); }
    }

    async function reconcile(month) {
        setReconciling(true);
        try {
            await api.post(`/ce3/participants/${participantId}/reconciliations/reconcile`, { period_month: month });
            const listR = await api.get(`/ce3/participants/${participantId}/reconciliations?months_back=12`);
            setRows(listR.data?.reconciliations || []);
        } finally { setReconciling(false); }
    }

    if (error) return (
        <div className="max-w-3xl mx-auto p-8 text-center text-sm text-red-600" data-testid="ce3-error">{String(error)}</div>
    );
    if (!cap || !ap) return (
        <div className="max-w-3xl mx-auto p-6 space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="ce3-contribution-position-page">
            <Link
                to={`/app/participants/${participantId}`}
                className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k"
                data-testid="ce3-back-to-profile"
            >
                <ChevronLeft className="w-4 h-4" /> Back to profile
            </Link>
            <PageIntro
                eyebrow="Contribution Position"
                title="Where You Stand on Contributions"
                description="One page that answers three questions: how much of the lifetime cap have I used, how much will I likely pay this year, and does what I've been charged actually match the estimate?"
                whatItDoes="Combines the lifetime cap accumulator, an annual projection with a confidence band, and month-by-month reconciliation of expected vs actual contributions."
                howToUse={[
                    "Review your lifetime cap headroom at the top.",
                    "Compare this year's projection with what's been charged so far.",
                    "Open any month with a variance to investigate the underlying invoices.",
                    "If contributions are causing hardship, open the hardship walkthrough.",
                ]}
                whatYouGet={[
                    "Certainty about how much you've paid vs what remains.",
                    "Early warning if this year's contributions are running high.",
                    "A direct hand-off to the hardship pathway when needed.",
                ]}
            />

            <LifetimeCapCard cap={cap} onRefresh={refreshCap} refreshing={refreshing} />

            {hardshipTriggers.length > 0 && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" data-testid="ce3-hardship-banner">
                    <p className="text-xs uppercase tracking-wide text-amber-800/70">Hardship pathway available</p>
                    <p className="text-sm text-amber-900 mt-1">
                        {hardshipTriggers[0].notification_tokens?.caregiver}
                    </p>
                    <Link
                        to={`/app/tools/contribution-estimator/hardship-walkthrough?trigger=${hardshipTriggers[0].id}`}
                        data-testid="ce3-hardship-open-walkthrough"
                        className="inline-block mt-3 text-xs px-4 py-2 rounded-full bg-amber-900 text-white"
                    >Open walkthrough →</Link>
                </section>
            )}

            <AnnualProjectionCard ap={ap} />
            <ReconciliationCard pid={participantId} rows={rows} onReconcile={reconcile} reconciling={reconciling} />

            <section className="rounded-2xl border border-primary-k/10 bg-white p-6" data-testid="ce3-pension-change-cta-section">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-primary-k/50">Pension status</p>
                        <h2 className="text-lg font-heading text-primary-k mt-1">
                            Current: {PENSION_LABELS[participant?.pension_status] || participant?.pension_status || "not set"}
                        </h2>
                        <p className="text-xs text-primary-k/60 mt-1">A change in pension status can move contribution amounts up or down.</p>
                    </div>
                    <button
                        onClick={() => setPensionModalOpen(true)}
                        data-testid="ce3-pension-change-open-btn"
                        className="text-xs inline-flex items-center gap-1 px-4 py-2 rounded-full bg-primary-k text-white"
                    ><ArrowRightLeft className="w-3 h-3" /> Change pension status</button>
                </div>
            </section>

            {pensionModalOpen && (
                <PensionChangeModal
                    pid={participantId}
                    currentStatus={participant?.pension_status}
                    onClose={() => setPensionModalOpen(false)}
                    onCommitted={() => { setPensionModalOpen(false); load(); }}
                />
            )}
        </div>
    );
}
