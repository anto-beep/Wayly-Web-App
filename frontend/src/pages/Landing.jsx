import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, FileSearch, MessageCircle, Users2, Wallet, AlertTriangle, Calendar, Mic, Check, CheckCircle2, FilePenLine, Calculator, ClipboardList } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import StatementDecoderEmbed from "@/components/StatementDecoderEmbed";
import HeroSpotlight from "@/components/HeroSpotlight";
import DualFlagshipHero from "@/components/DualFlagshipHero";
import ToolClusterGrid from "@/components/ToolClusterGrid";
import { BrowserFrame, ScreenshotStatement, ScreenshotDashboard, ScreenshotFamilyThread, ScreenshotAnomaly, ScreenshotReportsHub } from "@/components/Screenshots";
import RevealOnScroll from "@/components/RevealOnScroll";

import SeoHead, { organizationLd, websiteLd } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
import { TOOL_COUNT, TOOLS_ORDERED, toolCountWord } from "@/config/toolRegistry";
import { useAuth } from "@/context/AuthContext";
import INDEX1 from "@/data/index1";
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

// Card set for the "What Wayly does" feature grid. Sourced from the
// tool registry (single source of truth). Slugs, icons and copy are
// resolved from TOOLS_ORDERED so adding a tool automatically appears
// here.
const FEATURES = TOOLS_ORDERED.map((t) => ({
    slug: t.slug,
    icon: t.IconComponent,
    title: t.name,
    body: t.short,
}));

