/**
 * DualFlagshipHero, FRONTEND-REBALANCE-1 hero.
 *
 * Statement Decoder and Invoice Checker are shown as co-equal flagships on
 * the homepage. Copy switches between caregiver and participant voice via
 * the PersonaToggle above the fold. Ask Wayly gets a tertiary conversational
 * entry at the bottom of the hero.
 *
 * Telemetry (client-side PostHog via `track`):
 *   - `hero_flagship_click`, { flagship: "statement_decoder" | "invoice_checker" }
 *   - `ask_wayly_home_click`
 */
import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileSearch, ReceiptText, MessageCircle, Sparkles, MapPin, Scale, Info } from "lucide-react";
import PersonaToggle from "@/components/PersonaToggle";
import { track } from "@/lib/analytics";

const COPY = {
    caregiver: {
        eyebrow: "Aged Care, Made Clear",
        headline: "Read the statement. Check the invoice. Sleep on Sunday.",
        subhead: "Wayly is the calm dashboard families use to make sense of every Support at Home statement and every provider invoice, before the money goes out the door.",
        flagship_statement_sub: "Upload the monthly statement. Get a plain-English breakdown of every stream, every rate, every flag.",
        flagship_invoice_sub: "Upload the contribution invoice. Wayly runs the C1 to C12 rule engine and tells you what to raise before you pay.",
    },
    participant: {
        eyebrow: "Aged Care, Made Clear",
        headline: "Your Care. Your Statement. Your Call.",
        subhead: "Wayly reads your Support at Home statement and any provider invoice with you, in plain English, so you know exactly where your funding goes and what is worth questioning.",
        flagship_statement_sub: "Drop in your monthly statement. See what every line means and where your quarterly budget stands.",
        flagship_invoice_sub: "Drop in an invoice from your provider. Wayly checks it against the rules and gives you the exact question to ask.",
    },
};

