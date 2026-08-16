/**
 * PPC-3 v1 · Provider comparison view (2-3 providers side-by-side).
 * Route: /app/tools/provider-price-checker/compare
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ChevronLeft, Plus, X, Shield, Star, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import PageIntro from "@/components/PageIntro";
import SmartAISummary from "@/components/SmartAISummary";

const SIGNAL_ICON = {
    many_positive_signals: CheckCircle2,
    mixed_signals: TrendingUp,
    several_concerns: AlertTriangle,
    insufficient_data_for_summary: Shield,
};
const SIGNAL_TONE = {
    many_positive_signals: "text-emerald-700",
    mixed_signals: "text-amber-700",
    several_concerns: "text-red-700",
    insufficient_data_for_summary: "text-primary-k/60",
};

export default function ProviderComparison() {
    const [names, setNames] = useState(["", ""]);
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const addSlot = () => { if (names.length < 3) setNames([...names, ""]); };
    const removeSlot = (i) => { if (names.length > 2) setNames(names.filter((_, idx) => idx !== i)); };
    const updateName = (i, v) => { const c = [...names]; c[i] = v; setNames(c); };

    const run = async () => {
        const filtered = names.map(n => (n || "").trim()).filter(Boolean);
        if (filtered.length < 2) { setErr("Enter at least 2 provider names."); return; }
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post("/ppc3/provider-comparison", { provider_names: filtered });
            setResult(data);
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not compare providers.");
        } finally { setBusy(false); }
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6" data-testid="ppc3-compare-root">
            <Link to="/ai-tools/provider-price-checker"
                  className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back to Provider Price Checker
            </Link>

            <PageIntro
                eyebrow="Compare Providers"
                title="Side-by-Side Quality Context"
                description="Compare 2 or 3 providers on the signals that actually matter. Every price sits next to a quality context, because the cheapest provider is not always the best value, and the dearest is not always safer."
                whatItDoes="Pulls published complaint, workforce, and rating signals for each named provider and lines them up in one view. Wayly does not compute a &quot;best&quot; provider, you decide."
                howToUse={[
                    "Enter 2 or 3 provider names.",
                    "Click Compare, signals are fetched from public regulator sources.",
                    "Read the quality summary chip and drill into any concerning signal.",
                    "Use the take-away with your family to make an informed choice.",
                ]}
                whatYouGet={[
                    "A quality chip for each provider (positive / mixed / concerns).",
                    "Signal-level context, not a hollow star rating.",
                    "A shareable comparison you can save or send to family.",
                ]}
            />

            {result && (
                <SmartAISummary
                    pageKey="provider-comparison"
                    context={{
                        providers: (result.providers || []).map((p) => ({
                            name: p.name,
                            quality_signal: p.quality_signal || p.overall_signal,
                            complaint_count: p.complaint_count ?? p.complaints_count,
                            workforce_signal: p.workforce_signal,
                            average_hourly_aud: p.avg_hourly_rate,
                        })),
                        compared_count: (result.providers || []).length,
                    }}
                />
            )}

            <section className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3">
                {names.map((n, i) => (
                    <div key={i} className="flex items-center gap-2" data-testid={`ppc3-compare-slot-${i}`}>
                        <input
                            type="text"
                            value={n}
                            onChange={e => updateName(i, e.target.value)}
                            placeholder={`Provider ${i + 1} name`}
                            className="flex-1 text-sm border border-primary-k/20 rounded-lg px-3 py-2"
                            data-testid={`ppc3-compare-input-${i}`}
                        />
                        {names.length > 2 && (
                            <button onClick={() => removeSlot(i)} className="text-primary-k/50 hover:text-primary-k">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}
                <div className="flex items-center gap-3">
                    {names.length < 3 && (
                        <button onClick={addSlot} data-testid="ppc3-compare-add"
                                className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary-k/20 text-primary-k">
                            <Plus className="w-3 h-3" /> Add third provider
                        </button>
                    )}
                    <button onClick={run} disabled={busy} data-testid="ppc3-compare-run"
                            className="ml-auto text-xs px-4 py-2 rounded-full bg-primary-k text-white disabled:opacity-50">
                        {busy ? "Comparing..." : "Compare"}
                    </button>
                </div>
                {err && <p className="text-xs text-red-700" data-testid="ppc3-compare-error">{err}</p>}
            </section>

            {result && (
                <section className="grid gap-4" style={{gridTemplateColumns: `repeat(${result.count}, minmax(0, 1fr))`}}
                         data-testid="ppc3-compare-results">
                    {result.comparison.map((p) => {
                        const summary = p.composite_quality_summary || {};
                        const Icon = SIGNAL_ICON[summary.overall_signal] || Shield;
                        const tone = SIGNAL_TONE[summary.overall_signal] || "";
                        return (
                            <div key={p.id} className="rounded-2xl border border-primary-k/10 bg-white p-5"
                                 data-testid={`ppc3-compare-card-${p.provider_name_normalised}`}>
                                <p className="text-xs uppercase tracking-wide text-primary-k/50">Provider</p>
                                <h2 className="text-lg font-heading text-primary-k mt-1">{p.provider_official_name}</h2>
                                <div className={`mt-3 flex items-center gap-2 ${tone}`}>
                                    <Icon className="w-4 h-4" />
                                    <span className="text-xs font-semibold uppercase tracking-wide">
                                        {(summary.overall_signal || "").replace(/_/g, " ")}
                                    </span>
                                </div>
                                <div className="mt-3 space-y-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="text-primary-k/60">ACQSC</span>
                                        <span className="text-primary-k">{(p.acqsc_compliance_status?.current_status || "unknown").replace(/_/g, " ")}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-primary-k/60">Star Rating</span>
                                        <span className="text-primary-k inline-flex items-center gap-1">
                                            <Star className="w-3 h-3" />
                                            {p.star_ratings?.overall_rating ? `${p.star_ratings.overall_rating}/5` : ","}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-primary-k/60">Wayly recommend %</span>
                                        <span className="text-primary-k">
                                            {p.wayly_aggregated_feedback?.threshold_met_for_publication
                                                ? `${p.wayly_aggregated_feedback.would_recommend_percentage}%`
                                                : "insufficient data"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-primary-k/60">Public referrals</span>
                                        <span className="text-primary-k">{(p.ombudsman_public_referrals || []).length}</span>
                                    </div>
                                </div>
                                <Link to={`/app/tools/provider-price-checker/quality/${encodeURIComponent(p.provider_official_name)}`}
                                      className="mt-4 inline-block text-xs text-primary-k underline"
                                      data-testid={`ppc3-compare-details-${p.provider_name_normalised}`}>
                                    See full details →
                                </Link>
                            </div>
                        );
                    })}
                </section>
            )}
        </div>
    );
}
