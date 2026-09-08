import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AboutBackLink from "@/components/AboutBackLink";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import ReportIssueButton from "@/components/ReportIssueButton";
import ToolExplainer from "@/components/ToolExplainer";
import ToolHero from "@/components/ToolHero";
import ToolGate from "@/components/ToolGate";
import { ScreenshotFamilyThread } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import { api, extractErrorMessage } from "@/lib/api";
import { Send, Loader2, Sparkles, MessageCircle } from "lucide-react";
import { AutomatedDecisionDisclosure, isEnabled } from "@/uxf";

import SeoHead, { softwareApplicationLd, howToLd, faqLd, breadcrumbLd } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

const _toolJsonLd = (cfg) => {
    const blocks = [softwareApplicationLd({
        name: cfg.toolName,
        description: cfg.toolDesc,
        url: `https://wayly.com.au${cfg.path}`,
    })];
    if (cfg.howTo) blocks.push(howToLd(cfg.howTo));
    if (cfg.faqs) blocks.push(faqLd(cfg.faqs));
    blocks.push(breadcrumbLd([
        { name: "Home", url: "/" },
        { name: "AI Tools", url: "/ai-tools" },
        { name: cfg.toolName, url: cfg.path },
    ]));
    return blocks;
};

const SUGGESTIONS = [
    "What is Support at Home and how is it different from Home Care Packages?",
    "What's the lifetime contribution cap and who does it apply to?",
    "How do the three service streams work?",
    "Can I switch providers under Support at Home?",
];

export default function FamilyCoordinator() {
    const access = useToolAccess();
    const [msgs, setMsgs] = useState([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const ref = useRef(null);

    useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

    const send = async (text) => {
        const m = (text ?? input).trim();
        if (!m) return;
        setInput("");
        setBusy(true);
        setMsgs((x) => [...x, { id: `u-${Date.now()}`, role: "user", content: m }]);
        try {
            const { data } = await api.post("/public/aged-care-chat", { message: m, session_id: sessionId });
            setSessionId(data.session_id);
            setMsgs((x) => [...x, { id: `a-${Date.now()}`, role: "assistant", content: data.reply }]);
        } catch (err) {
            setMsgs((x) => [...x, { id: `e-${Date.now()}`, role: "assistant", content: extractErrorMessage(err, "Sorry, couldn't reach the assistant.") }]);
        } finally { setBusy(false); }
    };

    if (access === "loading") return (<div className="min-h-screen bg-kindred"><SeoHead {...SEO.toolFamilyCoordinator} jsonLd={_toolJsonLd(SEO.toolFamilyCoordinator)} />
            <MarketingHeader /><div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div><ToolRelatedLinks slug="family-coordinator" />
            <Footer /></div>);
    if (access === "blocked") return (<div className="min-h-screen bg-kindred"><SeoHead {...SEO.toolFamilyCoordinator} jsonLd={_toolJsonLd(SEO.toolFamilyCoordinator)} />
    <MarketingHeader /><ToolHero toolKey="family-coordinator" /><ToolGate toolName="Aged Care Q&A"><ScreenshotFamilyThread /></ToolGate><section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="family-coordinator" /></section><ToolRelatedLinks slug="family-coordinator" />
            <Footer /></div>);

    return (
        <div className="min-h-screen bg-kindred flex flex-col">
            <SeoHead {...SEO.toolFamilyCoordinator} jsonLd={_toolJsonLd(SEO.toolFamilyCoordinator)} />
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6 w-full">
                <div className="flex items-center gap-4 flex-wrap">
                    <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI Tools</Link>
                    <AboutBackLink />
                </div>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Aged Care Q&amp;A</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">Plain-English answers about the Support at Home program, grounded in the Aged Care Act 2024.</p>
                <p className="mt-2 text-xs text-muted-k">This is a general Q&amp;A assistant, it can't see your account or statements. Signed-in members can ask the in-app assistant questions about their own household.</p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-12 w-full flex-1 flex flex-col" data-testid="aged-care-qa">
                <div ref={ref} className="flex-1 min-h-[400px] overflow-y-auto bg-surface border border-kindred rounded-2xl p-5 space-y-4">
                    {msgs.length === 0 && !busy && (
                        <div className="h-full flex flex-col items-center justify-center text-center text-muted-k px-4 py-10">
                            <MessageCircle className="h-8 w-8 text-sage" />
                            <p className="mt-4 max-w-md">Ask anything about Support at Home, classifications, contributions, or the new Aged Care Act 2024.</p>
                            <div className="mt-6 grid sm:grid-cols-2 gap-2 w-full max-w-xl">
                                {SUGGESTIONS.map((s) => (
                                    <button key={s} onClick={() => send(s)} data-testid={`fc-suggest-${s.slice(0, 12)}`} className="text-left text-sm text-primary-k border border-kindred rounded-lg px-3 py-2.5 hover:bg-surface-2 transition-colors">{s}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {msgs.map((m) => (
                        <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`fc-msg-${m.role}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-primary-k text-white rounded-br-sm" : "bg-surface-2 text-primary-k rounded-bl-sm"}`}>{m.content}</div>
                        </div>
                    ))}
                    {busy && <div className="flex items-center gap-2 text-muted-k text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
                    {msgs.length > 0 && !busy && msgs[msgs.length - 1].role === "assistant" && (
                        <ReportIssueButton variant="inline" toolName="Aged Care Q&A" toolOutput={{ messages: msgs }} />
                    )}
                </div>

                {msgs.length > 0 && isEnabled("uxf_v3.disclosure") && (
                    <div className="mt-3">
                        <AutomatedDecisionDisclosure
                            body="These answers are generated automatically from your question and the Aged Care Act 2024. They are general information, not legal or financial advice for your specific situation. You can contact any Wayly team member for clarification."
                            contactUrl="/contact"
                            testId="fc-automated-decision"
                        />
                    </div>
                )}

                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-4 flex items-center gap-2">
                    <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" data-testid="fc-input" className="flex-1 rounded-full border border-kindred bg-surface px-5 py-3 focus:outline-none focus:ring-2 ring-primary-k" />
                    <button type="submit" disabled={busy || !input.trim()} data-testid="fc-send" className="bg-primary-k text-white rounded-full p-3 hover:bg-[#091D33] disabled:opacity-60"><Send className="h-4 w-4" /></button>
                </form>

                {msgs.length >= 6 && access !== "allowed" && (
                    <div className="mt-4 bg-surface-2 rounded-xl p-4 border border-kindred text-sm text-primary-k">
                        Want Wayly to do this for your specific household, with your statements, budget, and care plan in context? <Link to="/signup" className="underline font-medium">Start free trial</Link>
                    </div>
                )}
            </section>
            <section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="family-coordinator" /></section>
            <ToolRelatedLinks slug="family-coordinator" />
            <Footer />
        </div>
    );
}
