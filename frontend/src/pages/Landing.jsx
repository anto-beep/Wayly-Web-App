import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, FileSearch, MessageCircle, Users2, Wallet, AlertTriangle, Calendar, Mic, Check } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import StatementDecoderEmbed from "@/components/StatementDecoderEmbed";
import { BrowserFrame, ScreenshotStatement, ScreenshotDashboard, ScreenshotFamilyThread, ScreenshotAnomaly } from "@/components/Screenshots";
import RevealOnScroll from "@/components/RevealOnScroll";

const PERSONAS = [
    {
        id: "caregiver",
        title: "I'm helping a parent",
        sub: "Most popular",
        cta: "Start free trial",
        href: "/signup",
        primary: true,
    },
    {
        id: "participant",
        title: "I'm on Support at Home",
        sub: "I receive care",
        cta: "Start free trial",
        href: "/signup",
    },
    {
        id: "advisor",
        title: "I'm a financial advisor",
        sub: "For practices",
        cta: "Book a demo",
        href: "/contact?intent=demo",
    },
];

const FEATURES = [
    { icon: FileSearch, title: "Statement parsing", body: "Every line item, every month, decoded into plain English." },
    { icon: Wallet, title: "Quarterly budget", body: "Across the three streams — Clinical, Independence, Everyday Living." },
    { icon: AlertTriangle, title: "Anomaly alerts", body: "Rate spikes, duplicates, missing entitlements — caught early." },
    { icon: Calendar, title: "Care calendar", body: "Every appointment from every provider in one weekly view." },
    { icon: Users2, title: "Family thread", body: "Siblings on the same page. No more group SMS chains." },
    { icon: ShieldCheck, title: "Audit trail", body: "Every action logged, ready if you ever need to escalate." },
    { icon: Mic, title: "Voice for participants", body: "A calm, large-text view your parent can use without help." },
    { icon: MessageCircle, title: "Ask anything", body: "Chat that knows your statements, budget, and lifetime cap." },
];

const FAQ = [
    { q: "Are you a Support at Home provider?", a: "No. We're independent software. Your registered provider stays whoever you've chosen — Wayly sits on top of them." },
    { q: "Do I need to switch providers to use Wayly?", a: "No. Wayly works with any registered Support at Home provider." },
    { q: "How much does it cost?", a: "Free tier with all 8 AI tools (5 uses per month each). Paid plans start at $19/month. 50% off for full-pension households." },
    { q: "Does my parent need to use it?", a: "Not at all. Most households are run by an adult-child caregiver. Your parent has their own simplified view but doesn't need to log in if they don't want to." },
    { q: "What about privacy?", a: "Australian-hosted, encrypted with per-household keys, never sold, never used to train AI without consent. Read more on our Trust page." },
    { q: "Will Wayly ever recommend a provider?", a: "We show provider prices and quality signals neutrally. We never accept commissions from providers, ever." },
    { q: "Can multiple family members share one account?", a: "Yes — that's the Family plan. Up to 5 family members, each with their own role-based view." },
    { q: "Does Wayly give clinical or financial advice?", a: "No. We help you understand the system. Clinical advice comes from your care team; financial advice from a licensed advisor." },
    { q: "What if my parent moves to residential care?", a: "We pause billing immediately and provide a transition guide." },
    { q: "Can I try it with sample data first?", a: "Yes — the /demo page walks you through a sample household with no signup. Or paste a statement into the decoder above right now." },
];

function useCountdown(target) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    const diff = Math.max(0, target.getTime() - now.getTime());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return { days, hours, minutes, expired: diff <= 0 };
}

