/**
 * Pricing page — Batch 3 update.
 *
 * 4 plan cards (Free / Solo / Family / Adviser), add-on explanation, full
 * comparison table grouped by section, FAQ with JSON-LD.
 */
import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Check, Minus, Crown, Plus, Users, ArrowDown } from "lucide-react";
import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
import { track } from "@/lib/analytics";

const TIERS = [
    {
        key: "free",
        name: "Free",
        price: "$0",
        cta: "Get started free",
        href: "/signup?plan=free",
        highlights: [
            "1 Statement Decoder use per calendar month",
            "1 participant",
            "Australian-hosted, fully secure",
            "Upgrade anytime",
        ],
    },
    {
        key: "solo",
        name: "Solo",
        price: "$19",
        cta: "Start 7-day free trial",
        href: "/signup?plan=solo",
        highlights: [
            "Unlimited Statement Decoder",
            "All 9 AI tools",
            "1 participant · 1 caregiver seat",
            "Document vault + budget tracking",
        ],
    },
    {
        key: "family",
        name: "Family",
        price: "$39",
        cta: "Start 7-day free trial",
        href: "/signup?plan=family",
        featured: true,
        badge: "Most popular",
        highlights: [
            "2 participants included",
            "3 caregiver seats",
            "All AI tools + extended features",
            "$19/month each for extras",
        ],
    },
    {
        key: "adviser",
        name: "Adviser",
        price: "$299",
        cta: "Contact us",
        href: "/contact?intent=adviser",
        highlights: [
            "Up to 20 client households",
            "3 caregiver seats",
            "Scenario modeller + branded PDFs",
            "Priority support + offline mode",
        ],
    },
];

const SECTIONS = [
    {
        label: "Statement Decoder",
        rows: [
            ["Statement Decoder", "1 per month", "Unlimited", "Unlimited", "Unlimited"],
            ["PDF, photo, DOCX, TXT formats", true, true, true, true],
            ["Anomaly detection (15 rules)", "✓ on free decode", true, true, true],
            ["Save decoded results to vault", false, true, true, true],
            ["Share decoded results with family", false, true, true, true],
            ["Hospitalisation charge detection", "✓ on free decode", true, true, true],
        ],
    },
    {
        label: "AI Tools",
        rows: [
            ["Budget Calculator", false, true, true, true],
            ["Provider Price Checker", false, true, true, true],
            ["Classification Self-Check", false, true, true, true],
            ["Reassessment Letter Generator", false, true, true, true],
            ["Contribution Estimator", false, true, true, true],
            ["Care Plan Reviewer", false, true, true, true],
            ["Aged Care Q&A", false, true, true, true],
            ["Care Plan Amendment Generator", false, true, true, true],
            ["Ask Wayly (AI chat)", false, true, true, true],
        ],
    },
    {
        label: "Participants & Caregivers",
        rows: [
            ["Participants included", "1", "1", "2", "Up to 20 clients"],
            ["Additional participants", "—", "Upgrade to Family", "+$19/month each", "+$19/month each"],
            ["Caregiver seats", "1", "1", "3", "3"],
        ],
    },
    {
        label: "Document Vault",
        rows: [
            ["Document vault", false, true, true, true],
            ["9 document categories", false, true, true, true],
            ["Version history", false, true, true, true],
            ["Encrypted storage (AWS Sydney)", false, true, true, true],
            ["Statement email forwarding", false, true, true, true],
        ],
    },
    {
        label: "Tracking & Management",
        rows: [
            ["Concern and conversation log", false, true, true, true],
            ["Care team directory", false, true, true, true],
            ["Visit and appointment calendar", false, true, true, true],
            ["AT-HM commitment tracker", false, true, true, true],
            ["Correspondence tracker", false, true, true, true],
            ["Hospital liaison mode", false, true, true, true],
            ["Provider switching workflow", false, true, true, true],
        ],
    },
    {
        label: "Alerts & Notifications",
        rows: [
            ["Budget threshold alerts", false, "Email only", "Push + email", true],
            ["SMS and WhatsApp alerts", false, true, true, true],
            ["AT-HM expiry reminders", false, true, true, true],
            ["Statement arrival alerts", false, true, true, true],
        ],
    },
    {
        label: "Reports",
        rows: [
            ["Quarterly summary reports", false, true, true, true],
            ["Annual financial year summaries", false, true, true, true],
            ["Adviser-branded PDF reports", false, false, false, true],
        ],
    },
    {
        label: "Family & Participant Features",
        rows: [
            ["Family message wall (photos + voice)", false, true, true, false],
            ["Participant view (simplified UI)", false, true, true, false],
            ["Voice input for participants", false, true, true, false],
            ["Referral program (14-day extended trial)", "As referrer", true, true, false],
            ["Offline mode (mobile)", false, true, true, true],
        ],
    },
    {
        label: "Adviser Tools",
        rows: [
            ["Multi-household adviser dashboard", false, false, false, true],
            ["Scenario modeller (means test)", false, false, false, true],
            ["Client-branded PDF reports", false, false, false, true],
            ["Read-only client household access", false, false, false, true],
        ],
    },
    {
        label: "Security & Privacy",
        rows: [
            ["Australian data hosting (AWS Sydney)", true, true, true, true],
            ["AES-256 encryption at rest", true, true, true, true],
            ["In-app account & data deletion", true, true, true, true],
            ["Privacy Act 1988 compliant", true, true, true, true],
        ],
    },
    {
        label: "Support",
        rows: [
            ["Help centre access", true, true, true, true],
            ["Email support", false, true, true, "Priority"],
            ["Priority support", false, false, true, true],
        ],
    },
];

