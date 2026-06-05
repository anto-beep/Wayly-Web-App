import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Home, Search } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";

/**
 * Phase 8 — Custom 404 page.
 *
 * Replaces the previous "redirect everything to /" catch-all so Google sees
 * a real 404 status (via the route + meta noindex) and our visitors see a
 * helpful next-step. Logs to PostHog as `page_not_found` so we can spot
 * recurring broken paths and ship redirects in seo_routes.py when patterns
 * emerge.
 */
export default function NotFound() {
    const location = useLocation();

    useEffect(() => {
        document.title = "Page not found · Wayly";
        if (typeof window !== "undefined") {
            try { window.plausible && window.plausible("404", { props: { path: location.pathname } }); } catch (_) {}
            try { window.posthog && window.posthog.capture("page_not_found", { path: location.pathname }); } catch (_) {}
        }
    }, [location.pathname]);

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Page not found · Wayly"
                description="The page you were looking for isn't here. Try the homepage, the free AI tools, or our FAQ."
                canonical={`https://wayly.com.au${location.pathname}`}
                noindex
            />
            <MarketingHeader />
            <main id="main-content" className="mx-auto max-w-3xl px-6 pt-16 pb-20 text-center">
                <div className="font-heading text-[120px] sm:text-[160px] leading-none text-[#0E2A47]/15 tracking-tight">404</div>
                <h1 className="font-heading text-3xl sm:text-4xl text-[#0E2A47] -mt-6">This page has gone for a walk.</h1>
                <p className="mt-4 text-[#3F506B] leading-relaxed max-w-xl mx-auto">
                    The URL you followed isn't on Wayly. It may have moved, or there could be a typo. Try one of the routes below, or email <a href="mailto:hello@wayly.com.au" className="text-[#075866] font-medium underline underline-offset-2">hello@wayly.com.au</a> if you think this is broken.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Link to="/" data-testid="notfound-home" className="inline-flex items-center gap-2 rounded-full bg-[#0E2A47] hover:bg-[#091D33] text-white px-5 py-3 text-sm font-semibold">
                        <Home className="h-4 w-4" /> Home
                    </Link>
                    <Link to="/ai-tools" data-testid="notfound-tools" className="inline-flex items-center gap-2 rounded-full bg-white text-[#0E2A47] border border-[#CFE0F0] px-5 py-3 text-sm font-semibold hover:border-[#2BC4D6]">
                        Free AI tools <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link to="/faq" data-testid="notfound-faq" className="inline-flex items-center gap-2 rounded-full bg-white text-[#0E2A47] border border-[#CFE0F0] px-5 py-3 text-sm font-semibold hover:border-[#2BC4D6]">
                        <Search className="h-4 w-4" /> Search FAQ
                    </Link>
                </div>

                <div className="mt-14 text-left grid sm:grid-cols-3 gap-3" data-testid="notfound-suggestions">
                    {[
                        { href: "/services", label: "Service explainers", sub: "Cleaning, personal care, nursing and 5 more" },
                        { href: "/policy", label: "Policy explainers", sub: "Personal care change, no-worse-off, caps status" },
                        { href: "/guides", label: "Caregiver guides", sub: "Practical and emotional reads" },
                    ].map((s) => (
                        <Link key={s.href} to={s.href} className="rounded-2xl border border-[#CFE0F0] bg-white p-4 hover:border-[#2BC4D6] hover:-translate-y-0.5 transition-all">
                            <div className="font-heading text-base text-[#0E2A47]">{s.label}</div>
                            <div className="text-xs text-[#3F506B] mt-1">{s.sub}</div>
                        </Link>
                    ))}
                </div>
            </main>
            <Footer />
        </div>
    );
}
