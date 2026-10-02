import React from "react";
import { Link } from "react-router-dom";
import {
    Moon,
    Sun,
    Compass,
    Scale,
    ShieldCheck,
    HandCoins,
    FileText,
    Wallet,
    Search,
    Handshake,
    Sparkles,
    Feather,
    ArrowRight,
    Users,
    Quote,
} from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";
import Reveal from "@/components/Reveal";
import { Orb } from "@/components/BrandVisuals";

// About page v8 (Jun 2026 visual rewrite).
//   - Far less prose. Every section is a bold, brand-coloured panel.
//   - WHITE text on every coloured background (light + dark).
//   - Icons, stat tiles and cards carry the story instead of long paragraphs.
//   - No em dashes in body copy. Wayly Title Case for headings.

const TEAL = "#0E4D52";
const CLAY = "#A5512B";
const SAGE = "#425F47";
const PLUM = "#5F4E76";
const TERRA = "#B23A2E";

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
                description:
                    "Wayly is an independent Australian software platform that helps families and older Australians understand Support at Home statements, budgets and care.",
            },
        ],
    };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="We Built Wayly Because Someone Had To | About Wayly"
                description="A calm, plain-English layer on top of Australia's Support at Home aged care system. Built by an Australian team for the people on the program, and for the people who love them."
                canonical="https://wayly.com.au/about"
                jsonLd={jsonLd}
            />
            <MarketingHeader />

            <main id="main-content" className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6 sm:space-y-8">
                {/* ---------------------------------------------------------------
                    HERO, solid teal, white text.
                    --------------------------------------------------------------- */}
                <Reveal>
                    <header className="relative overflow-hidden rounded-3xl bg-surface border border-kindred p-8 sm:p-14 shadow-sm">
                        <Orb className="wayly-float" style={{ width: 300, height: 300, top: -120, right: -80 }} from="#DCEAE9" to="#C4D4C8" />
                        <Orb className="wayly-float-slow" style={{ width: 220, height: 220, bottom: -100, left: -70 }} from="#F3E7DE" to="#E9D4C6" />
                        <div className="relative z-10 max-w-3xl">
                            <div className="inline-flex items-center gap-2 rounded-full bg-[#0E4D52]/8 px-3 py-1 text-[11px] uppercase tracking-[0.16em] font-semibold text-[#0E4D52]">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden /> About Wayly
                            </div>
                            <h1
                                data-testid="about-h1"
                                className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-5 leading-tight text-primary-k"
                            >
                                We Built Wayly Because{" "}
                                <span style={{ color: CLAY }}>Someone Had To.</span>
                            </h1>
                            <p className="mt-6 text-lg sm:text-xl text-muted-k leading-relaxed max-w-2xl">
                                A calm, plain-English layer on top of Australia&apos;s Support at Home
                                aged care system. Built by Australians, for the people on the
                                program and the people who love them.
                            </p>
                            <a
                                href="#about-section-moments"
                                data-testid="about-read-on"
                                onClick={(e) => {
                                    e.preventDefault();
                                    document
                                        .getElementById("about-section-moments")
                                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }}
                                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#0E4D52] px-6 py-3 text-sm font-semibold text-white shadow-md transition-transform"
                            >
                                Read Our Story
                                <ArrowRight className="h-4 w-4" aria-hidden />
                            </a>
                        </div>
                    </header>
                </Reveal>

                {/* ---------------------------------------------------------------
                    SECTION I, The Moments (two coloured scene cards).
                    --------------------------------------------------------------- */}
                <SectionHeading num="I" title="The Moments We&apos;re Building For" testid="about-section-moments" />
                <div className="grid gap-6 lg:grid-cols-2">
                    <Scene bg={CLAY} icon={Moon} label="11pm">
                        The email you have been avoiding since Wednesday. Twelve pages. Three budget
                        streams. A charge nobody mentioned. You were not trained for this, and you
                        are quietly exhausted.
                    </Scene>
                    <Scene bg={SAGE} icon={Sun} label="Wednesday, 9am">
                        Reading glasses on, a cup of tea, the statement finally open. You have paid
                        every bill on time for decades. You just wish the paper would speak your
                        language.
                    </Scene>
                </div>
                <PullQuote bg={TEAL}>That is the moment Wayly was built for.</PullQuote>

                {/* ---------------------------------------------------------------
                    SECTION II, You Are Not Alone.
                    --------------------------------------------------------------- */}
                <SectionHeading num="II" title="You Are Not Alone in This" testid="about-section-not-alone" />
                <Reveal>
                    <div
                        className="rounded-3xl bg-surface border border-kindred p-8 sm:p-10 shadow-sm border-l-4"
                        style={{ borderLeftColor: PLUM }}
                    >
                        <p className="text-lg sm:text-xl leading-relaxed max-w-3xl text-primary-k/90">
                            Across Australia, other people are doing exactly what you are doing. The
                            older Australian reading their own statement. The adult child three
                            states away. The siblings on WhatsApp. The partner of forty years.
                        </p>
                        <p className="mt-4 font-heading text-2xl sm:text-3xl leading-snug text-primary-k">
                            None of you are getting a handbook.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            {["Older Australians", "Adult children", "Siblings", "Partners"].map((t) => (
                                <span
                                    key={t}
                                    className="inline-flex items-center gap-2 rounded-full bg-surface-2 border border-kindred px-4 py-2 text-sm font-medium text-primary-k"
                                >
                                    <Users className="h-4 w-4" style={{ color: PLUM }} aria-hidden />
                                    {t}
                                </span>
                            ))}
                        </div>
                    </div>
                </Reveal>

                {/* ---------------------------------------------------------------
                    SECTION III, Why Now (stat tiles).
                    --------------------------------------------------------------- */}
                <SectionHeading num="III" title="Why Now" testid="about-section-why-now" />
                <div className="grid gap-4 sm:grid-cols-3">
                    <StatTile bg={TEAL} value="3" label="Budget Streams" />
                    <StatTile bg={CLAY} value="8" label="Classification Levels" />
                    <StatTile bg={SAGE} value="Nov 2025" label="Support at Home Began" />
                </div>
                <Reveal>
                    <p className="text-base sm:text-lg text-primary-k leading-relaxed max-w-3xl">
                        Support at Home is fairer than what came before. It is also far more complex.
                        The official documents are accurate, but they are not how anyone actually
                        talks. People need a careful translator in the middle. That is the whole job.
                    </p>
                </Reveal>

                {/* ---------------------------------------------------------------
                    SECTION IV, What We Have Learned (numbered coloured cards).
                    --------------------------------------------------------------- */}
                <SectionHeading num="IV" title="What We&apos;ve Learned Along the Way" testid="about-section-learned" />
                <div className="grid gap-4 md:grid-cols-2">
                    <Lesson n="01" bg={TEAL}>
                        The system was not built to be read by the people paying its bills. That is
                        not your failure.
                    </Lesson>
                    <Lesson n="02" bg={CLAY}>
                        You are allowed to ask questions and push back, even when a professional
                        wrote it.
                    </Lesson>
                    <Lesson n="03" bg={SAGE}>
                        Being careful with your money is not being difficult. It is being sensible.
                    </Lesson>
                    <Lesson n="04" bg={PLUM}>
                        A well-decoded statement can prevent a family argument or a preventable loss.
                    </Lesson>
                    <Lesson n="05" bg={TERRA}>
                        Whether you are cared for or doing the caring, this is real work. It does not
                        get easier by pretending it is not hard.
                    </Lesson>
                </div>

                {/* ---------------------------------------------------------------
                    SECTION V, What We Believe (icon belief cards).
                    --------------------------------------------------------------- */}
                <SectionHeading num="V" title="What We Believe" testid="about-section-believe" />
                <div className="grid gap-6 md:grid-cols-3">
                    <Belief bg={CLAY} icon={Scale} title="Plain English Is the Correction">
                        If we cannot explain a fee in one sentence to the person paying it, the fee is
                        the problem, not the explanation.
                    </Belief>
                    <Belief bg={TEAL} icon={HandCoins} title="We Work for You, Not the Provider">
                        No referral fees. No kickbacks. No commissions from any aged care provider.
                        Ever. Our comparisons are honest.
                    </Belief>
                    <Belief bg={SAGE} icon={ShieldCheck} title="Privacy Is Built In">
                        Your data is hosted in Australia and encrypted. We do not train AI on your
                        files without consent. Delete means delete.
                    </Belief>
                </div>

                {/* ---------------------------------------------------------------
                    SECTION VI, What Wayly Does Across a Year (cluster cards).
                    --------------------------------------------------------------- */}
                <SectionHeading
                    num="VI"
                    title="What Wayly Does Across a Year"
                    testid="about-section-year"
                    lead="Aged care is not one moment. It is a hundred small ones. Wayly is one calm product with a careful tool for each."
                />
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    <ClusterCard
                        bg={TEAL}
                        icon={FileText}
                        title="Reading What You&apos;re Paying For"
                        to="/ai-tools/statement-decoder"
                    >
                        Turn a twelve-page statement into a plain answer in about sixty seconds.
                    </ClusterCard>
                    <ClusterCard
                        bg={CLAY}
                        icon={Wallet}
                        title="The Right Care at the Right Price"
                        to="/ai-tools/provider-price-checker"
                    >
                        Check a quoted price against the published range before you say yes.
                    </ClusterCard>
                    <ClusterCard
                        bg={SAGE}
                        icon={Search}
                        title="Speaking Up When Something&apos;s Wrong"
                        to="/ai-tools/letters-and-follow-ups"
                    >
                        Draft a polite, firm, correct letter, or escalate to the right regulator.
                    </ClusterCard>
                    <ClusterCard
                        bg={PLUM}
                        icon={Handshake}
                        title="Keeping Everyone on the Same Page"
                        to="/ai-tools/family-coordinator"
                    >
                        A shared thread and a record of who agreed to what, without three email chains.
                    </ClusterCard>
                </div>
                <Reveal>
                    <div
                        className="rounded-3xl p-6 sm:p-8 text-white shadow-md"
                        style={{ background: `linear-gradient(135deg, ${TEAL}, ${PLUM})` }}
                    >
                        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            Ask Wayly
                        </div>
                        <p className="mt-3 text-base sm:text-lg leading-relaxed max-w-4xl text-white">
                            Alongside every tool, Ask Wayly answers questions in plain English at any
                            time. What does &quot;brokered service&quot; mean? Is $95 an hour high?
                            You ask, it answers.
                        </p>
                    </div>
                </Reveal>

                {/* ---------------------------------------------------------------
                    SECTION VII, What Wayly Doesn't Do.
                    --------------------------------------------------------------- */}
                <SectionHeading num="VII" title="What Wayly Doesn&apos;t Do" testid="about-section-doesnt-do" />
                <Reveal>
                    <div
                        className="rounded-3xl bg-surface border border-kindred p-8 sm:p-10 shadow-sm border-l-4"
                        style={{ borderLeftColor: TERRA }}
                    >
                        <p className="text-lg sm:text-xl leading-relaxed max-w-3xl text-primary-k/90">
                            Wayly is not your case manager, financial adviser, or doctor. We are a
                            co-pilot, not a driver. We tell you what the statement says. We do not tell
                            you what to do about it.
                        </p>
                    </div>
                </Reveal>

                {/* ---------------------------------------------------------------
                    SECTION IX, The Small Thing.
                    --------------------------------------------------------------- */}
                <SectionHeading num="IX" title="The Small Thing We Want for You" testid="about-section-small-thing" />
                <Reveal>
                    <p className="text-base sm:text-lg text-primary-k leading-relaxed max-w-3xl">
                        We want you to sit down with a cup of tea and know, in about ten seconds, that
                        everything is roughly okay. The cleaner is booked. The invoice matches. The
                        budget will hold. Nobody is sending an email at 11pm that ruins your week.
                    </p>
                </Reveal>
                <PullQuote bg={SAGE}>
                    That is the small, boring, precious thing we are trying to build.
                </PullQuote>

                {/* ---------------------------------------------------------------
                    SECTION X, Antony's note.
                    --------------------------------------------------------------- */}
                <Reveal>
                    <section
                        data-testid="about-section-antony"
                        className="rounded-3xl p-8 sm:p-12 text-white shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${TEAL}, #0A3E42)` }}
                    >
                        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70">
                            <Feather className="h-3.5 w-3.5" aria-hidden />
                            A Personal Note
                        </div>
                        <h2 className="mt-5 font-heading text-2xl sm:text-3xl tracking-tight leading-tight text-white">
                            A Note From Antony
                        </h2>
                        <div className="mt-6 space-y-4 text-base sm:text-lg leading-relaxed max-w-2xl text-white/90">
                            <p>Wayly is new, and I am the person behind it.</p>
                            <p>
                                I built it because I could not accept that families and older
                                Australians were left working out the same twelve-page statement
                                alone, at 11pm. If Wayly helps you, that is why.
                            </p>
                            <p>
                                If something is wrong, write to me at{" "}
                                <a
                                    className="underline decoration-white/50 underline-offset-4 hover:decoration-white text-white"
                                    href="mailto:support@wayly.com.au"
                                >
                                    support@wayly.com.au
                                </a>
                                . I read every message and fix what I can, quickly.
                            </p>
                        </div>
                        <div className="mt-8 flex items-center gap-4">
                            <span aria-hidden className="font-heading italic text-3xl text-white">
                                Antony
                            </span>
                            <span className="h-px flex-1 bg-white/25" aria-hidden />
                        </div>
                        <div className="mt-2 text-sm text-white/70">Founder, Wayly</div>
                    </section>
                </Reveal>

                {/* ---------------------------------------------------------------
                    SECTION XI, Try Wayly CTA.
                    --------------------------------------------------------------- */}
                <Reveal>
                    <section
                        data-testid="about-section-try"
                        className="rounded-3xl p-8 sm:p-12 text-white shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${CLAY}, #7A3A1F)` }}
                    >
                        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70">
                            <Compass className="h-3.5 w-3.5" aria-hidden />
                            Take the First Step
                        </div>
                        <h2 className="mt-5 font-heading text-3xl sm:text-5xl tracking-tight leading-tight text-white">
                            Try Wayly
                        </h2>
                        <p className="mt-5 text-base sm:text-lg leading-relaxed max-w-3xl text-white/90">
                            Every tool is free to try. Start a 7-day trial of any paid plan, no card
                            needed. Or run one free Statement Decode every 120 days, no signup.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                to="/ai-tools/statement-decoder"
                                data-testid="about-cta-decode"
                                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold shadow-md transition-transform"
                                style={{ color: CLAY }}
                            >
                                Decode a Statement
                                <ArrowRight className="h-4 w-4" aria-hidden />
                            </Link>
                            <Link
                                to="/pricing"
                                data-testid="about-cta-plans"
                                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                            >
                                See Our Plans
                            </Link>
                        </div>
                    </section>
                </Reveal>
            </main>
            <Footer />
        </div>
    );
}

