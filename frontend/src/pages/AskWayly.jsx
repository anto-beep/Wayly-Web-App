import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ShieldCheck, MessageCircle, Wallet, Repeat, HelpCircle } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHubLinks from "@/components/SeoHubLinks";
import SeoHead from "@/seo/SeoHead";
import Reveal from "@/components/Reveal";

const CLAY = "#A5512B";

const QUESTION_GROUPS = [
    {
        icon: Wallet,
        title: "Money and Budgets",
        questions: [
            "What is the quarterly budget for Level 4?",
            "What is the rollover cap and how does it work?",
            "How does the personal care change on 1 October 2026 affect me?",
            "How is my contribution worked out from my pension status?",
        ],
    },
    {
        icon: Repeat,
        title: "Providers and Care",
        questions: [
            "How do I switch providers without a gap in service?",
            "Can I claim AT-HM items more than once?",
            "Is the no worse off guarantee still in force?",
            "What is a brokered service and why does it cost more?",
        ],
    },
];

const HOW_IT_WORKS = [
    { icon: MessageCircle, title: "Ask in Plain English", body: "Type your question the way you would ask a knowledgeable friend. No jargon, no forms, no account needed." },
    { icon: Sparkles, title: "Get a Grounded Answer", body: "Wayly answers from the published Support at Home rules, using digits for money and % for percentages so the numbers are exact." },
    { icon: ShieldCheck, title: "Know the Limits", body: "When a question needs a human, Wayly says so and points you to your provider, case manager, or My Aged Care." },
];

