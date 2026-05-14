import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Check, Minus, ShieldCheck } from "lucide-react";
import { BrowserFrame, PhoneFrame, ScreenshotDashboard, ScreenshotParticipant, ScreenshotFamilyThread } from "@/components/Screenshots";

import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
const TIERS = [
    {
        name: "Free",
        price: "$0",
        period: "forever",
        desc: "Statement Decoder — 1 use per day, no signup. Newsletter. Public templates. Glossary.",
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
        name: "Adviser",
        price: "$299",
        period: "per month",
        desc: "Up to 25 clients. Lifetime-cap tracker, forecasting, review-pack export, email + priority support. 7-day free trial.",
        cta: "Start free trial",
        href: "/signup?plan=adviser",
    },
    {
        name: "Adviser Pro",
        price: "$999",
        period: "per month",
        desc: "Up to 200 clients. White-label, custom domain, multi-adviser team, dedicated CS manager, API access.",
        cta: "Book a demo",
        href: "/for-advisors",
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
    { q: "Free vs Solo — what's the real difference?", a: "Free = 2 public AI tools, occasional use. Solo = all 8 tools + Wayly actively watches your statements, budget, and care every day and alerts you when something needs attention." },
    { q: "Why is Family $39 if Solo is $19?", a: "Family adds: up to 5 seats, role permissions, Sunday digest, decision log, advisor read-only sharing. Most households use Family." },
    { q: "Pensioner discount?", a: "Yes — 50% off Solo and Family with verified full-pension status." },
    { q: "Can I deduct Wayly from my parent's Support at Home funding?", a: "No — Wayly is software for the family, not a Support at Home service. Paid by the family directly." },
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
            <SeoHead {...SEO.pricing} />
            <MarketingHeader />

            <section className="mx-auto max-w-7xl px-6 pt-12 pb-8 text-center">
                <span className="overline">Pricing</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4">Choose how Wayly helps your family.</h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl mx-auto leading-relaxed">
                    No card required for the trial. Cancel anytime. Pensioner discount available. Australian-hosted, never sells your data, never accepts commissions from providers.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5" data-testid="pricing-payment-methods">
                    <span className="text-xs uppercase tracking-wider text-muted-k font-medium">Pay with</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-3 py-1 text-xs font-medium text-primary-k" data-testid="pay-method-card">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/></svg>
                        Card
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-3 py-1 text-xs font-medium text-primary-k" data-testid="pay-method-applepay">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.05 12.04c-.03-2.92 2.38-4.32 2.49-4.39-1.36-1.99-3.48-2.27-4.23-2.3-1.8-.18-3.51 1.06-4.42 1.06-.92 0-2.32-1.04-3.82-1.01-1.96.03-3.78 1.14-4.79 2.89-2.05 3.55-.52 8.81 1.47 11.69.97 1.41 2.13 2.99 3.65 2.94 1.47-.06 2.02-.95 3.79-.95 1.77 0 2.27.95 3.82.92 1.58-.03 2.58-1.43 3.54-2.85 1.12-1.63 1.58-3.22 1.61-3.31-.04-.02-3.09-1.19-3.12-4.69zM14.16 3.42c.81-.98 1.36-2.34 1.21-3.7-1.17.05-2.59.78-3.43 1.76-.75.87-1.4 2.27-1.22 3.6 1.3.1 2.63-.66 3.44-1.66z"/></svg>
                        Apple Pay
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-3 py-1 text-xs font-medium text-primary-k" data-testid="pay-method-googlepay">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 11.05v2.1h5.06c-.22 1.22-.91 2.27-1.94 2.97v2.46h3.13C20.07 16.95 21 14.7 21 12c0-.6-.05-1.18-.16-1.74H12v.79zm0 9.95c2.43 0 4.47-.81 5.96-2.18l-2.9-2.25c-.81.55-1.85.88-3.06.88-2.36 0-4.36-1.59-5.07-3.73H3.93v2.34A8.99 8.99 0 0 0 12 21z"/></svg>
                        Google Pay
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-3 py-1 text-xs font-medium text-primary-k" data-testid="pay-method-paypal">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7.5 22h-3l1.4-9h3.6c2.6 0 4.3-.8 5.2-2.4.4-.7.6-1.4.6-2.1 0-.5-.1-1-.3-1.4.4.2.7.5 1 .8.6.8.9 1.8.8 3-.2 2-1.2 3.5-2.9 4.4-1.5.7-3.4.8-5.1.7zM18.2 5.4c-.2-.3-.5-.5-.8-.7-1-.6-2.4-.7-4.1-.7H8.5c-.4 0-.7.3-.8.7l-2 12.7c-.1.3.2.6.5.6h3.4l.9-5.6h2.3c4.2 0 6.6-2 7.2-5.5.2-.5.2-1 .2-1.5z"/></svg>
                        PayPal
                    </span>
                </div>
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
                            <Link to={t.href} className="mt-6 inline-block text-center rounded-full py-2.5 px-5 text-sm font-medium bg-primary-k text-white hover:bg-[#16294a]">
                                {t.cta}
                            </Link>
                        </div>
                    ))}
                </div>
            </section>

            {/* DEVICES STRIP — built for the whole family */}
            <section className="mx-auto max-w-7xl px-6 py-12" data-testid="pricing-devices-strip">
                <div className="text-center max-w-2xl mx-auto">
                    <h3 className="font-heading text-2xl text-primary-k tracking-tight">Built for the whole family.</h3>
                    <p className="text-sm text-muted-k mt-2">Same data. Three views — calibrated for the person using each one.</p>
                </div>
                <div className="mt-10 hidden md:flex items-end justify-center gap-6 overflow-x-auto">
                    <div className="text-center">
                        <PhoneFrame scale={0.5} label="Participant view on iPhone — Dorothy's screen">
                            <ScreenshotParticipant />
                        </PhoneFrame>
                        <div className="mt-3 text-xs text-muted-k">Simple view for Mum</div>
                    </div>
                    <div className="text-center">
                        <BrowserFrame url="app.wayly.com.au/dashboard" scale={0.55} label="Caregiver dashboard on MacBook">
                            <ScreenshotDashboard />
                        </BrowserFrame>
                        <div className="mt-3 text-xs text-muted-k">Full dashboard for you</div>
                    </div>
                    <div className="text-center">
                        <PhoneFrame scale={0.5} label="Family thread chat on iPhone">
                            <ScreenshotFamilyThread />
                        </PhoneFrame>
                        <div className="mt-3 text-xs text-muted-k">Family in the loop</div>
                    </div>
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
