import React, { useState } from "react";
import { Link } from "react-router-dom";
import PageIntro from "@/components/PageIntro";
import { api, formatAUD } from "@/lib/api";
import {
    Loader2, Activity, HeartHandshake, ShieldCheck, CheckCircle2, CalendarDays,
    HelpCircle, ArrowRight, RotateCcw, Sparkles, UserRound,
} from "lucide-react";

/* =========================================================================
   Short-Term Pathways (STP-1) — Guided Journeys
   Interactive checker for the Restorative Care + End-of-Life pathways.
   Light-first visual system: soft tinted surfaces, readable dark text,
   colour used only as accents. Backend: POST /public/short-term-pathways/check
   ========================================================================= */

const SITUATIONS = [
    { v: "recovering", label: "Recovering after a hospital stay, fall or illness", desc: "Focused therapy to help regain independence", Icon: Activity },
    { v: "end_of_life", label: "Approaching the end of life, wanting to stay at home", desc: "Extra support for comfort in the final months", Icon: HeartHandshake },
    { v: "exploring", label: "Just exploring what is available", desc: "See both short-term pathways side by side", Icon: Sparkles },
];

// Accent colour used sparingly on a light surface.
const ACCENT = {
    restorative_care: { color: "#0E4D52", soft: "#E9F2F2", Icon: Activity },   // teal / teal-50
    end_of_life: { color: "#A5512B", soft: "#FBEEE7", Icon: HeartHandshake },   // clay / clay-50
};
const SAGE = { color: "#425F47", soft: "#EEF3EE" };

const CONFIDENCE = {
    likely: "Looks like a strong fit",
    possible: "May apply",
    explore: "Worth exploring",
};

