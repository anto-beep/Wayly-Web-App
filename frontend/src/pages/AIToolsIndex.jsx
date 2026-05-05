import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ArrowRight, FileSearch, Wallet, BarChart3, ListChecks, FileEdit, Receipt, ClipboardCheck, MessageCircle } from "lucide-react";
import AIAccuracyBanner from "@/components/AIAccuracyBanner";

const TOOLS = [
    {
        slug: "statement-decoder",
        title: "Statement Decoder",
        body: "Paste any Support at Home monthly statement and get a plain-English explanation in 60 seconds.",
        icon: FileSearch,
        plan: "Free — 1 use/day",
        planTone: "free",
        planSub: "No signup required",
    },
    {
        slug: "budget-calculator",
        title: "Budget & Lifetime Cap Calculator",
        body: "Enter your classification and contribution status. See annual budget, per-stream allocation, and lifetime cap projection.",
        icon: Wallet,
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
    },
    {
        slug: "provider-price-checker",
        title: "Provider Price Checker",
        body: "Tell us what you're being charged. We'll tell you whether it's fair against published medians and (after 1 Jul 2026) the cap.",
        icon: BarChart3,
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
    },
    {
        slug: "classification-self-check",
        title: "Classification Self-Check",
        body: "Answer 12 questions about daily life. See which classification is likely — and whether to request a reassessment.",
        icon: ListChecks,
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
    },
    {
        slug: "reassessment-letter",
        title: "Reassessment Letter Drafter",
        body: "Tell us what's changed. We'll draft a clear reassessment request ready to send to My Aged Care.",
        icon: FileEdit,
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
    },
    {
        slug: "contribution-estimator",
        title: "Contribution Estimator",
        body: "How much will you actually pay each quarter under Support at Home? Enter the situation, see a clear breakdown.",
        icon: Receipt,
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
    },
    {
        slug: "care-plan-reviewer",
        title: "Care Plan Reviewer",
        body: "Paste a care plan. We'll check it against the Statement of Rights and the National Quality Standards.",
        icon: ClipboardCheck,
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
    },
    {
        slug: "family-coordinator",
        title: "Family Care Coordinator",
        body: "Ask any question about Australia's aged-care system. Answers grounded in the Aged Care Act 2024 and program manual.",
        icon: MessageCircle,
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
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
                    Every tool is free to use with a 5-uses-per-hour limit per IP. Create a free account for unlimited access. Australian-hosted, never sold.
                </p>
            </section>
            <section className="mx-auto max-w-7xl px-6 pb-20">
                <AIAccuracyBanner className="mb-6" />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="ai-tools-grid">
                    {TOOLS.map((t) => (
                        <div
                            key={t.slug}
                            className="rounded-xl border border-kindred bg-surface p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
                            data-testid={`ai-tool-card-${t.slug}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                                    <t.icon className="h-5 w-5 text-primary-k" />
                                </div>
                                <div className="text-right">
                                    <span
                                        className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 ${
                                            t.planTone === "free" ? "bg-sage/20 text-[#3A5A40]" : "bg-[#1F3A5F] text-white"
                                        }`}
                                        data-testid={`ai-tool-plan-${t.slug}`}
                                    >
                                        {t.plan}
                                    </span>
                                    {t.planSub && <div className="text-[10px] text-muted-k mt-1">{t.planSub}</div>}
                                </div>
                            </div>
                            <h2 className="font-heading text-xl text-primary-k mt-4">{t.title}</h2>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed">{t.body}</p>
                            <Link to={`/ai-tools/${t.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k font-medium" data-testid={`ai-tool-link-${t.slug}`}>
                                {t.plan === "Free" ? "Try free" : "Open tool"} <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    ))}
                </div>
            </section>
            <Footer />
        </div>
    );
}
