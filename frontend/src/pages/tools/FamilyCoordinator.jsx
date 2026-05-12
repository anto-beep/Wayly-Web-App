import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolGate from "@/components/ToolGate";
import { ScreenshotFamilyThread } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import { api, extractErrorMessage } from "@/lib/api";
import { Send, Loader2, Sparkles, MessageCircle } from "lucide-react";

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
            const { data } = await api.post("/public/family-coordinator-chat", { message: m, session_id: sessionId });
            setSessionId(data.session_id);
            setMsgs((x) => [...x, { id: `a-${Date.now()}`, role: "assistant", content: data.reply }]);
        } catch (err) {
            setMsgs((x) => [...x, { id: `e-${Date.now()}`, role: "assistant", content: extractErrorMessage(err, "Sorry — couldn't reach the assistant.") }]);
        } finally { setBusy(false); }
    };

    if (access === "loading") return (<div className="min-h-screen bg-kindred"><SeoHead {...SEO.toolFamilyCoordinator} jsonLd={_toolJsonLd(SEO.toolFamilyCoordinator)} />
            <MarketingHeader /><div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div><Footer /></div>);
    if (access === "blocked") return (<div className="min-h-screen bg-kindred"><MarketingHeader /><section className="mx-auto max-w-4xl px-6 pt-8"><AIAccuracyBanner text={TOOL_DISCLAIMERS["family-coordinator"]} /></section><ToolGate toolName="Family Care Coordinator"><ScreenshotFamilyThread /></ToolGate><Footer /></div>);

    return (
        <div className="min-h-screen bg-kindred flex flex-col">
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6 w-full">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI tools</Link>
                <span className="overline mt-6 block">Free tool · 5 uses per hour</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Family Care Coordinator</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">Ask anything about Australia's aged-care system. Answers grounded in the Aged Care Act 2024, the Support at Home program manual, and the National Quality Standards.</p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-12 w-full flex-1 flex flex-col" data-testid="family-coordinator">
                <AIAccuracyBanner text={TOOL_DISCLAIMERS["family-coordinator"]} className="mb-4" />
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
                </div>

                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-4 flex items-center gap-2">
                    <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" data-testid="fc-input" className="flex-1 rounded-full border border-kindred bg-surface px-5 py-3 focus:outline-none focus:ring-2 ring-primary-k" />
                    <button type="submit" disabled={busy || !input.trim()} data-testid="fc-send" className="bg-primary-k text-white rounded-full p-3 hover:bg-[#16294a] disabled:opacity-60"><Send className="h-4 w-4" /></button>
                </form>

                {msgs.length >= 6 && (
                    <div className="mt-4 bg-surface-2 rounded-xl p-4 border border-kindred text-sm text-primary-k">
                        Want Wayly to do this for your specific household — with your statements, budget, and care plan in context? <Link to="/signup" className="underline font-medium">Start free trial</Link>
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}