export default function DualFlagshipHero() {
    const [persona, setPersona] = useState("caregiver");
    const copy = COPY[persona] || COPY.caregiver;

    const onFlagshipClick = useCallback((flagship) => {
        try { track?.event?.("hero_flagship_click", { flagship, persona }); } catch { /* non-fatal */ }
    }, [persona]);

    const onAskWaylyClick = useCallback(() => {
        try { track?.event?.("ask_wayly_home_click", { persona }); } catch { /* non-fatal */ }
    }, [persona]);

    return (
        <section
            className="relative overflow-hidden bg-gradient-to-br from-surface-2 via-surface to-surface-2 border-b border-kindred"
            data-testid="dual-flagship-hero"
        >
            <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_10%,#0F5648_0%,transparent_45%),radial-gradient(circle_at_80%_20%,#C99B2E_0%,transparent_35%)]" aria-hidden="true" />

            <div className="relative mx-auto max-w-7xl px-6 pt-14 pb-20 lg:pt-20 lg:pb-24">
                {/* Persona toggle above the fold */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-accent-aa-bold" data-testid="hero-eyebrow">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        {copy.eyebrow}
                    </div>
                    <PersonaToggle onChange={setPersona} defaultPersona={persona} />
                </div>

                <h1
                    className="mt-6 font-heading text-4xl sm:text-5xl lg:text-6xl text-primary-k tracking-tight leading-[1.05] max-w-4xl"
                    data-testid="hero-headline"
                >
                    {copy.headline}
                </h1>
                <p className="mt-5 text-lg text-primary-k/85 max-w-2xl leading-relaxed">
                    {copy.subhead}
                </p>

                {/* Dual-flagship card row, Statement Decoder + Invoice Checker */}
                <div className="mt-10 grid lg:grid-cols-2 gap-5" data-testid="dual-flagship-cards">
                    <FlagshipCard
                        testid="hero-flagship-statement-decoder"
                        Icon={FileSearch}
                        eyebrow="Free · No signup"
                        title="Statement Decoder"
                        sub={copy.flagship_statement_sub}
                        cta="Decode a statement"
                        to="/ai-tools/statement-decoder"
                        onClick={() => onFlagshipClick("statement_decoder")}
                        accent="teal"
                    />
                    <FlagshipCard
                        testid="hero-flagship-invoice-checker"
                        Icon={ReceiptText}
                        eyebrow="7-day free trial"
                        title="Invoice Checker"
                        sub={copy.flagship_invoice_sub}
                        cta="Check an invoice"
                        to="/ai-tools/invoice-checker"
                        onClick={() => onFlagshipClick("invoice_checker")}
                        accent="clay"
                    />
                </div>

                {/* Ask Wayly, tertiary conversational entry */}
                <div className="mt-8 flex flex-wrap items-center gap-3" data-testid="hero-ask-wayly-row">
                    <Link
                        to="/ai-tools/family-coordinator"
                        onClick={onAskWaylyClick}
                        data-testid="hero-ask-wayly-cta"
                        className="inline-flex items-center gap-2 rounded-full border border-primary-k bg-surface text-primary-k px-5 py-2.5 text-sm font-medium hover:bg-primary-k hover:text-white transition-colors"
                    >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        Ask Wayly a question
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                    <span className="text-xs text-muted-k">
                        Plain-English answers grounded in the Aged Care Act 2024
                    </span>
                </div>

                {/* Trust strip: three promises presented as high-contrast pills with icons. */}
                <div
                    className="mt-10 flex flex-wrap items-center gap-2.5"
                    data-testid="hero-trust-strip"
                    role="list"
                    aria-label="What Wayly commits to"
                >
                    <span
                        role="listitem"
                        className="inline-flex items-center gap-2 rounded-full border border-primary-k/25 bg-white/80 backdrop-blur-sm px-3.5 py-1.5 text-[13px] font-medium text-primary-k shadow-sm"
                    >
                        <MapPin className="h-3.5 w-3.5 text-sage-700" aria-hidden="true" />
                        Data in Australia
                    </span>
                    <span
                        role="listitem"
                        className="inline-flex items-center gap-2 rounded-full border border-primary-k/25 bg-white/80 backdrop-blur-sm px-3.5 py-1.5 text-[13px] font-medium text-primary-k shadow-sm"
                    >
                        <Scale className="h-3.5 w-3.5 text-primary-k" aria-hidden="true" />
                        Independent, no provider ownership
                    </span>
                    <span
                        role="listitem"
                        className="inline-flex items-center gap-2 rounded-full border border-primary-k/25 bg-white/80 backdrop-blur-sm px-3.5 py-1.5 text-[13px] font-medium text-primary-k shadow-sm"
                    >
                        <Info className="h-3.5 w-3.5 text-clay-dark" aria-hidden="true" />
                        Information only, not financial or legal advice
                    </span>
                </div>

                {/* Dashboard screenshot, anchoring visual for the hero. */}
                <div className="mt-14 relative" data-testid="hero-screenshot-wrap">
                    <div className="absolute inset-x-8 -bottom-6 h-24 bg-primary-k/10 blur-3xl rounded-full" aria-hidden="true" />
                    <div className="relative rounded-2xl border border-kindred bg-surface shadow-[0_30px_80px_-20px_rgba(15,42,68,0.35)] overflow-hidden">
                        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-kindred bg-surface-2/60">
                            <span className="h-2.5 w-2.5 rounded-full bg-clay/60" aria-hidden="true" />
                            <span className="h-2.5 w-2.5 rounded-full bg-gold/60" aria-hidden="true" />
                            <span className="h-2.5 w-2.5 rounded-full bg-sage/60" aria-hidden="true" />
                            <span className="ml-2 text-[10px] text-muted-k tabular-nums">wayly.com.au/app</span>
                        </div>
                        <img
                            src="/branding/screenshots/dashboard-hero.png"
                            alt="Wayly dashboard preview showing statement decoding, quarterly pacing and invoice checker at a glance."
                            className="block w-full h-auto"
                            data-testid="hero-screenshot-img"
                            loading="lazy"
                            decoding="async"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

function FlagshipCard({ testid, Icon, eyebrow, title, sub, cta, to, onClick, accent, badge }) {
    const accentClasses = accent === "clay"
        ? "border-clay/40 hover:border-clay hover:shadow-[0_20px_60px_rgba(181,124,87,0.25)]"
        : "border-sage/40 hover:border-primary-k hover:shadow-[0_20px_60px_rgba(15,86,72,0.20)]";
    const iconWrap = accent === "clay"
        ? "bg-clay/12 text-clay-dark"
        : "bg-sage/15 text-primary-k";
    return (
        <Link
            to={to}
            onClick={onClick}
            data-testid={testid}
            className={`group relative block rounded-2xl border-2 bg-surface p-6 lg:p-7 transition-all hover:-translate-y-1 ${accentClasses}`}
        >
            {badge && (
                <span className="absolute -top-2.5 right-6 inline-flex items-center gap-1 rounded-full bg-clay text-white text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 shadow-md">
                    {badge}
                </span>
            )}
            <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-xl inline-flex items-center justify-center shrink-0 ${iconWrap}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-k">{eyebrow}</div>
                    <h2 className="mt-1 font-heading text-2xl text-primary-k tracking-tight">{title}</h2>
                    <p className="mt-2.5 text-sm text-primary-k/80 leading-relaxed">{sub}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-k group-hover:gap-2 transition-all">
                        {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                </div>
            </div>
        </Link>
    );
}