export default function Landing() {
    const countdown = useCountdown(new Date("2026-07-01T00:00:00+10:00"));
    const [selectedPersona, setSelectedPersona] = useState("caregiver");

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />

            {/* HERO */}
            <section className="mx-auto max-w-7xl px-6 pt-12 pb-20">
                <div className="grid lg:grid-cols-12 gap-10 items-start">
                    <div className="lg:col-span-7 animate-fade-up">
                        <span className="overline">For Australian families · Support at Home</span>
                        <h1 className="font-heading text-5xl sm:text-6xl lg:text-7xl text-primary-k mt-4 leading-[1.05] tracking-tight">
                            Support at Home,<br />finally explained.
                        </h1>
                        <p className="mt-6 text-lg text-muted-k max-w-xl leading-relaxed">
                            Australia's aged-care system was rebuilt November 2025. Get the AI co-pilot that turns your monthly statement, quarterly budget, and care plan into one calm dashboard — for the whole family.
                        </p>

                        {/* Persona on-ramp */}
                        <div className="mt-8 grid sm:grid-cols-3 gap-3" data-testid="persona-onramp">
                            {PERSONAS.map((p) => (
                                <button
                                    key={p.id}
                                    onMouseEnter={() => setSelectedPersona(p.id)}
                                    onClick={() => (window.location.href = p.href)}
                                    data-testid={`persona-${p.id}`}
                                    className={`text-left rounded-xl p-4 border transition-all ${
                                        selectedPersona === p.id
                                            ? "border-primary-k bg-primary-k text-white -translate-y-0.5 shadow-md"
                                            : "border-kindred bg-surface hover:border-primary-k hover:-translate-y-0.5"
                                    }`}
                                >
                                    <div className={`text-xs uppercase tracking-wider ${selectedPersona === p.id ? "text-gold" : "text-muted-k"}`}>
                                        {p.sub}
                                    </div>
                                    <div className={`font-heading text-lg mt-1 ${selectedPersona === p.id ? "text-white" : "text-primary-k"}`}>
                                        {p.title}
                                    </div>
                                    <div className={`mt-3 text-sm inline-flex items-center gap-1 ${selectedPersona === p.id ? "text-white" : "text-primary-k"}`}>
                                        {p.cta} <ArrowRight className="h-3.5 w-3.5" />
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Trust strip */}
                        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-k">
                            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-sage" /> Australian-hosted</span>
                            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-sage" /> Privacy Act compliant</span>
                            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-sage" /> Never accepts commissions</span>
                            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-sage" /> Never sells your data</span>
                        </div>
                    </div>

                    <div className="lg:col-span-5">
                        <StatementDecoderEmbed compact />
                    </div>
                </div>
            </section>

            {/* SOCIAL PROOF STRIP */}
            <section className="border-y border-kindred bg-surface-2">
                <div className="mx-auto max-w-7xl px-6 py-8 grid grid-cols-3 gap-6 text-center">
                    {[
                        { n: "2,847", l: "households" },
                        { n: "127", l: "advisor practices" },
                        { n: "$2.4M", l: "in incorrect charges flagged" },
                    ].map((s) => (
                        <div key={s.l}>
                            <div className="font-heading text-3xl sm:text-4xl text-primary-k tabular-nums">{s.n}</div>
                            <div className="text-xs sm:text-sm text-muted-k mt-1">{s.l}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* PROBLEM */}
            <section className="mx-auto max-w-7xl px-6 py-16">
                <span className="overline">The problem we're solving</span>
                <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 max-w-3xl tracking-tight">
                    The new Support at Home program is more flexible — and far more complex.
                </h2>
                <div className="mt-10 grid md:grid-cols-3 gap-6">
                    {[
                        { t: "For the family caregiver", b: "You're working full-time. Your parent's statement is in your inbox. You don't know what 80% of it means. The siblings are calling with opinions." },
                        { t: "For the participant", b: "Eight classifications, three streams, dozens of service codes. Government calculators don't help; the funding goes underused." },
                        { t: "For the financial advisor", b: "Lifetime caps, quarterly budgets, contribution scaling, indexation. Your spreadsheet just got a lot more complex." },
                    ].map((c) => (
                        <div key={c.t} className="bg-surface border border-kindred rounded-xl p-6">
                            <h3 className="font-heading text-xl text-primary-k">{c.t}</h3>
                            <p className="mt-3 text-sm text-muted-k leading-relaxed">{c.b}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* HOW IT WORKS — three steps with real screenshots */}
            <section className="mx-auto max-w-7xl px-6 py-16" data-testid="how-it-works">
                <div className="text-center max-w-2xl mx-auto">
                    <span className="overline">How it works</span>
                    <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight">
                        Three steps. Five minutes a month. The whole family in the loop.
                    </h2>
                </div>

                {/* Step 1 — screenshot LEFT, copy RIGHT */}
                <div className="mt-14 grid lg:grid-cols-2 gap-10 items-center">
                    <RevealOnScroll rotate={-1.5} className="hidden sm:block">
                        <BrowserFrame url="app.wayly.com.au/decode" scale={0.78} label="Statement decoder result">
                            <ScreenshotStatement />
                        </BrowserFrame>
                    </RevealOnScroll>
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Step 01</div>
                        <h3 className="font-heading text-3xl text-primary-k mt-3 tracking-tight leading-tight">Forward your statement. Get plain English in 90 seconds.</h3>
                        <p className="mt-4 text-muted-k leading-relaxed max-w-md">Drop in your provider's monthly PDF, CSV or pasted text. Wayly extracts every line item, breaks it down by stream, and explains it like a friend who's been through this before.</p>
                    </div>
                </div>

                {/* Step 2 — copy LEFT, screenshot RIGHT */}
                <div className="mt-20 grid lg:grid-cols-2 gap-10 items-center">
                    <div className="lg:order-1 order-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Step 02</div>
                        <h3 className="font-heading text-3xl text-primary-k mt-3 tracking-tight leading-tight">Wayly watches for anything unusual — so you don't have to.</h3>
                        <p className="mt-4 text-muted-k leading-relaxed max-w-md">Rate increases. Duplicate visits. Rollover risk. Lifetime cap creep. We compare every charge against the published price and flag what doesn't add up — with the receipts.</p>
                    </div>
                    <RevealOnScroll rotate={1} className="lg:order-2 order-1 hidden sm:block">
                        <BrowserFrame url="app.wayly.com.au/anomalies" scale={0.78} label="Anomaly alert detail">
                            <ScreenshotAnomaly />
                        </BrowserFrame>
                    </RevealOnScroll>
                </div>

                {/* Step 3 — screenshot LEFT, copy RIGHT */}
                <div className="mt-20 grid lg:grid-cols-2 gap-10 items-center">
                    <RevealOnScroll rotate={-1}>
                        <BrowserFrame url="app.wayly.com.au/family" scale={0.78} label="Family thread chat">
                            <ScreenshotFamilyThread />
                        </BrowserFrame>
                    </RevealOnScroll>
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Step 03</div>
                        <h3 className="font-heading text-3xl text-primary-k mt-3 tracking-tight leading-tight">Your whole family, on the same page.</h3>
                        <p className="mt-4 text-muted-k leading-relaxed max-w-md">Loop in siblings, advisors, and even your parent's GP. Wayly answers the practical questions ("is a handrail covered?") so the conversation stays on what really matters.</p>
                    </div>
                </div>
            </section>

            {/* BIG NUMBER */}
            <section className="bg-primary-k">
                <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 text-center">
                    <span className="overline" style={{ color: "rgba(255,255,255,0.6)" }}>The Wayly difference</span>
                    <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl text-white mt-4 leading-tight tracking-tight max-w-4xl mx-auto">
                        The average Wayly household spots <span className="text-gold">$1,847/year</span> in incorrect charges and unused funding.
                    </h2>
                    <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
                        <Link
                            to="/signup"
                            data-testid="big-number-cta"
                            className="bg-gold text-primary-k font-medium rounded-full px-6 py-3 hover:bg-[#c8973f] transition-colors"
                        >
                            Start free for 7 days
                        </Link>
                        <Link to="/ai-tools/budget-calculator" className="text-white underline">
                            Or estimate your own budget →
                        </Link>
                    </div>
                </div>
            </section>

            {/* FEATURE GRID */}
            <section className="mx-auto max-w-7xl px-6 py-16">
                <span className="overline">What Wayly does</span>
                <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 max-w-3xl tracking-tight">
                    Eight quiet AI agents, one calm dashboard.
                </h2>
                <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {FEATURES.map((f) => (
                        <div key={f.title} className="bg-surface rounded-xl border border-kindred p-5 hover:-translate-y-1 hover:shadow-lg transition-all">
                            <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                                <f.icon className="h-5 w-5 text-primary-k" />
                            </div>
                            <h3 className="font-heading text-lg mt-4 text-primary-k">{f.title}</h3>
                            <p className="text-sm text-muted-k mt-2 leading-relaxed">{f.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* SEE THE DASHBOARD — full-width strip with wipe reveal */}
            <section className="mx-auto max-w-7xl px-6 py-16" data-testid="dashboard-strip">
                <div className="text-center max-w-2xl mx-auto">
                    <span className="overline">The product</span>
                    <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight">One calm dashboard for everything.</h2>
                </div>
                <div className="mt-10 max-w-5xl mx-auto hidden sm:block">
                    <RevealOnScroll>
                        <BrowserFrame url="app.wayly.com.au/dashboard" scale={0.9} label="Caregiver dashboard with stat cards, anomalies, and latest statement">
                            <ScreenshotDashboard />
                        </BrowserFrame>
                    </RevealOnScroll>
                </div>
                <div className="text-center mt-8">
                    <Link to="/signup?plan=solo" data-testid="dashboard-strip-cta" className="inline-flex items-center gap-2 bg-gold text-primary-k font-semibold rounded-full px-6 py-3 hover:brightness-95">
                        Start your free 7-day trial <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </section>

            {/* COUNTDOWN */}
            <section className="border-y border-kindred bg-surface-2">
                <div className="mx-auto max-w-7xl px-6 py-12 grid lg:grid-cols-12 gap-8 items-center">
                    <div className="lg:col-span-7">
                        <span className="overline">The 1 July 2026 moment</span>
                        <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight">
                            Government price caps land in <span className="text-gold tabular-nums">{countdown.days}</span> days.
                        </h2>
                        <p className="mt-4 text-muted-k max-w-2xl leading-relaxed">
                            Until then, providers can charge what they like. We benchmark every charge against the published price guide and our anonymised network data — so you know what's reasonable today, not after caps land.
                        </p>
                    </div>
                    <div className="lg:col-span-5">
                        <div className="bg-surface border border-kindred rounded-2xl p-6 grid grid-cols-3 gap-4 text-center" data-testid="countdown-card">
                            {[
                                { v: countdown.days, l: "days" },
                                { v: countdown.hours, l: "hours" },
                                { v: countdown.minutes, l: "minutes" },
                            ].map((s) => (
                                <div key={s.l}>
                                    <div className="font-heading text-4xl text-primary-k tabular-nums">{String(s.v).padStart(2, "0")}</div>
                                    <div className="text-xs text-muted-k uppercase tracking-wider mt-1">{s.l}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* AI TOOLS TEASER */}
            <section className="mx-auto max-w-7xl px-6 py-16">
                <div className="flex items-end justify-between flex-wrap gap-4">
                    <div>
                        <span className="overline">Free AI tools</span>
                        <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight max-w-2xl">
                            Try Wayly without signing up.
                        </h2>
                    </div>
                    <Link to="/ai-tools" className="text-primary-k underline text-sm">See all 8 tools →</Link>
                </div>
                <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[
                        { to: "/ai-tools/statement-decoder", title: "Statement Decoder", body: "Paste any monthly statement. Get plain English in 60 seconds." },
                        { to: "/ai-tools/budget-calculator", title: "Budget & Lifetime Cap Calculator", body: "Annual, quarterly, per-stream, lifetime cap projection." },
                        { to: "/ai-tools/provider-price-checker", title: "Provider Price Checker", body: "Tell us what you're charged. We'll tell you whether it's fair." },
                    ].map((t) => (
                        <Link key={t.to} to={t.to} className="bg-surface border border-kindred rounded-xl p-6 hover:-translate-y-1 hover:shadow-lg transition-all" data-testid={`tool-teaser-${t.to.split('/').pop()}`}>
                            <h3 className="font-heading text-xl text-primary-k">{t.title}</h3>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed">{t.body}</p>
                            <div className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k">
                                Try free <ArrowRight className="h-3.5 w-3.5" />
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* PRICING TEASER */}
            <section className="bg-surface-2 border-y border-kindred">
                <div className="mx-auto max-w-7xl px-6 py-16">
                    <div className="text-center">
                        <span className="overline">Pricing</span>
                        <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight">
                            Choose how Wayly helps your family.
                        </h2>
                    </div>
                    <div className="mt-10 grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
                        {[
                            { name: "Free", price: "$0", desc: "Statement Decoder — 1 use per day, no signup." },
                            { name: "Solo", price: "$19/mo", desc: "All 8 AI tools, unlimited. 1 caregiver seat." },
                            { name: "Family", price: "$39/mo", desc: "Most popular. Up to 5 family members + Sunday digest.", featured: true },
                        ].map((t) => (
                            <div
                                key={t.name}
                                className={`rounded-2xl p-6 border ${t.featured ? "bg-primary-k text-white border-primary-k" : "bg-surface border-kindred"}`}
                            >
                                <div className={`text-xs uppercase tracking-wider ${t.featured ? "text-gold" : "text-muted-k"}`}>
                                    {t.featured ? "Most popular" : t.name}
                                </div>
                                <div className={`mt-2 font-heading text-3xl ${t.featured ? "text-white" : "text-primary-k"}`}>{t.price}</div>
                                <p className={`mt-3 text-sm ${t.featured ? "text-white/80" : "text-muted-k"}`}>{t.desc}</p>
                            </div>
                        ))}
                    </div>
                    <div className="text-center mt-8">
                        <Link to="/pricing" className="text-primary-k underline">See full pricing →</Link>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="mx-auto max-w-4xl px-6 py-16">
                <span className="overline">Common questions</span>
                <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight">
                    Everything we get asked, openly.
                </h2>
                <div className="mt-8 space-y-3" data-testid="faq-list">
                    {FAQ.map((f, i) => (
                        <details key={i} className="bg-surface rounded-xl border border-kindred p-5 group">
                            <summary className="cursor-pointer font-medium text-primary-k flex items-center justify-between">
                                {f.q}
                                <span className="text-muted-k group-open:rotate-45 transition-transform">+</span>
                            </summary>
                            <p className="mt-3 text-sm text-muted-k leading-relaxed">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* FINAL CTA */}
            <section className="bg-primary-k">
                <div className="mx-auto max-w-4xl px-6 py-16 text-center">
                    <h2 className="font-heading text-4xl sm:text-5xl text-white tracking-tight">Ready when you are.</h2>
                    <p className="mt-4 text-white/80 max-w-xl mx-auto">
                        Try Wayly free for 7 days. Cancel anytime. No card required for the trial.
                    </p>
                    <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
                        <Link to="/signup" data-testid="final-cta-signup" className="bg-gold text-primary-k font-medium rounded-full px-6 py-3 hover:bg-[#c8973f] transition-colors">
                            Start free trial
                        </Link>
                        <Link to="/ai-tools" className="text-white underline">Or try a free AI tool</Link>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
}
