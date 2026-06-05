import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Lock, Users, Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";

/**
 * HeroSpotlight — Landing page hero, Jun 2026 brand.
 *
 * Layout on lg+ : 3 visual lanes inside a full-bleed section
 *   • lane 1 (cols 1-5)  → headline + subhead + CTAs + 4 trust pills
 *   • lane 2 (cols 6-8)  → 3 dashboard cards stacked vertically, evenly spaced, no overlap
 *   • lane 3 (cols 9-12) → lifestyle photograph of caregiver + parent, never covered
 *
 * Below md the photo stacks on top, cards stack below it, all separated.
 */

function PillBadge({ icon: Icon, label, tone }) {
    const tones = {
        teal: "bg-[#3DB8A8]",
        cyan: "bg-[#2BC4D6]",
        indigo: "bg-[#5A7BE8]",
        lavender: "bg-[#8E7BE8]",
    };
    return (
        <span className="inline-flex items-center gap-2 rounded-full bg-white pl-1 pr-4 py-1 wayly-card-shadow border border-white/60">
            <span className={`h-7 w-7 rounded-full inline-flex items-center justify-center text-white ${tones[tone]}`}>
                <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-[13px] font-medium text-[#0E2A47]">{label}</span>
        </span>
    );
}

function CategoryBar({ label, pct, colour }) {
    return (
        <div>
            <div className="flex items-center justify-between text-[11px] text-[#4A5A75] mb-1">
                <span>{label}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#E2EEF8] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
            </div>
        </div>
    );
}

function DonutChart() {
    const r = 26, c = 2 * Math.PI * r;
    const used = c * 0.51;
    return (
        <div className="relative">
            <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden>
                <circle cx="38" cy="38" r={r} fill="none" stroke="#E2EEF8" strokeWidth="9" />
                <circle
                    cx="38" cy="38" r={r}
                    fill="none"
                    stroke="url(#donutG)"
                    strokeWidth="9"
                    strokeDasharray={`${used} ${c - used}`}
                    strokeDashoffset={c * 0.25}
                    strokeLinecap="round"
                    transform="rotate(-90 38 38)"
                />
                <defs>
                    <linearGradient id="donutG" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#1E7BD9" />
                        <stop offset="100%" stopColor="#2BC4D6" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[11px] font-semibold text-[#0E2A47] tabular-nums">$12,341</div>
                <div className="text-[9px] text-[#4A5A75]">Remaining</div>
            </div>
        </div>
    );
}

function BudgetCard() {
    return (
        <div className="rounded-2xl bg-white wayly-card-shadow p-5" data-testid="hero-budget-card">
            <div className="flex items-center gap-2">
                <img src="/branding/svg/wayly-mark.svg" alt="" className="h-6 w-6" />
                <span className="font-semibold text-[#0E2A47] tracking-tight">wayly</span>
            </div>
            <div className="mt-3">
                <div className="font-heading text-base text-[#0E2A47]">Good morning, Sarah</div>
                <div className="text-xs text-[#4A5A75] mt-0.5">Here's an overview of Mum's Support at Home.</div>
            </div>
            <div className="mt-4 rounded-xl bg-[#F4FAFE] p-4">
                <div className="text-[11px] uppercase tracking-wider text-[#4A5A75]">Budget overview</div>
                <div className="text-xs text-[#4A5A75] mt-2">Total budget</div>
                <div className="flex items-center justify-between mt-1">
                    <div className="font-heading text-xl text-[#0E2A47] tabular-nums">$24,857.10</div>
                    <DonutChart />
                </div>
            </div>
            <div className="mt-4 space-y-2">
                <CategoryBar label="Personal Care" pct={62} colour="#1E7BD9" />
                <CategoryBar label="Domestic Assistance" pct={48} colour="#2BC4D6" />
                <CategoryBar label="Transport" pct={28} colour="#8E7BE8" />
            </div>
        </div>
    );
}

function StatementCard() {
    return (
        <div className="rounded-2xl bg-white wayly-card-shadow p-5" data-testid="hero-statement-card">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-[#0E2A47]">Recent statement</div>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F5648] bg-[#D5F1E9] rounded-full px-2 py-0.5">
                    <CheckCircle2 className="h-3 w-3" /> Reviewed
                </span>
            </div>
            <div className="text-[11px] text-[#4A5A75] mt-1">Services from 1 – 30 Apr 2026</div>
            <div className="mt-3 space-y-2.5 text-[13px]">
                <div className="flex items-center justify-between">
                    <span className="text-[#4A5A75]">Total budget</span>
                    <span className="font-semibold text-[#0E2A47] tabular-nums">$24,857.10</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-[#4A5A75]">Total used</span>
                    <span className="font-semibold text-[#0E2A47] tabular-nums">$12,515.85</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#E2EEF8]">
                    <span className="font-medium text-[#0E2A47]">Remaining</span>
                    <span className="font-bold text-[#0F5648] tabular-nums">$12,341.25</span>
                </div>
            </div>
        </div>
    );
}

function CarePlanCard() {
    return (
        <div className="rounded-2xl bg-white wayly-card-shadow p-4" data-testid="hero-careplan-card">
            <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#8E7BE8]" />
                <div className="text-[12px] font-semibold text-[#0E2A47]">Care plan insights</div>
            </div>
            <div className="mt-2.5 flex items-start gap-1.5">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#8E7BE8]" />
                <div>
                    <div className="text-[12px] font-semibold text-[#0E2A47]">Your plan is on track.</div>
                    <div className="text-[11px] text-[#4A5A75] mt-0.5">You have 49% of your budget remaining.</div>
                </div>
            </div>
        </div>
    );
}

export default function HeroSpotlight() {
    return (
        <section className="relative overflow-hidden wayly-hero-bg" data-testid="hero-spotlight">
            <div className="mx-auto w-full max-w-[1480px] px-6 lg:px-10 pt-10 pb-32 lg:pb-44">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">

                    {/* LANE 1 — copy block (cols 1-5) */}
                    <div className="lg:col-span-5 relative z-10 animate-fade-up self-center">
                        <span className="inline-flex items-center gap-2 rounded-full bg-white border border-[#CFE0F0] px-3 py-1 text-[11px] uppercase tracking-wider text-[#1E7BD9]">
                            For Australian families
                        </span>
                        <h1 className="font-heading mt-6 text-[44px] sm:text-[56px] lg:text-[64px] xl:text-[72px] leading-[1.04] tracking-tight text-[#0E2A47]">
                            Support at Home,<br />finally <span className="wayly-gradient-text">explained.</span>
                        </h1>
                        <p className="mt-6 text-lg text-[#4A5A75] max-w-xl leading-relaxed">
                            Helping Australian families understand aged care funding, statements and care plans.
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                to="/signup"
                                data-testid="hero-cta-primary"
                                className="inline-flex items-center gap-2 rounded-full bg-[#0E2A47] hover:bg-[#091D33] text-white px-6 py-3.5 text-sm font-semibold transition-colors"
                            >
                                Start free trial <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                to="/ai-tools/statement-decoder"
                                data-testid="hero-cta-secondary"
                                className="inline-flex items-center gap-2 rounded-full bg-white text-[#0E2A47] border border-[#CFE0F0] px-6 py-3.5 text-sm font-semibold hover:border-[#2BC4D6] hover:text-[#1E7BD9] transition-colors"
                            >
                                Try the Statement Decoder
                            </Link>
                        </div>

                        {/* Trust pills */}
                        <div className="mt-8 flex flex-wrap gap-3" data-testid="hero-trust-pills">
                            <PillBadge icon={ShieldCheck} label="Australian-hosted" tone="teal" />
                            <PillBadge icon={Lock} label="Privacy-first" tone="cyan" />
                            <PillBadge icon={Users} label="Independent" tone="indigo" />
                            <PillBadge icon={Sparkles} label="AI-powered" tone="lavender" />
                        </div>
                    </div>

                    {/* LANE 2 — three stacked dashboard cards (cols 6-8), no overlap */}
                    <div className="lg:col-span-3 order-3 lg:order-2 flex flex-col justify-center gap-4 lg:gap-5" data-testid="hero-card-stack">
                        <BudgetCard />
                        <StatementCard />
                        <CarePlanCard />
                    </div>

                    {/* LANE 3 — lifestyle photo (cols 9-12) — kept clean, no cards on top */}
                    <div className="lg:col-span-4 order-2 lg:order-3 relative flex">
                        <div className="relative w-full rounded-3xl overflow-hidden wayly-card-shadow min-h-[460px] lg:min-h-[640px]">
                            <picture>
                                <source srcSet="/branding/hero-photo-portrait.webp?v=2" type="image/webp" />
                                <img
                                    src="/branding/hero-photo-portrait.jpg?v=2"
                                    alt="An adult daughter and her mother smile while reviewing the Wayly dashboard on a tablet together."
                                    className="absolute inset-0 w-full h-full object-cover object-center"
                                    loading="eager"
                                    fetchpriority="high"
                                    width="570"
                                    height="773"
                                    data-testid="hero-photo"
                                />
                            </picture>
                            {/* Soft sky gradient at the top edge so the photo blends into the page */}
                            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#EAF4FB]/55 to-transparent pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Wave divider */}
            <div className="absolute inset-x-0 bottom-0 pointer-events-none" aria-hidden>
                <img src="/branding/wayly-wave.svg" alt="" className="w-full block" />
            </div>
        </section>
    );
}
