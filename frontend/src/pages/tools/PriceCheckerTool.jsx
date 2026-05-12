import React, { useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolGate from "@/components/ToolGate";
import { ScreenshotStatement } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import { api, formatAUD2, extractErrorMessage } from "@/lib/api";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";

import SeoHead, { softwareApplicationLd, howToLd, faqLd, breadcrumbLd } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

const _toolJsonLd = (cfg) => {
    const blocks = [softwareApplicationLd({
        name: cfg.toolName,
        description: cfg.toolDesc,
        url: `https://wayly.com.au${cfg.path}`,
    })];
    if (cfg.howTo) blocks.push(howToLd(cfg.howTo));
    if (cfg.faqs) blocks.push(faqLd(cfg.faqs));
    blocks.push(breadcrumbLd([
        { name: "Home", url: "/" },
        { name: "AI Tools", url: "/ai-tools" },
        { name: cfg.toolName, url: cfg.path },
    ]));
    return blocks;
};

const SERVICES = [
    "Domestic assistance — cleaning",
    "Personal care",
    "Occupational therapy",
    "Physiotherapy",
    "Social support",
    "Transport — community access",
    "Home maintenance / gardening",
    "Meal preparation",
    "Nursing — registered",
    "Allied health — podiatry",
];

export default function PriceCheckerTool() {
    const access = useToolAccess();
    const [service, setService] = useState(SERVICES[0]);
    const [rate, setRate] = useState("");
    const [postcode, setPostcode] = useState("");
    const [provider, setProvider] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const submit = async () => {
        setError(null);
        setResult(null);
        setLoading(true);
        try {
            const { data } = await api.post("/public/price-check", {
                service,
                rate: parseFloat(rate),
                postcode: postcode || null,
                provider: provider || null,
            });
            setResult(data);
        } catch (err) {
            setError(extractErrorMessage(err, "Could not check price."));
        } finally {
            setLoading(false);
        }
    };

    const verdictTone = (v) => {
        if (v === "fair") return "text-sage";
        if (v === "high") return "text-terracotta";
        if (v === "low") return "text-primary-k";
        return "text-muted-k";
    };

    if (access === "loading") return (<div className="min-h-screen bg-kindred"><SeoHead {...SEO.toolPriceChecker} jsonLd={_toolJsonLd(SEO.toolPriceChecker)} />
            <MarketingHeader /><div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div><Footer /></div>);
    if (access === "blocked") return (<div className="min-h-screen bg-kindred"><MarketingHeader /><section className="mx-auto max-w-4xl px-6 pt-8"><AIAccuracyBanner text={TOOL_DISCLAIMERS["provider-price-checker"]} /></section><ToolGate toolName="Provider Price Checker"><ScreenshotStatement /></ToolGate><Footer /></div>);

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI tools</Link>
                <span className="overline mt-6 block">Free tool · 5 uses per hour</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Provider Price Checker</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Tell us what you're being charged. We'll compare it against the published median price for that service and (after 1 July 2026) the government cap — so you know whether to ask questions.
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20">
                <AIAccuracyBanner text={TOOL_DISCLAIMERS["provider-price-checker"]} className="mb-4" />
                <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-5" data-testid="price-checker">
                    <label className="block">
                        <span className="text-sm text-muted-k">Service</span>
                        <select
                            value={service}
                            onChange={(e) => setService(e.target.value)}
                            data-testid="pc-service"
                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                        >
                            {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </label>

                    <div className="grid sm:grid-cols-3 gap-4">
                        <label className="block sm:col-span-1">
                            <span className="text-sm text-muted-k">Rate charged ($/hr or $/visit)</span>
                            <input
                                type="number"
                                value={rate}
                                onChange={(e) => setRate(e.target.value)}
                                placeholder="e.g. 95"
                                data-testid="pc-rate"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k tabular-nums"
                                min="0"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm text-muted-k">Postcode (optional)</span>
                            <input
                                value={postcode}
                                onChange={(e) => setPostcode(e.target.value)}
                                placeholder="e.g. 3220"
                                data-testid="pc-postcode"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm text-muted-k">Provider (optional)</span>
                            <input
                                value={provider}
                                onChange={(e) => setProvider(e.target.value)}
                                placeholder="Provider name"
                                data-testid="pc-provider"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </label>
                    </div>

                    <button
                        onClick={submit}
                        disabled={loading || !rate}
                        data-testid="pc-submit"
                        className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Checking…" : "Check this price"}
                    </button>

                    {error && <div className="text-sm text-terracotta">{error}</div>}
                </div>

                {result && (
                    <div className="mt-6 space-y-5 animate-fade-up" data-testid="pc-result">
                        <div className="bg-surface border border-kindred rounded-xl p-6">
                            <div className="overline">Verdict</div>
                            <div className={`mt-2 font-heading text-3xl ${verdictTone(result.verdict)}`}>
                                {result.verdict_label}
                            </div>
                            <p className="mt-2 text-primary-k leading-relaxed">{result.assessment}</p>
                        </div>

                        <div className="grid sm:grid-cols-3 gap-3">
                            <div className="bg-surface border border-kindred rounded-xl p-4">
                                <div className="text-xs uppercase tracking-wider text-muted-k">You're charged</div>
                                <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums">{formatAUD2(result.charged)}</div>
                            </div>
                            <div className="bg-surface border border-kindred rounded-xl p-4">
                                <div className="text-xs uppercase tracking-wider text-muted-k">Network median</div>
                                <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums">{formatAUD2(result.median)}</div>
                            </div>
                            <div className="bg-surface border border-kindred rounded-xl p-4">
                                <div className="text-xs uppercase tracking-wider text-muted-k">1 Jul 2026 cap</div>
                                <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums">{formatAUD2(result.cap)}</div>
                            </div>
                        </div>

                        {result.delta_pct != null && (
                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                                <p className="text-sm text-primary-k">
                                    You're paying <span className="font-medium tabular-nums">{result.delta_pct > 0 ? "+" : ""}{result.delta_pct.toFixed(1)}%</span> vs the typical rate.
                                    {result.suggested_action && <span className="block mt-1 italic">→ {result.suggested_action}</span>}
                                </p>
                            </div>
                        )}

                        <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                            <div className="font-medium text-primary-k">Want every charge checked automatically?</div>
                            <p className="text-sm text-muted-k mt-1">Wayly compares every line on every statement against published prices and our anonymised network — and tells you the moment something looks off.</p>
                            <div className="mt-3 flex items-center gap-3 flex-wrap">
                                <Link to="/signup" className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a]">Start free trial</Link>
                                <Link to="/ai-tools/statement-decoder" className="text-sm text-primary-k underline inline-flex items-center gap-1">
                                    Decode a full statement <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-8 bg-surface border border-kindred rounded-xl p-5 text-sm text-muted-k">
                    <div className="overline">How this works</div>
                    <p className="mt-2 leading-relaxed">
                        Median prices are derived from public provider price lists and anonymised aggregate data from Wayly users (we never share an individual provider's specific data). Government price caps from 1 July 2026 reflect the published draft cap schedule and will be updated on launch.
                    </p>
                </div>
            </section>
            <Footer />
        </div>
    );
}