const SEO_FAQS = [
    { q: "Is Ask Wayly Free?", a: "Yes. Ask Wayly is completely free with no login, no signup, and no marketing follow-up. You can ask as many Support at Home questions as you like." },
    { q: "Where Do Ask Wayly's Answers Come From?", a: "Answers are grounded in the Department of Health published Support at Home rules and the Wayly editorial team's plain-English interpretation of them. Wayly always uses $ for money and % for percentages, and never spells those out." },
    { q: "Does Ask Wayly Give Financial or Medical Advice?", a: "No. Ask Wayly explains how the program works, but it is not a financial adviser, case manager, or doctor. For personal financial, legal, or clinical decisions it will point you to the right qualified human." },
    { q: "Does Ask Wayly See My Statements?", a: "No. On this public page Ask Wayly only knows the general rules. It never sees your private statements unless you log in to Wayly and choose to share them, and conversations are never used to train AI without your consent." },
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
            {
                "@type": "FAQPage",
                mainEntity: SEO_FAQS.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
            },
        ],
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Ask Wayly: Free Plain-English Answers About Support at Home | Wayly"
                description="Ask Wayly is a free, evidence-grounded chat that answers Support at Home questions from the public rules: budgets, contributions, providers, and reassessments. No login, no signup."
                canonical="https://wayly.com.au/ask-wayly"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
            <div className="mx-auto max-w-3xl px-6 pt-12 pb-16">
                <Reveal>
                    <span className="overline">Ask Wayly</span>
                    <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 leading-tight tracking-tight" data-testid="askwayly-h1">
                        Plain-English Answers <span style={{ color: CLAY }}>About Support at Home</span>
                    </h1>
                    <p className="mt-4 text-muted-k leading-relaxed text-lg">
                        Ask Wayly is a free chat that answers your questions straight from the public Support at Home rules. It does not see your statements unless you log in and choose to share, it does not give financial or clinical advice, and it will tell you honestly when a question needs a human.
                    </p>
                </Reveal>

                <div className="mt-8 grid sm:grid-cols-3 gap-3">
                    <Feature icon={Sparkles} title="Grounded in the Rules" body="Answers come from the Department of Health published Support at Home rules and our editorial team's interpretation." />
                    <Feature icon={ShieldCheck} title="Private by Default" body="No login required. Conversations are not used to train AI without consent. Read the privacy policy." />
                    <Feature icon={MessageCircle} title="Honest About Limits" body="When a question is outside the public rules, clinical, financial or legal, Wayly says so and points to the right human." />
                </div>

                {/* How it works */}
                <Reveal as="section" className="mt-14" data-testid="askwayly-how">
                    <h2 className="font-heading text-2xl text-primary-k tracking-tight">How Ask Wayly Works</h2>
                    <div className="mt-5 grid sm:grid-cols-3 gap-4">
                        {HOW_IT_WORKS.map((s, i) => (
                            <div key={s.title} className="rounded-2xl border border-kindred bg-surface p-5">
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full font-heading text-sm" style={{ background: "#FBEEE7", color: CLAY }}>{i + 1}</span>
                                    <s.icon className="h-4 w-4" style={{ color: CLAY }} />
                                </div>
                                <div className="mt-3 font-heading text-lg text-primary-k">{s.title}</div>
                                <p className="mt-1 text-sm text-muted-k leading-relaxed">{s.body}</p>
                            </div>
                        ))}
                    </div>
                </Reveal>

                {/* Example questions, themed */}
                <Reveal as="section" className="mt-14" data-testid="askwayly-examples">
                    <h2 className="font-heading text-2xl text-primary-k tracking-tight">Questions Families Ask Most</h2>
                    <div className="mt-5 grid sm:grid-cols-2 gap-4">
                        {QUESTION_GROUPS.map((g) => (
                            <div key={g.title} className="rounded-2xl border border-kindred bg-surface p-5">
                                <div className="flex items-center gap-2">
                                    <g.icon className="h-4 w-4" style={{ color: CLAY }} />
                                    <div className="font-heading text-lg text-primary-k">{g.title}</div>
                                </div>
                                <ul className="mt-3 space-y-2 text-sm text-muted-k">
                                    {g.questions.map((q) => (
                                        <li key={q} className="flex items-start gap-2">
                                            <span className="mt-2 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: CLAY }} aria-hidden />
                                            <span>{q}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </Reveal>

                <div className="mt-10 flex flex-wrap gap-3">
                    <Link
                        to="/ai-tools/family-coordinator"
                        data-testid="askwayly-cta-primary"
                        className="inline-flex items-center gap-2 rounded-full bg-primary-k hover:bg-[#091D33] text-white px-6 py-3.5 text-sm font-semibold"
                    >
                        Start Chatting <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                        to="/faq"
                        data-testid="askwayly-cta-secondary"
                        className="inline-flex items-center gap-2 rounded-full bg-white text-primary-k border border-kindred px-6 py-3.5 text-sm font-semibold hover:border-[#A5512B]"
                    >
                        Or Browse the FAQ
                    </Link>
                </div>

                {/* SEO FAQ */}
                <Reveal as="section" className="mt-14" data-testid="askwayly-faq">
                    <h2 className="font-heading text-2xl text-primary-k tracking-tight">Ask Wayly, Answered</h2>
                    <div className="mt-5 space-y-3">
                        {SEO_FAQS.map((f, i) => (
                            <details key={i} className="group rounded-xl border border-kindred bg-surface px-5 py-4" data-testid={`askwayly-faq-${i}`}>
                                <summary className="cursor-pointer list-none flex items-start justify-between gap-3 text-primary-k font-semibold">
                                    <span className="inline-flex items-center gap-2"><HelpCircle className="h-4 w-4 flex-none" style={{ color: CLAY }} />{f.q}</span>
                                </summary>
                                <p className="mt-3 text-sm text-muted-k leading-relaxed">{f.a}</p>
                            </details>
                        ))}
                    </div>
                </Reveal>

                <p className="mt-10 text-xs text-muted-k">
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
        <div className="rounded-2xl border border-kindred bg-surface p-4">
            <div className="h-9 w-9 rounded-lg inline-flex items-center justify-center" style={{ background: "#FBEEE7", color: CLAY }}>
                <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="mt-3 font-semibold text-primary-k text-sm">{title}</div>
            <div className="mt-1 text-xs text-muted-k leading-relaxed">{body}</div>
        </div>
    );
}
