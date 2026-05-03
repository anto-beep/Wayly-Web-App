import React, { useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import UpgradeGate from "@/components/UpgradeGate";
import { useAuth } from "@/context/AuthContext";
import { api, formatAUD } from "@/lib/api";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";

const QUESTIONS = [
    "How easily does your parent shower or bathe themselves?",
    "How easily do they dress and groom themselves?",
    "How easily do they get out of bed and move around the house?",
    "How easily do they prepare a simple meal?",
    "How easily do they manage household cleaning and laundry?",
    "How easily do they manage their own medication?",
    "How easily do they manage shopping and errands?",
    "How easily do they manage transport and appointments?",
    "How is their memory and ability to follow conversations?",
    "How is their mood and emotional wellbeing?",
    "How often have they had falls or accidents in the last 6 months?",
    "How much informal support (family, neighbours) do they currently receive?",
];

const SCALE = [
    { v: 0, label: "No difficulty" },
    { v: 1, label: "Slight" },
    { v: 2, label: "Moderate" },
    { v: 3, label: "Significant" },
    { v: 4, label: "Cannot do alone" },
];

export default function ClassificationCheck() {
    const { user } = useAuth();
    const [answers, setAnswers] = useState(Array(12).fill(null));
    const [current, setCurrent] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const allDone = answers.every((a) => a !== null);

    const submit = async () => {
        setLoading(true);
        try {
            const { data } = await api.post("/public/classification-check", {
                answers,
                current_classification: current ? parseInt(current) : null,
            });
            setResult(data);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI tools</Link>
                <span className="overline mt-6 block">Solo plan · 14‑day free trial</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Classification Self-Check</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">
                    Answer 12 questions about daily life. We'll show you the classification range your parent is likely to fall in — and whether to consider a reassessment.
                </p>
                <p className="mt-3 text-sm text-muted-k italic">This is informational only. Only the My Aged Care Independent Assessment Tool determines actual classification.</p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-20">
                {!user && <UpgradeGate toolName="The Classification Self-Check" />}
                <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-6" data-testid="classification-quiz">
                    {QUESTIONS.map((q, i) => (
                        <div key={i}>
                            <div className="text-sm text-primary-k font-medium">{i + 1}. {q}</div>
                            <div className="mt-2 grid grid-cols-5 gap-2">
                                {SCALE.map((s) => (
                                    <button
                                        key={s.v}
                                        type="button"
                                        onClick={() => setAnswers((a) => { const c = [...a]; c[i] = s.v; return c; })}
                                        data-testid={`q-${i}-${s.v}`}
                                        className={`text-xs rounded-md border py-2 px-1 transition-colors ${answers[i] === s.v ? "border-primary-k bg-primary-k text-white" : "border-kindred text-muted-k hover:bg-surface-2"}`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}

                    <label className="block">
                        <span className="text-sm text-muted-k">Current classification (optional, for comparison)</span>
                        <select
                            value={current}
                            onChange={(e) => setCurrent(e.target.value)}
                            data-testid="cc-current"
                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                        >
                            <option value="">Skip</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Classification {n}</option>)}
                        </select>
                    </label>

                    <button
                        onClick={submit}
                        disabled={!allDone || loading}
                        data-testid="cc-submit"
                        className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Calculating…" : allDone ? "See likely classification" : `Answer all 12 questions (${answers.filter((a) => a !== null).length}/12)`}
                    </button>
                </div>

                {result && (
                    <div className="mt-6 space-y-5 animate-fade-up" data-testid="cc-result">
                        <div className="bg-surface border border-kindred rounded-xl p-6 text-center">
                            <div className="overline">Likely classification</div>
                            <div className="mt-3 font-heading text-5xl text-primary-k">{result.likely_label}</div>
                            <p className="mt-3 text-muted-k tabular-nums">{formatAUD(result.annual_range[0])}–{formatAUD(result.annual_range[1])} per year</p>
                        </div>
                        {result.suggest_reassessment && (
                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                                <div className="font-medium text-primary-k">Worth considering a reassessment</div>
                                <p className="text-sm text-muted-k mt-1">Your answers suggest a meaningful gap from the current classification ({result.current_classification}). Many families request a reassessment when needs change.</p>
                                <Link to="/ai-tools/reassessment-letter" className="mt-3 inline-flex items-center gap-1 text-sm text-primary-k font-medium">
                                    Draft a reassessment letter <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        )}
                        <p className="text-xs text-muted-k italic">{result.caveat}</p>
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}