// ---------------------------------------------------------------------
// Presentation primitives.
// ---------------------------------------------------------------------

function SectionHeading({ num, title, testid, lead }) {
    return (
        <div id={testid} data-testid={testid} className="scroll-mt-24 pt-6">
            <div className="flex items-center gap-3">
                <span
                    className="font-heading text-lg tabular-nums"
                    style={{ color: CLAY }}
                    aria-hidden
                >
                    {num}
                </span>
                <span className="h-1 w-12 rounded-full" style={{ background: CLAY }} aria-hidden />
            </div>
            <h2
                className="mt-3 font-heading text-3xl sm:text-4xl text-primary-k tracking-tight leading-tight"
                dangerouslySetInnerHTML={{ __html: title }}
            />
            {lead && <p className="mt-3 text-base sm:text-lg text-muted-k leading-relaxed max-w-3xl">{lead}</p>}
        </div>
    );
}

function Scene({ bg, icon: Icon, label, children }) {
    return (
        <Reveal className="h-full">
            <div className="group relative h-full overflow-hidden rounded-2xl bg-surface border border-kindred p-6 sm:p-8 shadow-sm transition-colors">
                <span className="absolute left-0 top-0 h-1.5 w-full opacity-80" style={{ backgroundColor: bg }} />
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em]" style={{ color: bg }}>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: bg }}>
                        <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    {label}
                </div>
                <p className="mt-5 text-base sm:text-lg leading-relaxed text-primary-k/90">{children}</p>
            </div>
        </Reveal>
    );
}

