/**
 * INV-1 v1.2 · Tool Registry (frontend mirror of backend/data/tool_registry.yaml).
 *
 * Single source of truth for every tool surface (tools grid, sidebar,
 * pricing, About, Ask Wayly). Adding a new tool means updating BOTH:
 *   1. backend/data/tool_registry.yaml  (canonical)
 *   2. this file                        (mirror, so the build doesn't need YAML parsing)
 *
 * A build-time consistency check (scripts/tool-registry-check.js) fails
 * CI if the two drift on slug, route, order or tier_entitlement.
 *
 * The tool count shown ANYWHERE must be derived from `TOOL_COUNT`, never
 * hardcoded. This structurally prevents the "8 tools" → "9 tools" drift.
 */

import {
    FileSearch,
    ReceiptText,
    Wallet,
    BarChart3,
    ListChecks,
    FileEdit,
    Receipt,
    ClipboardCheck,
    MessageCircle,
} from "lucide-react";

const ICON_MAP = {
    FileSearch,
    ReceiptText,
    Wallet,
    BarChart3,
    ListChecks,
    FileEdit,
    Receipt,
    ClipboardCheck,
    MessageCircle,
};

/** @type {Array<Object>} */
export const TOOL_REGISTRY = [
    {
        slug: "statement-decoder",
        name: "Statement Decoder",
        short: "Plain-English explanation of your monthly Support at Home statement.",
        body: "Paste any Support at Home monthly statement and get a plain-English explanation in 60 seconds.",
        icon: "FileSearch",
        route: "/ai-tools/statement-decoder",
        marketingRoute: "/ai-tools/statement-decoder",
        plan: "Free, 1 use/120 days",
        planTone: "free",
        planSub: "No signup required",
        tiers: ["free", "solo", "family", "adviser"],
        featured: true,
        order: 10,
        badge: null,
    },
    {
        slug: "invoice-checker",
        name: "Invoice Checker",
        short: "Check the separate contribution invoice your provider sent.",
        body: "Upload the invoice your provider sends for the contribution you pay. We check it line by line against your funding, your expected contribution, and the current program rules, and flag anything worth raising with your provider before you pay.",
        icon: "ReceiptText",
        route: "/ai-tools/invoice-checker",
        marketingRoute: "/ai-tools/invoice-checker",
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
        tiers: ["solo", "family", "adviser"],
        featured: true,
        order: 15,
        badge: null,
    },
    {
        slug: "budget-calculator",
        name: "Budget & Lifetime Cap Calculator",
        short: "Annual budget, per-stream allocation, and lifetime cap projection.",
        body: "Enter your classification and contribution status. See annual budget, per-stream allocation, and lifetime cap projection.",
        icon: "Wallet",
        route: "/ai-tools/budget-calculator",
        marketingRoute: "/ai-tools/budget-calculator",
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
        tiers: ["solo", "family", "adviser"],
        featured: true,
        order: 20,
        badge: null,
    },
    {
        slug: "provider-price-checker",
        name: "Provider Price Checker",
        short: "Compare your provider's charge against published medians.",
        body: "Tell us what you are being charged. We compare it against published medians and the Wayly Provider Quality Index, and flag brokered service premiums.",
        icon: "BarChart3",
        route: "/ai-tools/provider-price-checker",
        marketingRoute: "/ai-tools/provider-price-checker",
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
        tiers: ["solo", "family", "adviser"],
        featured: true,
        order: 30,
        badge: null,
    },
    {
        slug: "classification-self-check",
        name: "Classification Self-Check",
        short: "See which Support at Home classification is likely for you.",
        body: "Answer 12 questions about daily life. See which classification is likely, and whether to request a reassessment.",
        icon: "ListChecks",
        route: "/ai-tools/classification-self-check",
        marketingRoute: "/ai-tools/classification-self-check",
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
        tiers: ["solo", "family", "adviser"],
        featured: true,
        order: 40,
        badge: null,
    },
    {
        slug: "letters-and-follow-ups",
        name: "Letters & Follow-ups",
        short: "Draft polished letters to your provider, ACQSC, or the Ombudsman.",
        body: "Draft a polished letter to My Aged Care, your provider, ACQSC, or the Ombudsman. Track responses and know when to escalate.",
        icon: "FileEdit",
        route: "/ai-tools/letters-and-follow-ups",
        marketingRoute: "/ai-tools/letters-and-follow-ups",
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
        tiers: ["solo", "family", "adviser"],
        featured: true,
        order: 50,
        badge: null,
    },
    {
        slug: "contribution-estimator",
        name: "Contribution Estimator",
        short: "See how much you will actually pay each quarter.",
        body: "How much will you actually pay each quarter under Support at Home? Enter the situation, see a clear breakdown.",
        icon: "Receipt",
        route: "/ai-tools/contribution-estimator",
        marketingRoute: "/ai-tools/contribution-estimator",
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
        tiers: ["solo", "family", "adviser"],
        featured: true,
        order: 60,
        badge: null,
    },
    {
        slug: "care-plan-reviewer",
        name: "Support Plan Reviewer",
        short: "Check a support plan against the Statement of Rights.",
        body: "Paste a support plan. We will check it against the Statement of Rights and the National Quality Standards.",
        icon: "ClipboardCheck",
        route: "/ai-tools/care-plan-reviewer",
        marketingRoute: "/ai-tools/care-plan-reviewer",
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
        tiers: ["solo", "family", "adviser"],
        featured: true,
        order: 70,
        badge: null,
    },
    {
        slug: "family-coordinator",
        name: "Aged Care Q&A",
        short: "Plain-English answers grounded in the Aged Care Act 2024.",
        body: "Plain-English answers about the Support at Home program, grounded in the Aged Care Act 2024.",
        icon: "MessageCircle",
        route: "/ai-tools/family-coordinator",
        marketingRoute: "/ai-tools/family-coordinator",
        plan: "Solo & Family",
        planTone: "paid",
        planSub: "7-day free trial",
        tiers: ["solo", "family", "adviser"],
        featured: true,
        order: 80,
        badge: null,
    },
];

/** Sorted-by-order copy of the registry, with icons resolved to components. */
export const TOOLS_ORDERED = [...TOOL_REGISTRY]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((t) => ({ ...t, IconComponent: ICON_MAP[t.icon] || FileSearch }));

/** Canonical count for every surface. Never hardcode "8" or "9". */
export const TOOL_COUNT = TOOLS_ORDERED.length;

/** Lookup by slug. Returns null when the slug is not registered. */
export function getTool(slug) {
    return TOOLS_ORDERED.find((t) => t.slug === slug) || null;
}

/** Tools available on a given plan slug (e.g. "solo", "family"). */
export function toolsForTier(tier) {
    return TOOLS_ORDERED.filter((t) => (t.tiers || []).includes(tier));
}

/** True when a badge is still within its launch window. */
export function isBadgeActive(tool, now = new Date()) {
    if (!tool?.badge) return false;
    if (!tool.badgeExpiresAt) return true;
    const expiry = new Date(tool.badgeExpiresAt);
    return !Number.isNaN(expiry.valueOf()) && now < expiry;
}

/** Word-form of a tool count for headings, e.g. TOOL_COUNT=9 → "Nine". */
export function toolCountWord(n = TOOL_COUNT) {
    const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
    return words[n] || String(n);
}
