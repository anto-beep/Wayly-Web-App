import React, { useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import EmailResultButton from "@/components/EmailResultButton";

export default function ReassessmentLetter() {
    const [form, setForm] = useState({
        participant_name: "",
        current_classification: 4,
        changes_summary: "",
        recent_events: "",
        sender_name: "",
        relationship: "family caregiver",
    });
    const [loading, setLoading] = useState(false);
    const [letter, setLetter] = useState(null);
    const [copied, setCopied] = useState(false);
    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async () => {
        setLoading(true);
        setLetter(null);
        try {
            const { data } = await api.post("/public/reassessment-letter", form);
            setLetter(data.letter);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not draft letter.");
        } finally {
            setLoading(false);
        }
    };

    const copy = async () => {
        await navigator.clipboard.writeText(letter);
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI tools</Link>
                <span className="overline mt-6 block">Free tool · 5 uses per hour</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Reassessment Letter Drafter</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">Tell us what's changed since the last assessment. We'll draft a clear, polite reassessment request you can send to My Aged Care.</p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-20">
                <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-5" data-testid="reassessment-form">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <label className="block"><span className="text-sm text-muted-k">Participant name</span>
                            <input value={form.participant_name} onChange={update("participant_name")} required data-testid="rl-participant" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                        </label>
                        <label className="block"><span className="text-sm text-muted-k">Current classification</span>
                            <select value={form.current_classification} onChange={(e) => setForm((f) => ({ ...f, current_classification: parseInt(e.target.value) }))} data-testid="rl-class" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k">
                                {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>Classification {n}</option>)}
                            </select>
                        </label>
                    </div>
                    <label className="block"><span className="text-sm text-muted-k">What's changed since the last assessment?</span>
                        <textarea value={form.changes_summary} onChange={update("changes_summary")} rows={4} required placeholder="e.g. Their mobility has dropped significantly since the recent hospital admission; they now need help with showering and meal prep daily." data-testid="rl-changes" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                    </label>
                    <label className="block"><span className="text-sm text-muted-k">Recent events (optional)</span>
                        <textarea value={form.recent_events} onChange={update("recent_events")} rows={2} placeholder="e.g. Hospital admission 14 March, fall on 2 April, new dementia diagnosis." data-testid="rl-events" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                    </label>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <label className="block"><span className="text-sm text-muted-k">Your name (the sender)</span>
                            <input value={form.sender_name} onChange={update("sender_name")} required data-testid="rl-sender" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                        </label>
                        <label className="block"><span className="text-sm text-muted-k">Your relationship</span>
                            <input value={form.relationship} onChange={update("relationship")} data-testid="rl-rel" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                        </label>
                    </div>
                    <button onClick={submit} disabled={loading || !form.participant_name || !form.changes_summary || !form.sender_name} data-testid="rl-submit" className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Drafting…" : "Draft my letter"}
                    </button>
                </div>

                {letter && (
                    <div className="mt-6 space-y-3 animate-fade-up" data-testid="rl-result">
                        <div className="flex items-center justify-between">
                            <div className="overline">Your draft letter</div>
                            <button onClick={copy} className="text-sm text-primary-k inline-flex items-center gap-1.5 underline">
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
                            </button>
                        </div>
                        <div className="bg-surface border border-kindred rounded-xl p-6 whitespace-pre-wrap text-sm text-primary-k leading-relaxed font-mono">{letter}</div>
                        <p className="text-xs text-muted-k italic">Always review before sending. Remove anything that doesn't sound like you, add anything missing.</p>
                        <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                            <div className="font-medium text-primary-k">Want Kindred to track the response?</div>
                            <p className="text-sm text-muted-k mt-1">Paid plans watch for the My Aged Care reply, log it to your audit trail, and walk you through the next steps.</p>
                            <div className="mt-3 flex items-center gap-3 flex-wrap">
                                <Link to="/signup" className="inline-block text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a]">Start free trial</Link>
                                <EmailResultButton
                                    tool="Reassessment Letter"
                                    headline={`Reassessment letter for ${form.participant_name || "[Participant]"}`}
                                    bodyHtml={`<p style="margin:0 0 12px;color:#555;font-size:13px">Draft reassessment letter to My Aged Care:</p><pre style="white-space:pre-wrap;font-family:Georgia,serif;color:#1F3A5F;background:#FAF7F2;padding:16px;border-radius:8px;border:1px solid #e5dfd2">${(letter || "").replace(/</g, "&lt;")}</pre>`}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}