function PullQuote({ bg, children }) {
    return (
        <Reveal>
            <div className="rounded-2xl bg-surface-2 border border-kindred border-l-4 p-8 sm:p-10 shadow-sm flex items-start gap-4" style={{ borderLeftColor: bg }}>
                <Quote className="h-8 w-8 flex-shrink-0" style={{ color: bg }} aria-hidden />
                <p className="font-heading italic text-2xl sm:text-3xl leading-snug text-primary-k">
                    {children}
                </p>
            </div>
        </Reveal>
    );
}

function StatTile({ bg, value, label }) {
    return (
        <Reveal className="h-full">
            <div className="group relative h-full overflow-hidden rounded-2xl bg-surface border border-kindred p-6 text-center shadow-sm transition-colors">
                <span className="absolute left-0 top-0 h-1.5 w-full opacity-80" style={{ backgroundColor: bg }} />
                <div className="font-heading text-4xl sm:text-5xl tabular-nums" style={{ color: bg }}>{value}</div>
                <div className="mt-2 text-xs uppercase tracking-wider text-muted-k leading-tight">
                    {label}
                </div>
            </div>
        </Reveal>
    );
}

function Lesson({ n, bg, children }) {
    return (
        <Reveal className="h-full">
            <div className="flex gap-5 rounded-2xl bg-surface border border-kindred border-l-4 p-6 h-full shadow-sm transition-colors" style={{ borderLeftColor: bg }}>
                <span className="font-heading text-3xl tabular-nums select-none" style={{ color: bg }} aria-hidden>
                    {n}
                </span>
                <p className="text-base sm:text-lg leading-relaxed text-primary-k/90">{children}</p>
            </div>
        </Reveal>
    );
}

