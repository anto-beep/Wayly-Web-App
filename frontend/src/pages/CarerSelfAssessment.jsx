/**
 * CS-1 v2 · Carer self-assessment. Multi-step check-in with save & resume,
 * a warm personalised summary, tailored resources, and a gentle "next check-in"
 * scheduler. Route: /app/carer/self-assessment
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import useScrollToResult from "@/hooks/useScrollToResult";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ChevronLeft, ChevronRight, Phone, ExternalLink, ShieldCheck, Heart, AlertTriangle, Save, CalendarCheck, Sparkles, CheckCircle2 } from "lucide-react";
import PageIntro from "@/components/PageIntro";

const STRENGTHS = [
    { key: "patience", label: "Patience" },
    { key: "organisation", label: "Organisation" },
    { key: "medical_knowledge", label: "Medical Knowledge" },
    { key: "physical_capacity", label: "Physical Capacity" },
    { key: "emotional_resilience", label: "Emotional Resilience" },
    { key: "communication", label: "Communication" },
    { key: "other", label: "Other" },
];
const CONSTRAINTS = [
    { key: "financial", label: "Financial" },
    { key: "physical", label: "Physical" },
    { key: "emotional", label: "Emotional" },
    { key: "time_pressure", label: "Time Pressure" },
    { key: "social_isolation", label: "Social Isolation" },
    { key: "own_health", label: "My Own Health" },
    { key: "family_conflict", label: "Family Conflict" },
    { key: "geographic", label: "Geographic (Remote / Travel)" },
    { key: "other", label: "Other" },
];
const CURRENT_SUPPORT = [
    { key: "respite_informal", label: "Informal Respite (Family / Friends)" },
    { key: "respite_formal", label: "Formal Respite Services" },
    { key: "counselling", label: "Counselling" },
    { key: "support_group", label: "Support Group" },
    { key: "online_community", label: "Online Community" },
    { key: "none", label: "None" },
];
const DESIRED = [
    { key: "more_respite", label: "More Respite" },
    { key: "financial_support", label: "Financial Support" },
    { key: "counselling", label: "Counselling" },
    { key: "peer_support", label: "Peer Support" },
    { key: "education", label: "Education / Training" },
    { key: "practical_help", label: "Practical Help" },
    { key: "understanding", label: "Understanding From Others" },
];

const FATIGUE_LEVELS = ["none", "mild", "moderate", "high", "severe"];
const SLEEP_LEVELS = ["good", "fair", "poor", "very_poor"];
const SELFCARE_LEVELS = ["adequate", "limited", "minimal", "none"];

const STEP_TITLES = [
    "What are you good at as a carer?",
    "Your caring capacity",
    "What is making caring harder?",
    "Support you are using now",
    "A gentle check-in on how you are doing",
    "What would help you most?",
];

const BURNOUT_STYLE = {
    low: { tone: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: Heart, label: "Managing well" },
    moderate: { tone: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Heart, label: "Some strain" },
    elevated: { tone: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: AlertTriangle, label: "Carrying a lot" },
    high: { tone: "text-red-700", bg: "bg-red-50 border-red-200", icon: AlertTriangle, label: "Really struggling" },
};

function Chip({ active, onClick, children, testid }) {
    return (
        <button type="button" onClick={onClick} data-testid={testid}
                className={`text-sm px-3.5 py-2 rounded-full border transition ${active ? "bg-primary-k text-white border-primary-k" : "border-primary-k/20 text-primary-k hover:border-primary-k/40 bg-white"}`}>
            {children}
        </button>
    );
}

function LevelRow({ label, value, options, onChange, testid }) {
    return (
        <div className="py-2">
            <label className="text-sm text-primary-k font-medium">{label}</label>
            <div className="flex flex-wrap gap-2 mt-2" data-testid={testid}>
                {options.map(opt => (
                    <Chip key={opt} active={value === opt} onClick={() => onChange(opt)} testid={`${testid}-${opt}`}>
                        {opt.replace(/_/g, " ")}
                    </Chip>
                ))}
            </div>
        </div>
    );
}

function WarmHandoffCard({ signal, response }) {
    const style = BURNOUT_STYLE[signal] || BURNOUT_STYLE.low;
    const Icon = style.icon;
    return (
        <div className={`rounded-2xl border p-5 ${style.bg}`} data-testid="cs1-burnout-result">
            <div className="flex items-start gap-3">
                <Icon className={`w-6 h-6 ${style.tone} flex-shrink-0`} />
                <div className="flex-1">
                    <p className={`text-xs uppercase tracking-wide font-semibold ${style.tone}`} data-testid={`cs1-burnout-signal-${signal}`}>{style.label}</p>
                    <p className="text-sm text-primary-k mt-2">{response?.message}</p>
                    {response?.emergency_note && (
                        <p className="text-sm font-semibold text-red-800 mt-2" data-testid="cs1-burnout-emergency">{response.emergency_note}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function ResourceCard({ s }) {
    return (
        <div className="rounded-xl bg-white border border-primary-k/10 p-3" data-testid={`cs1-resource-${s.slug}`}>
            <p className="text-sm font-medium text-primary-k">{s.service_name}</p>
            <p className="text-xs text-muted-k mt-1">{s.description}</p>
            <div className="flex items-center gap-3 mt-2">
                {s.contact_phone && (
                    <a href={`tel:${s.contact_phone.replace(/\s/g, "")}`} className="text-xs inline-flex items-center gap-1 text-primary-k font-medium" data-testid={`cs1-resource-call-${s.slug}`}>
                        <Phone className="w-3 h-3" /> {s.contact_phone}
                    </a>
                )}
                {s.contact_website && (
                    <a href={s.contact_website} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 text-muted-k">
                        <ExternalLink className="w-3 h-3" /> Website
                    </a>
                )}
            </div>
        </div>
    );
}

const EMPTY_FORM = {
    self_reported_strengths: [], strengths_notes: "", capacity_indicators: {},
    constraints_reported: [], constraints_notes: "", support_used_currently: [],
    desired_support: [], opt_in_burnout: false, opt_in_health_conditions: false,
    burnout_self_report: { fatigue_level: null, emotional_exhaustion: null, isolation_feelings: null, sleep_quality: null, self_care_time: null },
    next_checkin_date: null,
};

export default function CarerSelfAssessment() {
    const [step, setStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [services, setServices] = useState([]);
    const [result, setResult] = useState(null);
    const [resumed, setResumed] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    const [checkinDate, setCheckinDate] = useState("");
    const [checkinSet, setCheckinSet] = useState(false);
    const resultRef = useScrollToResult(Boolean(result));
    const draftReady = useRef(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });

    const totalSteps = 6;

    useEffect(() => {
        api.get("/cs1/support-services").then(r => setServices(r.data.services || [])).catch(() => {});
    }, []);

    // Load any saved draft so the carer can pick up where they left off.
    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/cs1/assessment-draft");
                if (data?.draft?.form) {
                    setForm({ ...EMPTY_FORM, ...data.draft.form });
                    setStep(Math.min(Math.max(data.draft.step || 1, 1), totalSteps));
                    setResumed(true);
                }
            } catch { /* no draft */ } finally { draftReady.current = true; }
        })();
    }, []);

    // Debounced autosave once a draft has been loaded and while still in the flow.
    useEffect(() => {
        if (!draftReady.current || result) return;
        const t = setTimeout(() => {
            api.put("/cs1/assessment-draft", { form, step }).then(() => setSavedAt(Date.now())).catch(() => {});
        }, 900);
        return () => clearTimeout(t);
    }, [form, step, result]);

    const saveNow = useCallback(async () => {
        try { await api.put("/cs1/assessment-draft", { form, step }); setSavedAt(Date.now()); } catch { /* noop */ }
    }, [form, step]);

    const toggle = (field, value) => {
        setForm(f => {
            const cur = f[field] || [];
            return { ...f, [field]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] };
        });
    };
    const setBurnout = (field, value) => setForm(f => ({ ...f, burnout_self_report: { ...f.burnout_self_report, [field]: value } }));

    const canNext = step < totalSteps;
    const canBack = step > 1;

    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post("/cs1/assessments", form);
            setResult(data.assessment);
            await api.delete("/cs1/assessment-draft").catch(() => {});
            setStep(totalSteps + 1);
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not save assessment.");
        } finally { setBusy(false); }
    };

    const scheduleCheckin = async (isoDate) => {
        if (!result?.id) return;
        setCheckinDate(isoDate);
        try {
            await api.post(`/cs1/assessments/${result.id}/checkin`, { next_checkin_date: isoDate });
            setCheckinSet(true);
        } catch { /* noop */ }
    };

    const quickCheckin = (weeks) => {
        const d = new Date();
        d.setDate(d.getDate() + weeks * 7);
        scheduleCheckin(d.toISOString().slice(0, 10));
    };

    const tailored = (() => {
        if (!result) return [];
        const map = Object.fromEntries((services || []).map(s => [s.slug, s]));
        return (result.resources_offered || []).map(slug => map[slug]).filter(Boolean);
    })();

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="cs1-assessment-root">
            <Link to="/app" className="inline-flex items-center gap-1 text-sm text-muted-k hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back
            </Link>

            <header>
                <PageIntro
                    eyebrow="Carer Self-Check"
                    title="Your Space to Check In With Yourself"
                    description="Caring for someone is demanding, and looking after yourself is not optional. This is a private self-check, nothing is shared, no diagnosis, and you can skip any question. You can save and come back whenever you like."
                    whatItDoes="Walks you through your caring role, strengths, constraints and stress signals, then gives you a warm summary, tailored support contacts, and a gentle prompt to check in with yourself again."
                    howToUse={[
                        "Move through the short steps at your own pace.",
                        "Answer honestly, this is only for you, and you can save and finish later.",
                        "At the end, read a private summary written back to you and pick when to check in again.",
                    ]}
                    whatYouGet={[
                        "A warm, plain-English read-back of what you shared.",
                        "Tailored support contacts based on what would help you most.",
                        "A gentle reminder to check in with yourself again.",
                    ]}
                />
                <div className="mt-3 rounded-xl border border-primary-k/10 bg-primary-k/[0.03] p-3 flex items-center justify-between gap-3" data-testid="cs1-handover-link">
                    <p className="text-sm text-primary-k">Planning time away? Build a handover pack for a backup carer.</p>
                    <Link to="/app/carer/handover-pack" className="text-sm font-medium text-primary-k underline whitespace-nowrap">Handover Pack</Link>
                </div>
                {resumed && step <= totalSteps && (
                    <div className="mt-3 rounded-xl border border-sage/30 bg-sage/[0.08] p-3 text-sm text-primary-k" data-testid="cs1-resume-banner">
                        Welcome back. We picked up where you left off.
                    </div>
                )}
                {step <= totalSteps && (
                    <>
                        <div className="mt-4 h-1.5 rounded-full bg-primary-k/10 overflow-hidden" data-testid="cs1-progress">
                            <div className="h-full bg-primary-k transition-all" style={{ width: `${(step / totalSteps) * 100}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-[11px] text-muted-k" data-testid="cs1-progress-label">Step {step} of {totalSteps}</p>
                            <p className="text-[11px] text-muted-k">{savedAt ? "Progress saved" : ""}</p>
                        </div>
                    </>
                )}
            </header>

            <section className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4" data-testid={`cs1-step-${step}`}>
                {step <= totalSteps && (
                    <h2 className="font-heading text-xl text-primary-k">{STEP_TITLES[step - 1]}</h2>
                )}
                {step === 1 && (
                    <>
                        <p className="text-sm text-muted-k">Selecting these helps you notice what you bring. Pick as many as you like.</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {STRENGTHS.map(s => (
                                <Chip key={s.key} active={form.self_reported_strengths.includes(s.key)} onClick={() => toggle("self_reported_strengths", s.key)} testid={`cs1-strength-${s.key}`}>{s.label}</Chip>
                            ))}
                        </div>
                        <label className="block text-xs text-muted-k font-medium mt-3">Anything you want to add? (Optional)</label>
                        <textarea value={form.strengths_notes} onChange={e => setForm({ ...form, strengths_notes: e.target.value })} placeholder="A few words about what you bring…" className="w-full mt-1 text-sm border border-primary-k/20 rounded-lg p-2" data-testid="cs1-strengths-notes" rows={2} />
                    </>
                )}

                {step === 2 && (
                    <>
                        <div className="grid gap-3 mt-1">
                            <label className="text-sm text-primary-k font-medium">
                                Roughly how many hours a week do you spend caring? (Optional)
                                <input type="number" min={0} max={168} value={form.capacity_indicators.hours_per_week_caring || ""} onChange={e => setForm({ ...form, capacity_indicators: { ...form.capacity_indicators, hours_per_week_caring: Number(e.target.value) || null } })} className="mt-1 w-full text-sm border border-primary-k/20 rounded-lg p-2" data-testid="cs1-hours-per-week" />
                            </label>
                            <label className="text-sm text-primary-k flex items-center gap-2">
                                <input type="checkbox" checked={form.opt_in_health_conditions} onChange={e => setForm({ ...form, opt_in_health_conditions: e.target.checked })} data-testid="cs1-optin-health" />
                                I&#39;m willing to share whether I have my own health conditions (optional)
                            </label>
                            {form.opt_in_health_conditions && (
                                <label className="text-sm text-primary-k flex items-center gap-2">
                                    <input type="checkbox" checked={!!form.capacity_indicators.has_own_health_conditions} onChange={e => setForm({ ...form, capacity_indicators: { ...form.capacity_indicators, has_own_health_conditions: e.target.checked } })} data-testid="cs1-has-health-cond" />
                                    Yes, I have my own health conditions to manage
                                </label>
                            )}
                        </div>
                    </>
                )}

                {step === 3 && (
                    <>
                        <p className="text-sm text-muted-k">There is no wrong answer here. Naming what is hard is the first step to easing it.</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {CONSTRAINTS.map(c => (
                                <Chip key={c.key} active={form.constraints_reported.includes(c.key)} onClick={() => toggle("constraints_reported", c.key)} testid={`cs1-constraint-${c.key}`}>{c.label}</Chip>
                            ))}
                        </div>
                        <label className="block text-xs text-muted-k font-medium mt-3">Anything you want to add? (Optional)</label>
                        <textarea value={form.constraints_notes} onChange={e => setForm({ ...form, constraints_notes: e.target.value })} placeholder="In your own words…" className="w-full mt-1 text-sm border border-primary-k/20 rounded-lg p-2" data-testid="cs1-constraints-notes" rows={2} />
                    </>
                )}

                {step === 4 && (
                    <>
                        <p className="text-sm text-muted-k">What support are you leaning on at the moment?</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {CURRENT_SUPPORT.map(c => (
                                <Chip key={c.key} active={form.support_used_currently.includes(c.key)} onClick={() => toggle("support_used_currently", c.key)} testid={`cs1-support-${c.key}`}>{c.label}</Chip>
                            ))}
                        </div>
                    </>
                )}

                {step === 5 && (
                    <>
                        <p className="text-sm text-muted-k">Completely optional, and only for you. It helps us point you to the right support.</p>
                        <label className="text-sm text-primary-k flex items-center gap-2 mt-1">
                            <input type="checkbox" checked={form.opt_in_burnout} onChange={e => setForm({ ...form, opt_in_burnout: e.target.checked })} data-testid="cs1-optin-burnout" />
                            Yes, I&#39;d like to check in about how I&#39;m doing
                        </label>
                        {form.opt_in_burnout && (
                            <div className="mt-3 border-t border-primary-k/10 pt-3">
                                <LevelRow label="How exhausted have you been feeling lately?" value={form.burnout_self_report.fatigue_level} options={FATIGUE_LEVELS} onChange={v => setBurnout("fatigue_level", v)} testid="cs1-burnout-fatigue" />
                                <LevelRow label="How emotionally drained do you feel?" value={form.burnout_self_report.emotional_exhaustion} options={FATIGUE_LEVELS} onChange={v => setBurnout("emotional_exhaustion", v)} testid="cs1-burnout-emotional" />
                                <LevelRow label="How isolated have you felt from other people?" value={form.burnout_self_report.isolation_feelings} options={FATIGUE_LEVELS} onChange={v => setBurnout("isolation_feelings", v)} testid="cs1-burnout-isolation" />
                                <LevelRow label="How is your sleep quality?" value={form.burnout_self_report.sleep_quality} options={SLEEP_LEVELS} onChange={v => setBurnout("sleep_quality", v)} testid="cs1-burnout-sleep" />
                                <LevelRow label="How much time do you have for yourself?" value={form.burnout_self_report.self_care_time} options={SELFCARE_LEVELS} onChange={v => setBurnout("self_care_time", v)} testid="cs1-burnout-selfcare" />
                            </div>
                        )}
                    </>
                )}

                {step === 6 && (
                    <>
                        <p className="text-sm text-muted-k">Pick what would make the biggest difference. We&#39;ll use this to suggest the right contacts.</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {DESIRED.map(d => (
                                <Chip key={d.key} active={form.desired_support.includes(d.key)} onClick={() => toggle("desired_support", d.key)} testid={`cs1-desired-${d.key}`}>{d.label}</Chip>
                            ))}
                        </div>
                    </>
                )}

                {step > totalSteps && result && (
                    <div ref={resultRef} className="space-y-5 scroll-mt-20" data-testid="cs1-results">
                        <div className="flex items-center gap-2 text-emerald-700">
                            <CheckCircle2 className="w-5 h-5" />
                            <p className="text-sm font-medium">All done. Here is what you shared, read back to you.</p>
                        </div>

                        {result.personal_summary && (
                            <div className="rounded-2xl p-5 border border-[#0E4D52]/15" style={{ backgroundColor: "#EEF4F4" }} data-testid="cs1-personal-summary">
                                <p className="text-sm text-primary-k leading-relaxed">{result.personal_summary}</p>
                            </div>
                        )}

                        {result.encouragement && (
                            <div className="rounded-2xl p-5 border border-[#A5512B]/15 flex items-start gap-3" style={{ backgroundColor: "#FBF3EE" }} data-testid="cs1-encouragement">
                                <Heart className="w-5 h-5 text-[#A5512B] flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-primary-k leading-relaxed">{result.encouragement}</p>
                            </div>
                        )}

                        {result.burnout_composite_signal && (
                            <WarmHandoffCard signal={result.burnout_composite_signal} response={result.burnout_response} />
                        )}

                        {tailored.length > 0 && (
                            <div data-testid="cs1-tailored-resources">
                                <p className="text-xs uppercase tracking-wide text-muted-k font-semibold mb-2">Support that fits what you shared</p>
                                <div className="grid sm:grid-cols-2 gap-2">
                                    {tailored.map(s => <ResourceCard key={s.slug} s={s} />)}
                                </div>
                            </div>
                        )}

                        {(result.next_steps || []).length > 0 && (
                            <div data-testid="cs1-next-steps">
                                <p className="text-xs uppercase tracking-wide text-muted-k font-semibold mb-2">Gentle next steps</p>
                                <ul className="space-y-2">
                                    {result.next_steps.map((s, i) => (
                                        <li key={i} className="flex items-start gap-2.5 text-sm text-primary-k">
                                            <Sparkles className="w-4 h-4 text-[#425F47] mt-0.5 flex-shrink-0" /> <span>{s}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Check-in scheduler */}
                        <div className="rounded-2xl border border-primary-k/10 bg-white p-5" data-testid="cs1-checkin">
                            <div className="flex items-center gap-2">
                                <CalendarCheck className="w-5 h-5 text-primary-k" />
                                <p className="text-sm font-medium text-primary-k">When would you like to check in with yourself again?</p>
                            </div>
                            {checkinSet ? (
                                <p className="text-sm text-emerald-700 mt-3" data-testid="cs1-checkin-confirm">
                                    Lovely. We&#39;ll gently nudge you to check in again around {new Date(checkinDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.
                                </p>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        <button onClick={() => quickCheckin(2)} className="text-sm px-3.5 py-2 rounded-full border border-primary-k/20 text-primary-k hover:border-primary-k/40" data-testid="cs1-checkin-2w">In 2 weeks</button>
                                        <button onClick={() => quickCheckin(4)} className="text-sm px-3.5 py-2 rounded-full border border-primary-k/20 text-primary-k hover:border-primary-k/40" data-testid="cs1-checkin-1m">In 1 month</button>
                                        <button onClick={() => quickCheckin(12)} className="text-sm px-3.5 py-2 rounded-full border border-primary-k/20 text-primary-k hover:border-primary-k/40" data-testid="cs1-checkin-3m">In 3 months</button>
                                    </div>
                                    <div className="mt-3">
                                        <label className="block text-xs text-muted-k font-medium">Or pick a date</label>
                                        <div className="flex items-center gap-2 mt-1">
                                            <input type="date" value={checkinDate} onChange={e => setCheckinDate(e.target.value)} className="text-sm border border-primary-k/20 rounded-lg p-2" data-testid="cs1-checkin-date" />
                                            <button onClick={() => checkinDate && scheduleCheckin(checkinDate)} disabled={!checkinDate} className="text-sm px-4 py-2 rounded-full bg-primary-k text-white disabled:opacity-40" data-testid="cs1-checkin-set">Set reminder</button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-muted-k">Anytime</p>
                            <p className="text-sm text-primary-k mt-2">
                                You can browse the full <Link to="/services" className="underline">support services directory</Link> whenever you like.
                                What you shared stays private to you; it&#39;s kept for 12 months and you can extend or delete it anytime.
                            </p>
                        </div>
                    </div>
                )}

                {err && <p className="text-xs text-red-700" data-testid="cs1-error">{err}</p>}
            </section>

            {step <= totalSteps && (
                <div className="flex items-center justify-between">
                    <button onClick={() => setStep(s => s - 1)} disabled={!canBack} className="text-sm inline-flex items-center gap-1 text-muted-k disabled:opacity-30 hover:text-primary-k" data-testid="cs1-back-btn">
                        <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <div className="flex items-center gap-3">
                        <button onClick={saveNow} className="text-sm inline-flex items-center gap-1 text-primary-k hover:underline" data-testid="cs1-save-later">
                            <Save className="w-3.5 h-3.5" /> Save &amp; Finish Later
                        </button>
                        {canNext ? (
                            <button onClick={() => setStep(s => s + 1)} className="text-sm inline-flex items-center gap-1 px-5 py-2.5 rounded-full bg-primary-k text-white hover:bg-[#0A3E42]" data-testid="cs1-next-btn">
                                Next <ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button onClick={submit} disabled={busy} className="text-sm inline-flex items-center gap-1 px-5 py-2.5 rounded-full bg-primary-k text-white disabled:opacity-50 hover:bg-[#0A3E42]" data-testid="cs1-submit-btn">
                                {busy ? "Saving…" : "See My Summary"}
                            </button>
                        )}
                    </div>
                </div>
            )}

            <p className="text-[11px] text-muted-k">
                If you or anyone in your household is in immediate danger, call 000. Lifeline crisis support: 13 11 14. Elder Abuse Helpline: 1800 353 374.
            </p>
        </div>
    );
}
