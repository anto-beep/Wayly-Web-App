import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead, { breadcrumbLd, howToLd, faqLd } from "@/seo/SeoHead";
import {
    Search, Scale, ArrowUpRight, ArrowDownRight, Check, ShieldAlert,
    TrendingUp, Receipt, FileClock, ArrowRight, Info,
} from "lucide-react";

const STEPS = [
    {
        icon: Search,
        name: "You enter the service and the rate",
        text: "Tell us the service (for example, personal care per hour) and the rate your provider charges on your Support at Home statement.",
    },
    {
        icon: Scale,
        name: "We match it to the Department of Health indicative range",
        text: "We look up the published indicative price range for that exact service in the most recent Department of Health snapshot.",
    },
    {
        icon: TrendingUp,
        name: "We show you where your rate sits",
        text: "You see whether your rate is below, inside or above the range, and exactly how far it is from the nearest edge and the median.",
    },
    {
        icon: ShieldAlert,
        name: "We flag anything unusual",
        text: "We run quality checks (an implausibly high or low rate, or a wrong unit) and count how many times the rate has risen in the last 12 months.",
    },
];

const POSITIONS = [
    {
        icon: ArrowDownRight,
        tone: "sage",
        title: "Below the range",
        body: "Your rate is under the published range. That is usually good news, but it is worth checking the unit is right (an hourly rate entered as a per-visit rate can look low).",
    },
    {
        icon: Check,
        tone: "sage",
        title: "Inside the range",
        body: "Your rate sits within what most providers charged in the survey. In-range does not automatically mean the price is fair, only that it is typical.",
    },
    {
        icon: ArrowUpRight,
        tone: "clay",
        title: "Above the range",
        body: "Your rate is higher than the published range. This does not automatically mean it is unreasonable, providers can set their own prices, but it is a fair reason to ask for a written explanation of how the rate was set.",
    },
];

const EXTRA_CHECKS = [
    {
        icon: ShieldAlert,
        title: "Quality guards",
        body: "If a rate looks implausibly low, more than double the top of the range, or like the wrong unit, we ask you to double-check before drawing any conclusion.",
    },
    {
        icon: FileClock,
        title: "Rate-increase counter",
        body: "Across your saved checks, we count genuine price rises in the last 12 months. The Department of Health has encouraged providers to limit increases to two per year.",
    },
    {
        icon: Receipt,
        title: "Your share",
        body: "Where we can, we show the participant contribution for that service based on pension status and classification, so you see what you would actually pay, not just the headline rate.",
    },
];

const SOURCE_POINTS = [
    "Under Support at Home, providers set their own prices, there is no legislated price cap in force.",
    "The Department of Health publishes indicative price ranges from a February 2025 survey of more than 300 Home Care Package providers.",
    "The planned 1 July 2026 national price caps have been deferred by the Australian Government indefinitely.",
    "Prices delivered outside standard business hours (evenings, weekends, public holidays) can sit above the indicative range.",
    "Nursing hourly prices include the everyday nursing consumables the nurse carries.",
    "The Department updates these ranges each quarter, and we refresh Wayly's reference within five working days of each publication.",
];

const FAQS = [
    {
        q: "Does Wayly give my provider a fairness score out of ten?",
        a: "No. There is no single fairness score. We compare your provider's rate against the Department of Health's indicative price range for that service and show you whether it is below, inside or above the range, and how far. You decide what to do with that information.",
    },
    {
        q: "Is an above-range price illegal or a rip-off?",
        a: "Not necessarily. Providers set their own prices under Support at Home, and there is currently no legislated cap. An above-range price simply means it is higher than most providers charged in the survey. Under the Aged Care Act 2024 prices must be reasonable, so it is a good reason to ask your provider for a written explanation.",
    },
    {
        q: "Does an in-range price mean I am getting a fair deal?",
        a: "In-range means your rate is typical of what other providers charged. It is reassuring, but it is a market snapshot, not a guarantee that the price is fair for your specific circumstances.",
    },
    {
        q: "Where do the indicative ranges come from?",
        a: "From the Department of Health's National Summary of Support at Home Prices, based on a February 2025 survey of over 300 providers. The Department updates the ranges each quarter and we refresh our reference within five working days.",
    },
    {
        q: "What about the price caps that were meant to start in 2026?",
        a: "The Australian Government has deferred the planned 1 July 2026 national provider price caps indefinitely. Providers continue to set their own prices, and the Price Checker compares against the indicative ranges, not a cap.",
    },
];

function toneClasses(tone) {
    return tone === "clay"
        ? { ring: "border-gold/40", chip: "bg-gold/15 text-gold" }
        : { ring: "border-sage/40", chip: "bg-sage/15 text-sage" };
}

