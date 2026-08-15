import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ShieldCheck, MessageCircle } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHubLinks from "@/components/SeoHubLinks";
import SeoHead from "@/seo/SeoHead";

const EXAMPLE_QUESTIONS = [
    "What is the quarterly budget for Level 4?",
    "How does the personal care change on 1 October 2026 affect me?",
    "Can I claim AT-HM items more than once?",
    "What is the rollover cap and how does it work?",
    "How do I switch providers without a gap in service?",
    "Is the no worse off guarantee still in force?",
];

export default function AskWayly() {
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: "https://wayly.com.au/" },
                    { "@type": "ListItem", position: 2, name: "Ask Wayly" },
                ],
            },
            {
                "@type": "WebApplication",
                name: "Ask Wayly",
                url: "https://wayly.com.au/ask-wayly",
                applicationCategory: "EducationalApplication",
                operatingSystem: "Web",
            },
        ],
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Ask Wayly, plain-English answers about Support at Home | Wayly"
                description="Ask Wayly is a free, evidence-grounded chat that answers Support at Home questions from the public rules. No login, no signup, no marketing follow-up."
                canonical="https://wayly.com.au/ask-wayly"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
            <div className="mx-auto max-w-3xl px-6 pt-10 pb-16">
                <span className="overline">Ask Wayly</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-[#0E2A47] mt-3 leading-tight tracking-tight" data-testid="askwayly-h1">
                    Plain-English answers about Support at Home
                </h1>
                <p className="mt-4 text-[#3C4A5E] leading-relaxed text-lg">
                    Ask Wayly is a free chat that answers questions from the public Support at Home rules. It does not see your statements unless you log in and choose to share. It does not give financial or clinical advice. It will tell you when a question needs a human.
                </p>

                <div className="mt-8 grid sm:grid-cols-3 gap-3">
                    <Feature icon={Sparkles} title="Grounded in the rules" body="Answers come from the Department of Health published Support at Home rules and our editorial team's interpretation." />
                    <Feature icon={ShieldCheck} title="Private by default" body="No login required. Conversations are not used to train AI without consent. Read the privacy policy." />
                    <Feature icon={MessageCircle} title="Honest about limits" body="When a question is outside the public rules (clinical, financial, legal) Wayly says so and points to the right human." />
                </div>

                <div className="mt-10 rounded-2xl border border-[#CFE0F0] bg-white p-6" data-testid="askwayly-examples">
                    <div className="text-[11px] uppercase tracking-wider text-[#1565B8] font-semibold">Example questions families ask</div>
                    <ul className="mt-3 space-y-2 text-sm text-[#3C4A5E]">
                        {EXAMPLE_QUESTIONS.map((q, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2BC4D6] shrink-0" aria-hidden />
                                <span>{q}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                    <Link
                        to="/ai-tools/family-coordinator"
                        data-testid="askwayly-cta-primary"
                        className="inline-flex items-center gap-2 rounded-full bg-[#0E2A47] hover:bg-[#091D33] text-white px-6 py-3.5 text-sm font-semibold"
                    >
                        Start chatting <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                        to="/faq"
                        data-testid="askwayly-cta-secondary"
                        className="inline-flex items-center gap-2 rounded-full bg-white text-[#0E2A47] border border-[#CFE0F0] px-6 py-3.5 text-sm font-semibold hover:border-[#2BC4D6]"
                    >
                        Or browse the FAQ
                    </Link>
                </div>

                <p className="mt-10 text-xs text-[#4A5A75]">
                    Ask Wayly is an AI assistant. It is highly accurate on the public rules but always verify dollar figures, dates, and personal eligibility with your provider, your case manager, or My Aged Care on 1800 200 422.
                </p>
            </div>
            </main>
            <SeoHubLinks exclude="/ask-wayly" />
            <Footer />
        </div>
    );
}

function Feature({ icon: Icon, title, body }) {
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