const FAQ = [
    { q: "Are you a Support at Home provider?", a: "No. We're independent software. Your registered provider stays whoever you've chosen, Wayly sits on top of them." },
    { q: "Do I need to switch providers to use Wayly?", a: "No. Wayly works with any registered Support at Home provider." },
    { q: "How much does it cost?", a: "Solo is $24.50 per fortnight and Family is $49.50 per fortnight, both billed every 14 days in AUD inclusive of GST. Every plan starts with a 7-day free trial, no card needed to start. Cancel any time." },
    { q: "Does my parent need to use it?", a: "Not at all. Most households are run by an adult-child caregiver. Your parent has their own simplified view but doesn't need to log in if they don't want to." },
    { q: "What about privacy?", a: "Australian-hosted, encrypted with per-household keys, never sold, never used to train AI without consent. Read more on our Trust page." },
    { q: "Will Wayly ever recommend a provider?", a: "We show provider prices and quality signals neutrally. We never accept commissions from providers, ever." },
    { q: "Can multiple family members share one account?", a: "Yes, that's the Family plan. Up to 5 family members, each with their own role-based view." },
    { q: "Does Wayly give clinical or financial advice?", a: "No. We help you understand the system. Clinical advice comes from your care team; financial advice from a licensed advisor." },
    { q: "What if my parent moves to residential care?", a: "We pause billing immediately and provide a transition guide." },
    { q: "Can I try it with sample data first?", a: "Yes, the /demo page walks you through a sample household with no signup. Or paste a statement into the decoder above right now." },
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
    const { user } = useAuth();
    const countdown = useCountdown(new Date("2026-10-01T00:00:00+10:00"));
    const [selectedPersona, setSelectedPersona] = useState("caregiver");

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.home} />
            <MarketingHeader />

            <main id="main-content">
            {/* HERO, FRONTEND-REBALANCE-1 feature-flagged.
                REACT_APP_FLAG_DUAL_FLAGSHIP=0 in the env reverts to the legacy
                HeroSpotlight so we can roll back in one env change if telemetry
                regresses. Default (unset) is ON per Phase 0 sign-off. */}
            {process.env.REACT_APP_FLAG_DUAL_FLAGSHIP === "0"
                ? <HeroSpotlight />
                : <DualFlagshipHero />}

            {/* PERSONA ON-RAMP + DECODER EMBED */}
            <section className="mx-auto max-w-7xl px-6 pt-16 pb-8" data-testid="persona-section">
                <div className="grid lg:grid-cols-12 gap-10 items-start">
                    <div className="lg:col-span-7">
                        <span className="overline">Three quick ways in</span>
                        <h2 className="font-heading text-3xl sm:text-4xl text-[#0E2A47] mt-3">Which describes you best?</h2>
                        <p className="mt-3 text-base text-[#4A5A75] max-w-xl leading-relaxed">
                            Australia's aged-care system was rebuilt on 1 November 2025. Pick the path that fits your household and we will tailor the next step for you.
                        </p>

                        {/* Persona on-ramp */}
                        <div className="mt-6 grid sm:grid-cols-3 gap-3" data-testid="persona-onramp">
                            {PERSONAS.map((p) => (
                                <button
                                    key={p.id}
                                    onMouseEnter={() => setSelectedPersona(p.id)}
                                    onClick={() => (window.location.href = p.href)}
                                    data-testid={`persona-${p.id}`}
                                    className={`text-left rounded-xl p-4 border transition-all ${
                                        selectedPersona === p.id
                                            ? "border-[#0E2A47] bg-[#0E2A47] text-white -translate-y-0.5 shadow-md"
                                            : "border-kindred bg-surface hover:border-[#0E2A47] hover:-translate-y-0.5"
                                    }`}
                                >
                                    <div className={`text-xs uppercase tracking-wider ${selectedPersona === p.id ? "text-white/85" : "text-muted-k"}`}>
                                        {p.sub}
                                    </div>
                                    <div className={`font-heading text-lg mt-1 ${selectedPersona === p.id ? "text-white" : "text-[#0E2A47]"}`}>
                                        {p.title}
                                    </div>
                                    <div className={`mt-3 text-sm inline-flex items-center gap-1 ${selectedPersona === p.id ? "text-white" : "text-[#0E2A47]"}`}>
                                        {p.cta} <ArrowRight className="h-3.5 w-3.5" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="lg:col-span-5">
                        <StatementDecoderEmbed compact />
                    </div>
                </div>
            </section>

            {/* PROBLEM */}
            <section className="mx-auto max-w-7xl px-6 py-16">
                <span className="overline">The Problem We're Solving</span>
                <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 max-w-3xl tracking-tight">
                    The new Support at Home program is more flexible, and <span style={{ color: "#A5512B" }}>far more complex</span>.
                </h2>
                <div className="mt-10 grid md:grid-cols-3 gap-6">
                    {[
                        { t: "For the Family Caregiver", b: "You love someone who needs help, so you stepped in. Now a statement lands in your inbox and you're not sure what most of it means, whether a charge is fair, or what to do next. You just want to get it right for them." },
                        { t: "For the Participant", b: "You want to stay in control of your own care and your own money. But eight classifications, three funding streams and dozens of service codes make it hard to see what you're entitled to, or whether your budget is being used well." },
                        { t: "For the Family", b: "You live in another suburb, or another state. You want to help without taking over, and to know that nothing important is being missed, without living in a group chat of half-answers and worry." },
                    ].map((c) => (
                        <RevealOnScroll key={c.t}>
                            <div className="h-full bg-surface border border-kindred rounded-xl p-6 hover:border-[#A5512B]/40 transition-colors">
                                <h3 className="font-heading text-xl text-[#A5512B]">{c.t}</h3>
                                <p className="mt-3 text-sm text-muted-k leading-relaxed">{c.b}</p>
                            </div>
                        </RevealOnScroll>
                    ))}
                </div>
            </section>

            {/* WHO WAYLY IS FOR, ecosystem grid, one card per audience.
                Design ref: verify-athlete "Six users. One shared truth." */}
            <section className="mx-auto max-w-7xl px-6 py-20" data-testid="ecosystem-section">
                <div className="text-center max-w-2xl mx-auto">
                    <span className="overline">Built for the Whole Household</span>
                    <h2 className="font-heading text-3xl sm:text-5xl text-primary-k mt-3 tracking-tight leading-tight">
                        Six People. <span style={{ color: "#A5512B" }}>One Shared Calm.</span>
                    </h2>
                    <p className="mt-4 text-base text-muted-k leading-relaxed">
                        Aged care is never just one person&apos;s problem. Wayly gives each
                        person in the picture their own front door to the same source of truth.
                    </p>
                </div>
                <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        { name: "Participants", body: "It's your care and your money. Read your own statement over breakfast, see where your budget is going, and stay in charge, no translator needed." },
                        { name: "Caregivers", body: "That 11pm envelope, understood in ten minutes. Know what's fair, what to query, and what to do next, without a finance degree." },
                        { name: "Family", body: "Everyone on the same page without three group chats. See exactly what your loved one sees, even from another state." },
                        { name: "Advisers", body: "White-label reports, contribution modelling and ready-to-send letters, so clients act on clear numbers, not guesswork." },
                        { name: "Providers", body: "Calmer conversations with participants who arrive already understanding their statement and their budget." },
                        { name: "Clinicians", body: "Classification, care plan and services in one glance before the next review, so nothing gets missed." },
                    ].map((p) => (
                        <RevealOnScroll key={p.name}>
                        <div
                            data-testid={`ecosystem-card-${p.name.toLowerCase()}`}
                            className="h-full rounded-2xl border border-kindred bg-surface p-6 hover:border-[#A5512B]/50 transition-colors"
                        >
                            <div className="text-xs uppercase tracking-[0.18em] text-[#A5512B] font-semibold">
                                Wayly for
                            </div>
                            <h3 className="mt-2 font-heading text-2xl text-primary-k tracking-tight">
                                {p.name}
                            </h3>
                            <p className="mt-3 text-base text-primary-k/85 leading-relaxed">
                                {p.body}
                            </p>
                        </div>
                        </RevealOnScroll>
                    ))}
                </div>
            </section>

            {/* FEATURE GRID, themed clusters when the dual-flagship flag is on,
                otherwise fall back to the legacy flat 9-tool grid. */}
            {process.env.REACT_APP_FLAG_DUAL_FLAGSHIP === "0" ? (
                <section className="mx-auto max-w-7xl px-6 py-16" data-testid="what-wayly-does">
                    <span className="overline">What Wayly does</span>
                    <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 max-w-3xl tracking-tight">
                        {toolCountWord(TOOL_COUNT)} AI Tools. One Calm Dashboard.
                    </h2>
                    <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {FEATURES.map((f) => (
                            <Link
                                key={f.title}
                                to={`/ai-tools/${f.slug}`}
                                data-testid={`feature-tile-${f.slug}`}
                                className="block bg-surface rounded-xl border border-kindred p-5 hover:-translate-y-1 hover:shadow-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-wayly-clay-500 focus-visible:ring-offset-2"
                            >
                                <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                                    <f.icon className="h-5 w-5 text-primary-k" />
                                </div>
                                <h3 className="font-heading text-lg mt-4 text-primary-k">{f.title}</h3>
                                <p className="text-sm text-muted-k mt-2 leading-relaxed">{f.body}</p>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : (
                <ToolClusterGrid />
            )}

            {/* HOW IT WORKS, three screenshot steps */}
            <section className="mx-auto max-w-7xl px-6 py-16" data-testid="how-it-works">

                {/* Step 1, screenshot RIGHT, copy LEFT.
                    Sized to match the "Reports" section (lg:col-span-7 image). */}
                <div className="mt-14 grid lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-5 min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-accent-aa-bold">Step 01</div>
                        <h3 className="font-heading text-3xl text-primary-k mt-3 tracking-tight leading-tight">Forward your statement. Get plain English in 90 seconds.</h3>
                        <p className="mt-4 text-muted-k leading-relaxed">Drop in your provider's monthly PDF, CSV or pasted text. Wayly extracts every line item, breaks it down by stream, and explains it like a friend who's been through this before.</p>
                    </div>
                    <div className="lg:col-span-7 min-w-0">
                        <RevealOnScroll>
                            <img
                                src="/marketing/03-statement-decoder-tool.png"
                                alt="Statement decoder result with line-by-line breakdown and anomaly flags"
                                width="1440"
                                height="900"
                                loading="lazy"
                                decoding="async"
                                className="w-full aspect-[16/10] object-cover object-top rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-kindred"
                                data-testid="step-1-screenshot"
                            />
                        </RevealOnScroll>
                    </div>
                </div>

                {/* Step 2, screenshot LEFT, copy RIGHT. */}
                <div className="mt-20 grid lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-7 min-w-0 lg:order-1 order-2">
                        <RevealOnScroll>
                            <img
                                src="/marketing/07-budget-alerts.png"
                                alt="Budget alert detail showing a flagged rate increase against the published price"
                                width="1440"
                                height="900"
                                loading="lazy"
                                decoding="async"
                                className="w-full aspect-[16/10] object-cover object-top rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-kindred"
                                data-testid="step-2-screenshot"
                            />
                        </RevealOnScroll>
                    </div>
                    <div className="lg:col-span-5 min-w-0 lg:order-2 order-1">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-accent-aa-bold">Step 02</div>
                        <h3 className="font-heading text-3xl text-primary-k mt-3 tracking-tight leading-tight">Wayly watches for anything unusual, so you don't have to.</h3>
                        <p className="mt-4 text-muted-k leading-relaxed">Rate increases. Duplicate visits. Rollover risk. Lifetime cap creep. We compare every charge against the published price and flag what doesn't add up, with the receipts.</p>
                    </div>
                </div>

                {/* Step 3, screenshot RIGHT, copy LEFT. */}
                <div className="mt-20 grid lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-5 min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-accent-aa-bold">Step 03</div>
                        <h3 className="font-heading text-3xl text-primary-k mt-3 tracking-tight leading-tight">Your whole family, on the same page.</h3>
                        <p className="mt-4 text-muted-k leading-relaxed">Loop in siblings, advisors, and even your parent's GP. Wayly answers the practical questions ("is a handrail covered?") so the conversation stays on what really matters.</p>
                    </div>
                    <div className="lg:col-span-7 min-w-0">
                        <RevealOnScroll>
                            <img
                                src="/marketing/09-family-wall.png"
                                alt="Family wall with shared notes, photos and voice updates from siblings"
                                width="1440"
                                height="900"
                                loading="lazy"
                                decoding="async"
                                className="w-full aspect-[16/10] object-cover object-top rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-kindred"
                                data-testid="step-3-screenshot"
                            />
                        </RevealOnScroll>
                    </div>
                </div>
            </section>

            {/* BIG NUMBER */}
            <section className="bg-primary-k">
                <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 text-center">
                    <span className="overline" style={{ color: "rgba(255,255,255,0.6)" }}>The Wayly difference</span>
                    <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl text-white mt-4 leading-tight tracking-tight max-w-4xl mx-auto">
                        The average Wayly household spots <span className="font-semibold" style={{ color: "var(--clay-on-dark)" }} data-testid="big-number-accent">$1,847/year</span> in incorrect charges and unused funding.
                    </h2>
                    <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
                        <Link
                            to="/signup"
                            data-testid="big-number-cta"
                            className="bg-gold text-white font-medium rounded-full px-6 py-3 hover:bg-[#1FA8B8] transition-colors"
                        >
                            Start free for 7 days
                        </Link>
                        <Link to="/ai-tools/budget-calculator" className="text-white underline font-semibold hover:no-underline">
                            Or estimate your own budget →
                        </Link>
                    </div>
                </div>
            </section>

            {/* FEATURE GRID moved above (see what-wayly-does section) */}

            {/* SEE THE DASHBOARD, full-width strip with wipe reveal */}
            <section className="mx-auto max-w-7xl px-6 py-16" data-testid="dashboard-strip">
                <div className="text-center max-w-2xl mx-auto">
                    <span className="overline">The Product</span>
                    <h2 className="font-heading text-3xl sm:text-5xl text-primary-k mt-3 tracking-tight">One Calm Dashboard for <span style={{ color: "#A5512B" }}>Everything</span>.</h2>
                </div>
                <div className="mt-10 max-w-5xl mx-auto">
                    <RevealOnScroll>
                        <img
                            src="/marketing/02-caregiver-dashboard.png"
                            alt="Caregiver dashboard with stat cards, anomalies, and latest statement"
                            width="1440"
                            height="900"
                            loading="lazy"
                            decoding="async"
                            className="w-full h-auto rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-kindred"
                            data-testid="dashboard-strip-screenshot"
                        />
                    </RevealOnScroll>
                </div>
                <div className="text-center mt-8">
                    <Link to="/signup?plan=solo" data-testid="dashboard-strip-cta" className="inline-flex items-center gap-2 bg-gold text-white font-semibold rounded-full px-6 py-3 hover:brightness-95">
                        Start your free 7-day trial <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </section>

            {/* REPORTS HUB STRIP, showcases the 8-PDF report library + provider grading */}
            <section className="border-t border-kindred bg-surface-2" data-testid="reports-strip">
                <div className="mx-auto max-w-7xl px-6 py-16 grid lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-5 min-w-0">
                        <span className="overline">Reports</span>
                        <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight">Reports your accountant will love.</h2>
                        <p className="mt-4 text-muted-k leading-relaxed">
                            Eight ready-to-share PDFs auto-generated at the end of every quarter. Annual Financial. Statement Digest. Tax Summary. Lifetime Cap Tracker. Budget Forecast. Care Plan Diff. Provider Performance, with a letter grade. Concerns Log. One click, one PDF, no formatting fights.
                        </p>
                        <ul className="mt-5 space-y-2 text-sm text-muted-k">
                            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary-k mt-0.5 flex-shrink-0" /> Branded, page-numbered PDFs stored in your encrypted vault</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary-k mt-0.5 flex-shrink-0" /> Provider Performance grading on visit reliability, substitutions, rate vs network</li>
                            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary-k mt-0.5 flex-shrink-0" /> Share a presigned link with your accountant or a Centrelink officer</li>
                        </ul>
                        <Link to="/signup?plan=solo" data-testid="reports-strip-cta" className="mt-7 inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-primary-k/90">
                            Try it free <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="lg:col-span-7 min-w-0">
                        <RevealOnScroll>
                            <img
                                src="/marketing/11-reports-hub.png"
                                alt="Reports hub showing eight auto-generated PDFs and a Provider Performance grade"
                                width="1440"
                                height="900"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-auto rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-kindred"
                                data-testid="reports-strip-screenshot"
                            />
                        </RevealOnScroll>
                    </div>
                </div>
            </section>


            {/* COUNTDOWN */}
            <section className="border-y border-kindred bg-surface-2">
                <div className="mx-auto max-w-7xl px-6 py-12 grid lg:grid-cols-12 gap-8 items-center">
                    <div className="lg:col-span-7">
                        <span className="overline">The 1 October 2026 moment</span>
                        <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight">
                            Personal care becomes fully funded in <span className="text-accent-aa tabular-nums font-semibold">{countdown.days}</span> days.
                        </h2>
                        <p className="mt-4 text-muted-k max-w-2xl leading-relaxed">
                            From 1 October 2026, showering, dressing and continence support move into Clinical Care under Support at Home, so families pay nothing for them. Until then, those visits still carry a contribution, and Wayly tracks every line so you know what should change on the day the rules do.
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
                        <span className="overline">Free to Try</span>
                        <h2 className="font-heading text-3xl sm:text-5xl text-primary-k mt-3 tracking-tight max-w-2xl">
                            Decode a Statement Now, <span style={{ color: "#A5512B" }}>No Signup Needed</span>.
                        </h2>
                        <p className="mt-3 text-base text-muted-k leading-relaxed max-w-2xl">
                            Paste any Support at Home statement and get plain English in about 60 seconds, no account required. The rest of Wayly's tools are included free with your account.
                        </p>
                    </div>
                    <Link to="/ai-tools" className="text-[#A5512B] font-semibold underline text-sm">See all {TOOL_COUNT} tools →</Link>
                </div>
                <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[
                        { to: "/ai-tools/statement-decoder", title: "Statement Decoder", body: "Paste any monthly statement. Get plain English in 60 seconds.", free: true },
                        { to: "/ai-tools/budget-calculator", title: "Budget & Lifetime Cap Calculator", body: "Annual, quarterly, per-stream and lifetime-cap projection.", free: false },
                        { to: "/ai-tools/provider-price-checker", title: "Provider Price Checker", body: "Tell us what you're charged. We'll tell you whether it's fair.", free: false },
                    ].map((t) => (
                        <RevealOnScroll key={t.to}>
                        <Link to={t.to} className="block h-full bg-surface border border-kindred rounded-xl p-6 hover:-translate-y-1 hover:shadow-lg transition-all" data-testid={`tool-teaser-${t.to.split('/').pop()}`}>
                            <div className="flex items-center gap-2">
                                <h3 className="font-heading text-xl text-primary-k">{t.title}</h3>
                            </div>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed">{t.body}</p>
                            <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "#A5512B" }}>
                                {t.free ? "Try free, no signup" : "Free with your account"} <ArrowRight className="h-3.5 w-3.5" />
                            </div>
                        </Link>
                        </RevealOnScroll>
                    ))}
                </div>
            </section>

            {/* PRICING TEASER */}
            <section className="bg-surface-2 border-y border-kindred">
                <div className="mx-auto max-w-7xl px-6 py-16">
                    <div className="text-center">
                        <span className="overline">Pricing</span>
                        <h2 className="font-heading text-3xl sm:text-5xl text-primary-k mt-3 tracking-tight">
                            Less Than One Hour With a <span style={{ color: "#A5512B" }}>Consultant</span>.
                        </h2>
                        <p className="mt-4 text-base text-muted-k leading-relaxed max-w-2xl mx-auto">
                            An aged-care consultant charges $150 to $250 for a single hour. Wayly is a few dollars a week, and it's there every day, catching overcharges and unused funding that can quietly cost hundreds each quarter.
                        </p>
                    </div>
                    <div className="mt-12 grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
                        {[
                            {
                                key: "solo",
                                name: "Solo",
                                price: "$24.50",
                                cadence: "per fortnight",
                                href: "/signup?plan=solo",
                                cta: "Get started",
                                bullets: ["All nine Wayly tools, unlocked", "Statement Decoder + anomaly flagging", "Budget, contribution and lifetime-cap tracking", "Ask Wayly, grounded in the Aged Care Act 2024", "One participant, one caregiver seat", "Your data stays in Australia"],
                            },
                            {
                                key: "family",
                                name: "Family",
                                price: "$49.50",
                                cadence: "per fortnight",
                                href: "/signup?plan=family",
                                cta: "Get started",
                                badge: "Most families choose this",
                                featured: true,
                                bullets: ["Everything in Solo, for two people", "Two full participants included", "Three caregiver seats, share with siblings", "One shared, always-current source of truth", "Ideal for couples or two parents", "Best value per person"],
                            },
                        ].map((t) => (
                            <RevealOnScroll key={t.key}>
                            <div
                                data-testid={`landing-tier-${t.key}`}
                                className={`relative h-full rounded-2xl border p-6 ${t.featured ? "bg-primary-k text-white border-gold shadow-xl" : "bg-surface border-kindred"}`}
                            >
                                {t.badge && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-white text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold whitespace-nowrap">
                                        {t.badge}
                                    </span>
                                )}
                                <h3 className={`font-heading text-2xl ${t.featured ? "text-white" : "text-primary-k"}`}>{t.name}</h3>
                                <div className="mt-3 flex items-baseline gap-1">
                                    <span className={`font-heading text-4xl ${t.featured ? "text-white" : "text-primary-k"}`}>{t.price}</span>
                                    <span className={`text-sm ${t.featured ? "text-white/70" : "text-muted-k"}`}>{t.cadence || "/month"}</span>
                                </div>
                                {t.featured && (
                                    <p className="mt-1 text-xs text-gold font-semibold">Just $24.75 per person, per fortnight</p>
                                )}
                                <ul className="mt-4 space-y-2 text-sm">
                                    {t.bullets.map((b) => (
                                        <li key={b} className={`flex gap-2 ${t.featured ? "text-white/90" : "text-muted-k"}`}>
                                            <Check className={`h-4 w-4 mt-0.5 flex-none ${t.featured ? "text-gold" : "text-sage"}`} aria-hidden="true" />
                                            {b}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    to={user ? "/pricing" : t.href}
                                    data-testid={`landing-tier-cta-${t.key}`}
                                    className={`mt-5 block text-center rounded-full px-4 py-2.5 text-sm font-semibold ${t.featured ? "bg-gold text-white hover:brightness-95" : "bg-primary-k text-white hover:bg-[#091D33]"}`}
                                >
                                    {user ? `Buy ${t.name}` : t.cta}
                                </Link>
                            </div>
                            </RevealOnScroll>
                        ))}
                    </div>
                    <div className="text-center mt-8">
                        <p className="text-sm text-muted-k">Every plan starts with a free 7-day trial. Cancel anytime.</p>
                        <Link to="/pricing" className="inline-block mt-3 text-[#A5512B] font-semibold underline">See full pricing &rarr;</Link>
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
                    <h2 className="font-heading text-4xl sm:text-5xl text-white tracking-tight wf-dot-lg">Ready when you are</h2>
                    <p className="mt-4 text-white/80 max-w-xl mx-auto">
                        Try Wayly free for 7 days. Cancel anytime. No card required for the trial.
                    </p>
                    <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
                        <Link to="/signup" data-testid="final-cta-signup" className="bg-gold text-white font-medium rounded-full px-6 py-3 hover:bg-[#1FA8B8] transition-colors">
                            Start free trial
                        </Link>
                        <Link to="/ai-tools" className="text-white underline">Or try a free AI tool</Link>
                    </div>
                </div>
            </section>
            </main>

            <Footer />
        </div>
    );
}
