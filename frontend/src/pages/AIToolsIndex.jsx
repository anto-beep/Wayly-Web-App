import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ArrowRight, FileSearch, Wallet, BarChart3, ListChecks, FileEdit, Receipt, ClipboardCheck, MessageCircle } from "lucide-react";

const TOOLS = [
    {
        slug: "statement-decoder",
        title: "Statement Decoder",
        body: "Paste any Support at Home monthly statement and get a plain-English explanation in 60 seconds.",
        keyword: "support at home statement explained",
        icon: FileSearch,
        live: true,
    },
    {
        slug: "budget-calculator",
        title: "Budget & Lifetime Cap Calculator",
        body: "Enter your classification and contribution status. See annual budget, per-stream allocation, and lifetime cap projection.",
        keyword: "support at home lifetime cap",
        icon: Wallet,
        live: true,
    },
    {
        slug: "provider-price-checker",
        title: "Provider Price Checker",
        body: "Tell us what you're being charged. We'll tell you whether it's fair against published medians and (after 1 Jul 2026) the cap.",
        keyword: "support at home prices",
        icon: BarChart3,
        live: true,
    },
    {
        slug: "classification-self-check",
        title: "Classification Self-Check",
        body: "Answer 12 questions about daily life. See which classification you're likely to be assessed at — and whether to request a reassessment.",
        keyword: "what classification will I get",
        icon: ListChecks,
        live: false,
    },
    {
        slug: "reassessment-letter",
        title: "Reassessment Letter Drafter",
        body: "Tell us what's changed. We'll draft a clear reassessment request you can send to My Aged Care.",
        keyword: "request aged care reassessment",
        icon: FileEdit,
        live: false,
    },
    {
        slug: "contribution-estimator",
        title: "Contribution Estimator",
        body: "How much will you actually pay each quarter under Support at Home? Enter your situation and see a clear breakdown.",
        keyword: "support at home contribution",
        icon: Receipt,
        live: false,
    },
    {
        slug: "care-plan-reviewer",
        title: "Care Plan Reviewer",
        body: "Paste your care plan. We'll check it against the Statement of Rights and the National Quality Standards.",
        keyword: "support at home care plan template",
        icon: ClipboardCheck,
        live: false,
    },
    {
        slug: "family-coordinator",
        title: "Family Care Coordinator",
        body: "Ask any question about Australia's aged-care system. Answers grounded in the Aged Care Act 2024 and program manual.",
        keyword: "aged care help australia",
        icon: MessageCircle,
        live: false,
    },
];

export default function AIToolsIndex() {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-7xl px-6 pt-12 pb-8">
                <span className="overline">Free AI tools</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight max-w-3xl">
                    Eight tools. No signup. Built for Australian families.
                </h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Each tool addresses a specific pain in Australia's Support at Home program. Free up to 5 uses per month. Australian-hosted, never sold.
                </p>
            </section>
            <section className="mx-auto max-w-7xl px-6 pb-20">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="ai-tools-grid">
                    {TOOLS.map((t) => (
                        <div
                            key={t.slug}
                            className={`rounded-xl border p-6 transition-all ${t.live ? "bg-surface border-kindred hover:-translate-y-1 hover:shadow-lg" : "bg-surface-2 border-kindred opacity-80"}`}
                            data-testid={`ai-tool-card-${t.slug}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                                    <t.icon className="h-5 w-5 text-primary-k" />
                                </div>
                                {!t.live && <span className="text-xs uppercase tracking-wider text-muted-k">Soon</span>}
                            </div>
                            <h2 className="font-heading text-xl text-primary-k mt-4">{t.title}</h2>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed">{t.body}</p>
                            {t.live ? (
                                <Link to={`/ai-tools/${t.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k font-medium">
                                    Try free <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            ) : (
                                <div className="mt-4 text-xs text-muted-k">Launching shortly.</div>
                            )}
                        </div>
                    ))}
                </div>
            </section>
            <Footer />
        </div>
    );
}
