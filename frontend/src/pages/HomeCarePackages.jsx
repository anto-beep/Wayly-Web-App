import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";

// HCP-BRIDGE-1 pillar page. Captures old-name "home care package" searches and
// routes them to the Statement Decoder. Rule: always pair the old name with the
// new one; never imply Home Care Packages are open to new applicants; no dollar
// figures (lifetime cap kept as concept only, filled from INDEX-1 before any
// figure is ever shown).
const PATH = "/home-care-packages";

const SECTIONS = [
    {
        id: "did-it-disappear",
        heading: "Did my Home Care Package just disappear?",
        body: "No. Every active Home Care Package moved to Support at Home automatically on 01/11/2025. There was no need to reapply or be reassessed just because the program changed. Your provider stayed the same unless you chose to change it.",
    },
    {
        id: "what-happened-to-funding",
        heading: "What happened to my funding?",
        body: "Your funding carried across at an equivalent level. People who moved from a Home Care Package keep a transitioned level of funding that matches what they had before. Any unspent Home Care Package money was kept and moved across with you.",
    },
    {
        id: "levels-vs-classifications",
        heading: "Are the old four levels the same as the new eight?",
        body: "Not directly. Home Care Packages had four levels. Support at Home has eight classifications. The government did not simply map the old four onto the new eight, so there is no exact \u201clevel 2 equals classification X\u201d answer. What matters is that your funding was maintained across the change.",
    },
    {
        id: "will-i-pay-more",
        heading: "Will I pay more now?",
        body: "If you were approved for a Home Care Package before 01/11/2025, a no worse off protection applies. Your contribution under Support at Home will not be higher than it was under your Home Care Package, even if you are later reassessed into a higher classification. This protection is set out in the Aged Care Rules 2025.",
    },
    {
        id: "can-i-still-get-one",
        heading: "Can I still get a Home Care Package?",
        body: "No. Home Care Packages closed to new applicants on 01/11/2025. Anyone new to in-home care now applies for Support at Home through My Aged Care on 1800 200 422.",
    },
    {
        id: "statement-looks-different",
        heading: "Your statement looks different now",
        body: "Support at Home statements are laid out differently from the old Home Care Package statements, with new service categories and a quarterly budget. If your first statements have been hard to read, that is exactly what Wayly's Statement Decoder is for.",
        cta: true,
    },
];

export default function HomeCarePackages() {
    const faqs = SECTIONS.filter((s) => s.heading.includes("?")).map((s) => ({ q: s.heading, a: s.body }));
    const faqLd = {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    };
    const articleLd = {
        "@type": "Article",
        headline: "Home Care Packages are now Support at Home",
        description: "Home Care Packages became Support at Home on 01/11/2025. What changed for your funding, your statement and what you pay, in plain English.",
        author: { "@type": "Organization", name: "Wayly" },
        publisher: { "@type": "Organization", name: "Wayly", logo: { "@type": "ImageObject", url: "https://wayly.com.au/branding/png/wayly-mark-512.png" } },
        datePublished: "2026-11-10",
        dateModified: "2026-11-10",
        mainEntityOfPage: { "@type": "WebPage", "@id": `https://wayly.com.au${PATH}` },
    };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Home Care Packages are now Support at Home | Wayly"
                description="Home Care Packages became Support at Home on 01/11/2025. See what changed for your funding, your statement and what you pay, in plain English."
                path={PATH}
                type="article"
                jsonLd={[articleLd, faqLd]}
            />
            <MarketingHeader />
            <main id="main-content" className="mx-auto max-w-4xl px-6 py-16">
                <span className="overline">Support at Home</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight" data-testid="hcp-pillar-h1">
                    Home Care Packages are now Support at Home
                </h1>

                {/* Intro */}
                <p className="mt-6 text-lg text-muted-k leading-relaxed">
                    On 01/11/2025, the Home Care Packages Program was replaced by Support at Home across Australia. If you or a parent had a Home Care Package, you are now on Support at Home. Your care did not stop, and you did not need to do anything to move across. This page explains what changed, in plain English.
                </p>

                {/* Sections */}
                <div className="mt-12 space-y-10">
                    {SECTIONS.map((s) => (
                        <section key={s.id} id={s.id} data-testid={`hcp-section-${s.id}`}>
                            <h2 className="font-heading text-2xl sm:text-3xl text-primary-k tracking-tight">{s.heading}</h2>
                            <p className="mt-3 text-base text-muted-k leading-relaxed">{s.body}</p>
                        </section>
                    ))}
                </div>

                {/* Closing CTA */}
                <div className="mt-16 rounded-2xl bg-primary-k text-white p-8 text-center" data-testid="hcp-closing-cta">
                    <h2 className="font-heading text-2xl sm:text-3xl">Try Wayly free for 7 days</h2>
                    <p className="mt-3 text-white/85 max-w-xl mx-auto leading-relaxed">
                        Make sense of your Support at Home statements, budgets and contributions, with every Wayly tool for 7 days.
                    </p>
                    <Link
                        to="/signup"
                        data-testid="hcp-signup-cta"
                        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-white text-primary-k font-bold px-7 py-3.5 shadow-lg"
                    >
                        Try Wayly free for 7 days <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

                <p className="mt-10 text-xs text-muted-k italic" data-testid="hcp-disclaimer">
                    General information, not financial, legal or clinical advice.
                </p>
            </main>
            <Footer />
        </div>
    );
}