const FAQS = [
    { q: "What is the difference between a participant and a caregiver?",
      a: "A participant is the person receiving Support at Home — the older person whose statements, budget and care are being managed. A caregiver is a family member or support person who uses Wayly to help manage the participant's care. Caregiver seats control who can log in and access the account." },
    { q: "Can I add more than 2 participants?",
      a: "Yes. The Family plan covers 2 participants. For each additional participant, you pay $19/month. They are added to your existing account and managed from the same dashboard — no new logins needed." },
    { q: "What happens to my data if I remove a participant?",
      a: "Their data is retained in your account for 60 days after removal. During this period you can export everything as a PDF, or permanently delete it immediately. After 60 days, data is automatically and permanently deleted." },
    { q: "If I remove a participant mid-month, do I get a refund?",
      a: "No. Participant add-on subscriptions cancel at the end of the current billing period. You will not be charged from the following month." },
    { q: "Can I downgrade from Family to Solo?",
      a: "Yes. If you remove your second participant, you'll be offered the option to downgrade. The downgrade takes effect at the end of your current billing period. Note that Solo includes 1 caregiver seat — if you have additional caregivers on your Family plan, you'll need to remove them before downgrading." },
    { q: "Does the free plan include any AI tools?",
      a: "The free plan includes 1 Statement Decoder use per calendar month. All other AI tools are available on paid plans only." },
    { q: "Can I use the Statement Decoder without creating an account?",
      a: "Yes. You can decode one statement per month without creating an account. The result is shown in full. Features that save or track your results require an account." },
    { q: "How does the free Statement Decoder gate actually work?",
      a: "Without an account, we use a server-side browser fingerprint (IP + user agent + accept-language) to count one decode per calendar month. With an account, the count is tied to your user ID. The counter resets on the 1st of every month." },
    { q: "What happens if my payment fails?",
      a: "We retry your payment for a few days and email you immediately. Your account stays active during the retry window. If the payment still hasn't gone through after the grace period, the plan moves to PAST_DUE and read-only access continues for 7 days so you don't lose data while you sort it out." },
];

function Cell({ v }) {
    if (v === true) return <Check className="h-4 w-4 text-sage mx-auto" aria-label="Yes" />;
    if (v === false) return <Minus className="h-4 w-4 text-muted-k mx-auto" aria-label="—" />;
    return <span className="text-xs text-primary-k">{v}</span>;
}

