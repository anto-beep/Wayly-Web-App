import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Check, Minus, ShieldCheck } from "lucide-react";

const TIERS = [
    {
        name: "Free",
        price: "$0",
        period: "forever",
        desc: "2 of 8 AI tools (Statement Decoder + Budget Calculator). 5 uses per month each. Newsletter. Public templates. Glossary.",
        cta: "Get started",
        href: "/signup?plan=free",
        featured: false,
    },
    {
        name: "Solo",
        price: "$19",
        period: "per month",
        desc: "All 8 AI tools, unlimited statement parsing, daily anomaly alerts, 1 caregiver seat. 7-day free trial.",
        cta: "Start free trial",
        href: "/signup?plan=solo",
        featured: false,
    },
    {
        name: "Family",
        price: "$39",
        period: "per month",
        desc: "Everything Solo + up to 5 family seats, Sunday digest emails, decision log, role-based permissions, advisor read-only sharing.",
        cta: "Start free trial",
        href: "/signup?plan=family",
        featured: true,
        badge: "Most popular",
    },
];

const ADVISOR = [
    {
        name: "Advisor",
        price: "$299",
        period: "per month",
        desc: "Up to 50 clients. Lifetime-cap tracker, forecasting, review-pack export, email + priority support.",
        cta: "Book a demo",
    },
    {
        name: "Advisor Pro",
        price: "$999",
        period: "per month",
        desc: "Up to 200 clients. White-label, custom domain, multi-advisor team, dedicated CS manager, API access.",
        cta: "Book a demo",
    },
];

const FEATURE_ROWS = [
    { feature: "Public AI tools", values: ["2 of 8", "All 8", "All 8"] },
    { feature: "Statement parsing", values: ["5/mo", "Unlimited", "Unlimited"] },
    { feature: "Anomaly alerts", values: [false, true, true] },
    { feature: "Quarterly budget tracking", values: [false, true, true] },
    { feature: "Lifetime cap tracking", values: [false, true, true] },
    { feature: "AI chat", values: ["Limited", true, true] },
    { feature: "Family seats", values: ["—", "1", "Up to 5"] },
    { feature: "Sunday digest emails", values: [false, false, true] },
    { feature: "Decision log", values: [false, false, true] },
    { feature: "Audit log (immutable)", values: [false, true, true] },
    { feature: "Advisor / GP read-only sharing", values: [false, false, true] },
    { feature: "Role-based permissions", values: [false, false, true] },
    { feature: "Voice for participant", values: [false, true, true] },
    { feature: "Australian-hosted, encrypted", values: [true, true, true] },
    { feature: "Priority support", values: [false, false, true] },
];

const FAQ = [
    { q: "What counts as one household?", a: "One participant + their family. Two parents both on Support at Home = two households (we offer 30% off the second)." },
    { q: "Free vs Solo — what's the real difference?", a: "Free = 2 public AI tools, occasional use. Solo = all 8 tools + Kindred actively watches your statements, budget, and care every day and alerts you when something needs attention." },
    { q: "Why is Family $39 if Solo is $19?", a: "Family adds: up to 5 seats, role permissions, Sunday digest, decision log, advisor read-only sharing. Most households use Family." },
    { q: "Pensioner discount?", a: "Yes — 50% off Solo and Family with verified full-pension status." },
    { q: "Can I deduct Kindred from my parent's Support at Home funding?", a: "No — Kindred is software for the family, not a Support at Home service. Paid by the family directly." },
    { q: "Refund policy?", a: "30-day full refund, no questions." },
    { q: "What happens if my parent moves to residential care?", a: "We pause billing immediately and give you a transition guide." },
    { q: "Free trial?", a: "Yes — 7 days on Solo or Family, no card needed." },
];

function Cell({ v }) {
    if (v === true) return <Check className="h-4 w-4 text-sage mx-auto" />;
    if (v === false) return <Minus className="h-4 w-4 text-muted-k mx-auto" />;
    return <span className="text-sm text-primary-k">{v}</span>;
}

