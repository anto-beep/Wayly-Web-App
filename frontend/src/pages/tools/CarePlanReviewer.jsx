import React, { useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import { Loader2, Sparkles, Check, X } from "lucide-react";

export default function CarePlanReviewer() {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const submit = async () => {
        setLoading(true);
        setResult(null);
        try {
            const { data } = await api.post("/public/care-plan-review", { text });
            setResult(data);
        } finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI tools</Link>
                <span className="overline mt-6 block">Free tool · 5 uses per hour</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Care Plan Reviewer</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">Paste the care plan text. We'll check it against the Statement of Rights (Aged Care Act 2024) and the National Quality Standards — and flag the gaps.</p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-20">
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="care-plan-form">
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder="Paste the full text of the care plan here…" data-testid="cp-text" className="w-full rounded-md border border-kindred bg-surface-2 p-3 text-sm focus:outline-none focus:ring-2 ring-primary-k" />
                    <button onClick={submit} disabled={loading || text.length < 50} data-testid="cp-submit" className="mt-4 w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Reviewing…" : "Review my care plan"}
                    </button>
                </div>

                {result && (
                    <div className="mt-6 space-y-5 animate-fade-up" data-testid="cp-result">
                        {result.summary && <div className="bg-surface-2 rounded-xl p-5 border border-kindred"><div className="overline">Summary</div><p className="mt-2 text-primary-k leading-relaxed">{result.summary}</p></div>}

                        {result.coverage?.length > 0 && (
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Coverage check</div>
                                <ul className="mt-3 space-y-2">
                                    {result.coverage.map((c, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm border-b border-kindred pb-2 last:border-0">
                                            {c.present ? <Check className="h-4 w-4 text-sage mt-0.5" /> : <X className="h-4 w-4 text-terracotta mt-0.5" />}
                                            <div className="flex-1"><span className="text-primary-k font-medium">{c.item}</span>{c.note && <div className="text-xs text-muted-k mt-0.5">{c.note}</div>}</div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {result.gaps?.length > 0 && (
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Gaps to raise</div>
                                <ul className="mt-3 space-y-1.5 text-sm text-primary-k list-disc list-inside">{result.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                            </div>
                        )}

                        {result.questions_to_raise?.length > 0 && (
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Questions for the next review</div>
                                <ul className="mt-3 space-y-1.5 text-sm text-primary-k list-disc list-inside">{result.questions_to_raise.map((q, i) => <li key={i}>{q}</li>)}</ul>
                            </div>
                        )}

                        <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                            <div className="font-medium text-primary-k">Want Kindred to watch divergence between this plan and what's actually delivered?</div>
                            <Link to="/signup" className="mt-3 inline-block text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a]">Start free trial</Link>
                        </div>
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}
