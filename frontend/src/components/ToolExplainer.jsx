/**
 * <ToolExplainer toolKey="statement-decoder" />, the §6 8-block content shell.
 * Renders the marketing/explainer surface below each tool's interactive UI.
 * All copy is verbatim §7 from the Dec 2026 refit brief (/app/Wayly_refit_dec2026.md).
 *
 * Mounted via: <ToolExplainer toolKey="statement-decoder" />
 */
import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { TOOL_CONTENT } from "@/data/toolContent";
import AIAccuracyBanner from "@/components/AIAccuracyBanner";
import { ChevronRight, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Maps a tool key (matching TOOL_CONTENT) to the authenticated deep-link route.
 * Used by the personalised CTA so a logged-in user gets straight to the
 * authenticated tool instead of seeing the "start free trial" sign-up prompt.
 */
const AUTHENTICATED_ROUTES = {
    "statement-decoder": "/app/statements/upload",
    "budget-calculator": "/app/pacing",
    "classification-self-check": "/app/csc/stream-mix-and-iat",
    "provider-price-checker": "/app/tools/provider-price-checker/compare",
    "reassessment-letter": "/ai-tools/reassessment-letter",
    "letters-and-follow-ups": "/app/correspondence",
    "contribution-estimator": "/app/tools/contribution-estimator/hardship-walkthrough",
    "care-plan-reviewer": "/app/care-plans",
    "family-coordinator": "/app/wall",
    "invoice-checker": "/ai-tools/invoice-checker",
};

export default function ToolExplainer({ toolKey }) {
    const c = TOOL_CONTENT[toolKey];
    const { user } = useAuth();
    if (!c) return null;
    const authenticatedRoute = AUTHENTICATED_ROUTES[toolKey] || "/app";
    // Schema.org FAQPage JSON-LD for rich-result eligibility in Google search.
    // Built from the tool's faqs array so any future copy edits flow through automatically.
    const faqJsonLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": c.faqs.map((f) => ({
            "@type": "Question",
            "name": f.q,
            "acceptedAnswer": { "@type": "Answer", "text": f.a },
        })),
    };
    return (
        <div className="space-y-16 mt-16 pb-20" data-testid={`tool-explainer-${toolKey}`}>
            {/* SEO: FAQ rich-result schema, emitted into <head> via helmet so it
                is captured by the prerender and does not live in the hydrated body. */}
            <Helmet>
                <script type="application/ld+json" data-testid={`tool-faq-jsonld-${toolKey}`}>
                    {JSON.stringify(faqJsonLd)}
                </script>
            </Helmet>

            {/* 2. What This Tool Does */}
            <section data-testid={`tool-what-${toolKey}`}>
                <h2 className="font-heading text-2xl sm:text-3xl text-primary-k tracking-tight">What This Tool Does</h2>
                <div className="mt-4 space-y-3 text-base text-muted-k leading-relaxed max-w-3xl">
                    {c.whatItDoes.map((p, i) => <p key={i}>{p}</p>)}
                </div>
            </section>

            {/* 3. How It Works */}
            <section data-testid={`tool-how-${toolKey}`}>
                <h2 className="font-heading text-2xl sm:text-3xl text-primary-k tracking-tight">How It Works</h2>
                <ol className="mt-4 grid sm:grid-cols-2 gap-4 max-w-4xl">
                    {c.howItWorks.map((step, i) => (
                        <li key={i} className="rounded-xl border border-kindred bg-surface p-5">
                            <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 h-8 w-8 rounded-full bg-primary-k text-white text-sm font-semibold flex items-center justify-center">{i + 1}</span>
                                <div>
                                    <h3 className="font-heading text-base text-primary-k">{step.title}</h3>
                                    <p className="mt-1 text-sm text-muted-k leading-relaxed">{step.body}</p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            {/* Yellow AI disclaimer, sits right after How It Works per the Dec 2026 refit */}
            <section data-testid={`tool-disclaimer-${toolKey}`}>
                <AIAccuracyBanner
                    text={`Information only, not advice. ${c.name} uses AI to help you understand your own aged care information in plain English. It does not give financial, legal, or medical advice, and it is not a decision from My Aged Care or Services Australia. AI can make mistakes, so please check anything important against your official statements, your provider, or My Aged Care on 1800 200 422 before you act on it. Figures shown are indicative and subject to the current Schedule of Subsidies and Supplements.`}
                />
            </section>

            {/* 4 + 5. What You'll Need / What You'll Get, two columns */}
            <section className="grid sm:grid-cols-2 gap-6 max-w-4xl" data-testid={`tool-need-get-${toolKey}`}>
                <div className="rounded-xl border border-kindred bg-surface p-6">
                    <h2 className="font-heading text-xl text-primary-k">What You&apos;ll Need</h2>
                    <ul className="mt-3 space-y-2 text-sm text-muted-k leading-relaxed">
                        {c.whatYouNeed.map((item, i) => <li key={i} className="flex gap-2"><ChevronRight className="h-3.5 w-3.5 mt-1 flex-shrink-0 text-primary-k" /><span>{item}</span></li>)}
                    </ul>
                </div>
                <div className="rounded-xl border border-kindred bg-surface p-6">
                    <h2 className="font-heading text-xl text-primary-k">What You&apos;ll Get</h2>
                    <ul className="mt-3 space-y-2 text-sm text-muted-k leading-relaxed">
                        {c.whatYouGet.map((item, i) => <li key={i} className="flex gap-2"><ChevronRight className="h-3.5 w-3.5 mt-1 flex-shrink-0 text-primary-k" /><span>{item}</span></li>)}
                    </ul>
                </div>
            </section>

            {/* 6. Common Questions */}
            <section data-testid={`tool-faq-${toolKey}`}>
                <h2 className="font-heading text-2xl sm:text-3xl text-primary-k tracking-tight">Common Questions</h2>
                <div className="mt-4 space-y-4 max-w-3xl">
                    {c.faqs.map((f, i) => (
                        <details key={i} className="rounded-xl border border-kindred bg-surface p-5 group" data-testid={`tool-faq-${toolKey}-${i}`}>
                            <summary className="font-heading text-base text-primary-k cursor-pointer list-none flex items-center justify-between">
                                {f.q}
                                <ChevronRight className="h-4 w-4 text-muted-k transition-transform group-open:rotate-90" />
                            </summary>
                            <p className="mt-3 text-sm text-muted-k leading-relaxed">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* 7. Tool-Specific CTA, personalised on auth state. Anonymous visitors see the sign-up prompt; logged-in users get a deep-link into their authenticated tool. */}
            {!user ? (
                <section className="rounded-2xl p-8 sm:p-10 max-w-3xl" style={{ background: "var(--primary-k, #0E4D52)", color: "#FFFFFF" }} data-testid={`tool-cta-${toolKey}`}>
                    <h2 className="font-heading text-2xl sm:text-3xl tracking-tight text-white">{c.ctaHeading}</h2>
                    <p className="mt-2 text-base text-white/90">{c.ctaBody}</p>
                    <Link
                        to="/signup"
                        className="inline-flex items-center gap-2 mt-5 rounded-md font-semibold px-5 py-2.5 transition-colors"
                        style={{ background: "var(--wayly-clay-500, #A5512B)", color: "#FFFFFF" }}
                        data-testid={`tool-cta-btn-${toolKey}`}
                    >
                        Start Your 7-Day Free Trial
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </section>
            ) : (
                <section className="rounded-2xl p-8 sm:p-10 max-w-3xl bg-surface-2 border border-primary-k/10" data-testid={`tool-cta-authed-${toolKey}`}>
                    <p className="text-xs uppercase tracking-wider text-primary-k/50">You&apos;re Logged In</p>
                    <h2 className="font-heading text-2xl sm:text-3xl tracking-tight text-primary-k mt-1">Open This Tool In Your Wayly App</h2>
                    <p className="mt-2 text-base text-muted-k">Skip the marketing page and go straight to the connected version, where {c.name} works on your real data.</p>
                    <Link
                        to={authenticatedRoute}
                        className="inline-flex items-center gap-2 mt-5 rounded-full font-semibold px-5 py-2.5 bg-primary-k text-white hover:opacity-90 transition-opacity"
                        data-testid={`tool-cta-authed-btn-${toolKey}`}
                    >
                        Open {c.name}
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </section>
            )}
        </div>
    );
}
