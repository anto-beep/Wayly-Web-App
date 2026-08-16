/**
 * CS-1 v1 · Carer self-assessment multi-step flow + burnout self-check + warm hand-off resources.
 * Route: /app/carer/self-assessment
 */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ChevronLeft, ChevronRight, Phone, ExternalLink, ShieldCheck, Heart, AlertTriangle } from "lucide-react";
import PageIntro from "@/components/PageIntro";

const STRENGTHS = [
    { key: "patience", label: "Patience" },
    { key: "organisation", label: "Organisation" },
    { key: "medical_knowledge", label: "Medical knowledge" },
    { key: "physical_capacity", label: "Physical capacity" },
    { key: "emotional_resilience", label: "Emotional resilience" },
    { key: "communication", label: "Communication" },
    { key: "other", label: "Other" },
];
const CONSTRAINTS = [
    { key: "financial", label: "Financial" },
    { key: "physical", label: "Physical" },
    { key: "emotional", label: "Emotional" },
    { key: "time_pressure", label: "Time pressure" },
    { key: "social_isolation", label: "Social isolation" },
    { key: "own_health", label: "My own health" },
    { key: "family_conflict", label: "Family conflict" },
    { key: "geographic", label: "Geographic (remote / travel)" },
    { key: "other", label: "Other" },
];
const CURRENT_SUPPORT = [
    { key: "respite_informal", label: "Informal respite (family/friends)" },
    { key: "respite_formal", label: "Formal respite services" },
    { key: "counselling", label: "Counselling" },
    { key: "support_group", label: "Support group" },
    { key: "online_community", label: "Online community" },
    { key: "none", label: "None" },
];
const DESIRED = [
    { key: "more_respite", label: "More respite" },
    { key: "financial_support", label: "Financial support" },
    { key: "counselling", label: "Counselling" },
    { key: "peer_support", label: "Peer support" },
    { key: "education", label: "Education / training" },
    { key: "practical_help", label: "Practical help" },
    { key: "understanding", label: "Understanding from others" },
];

const FATIGUE_LEVELS = ["none", "mild", "moderate", "high", "severe"];
const SLEEP_LEVELS = ["good", "fair", "poor", "very_poor"];
const SELFCARE_LEVELS = ["adequate", "limited", "minimal", "none"];

const BURNOUT_STYLE = {
    low: { tone: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: Heart, label: "Managing well" },
    moderate: { tone: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Heart, label: "Some strain" },
    elevated: { tone: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: AlertTriangle, label: "Carrying a lot" },
    high: { tone: "text-red-700", bg: "bg-red-50 border-red-200", icon: AlertTriangle, label: "Really struggling" },
};