export default function ProviderPriceExplainer() {
    const path = "/ai-tools/provider-price-checker/how-it-works";
    const jsonLd = [
        breadcrumbLd([
            { name: "Wayly", url: "/" },
            { name: "AI Tools", url: "/ai-tools" },
            { name: "Provider Price Checker", url: "/ai-tools/provider-price-checker" },
            { name: "How the fairness check works", url: path },
        ]),
        howToLd({
            name: "How Wayly's Provider Price Checker works",
            description: "How Wayly compares your aged-care provider's rate against the Department of Health indicative price ranges for Support at Home.",
            steps: STEPS.map((s) => ({ name: s.name, text: s.text })),
        }),
        faqLd(FAQS),
    ];

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="How the aged-care price fairness check works"
                description="How Wayly's Provider Price Checker compares your Support at Home provider's rate against the Department of Health indicative ranges, in plain English."
                path={path}
                type="article"
                jsonLd={jsonLd}
            />
            <MarketingHeader />

            {/* Hero */}
            <section className="mx-auto max-w-4xl px-6 pt-12 pb-8" data-testid="ppc-explainer">
                <span className="overline">Provider Price Checker</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight mt-4 leading-tight" data-testid="ppc-explainer-title">
                    How we check if your aged-care price is fair
                </h1>
                <p className="mt-5 text-lg text-muted-k leading-relaxed">
                    Under Support at Home, providers set their own prices and there is no legislated cap.
                    So Wayly does not invent a fairness score. Instead, it compares the rate on your
                    statement against the price ranges the Department of Health actually publishes, and shows
                    you, in plain English, where your rate sits.
                </p>
            </section>

            {/* Short answer callout */}
            <section className="mx-auto max-w-4xl px-6 pb-10">
                <div className="rounded-2xl border-2 border-gold/30 bg-gold/[0.06] p-6 flex items-start gap-4">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gold/15 text-gold">
                        <Info className="h-5 w-5" />
                    </span>
                    <div>
                        <h2 className="font-heading text-xl text-primary-k">The short answer</h2>
                        <p className="mt-2 text-sm text-muted-k leading-relaxed">
                            We take the rate you were charged, find the Department of Health indicative range
                            for that service, and tell you whether you are below, inside or above it, and by
                            how much. In-range does not automatically mean fair, and above-range does not
                            automatically mean a rip-off. It is a starting point for a better-informed
                            conversation with your provider.
                        </p>
                    </div>
                </div>
            </section>

            {/* How it works steps */}
            <section className="mx-auto max-w-4xl px-6 pb-12">
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">How the check works</h2>
                <ol className="mt-6 space-y-4" data-testid="ppc-explainer-steps">
                    {STEPS.map((s, i) => (
                        <li key={s.name} className="bg-surface border border-kindred rounded-xl p-5 flex items-start gap-4">
                            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-k/[0.06] text-primary-k font-heading">
                                {i + 1}
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <s.icon className="h-4 w-4 text-gold" />
                                    <h3 className="font-medium text-primary-k">{s.name}</h3>
                                </div>
                                <p className="mt-1.5 text-sm text-muted-k leading-relaxed">{s.text}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            {/* What the result means */}
            <section className="mx-auto max-w-4xl px-6 pb-12">
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">What your result means</h2>
                <div className="mt-6 grid sm:grid-cols-3 gap-4" data-testid="ppc-explainer-positions">
                    {POSITIONS.map((p) => {
                        const t = toneClasses(p.tone);
                        return (
                            <div key={p.title} className={`bg-surface border ${t.ring} rounded-xl p-5`}>
                                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${t.chip}`}>
                                    <p.icon className="h-5 w-5" />
                                </span>
                                <h3 className="mt-3 font-heading text-lg text-primary-k">{p.title}</h3>
                                <p className="mt-2 text-sm text-muted-k leading-relaxed">{p.body}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Extra checks */}
            <section className="mx-auto max-w-4xl px-6 pb-12">
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">The extra checks we run</h2>
                <div className="mt-6 grid sm:grid-cols-3 gap-4">
                    {EXTRA_CHECKS.map((c) => (
                        <div key={c.title} className="bg-surface border border-kindred rounded-xl p-5">
                            <c.icon className="h-5 w-5 text-primary-k" />
                            <h3 className="mt-3 font-medium text-primary-k">{c.title}</h3>
                            <p className="mt-1.5 text-sm text-muted-k leading-relaxed">{c.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Where the numbers come from */}
            <section className="mx-auto max-w-4xl px-6 pb-12">
                <div className="bg-surface-2 border border-kindred rounded-xl p-6">
                    <h2 className="font-heading text-2xl text-primary-k tracking-tight">Where the numbers come from</h2>
                    <ul className="mt-4 space-y-2.5">
                        {SOURCE_POINTS.map((point, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-muted-k leading-relaxed">
                                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-gold" />
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 text-xs text-muted-k">
                        Source: Department of Health, National Summary of Support at Home Prices; Minister for
                        Aged Care media release, May 2026.
                    </p>
                </div>
            </section>

            {/* FAQ */}
            <section className="mx-auto max-w-4xl px-6 pb-12">
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Common questions</h2>
                <div className="mt-6 space-y-3" data-testid="ppc-explainer-faqs">
                    {FAQS.map((f) => (
                        <details key={f.q} className="group bg-surface border border-kindred rounded-xl px-5 py-4">
                            <summary className="flex cursor-pointer items-center justify-between gap-3 list-none font-medium text-primary-k">
                                {f.q}
                                <ArrowRight className="h-4 w-4 flex-none text-muted-k transition-transform group-open:rotate-90" />
                            </summary>
                            <p className="mt-3 text-sm text-muted-k leading-relaxed">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* CTA */}
            <section className="mx-auto max-w-4xl px-6 pb-16">
                <div className="rounded-2xl bg-primary-k text-white p-8 text-center">
                    <h2 className="font-heading text-2xl sm:text-3xl tracking-tight">Check your own provider&rsquo;s rate</h2>
                    <p className="mt-3 text-white/80 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
                        Enter a rate from your statement and see where it sits against the Department of Health
                        indicative range, in seconds.
                    </p>
                    <Link
                        to="/ai-tools/provider-price-checker"
                        data-testid="ppc-explainer-cta"
                        className="mt-6 inline-flex items-center gap-2 rounded-pill bg-gold px-6 py-3 font-semibold text-white hover:bg-[#8f4523] transition-colors"
                    >
                        Open the Provider Price Checker
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </section>

            <Footer />
        </div>
    );
}