export default function ShortTermPathways() {
    const [situation, setSituation] = useState("recovering");
    const [recentEvent, setRecentEvent] = useState(null);
    const [prognosisShort, setPrognosisShort] = useState(null);
    const [stayHome, setStayHome] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const run = async () => {
        setLoading(true); setError(null); setResult(null);
        try {
            const { data } = await api.post("/public/short-term-pathways/check", {
                situation,
                recent_event: situation === "recovering" ? recentEvent : null,
                prognosis_short: situation === "end_of_life" ? prognosisShort : null,
                stay_at_home: situation === "end_of_life" ? stayHome : null,
            });
            setResult(data);
            requestAnimationFrame(() => {
                document.getElementById("stp-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        } catch (e) {
            setError("Could not check the pathways just now. Please try again in a moment.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="stp-page">
            <PageIntro
                eyebrow="Guided Journeys"
                title="Short-Term Pathways"
                description="Support at Home has two short-term pathways that sit alongside your ongoing quarterly budget, so they do not come out of it. Answer a couple of questions to see which one fits and how it works."
                whatItDoes="Points you to the Restorative Care or End-of-Life pathway based on your situation, with the budget, timing and rules laid out plainly."
                howToUse={[
                    "Tell us the situation you are in.",
                    "Answer one or two quick follow-up questions.",
                    "Read the tailored result and the questions to ask your provider.",
                ]}
                whatYouGet={[
                    "The funding, duration and rules for the right pathway",
                    "A ready-made list of questions for your provider",
                ]}
            />

            {/* Form */}
            <div className="bg-surface border border-kindred rounded-2xl p-5 sm:p-6 space-y-6" data-testid="stp-form">
                <div>
                    <div className="text-xs uppercase tracking-wider text-muted-k mb-2">What is the situation?</div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {SITUATIONS.map((s) => {
                            const active = situation === s.v;
                            const Icon = s.Icon;
                            return (
                                <button
                                    key={s.v}
                                    type="button"
                                    onClick={() => { setSituation(s.v); setResult(null); }}
                                    data-testid={`stp-situation-${s.v}`}
                                    aria-pressed={active}
                                    className={`text-left rounded-2xl border p-4 transition-colors ${active ? "border-primary-k bg-[#E9F2F2] shadow-sm" : "border-kindred hover:border-primary-k/40 hover:bg-surface-2"}`}
                                >
                                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl mb-2 ${active ? "bg-primary-k text-white" : "bg-[#E9F2F2] text-primary-k"}`}>
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <span className="block text-sm font-medium text-primary-k">{s.label}</span>
                                    <span className="block text-xs text-muted-k mt-1 leading-relaxed">{s.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {situation === "recovering" && (
                    <YesNoRow label="Has there been a recent hospital stay, fall, fracture or stroke?" value={recentEvent} onChange={setRecentEvent} testId="stp-q-recent" />
                )}
                {situation === "end_of_life" && (
                    <div className="space-y-4">
                        <YesNoRow label="Is there a prognosis of around three months or less?" value={prognosisShort} onChange={setPrognosisShort} testId="stp-q-prognosis" />
                        <YesNoRow label="Is the wish to remain at home rather than move to hospital or a facility?" value={stayHome} onChange={setStayHome} testId="stp-q-stayhome" />
                    </div>
                )}

                <button
                    onClick={run}
                    disabled={loading}
                    data-testid="stp-submit"
                    className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#0A3E42] disabled:opacity-60 inline-flex items-center justify-center gap-2 font-medium transition-colors"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    See what applies
                </button>
                {error && <div data-testid="stp-error" className="text-sm text-terracotta">{error}</div>}
            </div>

            {/* Result */}
            {result && (
                <div id="stp-result" className="space-y-5 scroll-mt-24" data-testid="stp-result">
                    <ResultHeadline result={result} />
                    {result.results?.map((p) => <PathwayCard key={p.id} p={p} />)}

                    <div className="rounded-2xl bg-surface border border-kindred p-5 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="stp-next-step">
                        <div className="flex-1">
                            <div className="font-medium text-primary-k">Ready to ask your provider?</div>
                            <p className="text-sm text-muted-k mt-1">Wayly can draft a letter to your provider or My Aged Care requesting one of these pathways.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setResult(null)} className="inline-flex items-center gap-1.5 text-sm text-primary-k hover:text-[#0A3E42]" data-testid="stp-reset">
                                <RotateCcw className="h-3.5 w-3.5" /> Start again
                            </button>
                            <Link to="/ai-tools/letters-and-follow-ups" className="inline-flex items-center gap-1.5 text-sm bg-primary-k text-white rounded-lg px-5 py-2.5 hover:bg-[#0A3E42] transition-colors" data-testid="stp-draft-letter">
                                Draft a request letter <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>

                    <p className="text-xs text-muted-k leading-relaxed max-w-3xl" data-testid="stp-disclaimer">{result.disclaimer}</p>
                </div>
            )}
        </div>
    );
}


function ResultHeadline({ result }) {
    const first = result.results?.[0];
    const accent = ACCENT[first?.id] || ACCENT.restorative_care;
    return (
        <div
            className="rounded-2xl border p-5 sm:p-6 flex items-start gap-4"
            style={{ backgroundColor: accent.soft, borderColor: `${accent.color}33` }}
            data-testid="stp-result-headline"
        >
            <span className="hidden sm:inline-flex h-11 w-11 rounded-xl items-center justify-center flex-shrink-0" style={{ backgroundColor: accent.color }}>
                <Sparkles className="h-5 w-5 text-white" />
            </span>
            <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent.color }}>Your result</div>
                <h2 className="mt-1.5 font-heading text-xl sm:text-2xl leading-tight text-primary-k">{result.headline}</h2>
            </div>
        </div>
    );
}


function YesNoRow({ label, value, onChange, testId }) {
    return (
        <div data-testid={testId}>
            <div className="text-sm font-medium text-primary-k">{label}</div>
            <div className="mt-2 flex gap-2">
                {[["yes", true], ["no", false]].map(([k, v]) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => onChange(v)}
                        data-testid={`${testId}-${k}`}
                        className={`px-6 py-2 rounded-full text-sm border transition-colors ${value === v ? "bg-primary-k text-white border-primary-k" : "border-kindred text-primary-k hover:border-primary-k"}`}
                    >
                        {k === "yes" ? "Yes" : "No"}
                    </button>
                ))}
            </div>
        </div>
    );
}


function PathwayCard({ p }) {
    const accent = ACCENT[p.id] || ACCENT.restorative_care;
    const Icon = accent.Icon;
    const facts = p.key_facts || [];
    const factCols = facts.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3";
    return (
        <div className="rounded-2xl border border-kindred bg-surface overflow-hidden shadow-sm" data-testid={`stp-card-${p.id}`}>
            {/* Accent strip */}
            <div className="h-1.5 w-full" style={{ backgroundColor: accent.color }} />

            <div className="p-5 sm:p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <span className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: accent.soft }}>
                            <Icon className="h-6 w-6" style={{ color: accent.color }} />
                        </span>
                        <div>
                            <h3 className="font-heading text-xl sm:text-2xl leading-tight text-primary-k">{p.title}</h3>
                            <div className="text-sm text-muted-k mt-0.5">{p.tagline}</div>
                        </div>
                    </div>
                    {p.confidence && (
                        <span
                            className="text-[11px] font-semibold rounded-full px-3 py-1 whitespace-nowrap"
                            style={{ backgroundColor: accent.soft, color: accent.color }}
                            data-testid={`stp-confidence-${p.id}`}
                        >
                            {CONFIDENCE[p.confidence] || "Worth exploring"}
                        </span>
                    )}
                </div>

                {/* Eligibility note */}
                {p.eligibility_note && (
                    <div
                        className="rounded-xl border-l-4 pl-4 pr-4 py-3 text-sm text-primary-k leading-relaxed"
                        style={{ backgroundColor: accent.soft, borderColor: accent.color }}
                        data-testid={`stp-note-${p.id}`}
                    >
                        {p.eligibility_note}
                    </div>
                )}

                {/* Key facts */}
                <div className={`grid ${factCols} gap-3`} data-testid={`stp-keyfacts-${p.id}`}>
                    {facts.map((k, i) => (
                        <div key={i} className="rounded-xl border border-kindred bg-surface-2 p-3">
                            <div className="text-[10px] uppercase tracking-wider font-semibold leading-tight" style={{ color: accent.color }}>{k.label}</div>
                            <div className="mt-1 font-heading text-lg text-primary-k tabular-nums leading-tight">
                                {k.value_aud != null ? formatAUD(k.value_aud) : k.value_text}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Funded separately */}
                {p.separate_from_quarterly_budget && (
                    <div
                        className="inline-flex items-center gap-2 text-xs font-medium rounded-full px-3 py-1.5"
                        style={{ backgroundColor: SAGE.soft, color: SAGE.color }}
                        data-testid={`stp-separate-${p.id}`}
                    >
                        <ShieldCheck className="h-3.5 w-3.5" /> Funded separately, so it does not reduce your quarterly budget
                    </div>
                )}

                {/* Who it is for — compact lead */}
                <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-4">
                    <UserRound className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: accent.color }} />
                    <p className="text-sm text-primary-k leading-relaxed">
                        <span className="font-semibold">Who it is for. </span>{p.who_its_for}
                    </p>
                </div>

                {/* Covers + Signs */}
                <div className="grid md:grid-cols-2 gap-x-6 gap-y-5">
                    <FactList title="What it covers" items={p.covers} Icon={CheckCircle2} color={SAGE.color} />
                    <FactList title="Signs it may apply" items={p.eligibility_signals} Icon={CalendarDays} color={accent.color} />
                </div>

                {/* Questions */}
                <div className="rounded-2xl p-4 sm:p-5" style={{ backgroundColor: accent.soft }} data-testid={`stp-questions-${p.id}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <HelpCircle className="h-4 w-4" style={{ color: accent.color }} />
                        <span className="font-semibold text-primary-k">Questions to ask your provider</span>
                    </div>
                    <ul className="space-y-2.5">
                        {(p.provider_questions || []).map((q, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <span className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0" style={{ backgroundColor: accent.color }}>{i + 1}</span>
                                <span className="text-sm text-primary-k leading-relaxed">{q}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="text-xs text-muted-k">{p.section_ref}</div>
            </div>
        </div>
    );
}


function FactList({ title, items, Icon, color }) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wider text-muted-k font-semibold mb-2">{title}</div>
            <ul className="space-y-2">
                {(items || []).map((c, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-primary-k leading-relaxed">
                        <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color }} />
                        <span>{c}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
