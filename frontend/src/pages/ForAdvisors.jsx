import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { TrendingUp, Users, FileText, Briefcase, Check, ArrowRight } from "lucide-react";

const FEATURES = [
    { icon: Users, title: "Client roster", body: "All your aged-care clients on one screen — classification, quarterly burn, lifetime-cap progress." },
    { icon: TrendingUp, title: "Lifetime-cap forecasting", body: "Project when each client hits the cap under different care-need scenarios." },
    { icon: FileText, title: "Review-pack export", body: "One-click PDF for client meetings — full position summary, year's spend, recommendations." },
    { icon: Briefcase, title: "White-label (Pro)", body: "Your firm's logo, your domain. Multi-advisor team accounts. API access." },
];

const TIERS = [
    { name: "Advisor", price: "$299", clients: "Up to 50 clients", desc: "Lifetime-cap tracker, forecasting, review-pack export, email + priority support.", featured: false },
    { name: "Advisor Pro", price: "$999", clients: "Up to 200 clients", desc: "White-label, custom domain, multi-advisor team, dedicated CS manager, API access.", featured: true },
];

export default function ForAdvisors() {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />

            <section className="mx-auto max-w-7xl px-6 pt-12 pb-16">
                <div className="grid lg:grid-cols-2 gap-10 items-center">
                    <div>
                        <span className="overline">For financial advisors</span>
                        <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight">
                            Make aged-care planning a profit centre, not a black hole.
                        </h1>
                        <p className="mt-5 text-lg text-muted-k leading-relaxed">
                            Your existing clients are facing the biggest aged-care reform in decades. Either you're the trusted source they call — or someone else is.
                        </p>
                        <div className="mt-7 flex items-center gap-3 flex-wrap">
                            <Link to="/contact" data-testid="advisor-book-demo" className="bg-primary-k text-white rounded-full px-6 py-3 hover:bg-[#16294a] transition-colors">
                                Book a demo
                            </Link>
                            <Link to="/pricing" className="text-primary-k underline">See pricing</Link>
                        </div>
                    </div>
                    <div className="bg-surface border border-kindred rounded-2xl p-8">
                        <span className="overline">A real example</span>
                        <p className="mt-3 text-primary-k leading-relaxed">
                            "We were spending three hours per client meeting building the aged-care position by hand. Kindred's review pack cuts that to twenty minutes — and the lifetime-cap forecasts have made a planning conversation possible that didn't exist before."
                        </p>
                        <div className="mt-5 text-sm text-muted-k">— Director, Geelong-based wealth firm (anonymised pending case study consent)</div>
                    </div>
                </div>
            </section>

            <section className="bg-surface-2 border-y border-kindred">
                <div className="mx-auto max-w-7xl px-6 py-16">
                    <span className="overline">What you get</span>
                    <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 max-w-3xl tracking-tight">Everything you need for the aged-care chapter of a financial plan.</h2>
                    <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="bg-surface rounded-xl border border-kindred p-5 hover:-translate-y-1 hover:shadow-lg transition-all">
                                <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                                    <f.icon className="h-5 w-5 text-primary-k" />
                                </div>
                                <h3 className="font-heading text-lg mt-4 text-primary-k">{f.title}</h3>
                                <p className="text-sm text-muted-k mt-2 leading-relaxed">{f.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 py-16">
                <span className="overline">Pricing for advisors</span>
                <h2 className="font-heading text-3xl text-primary-k mt-3 tracking-tight">Two tiers. Built for practices.</h2>
                <div className="mt-8 grid sm:grid-cols-2 gap-5 max-w-4xl">
                    {TIERS.map((t) => (
                        <div key={t.name} className={`rounded-2xl p-6 border ${t.featured ? "bg-primary-k text-white border-primary-k" : "bg-surface border-kindred"}`} data-testid={`advisor-tier-${t.name.toLowerCase().replace(/\s/g, "-")}`}>
                            <div className={`text-xs uppercase tracking-wider ${t.featured ? "text-gold" : "text-muted-k"}`}>{t.featured ? "Most popular" : t.name}</div>
                            <div className={`mt-2 font-heading text-4xl tabular-nums ${t.featured ? "text-white" : "text-primary-k"}`}>{t.price}<span className="text-base font-sans">/mo</span></div>
                            <div className={`text-sm ${t.featured ? "text-white/70" : "text-muted-k"}`}>{t.clients}</div>
                            <p className={`mt-4 text-sm leading-relaxed ${t.featured ? "text-white/85" : "text-muted-k"}`}>{t.desc}</p>
                            <Link to="/contact" className={`mt-6 inline-flex items-center justify-center gap-1 w-full rounded-full py-2.5 text-sm font-medium ${t.featured ? "bg-gold text-primary-k hover:bg-[#c8973f]" : "bg-primary-k text-white hover:bg-[#16294a]"}`}>
                                Book a demo <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    ))}
                </div>
            </section>

            <section className="bg-primary-k">
                <div className="mx-auto max-w-4xl px-6 py-16 text-center">
                    <h2 className="font-heading text-4xl sm:text-5xl text-white tracking-tight">A 30-minute demo will show you everything.</h2>
                    <Link to="/contact" className="mt-8 inline-block bg-gold text-primary-k font-medium rounded-full px-6 py-3 hover:bg-[#c8973f]">Book a demo</Link>
                </div>
            </section>
            <Footer />
        </div>
    );
}
