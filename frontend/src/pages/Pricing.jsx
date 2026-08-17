/**
 * Pricing page, Batch 3 update.
 *
 * 4 plan cards (Free / Solo / Family / Adviser), add-on explanation, full
 * comparison table grouped by section, FAQ with JSON-LD.
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Check, Minus, Crown, Plus, Users, ArrowDown, Loader2 } from "lucide-react";
import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
import { track } from "@/lib/analytics";
import { TOOL_COUNT } from "@/config/toolRegistry";
import INDEX1 from "@/data/index1";
import Reveal from "@/components/Reveal";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const TIERS = [
    {
        key: "solo",
        name: "Solo",
        price: "$24.50",
        cadence: "per fortnight",
        tagline: "For the family member handling things alone.",
        cta: "Get started",
        href: "/signup?plan=solo",
        highlights: [
            "All nine Wayly tools",
            "Statement Decoder for monthly statements",
            "Invoice Checker for contribution invoices",
            "Budget Calculator with forecast alerts",
            "Care Plan Reviewer with meeting artefacts",
            "Classification Self-Check and Reassessment Letter Generator",
            "Ask Wayly conversational assistant",
            "Data stays in Australia",
        ],
    },
    {
        key: "family",
        name: "Family",
        price: "$49.50",
        cadence: "per fortnight",
        tagline: "For families sharing the load.",
        cta: "Get started",
        href: "/signup?plan=family",
        featured: true,
        badge: "Recommended",
        reasonToChoose: "Best if more than one person helps with the care.",
        highlights: [
            "Everything in Solo",
            "Two full participants: shared care plan, statements, invoices, decisions",
            "Three caregiver seats with read-only access for paid or informal carers",
            "Family Coordinator with notification routing",
            "One document upload, everyone sees the findings",
            "Meeting artefacts shareable across the household",
            "Additional participants at $24.50 per fortnight each",
        ],
    },
];

const SECTIONS = [
    {
        label: "Statement Decoder",
        rows: [
            ["Statement Decoder", "Unlimited", "Unlimited", "Unlimited"],
            ["PDF, photo, DOCX, TXT formats", true, true, true],
            ["Anomaly detection (15 rules)", true, true, true],
            ["Save decoded results to vault", true, true, true],
            ["Share decoded results with family", true, true, true],
            ["Hospitalisation charge detection", true, true, true],
        ],
    },
    {
        label: "AI Tools",
        rows: [
            ["Statement Decoder", true, true, true],
            ["Invoice Checker", true, true, true],
            ["Budget Calculator", true, true, true],
            ["Provider Price Checker", true, true, true],
            ["Classification Self-Check", true, true, true],
            ["Letters & Follow-ups", true, true, true],
            ["Contribution Estimator", true, true, true],
            ["Support Plan Reviewer", true, true, true],
            ["Aged Care Q&A", true, true, true],
            ["Care Plan Amendment Generator", false, true, true],
            ["Ask Wayly (AI chat)", true, true, true],
        ],
    },
    {
        label: "Participants & Caregivers",
        rows: [
            ["Participants included", "1", "2", "Up to 20 clients"],
            ["Additional participants", "Upgrade to Family", "+$24.50 per fortnight each", "+$24.50 per fortnight each"],
            ["Caregiver seats", "1", "3", "3"],
        ],
    },
    {
        label: "Document Vault",
        rows: [
            ["Document vault", true, true, true],
            ["9 document categories", true, true, true],
            ["Version history", true, true, true],
            ["Encrypted storage (AWS Sydney)", true, true, true],
            ["Statement email forwarding", true, true, true],
        ],
    },
    {
        label: "Tracking & Management",
        rows: [
            ["Concern and conversation log", true, true, true],
            ["Care team directory", true, true, true],
            ["Visit and appointment calendar", true, true, true],
            ["AT-HM commitment tracker", true, true, true],
            ["Correspondence tracker", true, true, true],
            ["Hospital liaison mode", true, true, true],
            ["Provider switching workflow", true, true, true],
        ],
    },
    {
        label: "Alerts & Notifications",
        rows: [
            ["Budget threshold alerts", "Email only", "Push + email", true],
            ["SMS and WhatsApp alerts", true, true, true],
            ["AT-HM expiry reminders", true, true, true],
            ["Statement arrival alerts", true, true, true],
        ],
    },
    {
        label: "Reports",
        rows: [
            ["Quarterly summary reports", true, true, true],
            ["Annual financial year summaries", true, true, true],
            ["Adviser-branded PDF reports", false, false, false],
        ],
    },
    {
        label: "Family & Participant Features",
        rows: [
            ["Family message wall (photos + voice)", true, true, false],
            ["Participant view (simplified UI)", true, true, false],
            ["Voice input for participants", true, true, false],
            ["Referral program (14-day extended trial)", true, true, false],
            ["Offline mode (mobile)", true, true, true],
        ],
    },
    {
        label: "Support",
        rows: [
            ["Help centre access", true, true, true],
            ["Email support", true, true, "Priority"],
            ["Priority support", false, true, true],
        ],
    },
];

const FAQS = [
    { q: "What is the difference between a participant and a caregiver?",
      a: "A participant is the person receiving Support at Home, the older person whose statements, budget and care are being managed. A caregiver is a family member or support person who uses Wayly to help manage the participant's care. Caregiver seats control who can log in and access the account." },
    { q: "Can I add more than 2 participants?",
      a: "Yes. The Family plan includes 2 participants. For each additional participant, you pay $24.50 per fortnight. They are added to your existing account and managed from the same dashboard, no new logins needed. There is no cap." },
    { q: "What happens to my data if I remove a participant?",
      a: "Their data is retained in your account for 60 days after removal. During this period you can export everything as a PDF, or permanently delete it immediately. After 60 days, data is automatically and permanently deleted." },
    { q: "If I remove a participant, do I get a refund?",
      a: "No. Removals take effect at the end of your current fortnightly billing period. You keep full access until then, so nobody loses features mid-cycle. Your next charge simply drops by $24.50 per participant removed." },
    { q: "Can I downgrade from Family to Solo?",
      a: "Yes. If you have exactly one participant on Family, you can switch to Solo directly from Settings and the change takes effect at the end of your current fortnight. If you have two or more participants, remove the extras first, then the switch to Solo becomes available (or we'll automatically move you to Solo when your participant count drops to one)." },
    { q: "What happens if my payment fails?",
      a: "We retry your payment for a few days and email you immediately. Your account stays active during the retry window. If the payment still hasn't gone through after the grace period, the plan moves to PAST_DUE and read-only access continues for 7 days so you don't lose data while you sort it out." },
];

function Cell({ v }) {
    if (v === true) return <Check className="h-4 w-4 text-sage mx-auto" aria-label="Yes" />;
    if (v === false) return <Minus className="h-4 w-4 text-muted-k mx-auto" aria-label=", " />;
    return <span className="text-xs text-primary-k">{v}</span>;
}

export default function Pricing() {
    const { user } = useAuth();
    const [loadingPlan, setLoadingPlan] = useState(null);

    // For logged-in users we jump straight to a Stripe subscription
    // Checkout Session. For guests we still route through /signup which
    // captures the plan and re-triggers checkout after account creation.
    const startCheckout = async (planKey, tierHref) => {
        if (!user) {
            window.location.href = tierHref;
            return;
        }
        if (planKey === "adviser") {
            window.location.href = "/contact?intent=adviser";
            return;
        }
        setLoadingPlan(planKey);
        try {
            const { data } = await api.post("/payments/checkout", {
                plan: planKey,
                origin_url: window.location.origin,
                trial_days: 7,
            });
            if (data?.url) {
                window.location.href = data.url;
            } else {
                toast.error("Could not start checkout. Please try again.");
            }
        } catch (e) {
            const msg = e?.response?.data?.detail || "Could not start checkout. Please try again.";
            toast.error(typeof msg === "string" ? msg : "Could not start checkout.");
        } finally {
            setLoadingPlan(null);
        }
    };
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
    // array, only the four published plans are emitted.
    //
    // Wayly is a SaaS subscription (digital, no physical shipping), so every
    // Offer carries:
    //   - `shippingDetails` declaring zero-cost, zero-delay digital delivery
    //   - `hasMerchantReturnPolicy` set to MerchantReturnNotPermitted with a
    //     human-readable description of "cancel anytime, no refund after billing"
    // This silences GSC's "Missing field 'shippingDetails' / 'hasMerchantReturnPolicy'"
    // warnings while staying truthful about how the product actually works.
    const _digitalShipping = {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "AUD" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "AU" },
        deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" },
            transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" },
        },
    };
    const _saasReturnPolicy = {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "AU",
        returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
        merchantReturnLink: "https://wayly.com.au/legal/terms",
    };
    const productJsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Wayly",
        description: "AI assistant for Australian families navigating Support at Home. Decode statements, check classifications, plan budgets and coordinate family carers.",
        image: [
            "https://wayly.com.au/branding/png/wayly-lockup-navy-1024.png",
            "https://wayly.com.au/og-image.png",
        ],
        brand: { "@type": "Brand", name: "Wayly" },
        offers: [
            { "@type": "Offer", name: "Solo", price: String(INDEX1.plans.solo.price_aud), priceCurrency: "AUD", priceSpecification: { "@type": "UnitPriceSpecification", price: String(INDEX1.plans.solo.price_aud), priceCurrency: "AUD", unitText: "MONTH" }, availability: "https://schema.org/InStock", url: "https://wayly.com.au/pricing", description: `All ${TOOL_COUNT} AI tools, unlimited Statement Decoder, one participant. 7-day free trial.`, shippingDetails: _digitalShipping, hasMerchantReturnPolicy: _saasReturnPolicy },
            { "@type": "Offer", name: "Family", price: String(INDEX1.plans.family.price_aud), priceCurrency: "AUD", priceSpecification: { "@type": "UnitPriceSpecification", price: String(INDEX1.plans.family.price_aud), priceCurrency: "AUD", unitText: "MONTH" }, availability: "https://schema.org/InStock", url: "https://wayly.com.au/pricing", description: "Up to four participants, family thread, weekly digest, audit log, household coordination.", shippingDetails: _digitalShipping, hasMerchantReturnPolicy: _saasReturnPolicy },
            { "@type": "Offer", name: "Adviser", price: String(INDEX1.plans.adviser.price_aud), priceCurrency: "AUD", priceSpecification: { "@type": "UnitPriceSpecification", price: String(INDEX1.plans.adviser.price_aud), priceCurrency: "AUD", unitText: "MONTH" }, availability: "https://schema.org/InStock", url: "https://wayly.com.au/pricing", description: "For aged-care specialist advisers. Client export, audit trail, branded reports.", shippingDetails: _digitalShipping, hasMerchantReturnPolicy: _saasReturnPolicy },
        ],
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.pricing} jsonLd={[faqJsonLd, productJsonLd]} />
            <MarketingHeader />
            <main id="main-content">
            <section className="mx-auto max-w-6xl px-6 pt-16 pb-10 text-center">
                <span className="overline">Pricing</span>
                <h1 className="font-heading text-3xl sm:text-5xl text-primary-k mt-3 tracking-tight leading-[1.1]">
                    Two Plans. Both <span className="underline decoration-2 underline-offset-4" style={{ color: "#A5512B", textDecorationColor: "#A5512B" }}>Cost Less Than One Hour</span><br />With a Consultant.
                </h1>
                <p className="mt-4 text-xs text-muted-k max-w-xl mx-auto">
                    Wayly is fortnightly billing. All prices in AUD including GST. Card required at signup. 7 day free trial, then $24.50 or $49.50 per fortnight. Cancel any time from your account.
                </p>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-12" data-testid="pricing-cards">
                <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
                    {TIERS.map((t) => (
                        <div key={t.key} className={`relative rounded-2xl border p-6 ${t.featured ? "bg-primary-k text-white border-gold shadow-xl" : "bg-surface border-kindred"}`} data-testid={`tier-${t.key}`}>
                            {t.badge && (
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-white text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold">
                                    {t.badge}
                                </span>
                            )}
                            <h2 className={`font-heading text-2xl ${t.featured ? "text-white" : "text-primary-k"}`}>{t.name}</h2>
                            {t.tagline && (
                                <p className={`text-[13px] mt-1 leading-snug ${t.featured ? "text-white/85" : "text-muted-k"}`}>{t.tagline}</p>
                            )}
                            {t.reasonToChoose && (
                                <p className={`text-[12px] mt-1 leading-snug font-medium ${t.featured ? "text-gold" : "text-primary-k"}`} data-testid={`tier-reason-${t.key}`}>{t.reasonToChoose}</p>
                            )}
                            <div className="mt-3 flex items-baseline gap-1">
                                <span className="font-heading text-4xl">{t.price}</span>
                                <span className={`text-sm ${t.featured ? "text-white/70" : "text-muted-k"}`}>{t.cadence || "/month"}</span>
                            </div>
                            <ul className="mt-4 space-y-2 text-sm">
                                {t.highlights.map((h) => (
                                    <li key={h} className="flex gap-2"><Check className={`h-4 w-4 mt-0.5 flex-none ${t.featured ? "text-gold" : "text-sage"}`} />{h}</li>
                                ))}
                            </ul>
                            <button
                                type="button"
                                onClick={() => {
                                    track.upgradeClick({ plan: t.key, location: "pricing" });
                                    startCheckout(t.key, t.href);
                                }}
                                disabled={loadingPlan === t.key}
                                data-testid={`tier-cta-${t.key}`}
                                className={`mt-5 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition ${t.featured ? "bg-gold text-white hover:brightness-95" : "bg-primary-k text-white hover:bg-[#091D33]"} disabled:opacity-60 disabled:cursor-wait`}
                            >
                                {loadingPlan === t.key ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Starting checkout</>
                                ) : (
                                    // Once a user is logged in, the marketing "Start 7-day free trial" line
                                    // is off-brief. Swap to a plain "Buy Solo / Buy Family / Talk to us"
                                    // so returning users see purchase language, not the guest lure.
                                    user
                                        ? (t.key === "adviser" ? "Talk to us" : `Buy ${t.name}`)
                                        : t.cta
                                )}
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Add-on explainer */}
            <section id="addons" className="mx-auto max-w-6xl px-6 py-14 border-y border-kindred bg-surface" data-testid="addons-section">
                <span className="overline">Bigger Households</span>
                <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-2 tracking-tight">Managing More Than <span style={{ color: "#A5512B" }}>2 Participants</span>?</h2>
                <p className="text-base text-muted-k mt-3 max-w-2xl">On the Family plan, add each additional participant for just $24.50 per fortnight. Everyone shares the same three caregiver seats and the full feature set.</p>
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
                <h2 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight">Compare the <span style={{ color: "#A5512B" }}>Two Plans</span></h2>
                <p className="text-sm text-muted-k mt-1 mb-6">The Family plan does everything Solo does, for two people and up to three caregivers.</p>
                <div className="overflow-x-auto rounded-2xl border border-kindred bg-surface">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 sticky top-0">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-primary-k">Feature</th>
                                <th className="px-3 py-3 text-center font-medium text-primary-k">Solo</th>
                                <th className="px-3 py-3 text-center font-semibold text-white bg-primary-k rounded-t-lg">Family <span className="text-gold">★</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {SECTIONS.filter((s) => !/adviser/i.test(s.label)).map((s) => (
                                <React.Fragment key={s.label}>
                                    <tr className="bg-[#A5512B]/8">
                                        <td colSpan={3} className="px-4 py-2.5 text-xs uppercase tracking-wider font-bold" style={{ color: "#A5512B" }}>{s.label}</td>
                                    </tr>
                                    {s.rows.map(([label, ...vals], idx) => (
                                        <tr key={`${s.label}-${idx}`} className="border-t border-kindred">
                                            <td className="px-4 py-2.5 text-primary-k">{label}</td>
                                            {vals.slice(0, 2).map((v, i) => (
                                                <td key={i} className={`px-3 py-2.5 text-center ${i === 1 ? "bg-primary-k/[0.03]" : ""}`}>
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
                    All prices in AUD including GST. 7-day free trial on Solo and Family plans. Card required at signup.
                    Cancel any time, cancellations take effect at the end of the current fortnightly billing period.
                    Additional participants on the Family plan: $24.50 per fortnight each, added or removed any time from your account.
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
            </main>

            <Footer />
        </div>
    );
}