function Belief({ bg, icon: Icon, title, children }) {
    return (
        <Reveal className="h-full">
            <div className="group relative h-full overflow-hidden rounded-2xl bg-surface border border-kindred p-6 sm:p-8 shadow-sm transition-colors">
                <span className="absolute left-0 top-0 h-1.5 w-full opacity-80" style={{ backgroundColor: bg }} />
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: bg }}>
                    <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-5 font-heading text-lg sm:text-xl tracking-tight leading-snug text-primary-k">
                    {title}
                </h3>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-k">{children}</p>
            </div>
        </Reveal>
    );
}

function ClusterCard({ bg, icon: Icon, title, to, children }) {
    const withFrom = to.includes("?") ? `${to}&from=about` : `${to}?from=about`;
    return (
        <Reveal className="h-full">
            <Link
                to={withFrom}
                data-testid="about-cluster-card"
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-surface border border-kindred p-6 shadow-sm transition-colors"
            >
                <span className="absolute left-0 top-0 h-1.5 w-full opacity-80" style={{ backgroundColor: bg }} />
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: bg }}>
                    <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3
                    className="mt-5 font-heading text-lg sm:text-xl tracking-tight leading-snug text-primary-k"
                    dangerouslySetInnerHTML={{ __html: title }}
                />
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-k flex-1">{children}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] font-semibold" style={{ color: bg }}>
                    Open the Tool
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-" aria-hidden />
                </span>
            </Link>
        </Reveal>
    );
}