export default function Pricing() {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />

            <section className="mx-auto max-w-7xl px-6 pt-12 pb-8 text-center">
                <span className="overline">Pricing</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4">Choose how Kindred helps your family.</h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl mx-auto leading-relaxed">
                    No card required for the trial. Cancel anytime. Pensioner discount available. Australian-hosted, never sells your data, never accepts commissions from providers.
                </p>
            </section>

            {/* CONSUMER TIERS */}
            <section className="mx-auto max-w-7xl px-6 pb-12">
                <div className="grid sm:grid-cols-3 gap-5" data-testid="pricing-tiers">
                    {TIERS.map((t) => (
                        <div
                            key={t.name}
                            data-testid={`pricing-tier-${t.name.toLowerCase()}`}
                            className={`rounded-2xl p-6 border flex flex-col transition-all ${
                                t.featured ? "bg-primary-k text-white border-primary-k -translate-y-1 shadow-lg" : "bg-surface border-kindred hover:-translate-y-1 hover:shadow-md"
                            }`}
                        >
                            {t.badge && (
                                <span className="self-start bg-gold text-primary-k text-xs font-medium uppercase tracking-wider px-2 py-1 rounded-full mb-3">
                                    {t.badge}
                                </span>
                            )}
                            <div className={`text-xs uppercase tracking-wider ${t.featured ? "text-white/70" : "text-muted-k"}`}>{t.name}</div>
                            <div className={`mt-2 font-heading text-5xl ${t.featured ? "text-white" : "text-primary-k"} tabular-nums`}>{t.price}</div>
                            <div className={`text-sm ${t.featured ? "text-white/70" : "text-muted-k"}`}>{t.period}</div>
                            <p className={`mt-4 text-sm leading-relaxed ${t.featured ? "text-white/85" : "text-muted-k"}`}>{t.desc}</p>
                            <Link
                                to={t.href}
                                data-testid={`pricing-cta-${t.name.toLowerCase()}`}
                                className={`mt-6 text-center rounded-full py-2.5 text-sm font-medium transition-colors ${
                                    t.featured ? "bg-gold text-primary-k hover:bg-[#c8973f]" : "bg-primary-k text-white hover:bg-[#16294a]"
                                }`}
                            >
                                {t.cta}
                            </Link>
                        </div>
                    ))}
                </div>
            </section>

            {/* ADVISOR TIERS */}
            <section className="mx-auto max-w-7xl px-6 py-12 border-t border-kindred">
                <span className="overline">For financial advisors</span>
                <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 tracking-tight">Make aged-care planning a profit centre.</h2>
                <div className="mt-8 grid sm:grid-cols-2 gap-5 max-w-4xl">
                    {ADVISOR.map((t) => (
                        <div key={t.name} className="rounded-2xl p-6 border bg-surface border-kindred" data-testid={`advisor-tier-${t.name.toLowerCase().replace(/\s/g, "-")}`}>
                            <div className="text-xs uppercase tracking-wider text-muted-k">{t.name}</div>
                            <div className="mt-2 font-heading text-4xl text-primary-k tabular-nums">{t.price}</div>
                            <div className="text-sm text-muted-k">{t.period}</div>
                            <p className="mt-4 text-sm text-muted-k leading-relaxed">{t.desc}</p>
                            <Link to="/for-advisors" className="mt-6 inline-block text-center rounded-full py-2.5 px-5 text-sm font-medium bg-primary-k text-white hover:bg-[#16294a]">
                                {t.cta}
                            </Link>
                        </div>
                    ))}
                </div>
            </section>

            {/* COMPARISON TABLE */}
            <section className="mx-auto max-w-7xl px-6 py-12 border-t border-kindred">
                <span className="overline">Full feature comparison</span>
                <h2 className="font-heading text-3xl text-primary-k mt-3 tracking-tight">What you get at every tier</h2>
                <div className="mt-8 overflow-x-auto bg-surface border border-kindred rounded-xl">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 text-muted-k">
                            <tr>
                                <th className="text-left px-5 py-3 font-medium">Feature</th>
                                {TIERS.map((t) => (
                                    <th key={t.name} className="px-4 py-3 text-center font-medium">{t.name}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {FEATURE_ROWS.map((row, i) => (
                                <tr key={i} className="border-t border-kindred">
                                    <td className="px-5 py-3 text-primary-k">{row.feature}</td>
                                    {row.values.map((v, j) => (
                                        <td key={j} className="px-4 py-3 text-center"><Cell v={v} /></td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* PENSIONER NOTE */}
            <section className="mx-auto max-w-7xl px-6 py-8">
                <div className="bg-surface-2 border border-kindred rounded-xl p-5 flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-sage mt-0.5 flex-shrink-0" />
                    <div>
                        <div className="font-medium text-primary-k">Pensioner discount — 50% off Solo and Family</div>
                        <div className="text-sm text-muted-k mt-1">Verified by uploading a screenshot of your Centrelink pension card. We confirm and delete the image; we never retain it.</div>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="mx-auto max-w-4xl px-6 py-12">
                <span className="overline">Pricing FAQ</span>
                <h2 className="font-heading text-3xl text-primary-k mt-3 tracking-tight">Things people ask before signing up</h2>
                <div className="mt-6 space-y-3" data-testid="pricing-faq">
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

            <section className="bg-primary-k">
                <div className="mx-auto max-w-4xl px-6 py-16 text-center">
                    <h2 className="font-heading text-4xl sm:text-5xl text-white tracking-tight">Start free — no card, no commitment.</h2>
                    <Link to="/signup" className="mt-8 inline-block bg-gold text-primary-k font-medium rounded-full px-6 py-3 hover:bg-[#c8973f]">
                        Create your account
                    </Link>
                </div>
            </section>

            <Footer />
        </div>
    );
}
