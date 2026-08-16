import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Layers, FileText } from "lucide-react";

/**
 * Phase 5 hub-and-spoke wiring.
 *
 * Each tool page renders <ToolRelatedLinks slug="<tool-slug>" /> just before
 * the Footer. The component surfaces three cross-links that strengthen
 * internal link equity:
 *   1) The deep guide article on /resources/articles/<article-slug>
 *   2) One Phase 4 service or policy page that pairs naturally with the tool
 *   3) One Phase 4 guide that pairs naturally with the tool
 *
 * Keeping the mapping in one place means future content additions only need
 * a single edit.
 */

const TOOL_LINKS = {
    "statement-decoder": {
        articleSlug: "wayly-statement-decoder-support-at-home-statement-explained",
        articleTitle: "How the Wayly Statement Decoder reads a Support at Home statement",
        articleSub: "Rule-by-rule walk-through of every audit check",
        pillarHref: "/services/personal-care",
        pillarLabel: "Personal care service",
        pillarSub: "Free from 1 October 2026",
        guideHref: "/guides/understanding-statement-line-items",
        guideLabel: "How to read a statement",
        guideSub: "What each line item means",
    },
    "budget-calculator": {
        articleSlug: "wayly-budget-calculator-support-at-home-quarterly-budget",
        articleTitle: "The Wayly Budget Calculator explained",
        articleSub: "Quarterly windows, rollover cap, lifetime cap",
        pillarHref: "/support-at-home-levels",
        pillarLabel: "Support at Home levels",
        pillarSub: "All 8 classifications with budgets",
        guideHref: "/policy/personal-care-free-1-october-2026",
        guideLabel: "Personal care change",
        guideSub: "How the 1 October 2026 change frees up budget",
    },
    "provider-price-checker": {
        articleSlug: "wayly-provider-price-checker-support-at-home-prices",
        articleTitle: "Inside the Wayly Provider Price Checker",
        articleSub: "Network medians and brokered-rate detection",
        pillarHref: "/policy/price-caps-status",
        pillarLabel: "Service price caps status",
        pillarSub: "Where the cap policy stands today",
        guideHref: "/guides/switching-providers",
        guideLabel: "How to switch providers",
        guideSub: "Free, takes about two weeks",
    },
    "classification-self-check": {
        articleSlug: "wayly-classification-self-check-support-at-home-levels",
        articleTitle: "Inside the Wayly Classification Self-Check",
        articleSub: "How the 12 questions map to Levels 1 through 8",
        pillarHref: "/support-at-home-levels",
        pillarLabel: "Support at Home levels",
        pillarSub: "Every classification explained",
        guideHref: "/ai-tools/letters-and-follow-ups",
        guideLabel: "Letters & Follow-ups",
        guideSub: "Draft a request if you need a higher level",
    },
    "reassessment-letter": {
        articleSlug: "wayly-reassessment-letter-generator-support-at-home-reassessment",
        articleTitle: "How to write a reassessment letter that works",
        articleSub: "Structure, evidence, and tone",
        pillarHref: "/guides/my-aged-care-assessment-delay",
        pillarLabel: "Assessment delay guide",
        pillarSub: "What to do while you wait",
        guideHref: "/support-at-home-levels",
        guideLabel: "Support at Home levels",
        guideSub: "Confirm which level you are requesting",
    },
    "letters-and-follow-ups": {
        articleSlug: "wayly-reassessment-letter-generator-support-at-home-reassessment",
        articleTitle: "Letter templates that get a response",
        articleSub: "Structure, evidence, and tone for every archetype",
        pillarHref: "/guides/my-aged-care-assessment-delay",
        pillarLabel: "Assessment delay guide",
        pillarSub: "What to do while you wait",
        guideHref: "/support-at-home-levels",
        guideLabel: "Support at Home levels",
        guideSub: "Reference the right level in your letter",
    },
    "contribution-estimator": {
        articleSlug: "wayly-contribution-estimator-support-at-home-fees",
        articleTitle: "How Support at Home contributions are calculated",
        articleSub: "Pension status, stream, and the participant share",
        pillarHref: "/policy/personal-care-free-1-october-2026",
        pillarLabel: "Personal care change",
        pillarSub: "Zero contribution from 1 October 2026",
        guideHref: "/policy/no-worse-off-guarantee",
        guideLabel: "No worse off guarantee",
        guideSub: "Your protection through the transition",
    },
    "care-plan-reviewer": {
        articleSlug: "wayly-care-plan-reviewer-support-at-home-care-plan",
        articleTitle: "What a good Support at Home care plan looks like",
        articleSub: "Goals, services, frequencies, and review dates",
        pillarHref: "/services/respite",
        pillarLabel: "Respite services",
        pillarSub: "Planned breaks for family carers",
        guideHref: "/guides/parent-refuses-help",
        guideLabel: "When a parent refuses help",
        guideSub: "Practical conversation scripts",
    },
    "family-coordinator": {
        articleSlug: "wayly-family-coordinator-managing-parents-aged-care",
        articleTitle: "Managing a parent's care without melting down",
        articleSub: "Family workflows that actually hold",
        pillarHref: "/guides/sibling-disagreements-about-mum",
        pillarLabel: "Sibling disagreements",
        pillarSub: "Bringing family on side",
        guideHref: "/guides/caring-from-far-away",
        guideLabel: "Caring from far away",
        guideSub: "When you cannot be there often",
    },
};

export default function ToolRelatedLinks({ slug }) {
    const links = TOOL_LINKS[slug];
    if (!links) return null;
    return (
        <section className="mx-auto max-w-7xl px-6 py-12" aria-labelledby="tool-related-h" data-testid="tool-related-links">
            <h2 id="tool-related-h" className="font-heading text-2xl text-[#0E2A47] tracking-tight">
                Go deeper on this topic
            </h2>
            <p className="mt-2 text-sm text-[#4A5A75] max-w-2xl">
                Three short reads that pair with this tool. Free, no signup.
            </p>
            <div className="mt-6 grid sm:grid-cols-3 gap-4">
                <Card
                    icon={BookOpen}
                    overline="Deep guide article"
                    href={`/resources/articles/${links.articleSlug}`}
                    label={links.articleTitle}
                    sub={links.articleSub}
                    testid={`related-${slug}-article`}
                />
                <Card
                    icon={Layers}
                    overline="Pillar page"
                    href={links.pillarHref}
                    label={links.pillarLabel}
                    sub={links.pillarSub}
                    testid={`related-${slug}-pillar`}
                />
                <Card
                    icon={FileText}
                    overline="Caregiver guide"
                    href={links.guideHref}
                    label={links.guideLabel}
                    sub={links.guideSub}
                    testid={`related-${slug}-guide`}
                />
            </div>
        </section>
    );
}

function Card({ icon: Icon, overline, href, label, sub, testid }) {
    return (
        <Link
            to={href}
            data-testid={testid}
            className="group block rounded-2xl border border-[#CFE0F0] bg-white p-5 hover:border-[#2BC4D6] hover:-translate-y-0.5 transition-all"
        >
            <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-[#DCEBF7] inline-flex items-center justify-center text-[#1565B8]">
                    <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="overline">{overline}</div>
            </div>
            <div className="font-heading text-lg text-[#0E2A47] mt-3 leading-snug">{label}</div>
            <div className="mt-1 text-xs text-[#4A5A75]">{sub}</div>
            <div className="mt-4 text-sm font-medium text-[#1565B8] inline-flex items-center gap-1">
                Read <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
        </Link>
    );
}