export default function Pricing() {
    const faqJsonLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
    };
    // Product + Offer schema for each paid tier. Free omitted from Offer list
    // (schema.org Offer expects a real transaction value) but is described in
    // the product description below. Adviser Pro is not in the public TIERS
    // array — only the four published plans are emitted.
    const productJsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Wayly",
        description: "AI assistant for Australian families navigating Support at Home. Decode statements, check classifications, plan budgets and coordinate family carers.",
        brand: { "@type": "Brand", name: "Wayly" },
        offers: [
            { "@type": "Offer", name: "Free", price: "0", priceCurrency: "AUD", availability: "https://schema.org/InStock", url: "https://wayly.com.au/pricing", description: "One Statement Decoder use per calendar month, one participant." },
            { "@type": "Offer", name: "Solo", price: "19", priceCurrency: "AUD", priceSpecification: { "@type": "UnitPriceSpecification", price: "19", priceCurrency: "AUD", unitText: "MONTH" }, availability: "https://schema.org/InStock", url: "https://wayly.com.au/pricing", description: "All eight AI tools, unlimited Statement Decoder, one participant. 7-day free trial." },
            { "@type": "Offer", name: "Family", price: "39", priceCurrency: "AUD", priceSpecification: { "@type": "UnitPriceSpecification", price: "39", priceCurrency: "AUD", unitText: "MONTH" }, availability: "https://schema.org/InStock", url: "https://wayly.com.au/pricing", description: "Up to four participants, family thread, weekly digest, audit log, household coordination." },
            { "@type": "Offer", name: "Adviser", price: "299", priceCurrency: "AUD", priceSpecification: { "@type": "UnitPriceSpecification", price: "299", priceCurrency: "AUD", unitText: "MONTH" }, availability: "https://schema.org/InStock", url: "https://wayly.com.au/pricing", description: "For aged-care specialist advisers. Client export, audit trail, branded reports." },
        ],
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.pricing} jsonLd={[faqJsonLd, productJsonLd]} />
            <MarketingHeader />
            <section className="mx-auto max-w-6xl px-6 pt-16 pb-10 text-center">
                <span className="overline">Pricing</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">
                    Simple, honest pricing.<br />Start free.
                </h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl mx-auto">
                    All prices in AUD inc. GST. Cancel anytime. 7-day free trial on Solo & Family — no card required.
                </p>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-12" data-testid="pricing-cards">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {TIERS.map((t) => (
                        <div key={t.key} className={`relative rounded-2xl border p-6 ${t.featured ? "bg-primary-k text-white border-gold shadow-xl" : "bg-surface border-kindred"}`} data-testid={`tier-${t.key}`}>
                            {t.badge && (
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-white text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold">
                                    {t.badge}
                                </span>
                            )}
                            <h2 className={`font-heading text-2xl ${t.featured ? "text-white" : "text-primary-k"}`}>{t.name}</h2>
                            <div className="mt-3 flex items-baseline gap-1">
                                <span className="font-heading text-4xl">{t.price}</span>
                                <span className={`text-sm ${t.featured ? "text-white/70" : "text-muted-k"}`}>/month</span>
                            </div>
                            <p className={`text-[11px] mt-1 ${t.featured ? "text-white/60" : "text-muted-k"}`}>Billed monthly · Cancel anytime · AUD inc. GST</p>
                            <ul className="mt-4 space-y-2 text-sm">
                                {t.highlights.map((h) => (
                                    <li key={h} className="flex gap-2"><Check className={`h-4 w-4 mt-0.5 flex-none ${t.featured ? "text-gold" : "text-sage"}`} />{h}</li>
                                ))}
                            </ul>
                            <Link to={t.href} data-testid={`tier-cta-${t.key}`} onClick={() => track.upgradeClick({ plan: t.key, location: "pricing" })} className={`mt-5 block text-center rounded-full px-4 py-2.5 text-sm font-semibold ${t.featured ? "bg-gold text-white hover:brightness-95" : "bg-primary-k text-white hover:bg-[#091D33]"}`}>
                                {t.cta}
                            </Link>
                        </div>
                    ))}
                </div>

                <div className="mt-4 text-center text-xs text-muted-k">
                    Need more than 2 participants? <a href="#addons" className="underline text-primary-k">Add additional participants at $19/month each</a>
                </div>
            </section>

            {/* Add-on explainer */}
            <section id="addons" className="mx-auto max-w-6xl px-6 py-12 border-y border-kindred bg-surface" data-testid="addons-section">
                <h2 className="font-heading text-2xl text-primary-k">Managing more than 2 participants?</h2>
                <p className="text-sm text-muted-k mt-2">Add as many as you need at $19/month each.</p>
                <div className="grid sm:grid-cols-3 gap-5 mt-6 text-sm">
                    {[
                        { icon: Plus, title: "Add from your account settings", body: "No new logins needed. Manage everyone from one dashboard." },
                        { icon: Crown, title: "Billed separately, cancel independently", body: "Each add-on is its own subscription. No lock-in." },
                        { icon: Users, title: "Shared caregiver seats & features", body: "All participants share the same 3 Family seats and the full feature set." },
                    ].map((c) => (
                        <div key={c.title} className="flex gap-3">
                            <div className="h-9 w-9 flex-none rounded-full bg-gold/15 text-gold flex items-center justify-center"><c.icon className="h-4 w-4" /></div>
                            <div>
                                <div className="font-medium text-primary-k">{c.title}</div>
                                <div className="text-muted-k text-xs mt-0.5">{c.body}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Feature comparison */}
            <section className="mx-auto max-w-6xl px-6 py-16" data-testid="pricing-table">
                <h2 className="font-heading text-3xl text-primary-k">Full feature comparison</h2>
                <p className="text-sm text-muted-k mt-1 mb-6">Every feature, mapped to every plan.</p>
                <div className="overflow-x-auto rounded-2xl border border-kindred bg-surface">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 sticky top-0">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-primary-k">Feature</th>
                                {["Free", "Solo", "Family", "Adviser"].map((h) => (
                                    <th key={h} className="px-3 py-3 text-center font-medium text-primary-k">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {SECTIONS.map((s) => (
                                <React.Fragment key={s.label}>
                                    <tr className="bg-primary-k/5">
                                        <td colSpan={5} className="px-4 py-2 text-[11px] uppercase tracking-wider text-primary-k font-semibold">{s.label}</td>
                                    </tr>
                                    {s.rows.map(([label, ...vals], idx) => (
                                        <tr key={`${s.label}-${idx}`} className="border-t border-kindred">
                                            <td className="px-4 py-2.5 text-primary-k">{label}</td>
                                            {vals.map((v, i) => (
                                                <td key={i} className="px-3 py-2.5 text-center">
                                                    <Cell v={v} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-muted-k mt-4 leading-relaxed">
                    All prices in AUD including GST. 7-day free trial on Solo and Family plans — no card required.
                    14-day free trial with a referral code. Cancel anytime; cancellations take effect at the end of
                    the current billing period. Additional participants on the Family plan: $19/month each, billed separately,
                    cancel independently.
                </p>
            </section>

            {/* FAQs */}
            <section className="mx-auto max-w-3xl px-6 pb-20" data-testid="pricing-faqs">
                <h2 className="font-heading text-3xl text-primary-k">Pricing questions</h2>
                <div className="mt-6 space-y-3">
                    {FAQS.map((f, i) => (
                        <details key={i} className="bg-surface border border-kindred rounded-xl p-4" data-testid={`faq-${i}`}>
                            <summary className="font-medium text-primary-k cursor-pointer">{f.q}</summary>
                            <p className="text-sm text-muted-k mt-2 leading-relaxed">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            <Footer />
        </div>
    );
}
