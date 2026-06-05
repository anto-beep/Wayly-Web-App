import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Sparkles, Users } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";

export default function About() {
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: "https://wayly.com.au/" },
                    { "@type": "ListItem", position: 2, name: "About" },
                ],
            },
            {
                "@type": "AboutPage",
                name: "About Wayly",
                url: "https://wayly.com.au/about",
                description: "Wayly is an independent Australian software platform that helps families understand Support at Home funding, statements and care plans.",
            },
        ],
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="About Wayly — independent aged care concierge for Australian families | Wayly"
                description="Wayly is an independent, Australian-built platform that helps families understand Support at Home. Provider-agnostic, never sells data, never takes commissions."
                canonical="https://wayly.com.au/about"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
            <div className="mx-auto max-w-3xl px-6 pt-10 pb-16">
                <span className="overline">About</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-[#0E2A47] mt-3 leading-tight tracking-tight" data-testid="about-h1">
                    We help Australian families understand aged care
                </h1>
                <p className="mt-6 text-lg text-[#3C4A5E] leading-relaxed">
                    Wayly was built for the adult-child family carer. The person juggling a job, a household, and an older parent who is starting to need more help. The person staring at a 12 page Support at Home statement at 11 pm wondering whether the rate creep is real and whether the cleaner came twice on Tuesday.
                </p>
                <p className="mt-3 text-[#3C4A5E] leading-relaxed">
                    Australia's aged care system was rebuilt in November 2025. The new Support at Home program is fairer in many ways and far more complex in others. Families need a calm, plain-English layer on top of it. That is what we are building.
                </p>

                <section className="mt-12">
                    <h2 className="font-heading text-2xl text-[#0E2A47] tracking-tight">What we do</h2>
                    <ul className="mt-4 space-y-3 text-[15px] text-[#3C4A5E]">
                        <li className="flex items-start gap-2.5"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2BC4D6] shrink-0" /><span>Decode your monthly Support at Home statement into plain English in 60 seconds.</span></li>
                        <li className="flex items-start gap-2.5"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2BC4D6] shrink-0" /><span>Track quarterly and lifetime budget across the three Support at Home streams.</span></li>
                        <li className="flex items-start gap-2.5"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2BC4D6] shrink-0" /><span>Catch billing anomalies, rate creep, and brokered service premiums before they become a problem.</span></li>
                        <li className="flex items-start gap-2.5"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2BC4D6] shrink-0" /><span>Keep siblings on the same page with a family thread and an immutable audit log.</span></li>
                        <li className="flex items-start gap-2.5"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2BC4D6] shrink-0" /><span>Give the participant a calm, large-text view they can use themselves.</span></li>
                    </ul>
                </section>

                <section className="mt-12">
                    <h2 className="font-heading text-2xl text-[#0E2A47] tracking-tight">What we never do</h2>
                    <div className="mt-4 grid sm:grid-cols-3 gap-3">
                        <Pillar icon={ShieldCheck} title="Never accept commissions" body="We never take a kick-back from a Support at Home provider. The Provider Quality Index is fully independent." />
                        <Pillar icon={Users} title="Never sell your data" body="Australian hosted. End-to-end encrypted with per-household keys. Never used for AI training without consent." />
                        <Pillar icon={Sparkles} title="Never replace your case manager" body="We are a co-pilot. Clinical advice comes from your care team. Financial advice comes from a licensed adviser." />
                    </div>
                </section>

                <section className="mt-12">
                    <h2 className="font-heading text-2xl text-[#0E2A47] tracking-tight">Who built this</h2>
                    <p className="mt-3 text-[#3C4A5E] leading-relaxed">
                        Wayly is built by a small Australian team led by Antony Chiware. The product, the editorial, and the support all run from Australia. We talk to family carers every week, listen to what is breaking, and ship fixes within hours.
                    </p>
                    <p className="mt-3 text-[#3C4A5E] leading-relaxed">
                        If something on the site is wrong, email <a className="text-[#1565B8] underline" href="mailto:hello@wayly.com.au">hello@wayly.com.au</a>. A real person reads every message. We update content within 24 hours when the policy or the rules change.
                    </p>
                </section>

                <section className="mt-12 rounded-2xl border border-[#CFE0F0] bg-white p-6">
                    <h2 className="font-heading text-xl text-[#0E2A47]">Try the free tools</h2>
                    <p className="mt-2 text-sm text-[#4A5A75]">No signup required. Five free uses each per hour.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/ai-tools/statement-decoder" className="inline-flex items-center gap-2 rounded-full bg-[#0E2A47] hover:bg-[#091D33] text-white px-5 py-2.5 text-sm font-semibold">
                            Decode a statement <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link to="/ai-tools" className="inline-flex items-center gap-2 rounded-full bg-white text-[#0E2A47] border border-[#CFE0F0] px-5 py-2.5 text-sm font-semibold hover:border-[#2BC4D6]">
                            See all 8 tools
                        </Link>
                    </div>
                </section>
            </div>
            </main>
            <Footer />
        </div>
    );
}

function Pillar({ icon: Icon, title, body }) {
    return (
        <div className="rounded-2xl border border-[#CFE0F0] bg-white p-4">
            <div className="h-9 w-9 rounded-lg bg-[#DCEBF7] inline-flex items-center justify-center text-[#1565B8]">
                <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="mt-3 font-semibold text-[#0E2A47] text-sm">{title}</div>
            <div className="mt-1 text-xs text-[#4A5A75] leading-relaxed">{body}</div>
        </div>
    );
}