function Chip({ active, onClick, children, testid }) {
    return (
        <button type="button" onClick={onClick} data-testid={testid}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${active ? "bg-primary-k text-white border-primary-k" : "border-primary-k/20 text-primary-k hover:border-primary-k/40"}`}>
            {children}
        </button>
    );
}

function LevelRow({ label, value, options, onChange, testid }) {
    return (
        <div className="py-2">
            <label className="text-sm text-primary-k">{label}</label>
            <div className="flex flex-wrap gap-2 mt-2" data-testid={testid}>
                {options.map(opt => (
                    <Chip key={opt} active={value === opt} onClick={() => onChange(opt)}
                          testid={`${testid}-${opt}`}>
                        {opt.replace(/_/g, " ")}
                    </Chip>
                ))}
            </div>
        </div>
    );
}

function WarmHandoffCard({ signal, response, services }) {
    const style = BURNOUT_STYLE[signal] || BURNOUT_STYLE.low;
    const Icon = style.icon;
    const resourceMap = Object.fromEntries((services || []).map(s => [s.slug, s]));
    const recs = (response?.recommended_resources || [])
        .map(slug => resourceMap[slug]).filter(Boolean);

    return (
        <div className={`rounded-2xl border p-5 ${style.bg}`} data-testid="cs1-burnout-result">
            <div className="flex items-start gap-3">
                <Icon className={`w-6 h-6 ${style.tone} flex-shrink-0`} />
                <div className="flex-1">
                    <p className={`text-xs uppercase tracking-wide font-semibold ${style.tone}`}
                       data-testid={`cs1-burnout-signal-${signal}`}>{style.label}</p>
                    <p className="text-sm text-primary-k mt-2">{response?.message}</p>
                    {response?.emergency_note && (
                        <p className="text-sm font-semibold text-red-800 mt-2" data-testid="cs1-burnout-emergency">
                            {response.emergency_note}
                        </p>
                    )}
                </div>
            </div>
            {recs.length > 0 && (
                <div className="mt-4 grid gap-2" data-testid="cs1-warm-handoff-resources">
                    {recs.map(s => (
                        <div key={s.slug} className="rounded-xl bg-white/70 border border-primary-k/10 p-3"
                             data-testid={`cs1-resource-${s.slug}`}>
                            <p className="text-sm font-medium text-primary-k">{s.service_name}</p>
                            <p className="text-xs text-primary-k/60 mt-1">{s.description}</p>
                            <div className="flex items-center gap-3 mt-2">
                                {s.contact_phone && (
                                    <a href={`tel:${s.contact_phone.replace(/\s/g, "")}`}
                                       className="text-xs inline-flex items-center gap-1 text-primary-k font-medium"
                                       data-testid={`cs1-resource-call-${s.slug}`}>
                                        <Phone className="w-3 h-3" /> {s.contact_phone}
                                    </a>
                                )}
                                {s.contact_website && (
                                    <a href={s.contact_website} target="_blank" rel="noopener noreferrer"
                                       className="text-xs inline-flex items-center gap-1 text-primary-k/70">
                                        <ExternalLink className="w-3 h-3" /> Website
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function CarerSelfAssessment() {
    const [step, setStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [services, setServices] = useState([]);
    const [result, setResult] = useState(null);
    const [form, setForm] = useState({
        self_reported_strengths: [],
        strengths_notes: "",
        capacity_indicators: {},
        constraints_reported: [],
        constraints_notes: "",
        support_used_currently: [],
        desired_support: [],
        opt_in_burnout: false,
        opt_in_health_conditions: false,
        burnout_self_report: {
            fatigue_level: null,
            emotional_exhaustion: null,
            isolation_feelings: null,
            sleep_quality: null,
            self_care_time: null,
        },
    });

    useEffect(() => {
        api.get("/cs1/support-services").then(r => setServices(r.data.services || [])).catch(() => {});
    }, []);

    const toggle = (field, value) => {
        setForm(f => {
            const cur = f[field] || [];
            return { ...f, [field]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] };
        });
    };

    const setBurnout = (field, value) => {
        setForm(f => ({ ...f, burnout_self_report: { ...f.burnout_self_report, [field]: value } }));
    };

    const totalSteps = 6;
    const canNext = step < totalSteps;
    const canBack = step > 1;

    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post("/cs1/assessments", form);
            setResult(data.assessment);
            setStep(totalSteps + 1); // results screen
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not save assessment.");
        } finally { setBusy(false); }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6" data-testid="cs1-assessment-root">
            <Link to="/app" className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back
            </Link>

            <header>
                <PageIntro
                    eyebrow="Carer Self-Check"
                    title="Your Space to Check In With Yourself"
                    description="Caring for someone is demanding, and looking after yourself is not optional. This is a private self-check, nothing is shared, no diagnosis, and you can skip any question."
                    whatItDoes="Walks you through your caring role, strengths, constraints, and stress signals. Recognises burnout patterns and points you to the right support, Carer Gateway, GP, or a warm human contact."
                    howToUse={[
                        "Move through the short multi-step check at your own pace.",
                        "Answer honestly, this is only for you.",
                        "At the end, review a private summary and suggested next steps.",
                        "Save the results if you want to revisit or share with your GP.",
                    ]}
                    whatYouGet={[
                        "A confidential burnout risk read-out.",
                        "Warm hand-off links to Carer Gateway, GP support, and respite services.",
                        "A private record you can return to over time.",
                    ]}
                />
                <div className="mt-3 rounded-xl border border-primary-k/10 bg-primary-k/[0.03] p-3 flex items-center justify-between gap-3" data-testid="cs1-handover-link">
                    <p className="text-sm text-primary-k">Planning time away? Build a handover pack for a backup carer.</p>
                    <Link to="/app/carer/handover-pack" className="text-sm font-medium text-primary-k underline whitespace-nowrap">
                        Handover Pack
                    </Link>
                </div>
                {step <= totalSteps && (
                    <div className="mt-4 h-1.5 rounded-full bg-primary-k/10 overflow-hidden" data-testid="cs1-progress">
                        <div className="h-full bg-primary-k transition-all" style={{width: `${(step/totalSteps)*100}%`}} />
                    </div>
                )}
                {step <= totalSteps && (
                    <p className="text-[11px] text-primary-k/50 mt-1" data-testid="cs1-progress-label">Step {step} of {totalSteps}</p>
                )}
            </header>

            <section className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4" data-testid={`cs1-step-${step}`}>
                {step === 1 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">What are you good at as a carer?</p>
                        <p className="text-xs text-primary-k/60">Selecting these helps you notice what you bring.</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {STRENGTHS.map(s => (
                                <Chip key={s.key} active={form.self_reported_strengths.includes(s.key)}
                                      onClick={() => toggle("self_reported_strengths", s.key)}
                                      testid={`cs1-strength-${s.key}`}>{s.label}</Chip>
                            ))}
                        </div>
                        <textarea value={form.strengths_notes} onChange={e => setForm({...form, strengths_notes: e.target.value})}
                                  placeholder="Any notes (optional)"
                                  className="w-full mt-2 text-sm border border-primary-k/20 rounded-lg p-2"
                                  data-testid="cs1-strengths-notes" rows={2} />
                    </>
                )}

                {step === 2 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">Your capacity</p>
                        <div className="grid gap-3 mt-2">
                            <label className="text-sm text-primary-k">
                                Hours per week caring (rough estimate)
                                <input type="number" min={0} max={168}
                                       value={form.capacity_indicators.hours_per_week_caring || ""}
                                       onChange={e => setForm({...form, capacity_indicators: {...form.capacity_indicators, hours_per_week_caring: Number(e.target.value) || null}})}
                                       className="mt-1 w-full text-sm border border-primary-k/20 rounded-lg p-2"
                                       data-testid="cs1-hours-per-week" />
                            </label>
                            <label className="text-sm text-primary-k flex items-center gap-2">
                                <input type="checkbox" checked={form.opt_in_health_conditions}
                                       onChange={e => setForm({...form, opt_in_health_conditions: e.target.checked})}
                                       data-testid="cs1-optin-health" />
                                I&#39;m willing to share whether I have my own health conditions (optional)
                            </label>
                            {form.opt_in_health_conditions && (
                                <label className="text-sm text-primary-k flex items-center gap-2">
                                    <input type="checkbox"
                                           checked={!!form.capacity_indicators.has_own_health_conditions}
                                           onChange={e => setForm({...form, capacity_indicators: {...form.capacity_indicators, has_own_health_conditions: e.target.checked}})}
                                           data-testid="cs1-has-health-cond" />
                                    Yes, I have my own health conditions to manage
                                </label>
                            )}
                        </div>
                    </>
                )}

                {step === 3 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">Constraints</p>
                        <p className="text-xs text-primary-k/60">What&#39;s making caring harder right now?</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {CONSTRAINTS.map(c => (
                                <Chip key={c.key} active={form.constraints_reported.includes(c.key)}
                                      onClick={() => toggle("constraints_reported", c.key)}
                                      testid={`cs1-constraint-${c.key}`}>{c.label}</Chip>
                            ))}
                        </div>
                        <textarea value={form.constraints_notes} onChange={e => setForm({...form, constraints_notes: e.target.value})}
                                  placeholder="Any notes (optional)"
                                  className="w-full mt-2 text-sm border border-primary-k/20 rounded-lg p-2"
                                  data-testid="cs1-constraints-notes" rows={2} />
                    </>
                )}

                {step === 4 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">Current support</p>
                        <p className="text-xs text-primary-k/60">What are you using right now?</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {CURRENT_SUPPORT.map(c => (
                                <Chip key={c.key} active={form.support_used_currently.includes(c.key)}
                                      onClick={() => toggle("support_used_currently", c.key)}
                                      testid={`cs1-support-${c.key}`}>{c.label}</Chip>
                            ))}
                        </div>
                    </>
                )}

                {step === 5 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">Burnout self-check (optional)</p>
                        <label className="text-sm text-primary-k flex items-center gap-2 mt-1">
                            <input type="checkbox" checked={form.opt_in_burnout}
                                   onChange={e => setForm({...form, opt_in_burnout: e.target.checked})}
                                   data-testid="cs1-optin-burnout" />
                            Yes, I&#39;d like to check in about how I&#39;m doing
                        </label>
                        {form.opt_in_burnout && (
                            <div className="mt-3 border-t border-primary-k/10 pt-3">
                                <LevelRow label="How exhausted have you been feeling lately?"
                                          value={form.burnout_self_report.fatigue_level}
                                          options={FATIGUE_LEVELS}
                                          onChange={v => setBurnout("fatigue_level", v)}
                                          testid="cs1-burnout-fatigue" />
                                <LevelRow label="How emotionally drained do you feel?"
                                          value={form.burnout_self_report.emotional_exhaustion}
                                          options={FATIGUE_LEVELS}
                                          onChange={v => setBurnout("emotional_exhaustion", v)}
                                          testid="cs1-burnout-emotional" />
                                <LevelRow label="How isolated have you felt from other people?"
                                          value={form.burnout_self_report.isolation_feelings}
                                          options={FATIGUE_LEVELS}
                                          onChange={v => setBurnout("isolation_feelings", v)}
                                          testid="cs1-burnout-isolation" />
                                <LevelRow label="How is your sleep quality?"
                                          value={form.burnout_self_report.sleep_quality}
                                          options={SLEEP_LEVELS}
                                          onChange={v => setBurnout("sleep_quality", v)}
                                          testid="cs1-burnout-sleep" />
                                <LevelRow label="How much time do you have for yourself?"
                                          value={form.burnout_self_report.self_care_time}
                                          options={SELFCARE_LEVELS}
                                          onChange={v => setBurnout("self_care_time", v)}
                                          testid="cs1-burnout-selfcare" />
                            </div>
                        )}
                    </>
                )}

                {step === 6 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">What would help most?</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {DESIRED.map(d => (
                                <Chip key={d.key} active={form.desired_support.includes(d.key)}
                                      onClick={() => toggle("desired_support", d.key)}
                                      testid={`cs1-desired-${d.key}`}>{d.label}</Chip>
                            ))}
                        </div>
                    </>
                )}

                {step > totalSteps && result && (
                    <div className="space-y-4" data-testid="cs1-results">
                        <div className="flex items-center gap-2 text-emerald-700">
                            <ShieldCheck className="w-5 h-5" />
                            <p className="text-sm font-medium">Assessment saved</p>
                        </div>
                        {result.burnout_composite_signal && (
                            <WarmHandoffCard
                                signal={result.burnout_composite_signal}
                                response={result.burnout_response}
                                services={services}
                            />
                        )}
                        <div>
                            <p className="text-xs uppercase tracking-wide text-primary-k/50">Suggested next steps</p>
                            <p className="text-sm text-primary-k mt-2">
                                You can visit the <Link to="/app/carer/support-services" className="underline">Support services directory</Link> anytime.
                                What you shared stays private to you; it&#39;s retained for 12 months and you can extend or delete it anytime.
                            </p>
                        </div>
                    </div>
                )}

                {err && <p className="text-xs text-red-700" data-testid="cs1-error">{err}</p>}
            </section>

            {step <= totalSteps && (
                <div className="flex items-center justify-between">
                    <button onClick={() => setStep(s => s - 1)} disabled={!canBack}
                            className="text-xs inline-flex items-center gap-1 text-primary-k/60 disabled:opacity-30"
                            data-testid="cs1-back-btn">
                        <ChevronLeft className="w-3 h-3" /> Back
                    </button>
                    {canNext ? (
                        <button onClick={() => setStep(s => s + 1)}
                                className="text-xs inline-flex items-center gap-1 px-4 py-2 rounded-full bg-primary-k text-white"
                                data-testid="cs1-next-btn">
                            Next <ChevronRight className="w-3 h-3" />
                        </button>
                    ) : (
                        <button onClick={submit} disabled={busy}
                                className="text-xs inline-flex items-center gap-1 px-4 py-2 rounded-full bg-primary-k text-white disabled:opacity-50"
                                data-testid="cs1-submit-btn">
                            {busy ? "Saving..." : "See suggestions"}
                        </button>
                    )}
                </div>
            )}

            <p className="text-[11px] text-primary-k/40">
                If you or anyone in your household is in immediate danger, call 000.
                Lifeline crisis support: 13 11 14. Elder Abuse Helpline: 1800 353 374.
            </p>
        </div>
    );
}
