/**
 * PPC-3 v1 · Provider Quality Detail with composite quality summary + Wayly survey.
 * Route: /app/tools/provider-price-checker/quality/:providerName
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { ChevronLeft, Shield, Star, MessageSquare, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import PageIntro from "@/components/PageIntro";

const SIGNAL_STYLE = {
    many_positive_signals: { icon: CheckCircle2, tone: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", label: "Many positive signals" },
    mixed_signals: { icon: TrendingUp, tone: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "Mixed signals" },
    several_concerns: { icon: AlertTriangle, tone: "text-red-700", bg: "bg-red-50 border-red-200", label: "Several concerns" },
    insufficient_data_for_summary: { icon: Shield, tone: "text-primary-k/60", bg: "bg-primary-k/5 border-primary-k/10", label: "Insufficient data" },
};

function CompositeSummaryCard({ summary }) {
    if (!summary) return null;
    const style = SIGNAL_STYLE[summary.overall_signal] || SIGNAL_STYLE.insufficient_data_for_summary;
    const Icon = style.icon;
    return (
        <div className={`rounded-2xl border p-5 ${style.bg}`} data-testid="ppc3-composite-summary">
            <div className="flex items-start gap-3">
                <Icon className={`w-6 h-6 ${style.tone} flex-shrink-0`} />
                <div className="flex-1">
                    <p className={`text-xs uppercase tracking-wide font-semibold ${style.tone}`}>{style.label}</p>
                    <p className="text-sm text-primary-k mt-2" data-testid="ppc3-composite-explanation">
                        {summary.explanation_tokens?.caregiver || summary.explanation_tokens?.participant_self || ""}
                    </p>
                    <p className="text-[11px] text-primary-k/50 mt-2">
                        Based on {summary.signals_available_count} public signal{summary.signals_available_count === 1 ? "" : "s"}:
                        {" "}{(summary.signals_included || []).join(", ") || "none yet"}.
                    </p>
                </div>
            </div>
        </div>
    );
}

function SignalRow({ label, value, source, testid }) {
    return (
        <div className="flex items-start justify-between gap-3 border-t border-primary-k/10 py-3" data-testid={testid}>
            <div>
                <p className="text-xs uppercase tracking-wide text-primary-k/50">{label}</p>
                <p className="text-sm text-primary-k font-medium mt-1">{value}</p>
            </div>
            {source && <p className="text-[10px] text-primary-k/40 self-end">Source: {source}</p>}
        </div>
    );
}

function RatingRow({ label, field, value, onChange }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <label className="text-sm text-primary-k">{label}</label>
            <div className="flex gap-1" data-testid={`ppc3-rating-${field}`}>
                {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => onChange(n)}
                            className={`w-8 h-8 rounded-full text-xs border ${value === n ? "bg-primary-k text-white border-primary-k" : "border-primary-k/20 text-primary-k/60"}`}>
                        {n}
                    </button>
                ))}
            </div>
        </div>
    );
}

function SurveyForm({ providerName, onSubmitted }) {
    const [form, setForm] = useState({
        care_quality: 4, communication: 4, billing_accuracy: 4,
        worker_reliability: 4, would_recommend: true,
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            await api.post("/ppc3/survey-responses", { provider_name: providerName, ...form });
            onSubmitted();
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not submit rating.");
        } finally { setBusy(false); }
    };
    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5" data-testid="ppc3-survey-form">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Rate your experience</p>
            <p className="text-[11px] text-primary-k/50 mt-1">Aggregated with a minimum of 5 responses; individual ratings are not published.</p>
            <div className="mt-3">
                <RatingRow label="Care quality" field="care_quality" value={form.care_quality}
                           onChange={n => setForm(f => ({...f, care_quality: n}))} />
                <RatingRow label="Communication" field="communication" value={form.communication}
                           onChange={n => setForm(f => ({...f, communication: n}))} />
                <RatingRow label="Billing accuracy" field="billing_accuracy" value={form.billing_accuracy}
                           onChange={n => setForm(f => ({...f, billing_accuracy: n}))} />
                <RatingRow label="Worker reliability" field="worker_reliability" value={form.worker_reliability}
                           onChange={n => setForm(f => ({...f, worker_reliability: n}))} />
                <div className="flex items-center justify-between gap-3 py-2">
                    <label className="text-sm text-primary-k">Would you recommend?</label>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setForm(f => ({...f, would_recommend: true}))}
                                className={`text-xs px-3 py-1 rounded-full border ${form.would_recommend ? "bg-primary-k text-white border-primary-k" : "border-primary-k/20"}`}
                                data-testid="ppc3-recommend-yes">Yes</button>
                        <button type="button" onClick={() => setForm(f => ({...f, would_recommend: false}))}
                                className={`text-xs px-3 py-1 rounded-full border ${!form.would_recommend ? "bg-primary-k text-white border-primary-k" : "border-primary-k/20"}`}
                                data-testid="ppc3-recommend-no">No</button>
                    </div>
                </div>
            </div>
            {err && <p className="text-xs text-red-700 mt-2" data-testid="ppc3-survey-error">{err}</p>}
            <button onClick={submit} disabled={busy}
                    className="mt-4 text-xs w-full py-2 rounded-full bg-primary-k text-white disabled:opacity-50"
                    data-testid="ppc3-survey-submit">
                {busy ? "Submitting..." : "Submit rating"}
            </button>
        </div>
    );
}

export default function ProviderQualityDetail() {
    const { providerName } = useParams();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const { data } = await api.get(`/ppc3/providers/${encodeURIComponent(providerName)}/quality-profile`);
            setProfile(data.profile);
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not load quality profile.");
        } finally { setLoading(false); }
    }, [providerName]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="max-w-3xl mx-auto p-6"><Skeleton className="h-40" /></div>;
    if (err) return <div className="max-w-3xl mx-auto p-6 text-red-700" data-testid="ppc3-error">{err}</div>;

    const acqsc = profile?.acqsc_compliance_status || {};
    const stars = profile?.star_ratings;
    const wayly = profile?.wayly_aggregated_feedback;

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="ppc3-detail-root">
            <Link to="/ai-tools/provider-price-checker"
                  className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back to Provider Price Checker
            </Link>

            <PageIntro
                eyebrow="Provider Quality Context"
                title={profile?.provider_official_name || providerName}
                description="Every publicly available quality signal we can lawfully surface for this provider, combined into one honest picture. This is not a rating or recommendation."
                whatItDoes="Aggregates official complaint history, workforce data, and Wayly's own community survey into a composite quality summary you can trust."
                howToUse={[
                    "Read the composite quality summary chip at the top.",
                    "Drill into each signal to see the raw source data and dates.",
                    "Complete the short Wayly survey to help other families.",
                    "Compare against another provider using the Compare Providers tool.",
                ]}
                whatYouGet={[
                    "One honest verdict on this provider, based on evidence.",
                    "Direct links to regulator public records.",
                    "The chance to contribute your own feedback to the community.",
                ]}
                data-testid="ppc3-provider-intro"
            >
                <p className="sr-only" data-testid="ppc3-provider-name">{profile?.provider_official_name || providerName}</p>
            </PageIntro>

            <CompositeSummaryCard summary={profile?.composite_quality_summary} />

            <section className="rounded-2xl border border-primary-k/10 bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-primary-k/50">Signals available</p>
                <SignalRow
                    label="ACQSC compliance"
                    value={acqsc.current_status?.replace(/_/g, " ") || "status unknown"}
                    source={acqsc.source_url ? "ACQSC public register" : "not yet synced"}
                    testid="ppc3-signal-acqsc"
                />
                <SignalRow
                    label="Star Ratings"
                    value={stars?.overall_rating ? `${stars.overall_rating} / 5` : "not published"}
                    source={stars?.overall_rating ? "My Aged Care" : null}
                    testid="ppc3-signal-stars"
                />
                <SignalRow
                    label="Wayly user feedback"
                    value={wayly?.threshold_met_for_publication
                        ? `${wayly.would_recommend_percentage}% recommend (n=${wayly.survey_response_count})`
                        : "not enough data yet"}
                    source={wayly?.threshold_met_for_publication ? "Wayly aggregated survey" : null}
                    testid="ppc3-signal-wayly"
                />
                <SignalRow
                    label="Ombudsman public referrals"
                    value={(profile?.ombudsman_public_referrals || []).length ? `${(profile?.ombudsman_public_referrals || []).length} referral(s)` : "none reported"}
                    source={(profile?.ombudsman_public_referrals || []).length ? "Commonwealth Ombudsman reports" : null}
                    testid="ppc3-signal-ombudsman"
                />
            </section>

            {profile?.provider_responses?.length > 0 && (
                <section className="rounded-2xl border border-primary-k/10 bg-white p-5" data-testid="ppc3-provider-responses">
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Provider responses</p>
                    {profile.provider_responses.map((r, i) => (
                        <div key={i} className="mt-3 border-t border-primary-k/10 pt-3">
                            <p className="text-xs text-primary-k/60">{r.submitter_name} · {r.submitter_role}</p>
                            <p className="text-sm text-primary-k mt-1">{r.response_content}</p>
                        </div>
                    ))}
                </section>
            )}

            <SurveyForm providerName={providerName} onSubmitted={load} />

            <section className="rounded-2xl border border-primary-k/10 bg-primary-k/5 p-5" data-testid="ppc3-opan-referral">
                <p className="text-xs uppercase tracking-wide text-primary-k/60 font-semibold">Talk to people who&#39;ve used this provider</p>
                <p className="text-sm text-primary-k mt-2">
                    Wayly does not connect users directly. The Older Persons Advocacy Network (OPAN) offers free advocacy that can help.
                </p>
                <a href="tel:1800700600" className="text-sm underline text-primary-k mt-2 inline-block">Call OPAN · 1800 700 600</a>
            </section>

            <p className="text-[11px] text-primary-k/40">
                Every signal has a public source. Wayly does not publish unverified reviews or aggregate worker-level signals.
                <Link to="/app/methodology/provider-quality" className="underline ml-1">Read the methodology</Link>.
            </p>
        </div>
    );
}
