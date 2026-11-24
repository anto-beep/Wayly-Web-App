import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { isConv1FlagOn } from "@/config/conv1Flags";
import conv1 from "@/lib/conv1";

/**
 * ArticleOfferBlock — CONV-1 v2 Workstream G.
 *
 * A topic-matched offer the reader can act on without leaving the article's
 * mental context. Two placements:
 *   • variant="inline" — a compact band injected at ~60% scroll depth.
 *   • variant="end"    — a fuller card at the foot of every article.
 *
 * The offer is matched to the article's browse category so the CTA always
 * points at the single most relevant free Wayly tool. Clicking fires the
 * K1 `article_cta_clicked` event with the slug, placement and matched offer.
 *
 * Gated by the `conv1_article_cta` flag — renders nothing when off.
 */

// Category → the one free tool that best continues the reader's task.
// Every offer is a FREE entry point (no card) so the article → action step is
// frictionless; the paid trial is introduced later in the funnel.
const OFFER_BY_CATEGORY = {
    "Billing & statements": "invoice_checker",
    "Fees & contributions": "contribution_estimator",
    "Levels & budgets": "classification",
    Assessment: "classification",
    "Changing provider": "price_checker",
    Complaints: "ask_wayly",
    CHSP: "free_account",
    "Equipment & AT-HM": "free_account",
    "Support at Home basics": "free_account",
};

const OFFERS = {
    invoice_checker: {
        eyebrow: "Put this to work",
        title: "Check an aged-care invoice — free",
        blurb: "Upload or paste an invoice and Wayly flags overcharges, duplicate items and fees that don't look right.",
        cta: "Check my invoice free",
        href: "/ai-tools/invoice-checker",
        disclosure: "One free invoice check every 120 days. No card required.",
    },
    statement_decoder: {
        eyebrow: "Put this to work",
        title: "Decode an aged-care statement — free",
        blurb: "Paste a confusing statement and Wayly explains every line in plain English.",
        cta: "Decode my statement free",
        href: "/ai-tools/statement-decoder",
        disclosure: "One free statement decode every 120 days. No card required.",
    },
    contribution_estimator: {
        eyebrow: "Work out your number",
        title: "Estimate your aged-care contribution — free",
        blurb: "Answer a few questions and see a plain-English estimate of what you may be asked to pay.",
        cta: "Estimate my contribution",
        href: "/ai-tools/contribution-estimator",
        disclosure: "Free to try. No card required.",
    },
    classification: {
        eyebrow: "Check where you sit",
        title: "Check your likely classification — free",
        blurb: "A quick self-check that points to the Support at Home level your situation likely maps to.",
        cta: "Run the self-check",
        href: "/ai-tools/classification-self-check",
        disclosure: "Free to try. No card required.",
    },
    price_checker: {
        eyebrow: "Compare before you switch",
        title: "Compare provider prices — free",
        blurb: "See how a provider's prices and fees stack up before you commit or switch.",
        cta: "Compare prices free",
        href: "/ai-tools/provider-price-checker",
        disclosure: "Two free price checks every 120 days. No card required.",
    },
    ask_wayly: {
        eyebrow: "Still unsure?",
        title: "Ask Wayly a question — free",
        blurb: "Describe your situation in your own words and get a plain-English answer grounded in the rules.",
        cta: "Ask Wayly",
        href: "/ask-wayly",
        disclosure: "Free. No card required.",
    },
    free_account: {
        eyebrow: "Keep going",
        title: "Create a free Wayly account — no card",
        blurb: "Save your checks, keep a few documents in one place and come back any time.",
        cta: "Create a free account",
        href: "/signup?plan=free",
        disclosure: "Free account. No card required. Upgrade any time.",
    },
};

function resolveOffer(category, slug = "", title = "") {
    const hay = `${slug} ${title}`.toLowerCase();
    // Billing category splits into invoice vs statement by intent.
    if (category === "Billing & statements") {
        return hay.includes("statement") && !hay.includes("invoice")
            ? "statement_decoder"
            : "invoice_checker";
    }
    return OFFER_BY_CATEGORY[category] || "free_account";
}

export default function ArticleOfferBlock({ slug, category, title, variant = "end" }) {
    const firedView = useRef(false);
    const on = isConv1FlagOn("conv1_article_cta");
    const offerKey = resolveOffer(category, slug, title);
    const offer = OFFERS[offerKey];

    useEffect(() => {
        if (!on || firedView.current) return;
        firedView.current = true;
    }, [on]);

    if (!on || !offer) return null;

    const onClick = () => {
        conv1.articleCtaClicked(slug, { placement: variant, offer: offerKey });
    };

    if (variant === "inline") {
        return (
            <aside
                data-testid="article-offer-inline"
                data-offer={offerKey}
                className="my-10 rounded-2xl border border-[#2BC4D6]/40 bg-[#F4FAFE] p-5 sm:flex sm:items-center sm:justify-between sm:gap-5"
            >
                <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#075866] font-semibold">
                        <Sparkles className="h-3.5 w-3.5" /> {offer.eyebrow}
                    </span>
                    <p className="mt-1.5 font-heading text-lg text-[#0E2A47] leading-snug">{offer.title}</p>
                    <p className="mt-1 text-sm text-[#3C4A5E] leading-relaxed">{offer.blurb}</p>
                </div>
                <Link
                    to={offer.href}
                    onClick={onClick}
                    data-testid="article-offer-inline-cta"
                    className="mt-4 sm:mt-0 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#075866] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a6d7e] transition-colors"
                >
                    {offer.cta} <ArrowRight className="h-4 w-4" />
                </Link>
            </aside>
        );
    }

    return (
        <section
            data-testid="article-offer-end"
            data-offer={offerKey}
            className="mt-12 rounded-3xl border border-kindred bg-surface p-6 sm:p-8"
        >
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#075866] font-semibold">
                <Sparkles className="h-3.5 w-3.5" /> {offer.eyebrow}
            </span>
            <h2 className="mt-2 font-heading text-2xl text-primary-k tracking-tight">{offer.title}</h2>
            <p className="mt-2 text-[15px] text-muted-k leading-relaxed max-w-prose">{offer.blurb}</p>
            <Link
                to={offer.href}
                onClick={onClick}
                data-testid="article-offer-end-cta"
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#075866] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0a6d7e] transition-colors"
            >
                {offer.cta} <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-muted-k">{offer.disclosure}</p>
        </section>
    );
}
