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
} from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";
import Reveal from "@/components/Reveal";

// About page v7 (July 2026 rewrite, wide editorial layout).
// Voice notes:
//   - Plain-spoken Australian English. Year 9 reading level.
//   - No em dashes anywhere in body copy.
//   - All headings use Wayly Title Case (Section 1.3 of the Dec 2026 refit).
// Layout:
//   - Wide 12-column editorial grid.
//   - Left column = sticky section marker (Roman numeral + H2 heading).
//   - Right column = body prose, cards, scenes.
//   - Hero spans ~1280px wide with generous vertical space.
//   - Antony's note keeps the intimate narrower column feel.

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
            <main id="main-content">
                {/* -----------------------------------------------------
                    HERO, wide asymmetric editorial layout.
                    Left: chapter pill + massive H1.
                    Right: italic standfirst floated in a narrower rail.
                    ----------------------------------------------------- */}
                <header className="relative overflow-hidden">
                    <div className="mx-auto max-w-[1600px] px-6 lg:px-12 pt-20 pb-8 sm:pt-28 sm:pb-12">
                        <div className="grid grid-cols-12 gap-x-8 lg:gap-x-16">
                            <div className="col-span-12 lg:col-span-8">
                                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-k">
                                    <span className="h-px w-8 bg-muted-k/60" aria-hidden />
                                    About Wayly
                                    <span className="h-px w-8 bg-muted-k/60" aria-hidden />
                                </div>
                                <h1
                                    data-testid="about-h1"
                                    className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight max-w-3xl"
                                >
                                    We Built Wayly Because <span style={{ color: "#A5512B" }}>Someone Had To.</span>
                                </h1>
                            </div>
                            <aside className="col-span-12 lg:col-span-4 mt-10 lg:mt-24 lg:pt-12 lg:border-l lg:border-kindred lg:pl-8">
                                <p className="italic text-lg sm:text-xl text-muted-k leading-relaxed">
                                    A calm, plain-English layer on top of Australia&apos;s Support at
                                    Home aged care system. Built by an Australian team for the people
                                    on the program, and for the people who love them.
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
                                    className="mt-10 inline-flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-k hover:text-primary-k transition-colors"
                                >
                                    <span>Read on</span>
                                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                </a>
                            </aside>
                        </div>
                    </div>
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-kindred"
                    />
                </header>

                {/* -----------------------------------------------------
                    ARTICLE BODY, wide 12-column editorial grid.
                    ----------------------------------------------------- */}
                <div className="mx-auto max-w-7xl px-6 lg:px-10 pb-24">
                    {/* -------------- Section I -------------- */}
                    <Section first num="I" title="The Moments We&apos;re Building For" testid="about-section-moments">
                        <div className="grid gap-6 lg:grid-cols-2">
                            <Scene icon={Moon} label="11pm">
                                <P>It might be 11pm.</P>
                                <P>
                                    The kids are asleep. The dishwasher is humming in the next room.
                                    Your partner has gone to bed. You sit on the couch with a lukewarm
                                    cup of tea and open the email from your dad&apos;s provider, the
                                    one you&apos;ve been avoiding since Wednesday. Twelve pages. Three
                                    budget streams. A &quot;service management charge&quot; nobody
                                    mentioned when you sat in that meeting six weeks ago. A cleaner
                                    billed twice on a Tuesday you&apos;re almost sure she came once.
                                    Your sister in Perth has been texting you all week asking
                                    what&apos;s happening. Mum called this morning and said she
                                    doesn&apos;t want to be a burden.
                                </P>
                                <P>
                                    You weren&apos;t trained for this. You went from being
                                    someone&apos;s child to being someone&apos;s advocate,
                                    translator, accountant, and roster planner, all without anyone
                                    handing you a job description. You are doing your best. You are
                                    also, quietly, exhausted.
                                </P>
                            </Scene>

                            <Scene icon={Sun} label="Wednesday, 9am">
                                <P>Or it might be a Wednesday morning at your kitchen table.</P>
                                <P>
                                    You&apos;ve made a cup of tea. Your reading glasses are on. The
                                    envelope arrived Monday and you&apos;re finally getting to it.
                                    You&apos;ve run a household, paid every bill on time for decades,
                                    and made every hard decision your life has asked of you. You are
                                    perfectly capable of reading a statement. But this one has three
                                    budget streams, a line for &quot;service management&quot;, a rate
                                    that&apos;s crept up since last quarter, and a section about
                                    &quot;brokered services&quot; that nobody explained. You could
                                    ring the provider, but the last person who answered read from a
                                    script you couldn&apos;t quite parse. You could ring someone in
                                    the family, but the last time you did they sounded stretched.
                                    You&apos;ll figure it out yourself.
                                </P>
                                <P>That&apos;s what you&apos;ve always done.</P>
                                <P>You just wish the paper would speak your language.</P>
                            </Scene>
                        </div>

                        <div className="mt-12 space-y-5">
                            <P>
                                Two different chairs. The same paperwork. The same twelve-page
                                statement. The same &quot;service management charge&quot; nobody
                                explained.
                            </P>
                            <P>
                                Whether it&apos;s your care or someone else&apos;s, whether
                                you&apos;re doing this on your own or as part of a family, whether
                                you started thinking about aged care this week or you&apos;ve been
                                carrying it for years, you deserve to know what the paper says.
                            </P>
                            <PullQuote>That is the moment Wayly was built for.</PullQuote>
                        </div>
                    </Section>

                    {/* -------------- Section II -------------- */}
                    <Section num="II" title="You Are Not Alone in This" testid="about-section-not-alone">
                        <P>
                            Right now, across Australia, other people are doing exactly what
                            you&apos;re doing.
                        </P>
                        <P>
                            Some are the older Australian reading their own statement over
                            breakfast and quietly working out whether the numbers add up. Some are
                            the adult child trying to keep the plates spinning from three suburbs or
                            three states away. Some are the siblings coordinating over WhatsApp.
                            Some are the partner of forty years, still doing the shopping and the
                            medications, wondering how to get help without giving anything up. Some
                            are all of the above at once.
                        </P>
                        <PullQuote>None of you are getting a handbook.</PullQuote>
                        <P>
                            That is not a failure of you or your family. It is a failure of the
                            system to speak plainly. The rules exist. The forms exist. The prices
                            exist. What has been missing is the layer in between. The friend who
                            happens to have read the rules. The person who will sit with you at your
                            kitchen table for as long as it takes to explain what your bill actually
                            means, in words you can use.
                        </P>
                        <P>That is the whole job. That is what we are trying to be.</P>
                    </Section>

                    {/* -------------- Section III -------------- */}
                    <Section num="III" title="Why Now" testid="about-section-why-now">
                        <P>
                            In November 2025, Australia replaced Home Care Packages with Support at
                            Home. The new program is, in many ways, fairer. It is also significantly
                            more complex.
                        </P>
                        <StatRow>
                            <Stat value="3" label="Budget Streams" />
                            <Stat value="8" label="Classification Levels" />
                            <Stat value="1" label="Program Still Bedding In" />
                        </StatRow>
                        <P>
                            Three separate budget streams. Quarterly caps and lifetime caps that
                            interact in ways the brochures don&apos;t quite explain. A market of
                            providers charging very different prices for what looks, on paper, like
                            the same service. Rules that will keep moving through 2026, including
                            the personal care funding change coming in October.
                        </P>
                        <P>
                            The official documents are accurate. They are also not how anyone
                            actually talks.
                        </P>
                        <P>
                            People need someone in the middle. Not a salesperson. Not a replacement
                            for your case manager. Just a quiet, careful translator who has read the
                            rules, can read your statement, and will tell you what it actually says,
                            and what to do about it.
                        </P>
                        <PullQuote>That is the whole job.</PullQuote>
                    </Section>

                    {/* -------------- Section IV -------------- */}
                    <Section num="IV" title="What We&apos;ve Learned Along the Way" testid="about-section-learned">
                        <P>
                            The people who built Wayly have spent months listening to people on both
                            sides of this. We have listened to the family member reading a
                            parent&apos;s statement late at night. We have listened to the person
                            quietly figuring out their own bill without wanting to trouble anyone.
                            We have watched families make the phone calls that go around in circles.
                            We have read the booklets that were supposed to explain everything, and
                            found that they don&apos;t.
                        </P>
                        <P>
                            Along the way we&apos;ve learned some things we would have given
                            anything to hear from someone else at the start. We&apos;ll put them
                            here in case they help.
                        </P>
                        <div className="mt-10 grid gap-4 md:grid-cols-2">
                            <LessonCard n="01">
                                The system was not built to be read by the people paying its bills.
                                That is not your failure. It is a design choice we can help fix.
                            </LessonCard>
                            <LessonCard n="02">
                                You are allowed to ask questions. You are allowed to push back. You
                                are allowed to say &quot;that doesn&apos;t look right&quot; even
                                when a professional wrote it.
                            </LessonCard>
                            <LessonCard n="03">
                                Being careful with your money is not being difficult. It is being
                                sensible. Every dollar in your budget is yours to account for,
                                whether you contributed it or the taxpayer did.
                            </LessonCard>
                            <LessonCard n="04">
                                A well-decoded statement can prevent a family argument, a bad
                                decision, or a preventable loss. Small paperwork wins are not small.
                            </LessonCard>
                            <LessonCard n="05">
                                Whether you&apos;re the one being cared for, or the one doing the
                                caring, this is real work. Nothing about it gets easier by
                                pretending it isn&apos;t hard.
                            </LessonCard>
                        </div>
                        <P className="mt-10">
                            We built Wayly around these truths, not around a market opportunity.
                        </P>
                    </Section>

                    {/* -------------- Section V (full-width card row) -------------- */}
                    <WideSection num="V" title="What We Believe" testid="about-section-believe">
                        <div className="grid gap-6 md:grid-cols-3">
                            <Belief
                                icon={Scale}
                                title="Complexity in Aged Care Is Not Neutral, and Plain English Is the Correction."
                            >
                                Some of the system&apos;s complexity is genuine. Some of it has
                                quietly benefited the people paid to explain it. Neither reason
                                justifies leaving you to figure it out alone. Every plain-English
                                explanation Wayly writes is, in its small way, a correction. If we
                                can&apos;t explain a fee in one sentence to the person paying it,
                                the fee is the problem, not the explanation.
                            </Belief>
                            <Belief
                                icon={HandCoins}
                                title="We Work for You, Not the Provider."
                            >
                                Wayly has never taken a referral fee, a kickback, or a commission
                                from an aged care provider. We never will. When we compare providers
                                on price or anything else, the comparison is honest and no financial
                                relationship influences what you see.
                            </Belief>
                            <Belief
                                icon={ShieldCheck}
                                title="Privacy Is Built Into How the Product Works."
                            >
                                Your data is hosted in Australia. It is encrypted in transit and at
                                rest. We use AI to read your statements and answer your questions,
                                but we don&apos;t use your data to train AI models without your
                                explicit consent. If you delete your account, we delete the data.
                                Not &quot;anonymise&quot;. Not &quot;retain for analytics&quot;.
                                Delete.
                            </Belief>
                        </div>
                    </WideSection>

                    {/* -------------- Section VI (full-width cluster row) -------------- */}
                    <WideSection
                        num="VI"
                        title="What Wayly Does Across a Year in Aged Care"
                        testid="about-section-year"
                        lead={
                            <>
                                <P>
                                    Statements are how most people first meet Wayly. The 11pm ones
                                    or the Wednesday morning ones. But the twelve-page bill is one
                                    moment in a much longer story, and Wayly is built for the rest
                                    of it too.
                                </P>
                                <P>
                                    Aged care is not one moment. It&apos;s a hundred small moments
                                    across a year. Some routine. Some hard. Some the difference
                                    between a good week and a bad one. Wayly is one product with a
                                    set of small, careful tools for each of them.
                                </P>
                            </>
                        }
                    >
                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                            <ClusterCard
                                icon={FileText}
                                title="Reading What You&apos;re Paying For"
                                to="/ai-tools/statement-decoder"
                            >
                                When the monthly statement arrives and you want to know what twelve
                                pages actually say, in about sixty seconds. When you&apos;re
                                checking whether your quarterly budget will hold through the next
                                reassessment, or whether the lifetime cap is closer than you
                                thought. When you&apos;re working out what share of the cost is
                                yours and what share the government covers, so you can plan a year
                                with real numbers instead of guesses.
                            </ClusterCard>
                            <ClusterCard
                                icon={Wallet}
                                title="Choosing the Right Care at the Right Price"
                                to="/ai-tools/provider-price-checker"
                            >
                                When a provider quotes you a price for something and you want to
                                know whether it&apos;s inside or outside the Department of
                                Health&apos;s published range. When you think your classification
                                might not match the care you actually need, and you want to check
                                quietly, on your own, before you ask for a reassessment. When the
                                care plan lands and you want to know if it&apos;s missing something
                                before the meeting, not after.
                            </ClusterCard>
                            <ClusterCard
                                icon={Search}
                                title="Speaking Up When Something Isn&apos;t Right"
                                to="/ai-tools/letters-and-follow-ups"
                            >
                                When you need to write to a provider about a bill that doesn&apos;t
                                add up, and you want the letter to be polite, firm, and correct.
                                When you need to escalate to the Aged Care Quality and Safety
                                Commission or the Ombudsman and you&apos;re not sure how to phrase
                                it. When someone&apos;s safety is at risk and you need the right
                                pathway, quickly, with the right numbers to call.
                            </ClusterCard>
                            <ClusterCard
                                icon={Handshake}
                                title="Keeping Everyone on the Same Page"
                                to="/ai-tools/family-coordinator"
                            >
                                When more than one person is involved in a decision, and you want a
                                shared thread and a record of who agreed to what. When the family
                                needs to see the same information you see, without three separate
                                email chains. When you&apos;d rather use Wayly on your own and have
                                it stay quiet and out of the way, until the day you don&apos;t want
                                it to.
                            </ClusterCard>
                        </div>

                        <div className="mt-12 rounded-2xl border border-kindred bg-surface p-6 sm:p-8">
                            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-k">
                                <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden />
                                Ask Wayly
                            </div>
                            <p className="mt-4 text-base sm:text-lg text-primary-k leading-relaxed max-w-4xl">
                                Alongside all of this, Ask Wayly answers questions in plain English
                                at any time. What does &quot;brokered service&quot; mean? Is a $95
                                hourly rate for domestic assistance high? Can I use unspent
                                quarterly budget next quarter? You ask. It answers.
                            </p>
                        </div>

                        <div className="mt-10 max-w-4xl space-y-5">
                            <P>
                                The tools are being wired to know about each other. When your
                                Statement Decoder catches a rate increase, we want your Budget
                                Calculator to see it. When your Support Plan Reviewer finds a gap, we
                                want your Letters tool to have a draft ready. When Ask Wayly answers
                                a question, we want it to use what your other tools already know.
                                Some of that is live today. Some of it we&apos;re still building.
                            </P>
                            <P>
                                You don&apos;t have to use all of it to get value from any of it.
                                But when you use more of it, it starts to feel like one calm room,
                                not eight noisy tabs.
                            </P>
                        </div>
                    </WideSection>

                    {/* -------------- Section VII -------------- */}
                    <Section num="VII" title="What Wayly Doesn&apos;t Do" testid="about-section-doesnt-do">
                        <P>
                            Wayly is not your case manager, your financial adviser, or your doctor.
                            Clinical decisions belong with your care team. Financial decisions
                            belong with someone licensed to make them with you. Wayly is a co-pilot,
                            not a driver. We will tell you what the statement says. We won&apos;t
                            tell you what to do about it.
                        </P>
                    </Section>

                    {/* -------------- Section IX -------------- */}
                    <Section num="IX" title="The Small Thing We Want for You" testid="about-section-small-thing">
                        <P>
                            We want you to sit down with a cup of tea on a Tuesday afternoon and
                            know, in about ten seconds, that everything is roughly okay.
                        </P>
                        <P>
                            That the cleaner is booked. That the invoice matches. That the budget
                            will hold. That the provider&apos;s price is fair. That if something
                            needs saying, you&apos;ll know how to say it. That anyone who needs to
                            see the same information can see it. That nobody is going to send an
                            email at 11pm that ruins your week.
                        </P>
                        <PullQuote>
                            That is the small, boring, precious thing we are trying to build.
                        </PullQuote>
                        <P>
                            If we get it right, most of the time you&apos;ll forget Wayly is there.
                            You&apos;ll open it once a month, look at the numbers for a minute,
                            close the tab, and go back to the actual life you&apos;re living.
                            You&apos;ll spend the time you saved doing the things aged care admin
                            has been quietly taking from you. Reading a book. Sitting in the garden.
                            Calling someone you love just to hear their voice.
                        </P>
                        <P>That is the point of all of this.</P>
                    </Section>
                </div>

                {/* -----------------------------------------------------
                    Section X, Antony's note.
                    Full-bleed soft wash, deliberately narrower column
                    to feel like a personal letter within the wide layout.
                    ----------------------------------------------------- */}
                <section
                    data-testid="about-section-antony"
                    className="border-y border-kindred bg-surface-2 py-20 sm:py-28"
                >
                    <div className="mx-auto max-w-2xl px-6 lg:px-10">
                        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-k">
                            <Feather className="h-3.5 w-3.5" aria-hidden />
                            A Personal Note
                        </div>
                        <h2 className="mt-6 font-heading text-3xl sm:text-4xl text-primary-k tracking-tight leading-tight">
                            A Note From Antony
                        </h2>
                        <div className="mt-8 space-y-5 text-base sm:text-lg text-primary-k leading-relaxed">
                            <p>Wayly is new.</p>
                            <p>
                                I&apos;m the person behind it. There isn&apos;t a big team. There
                                isn&apos;t a decade of case studies to show you. There&apos;s a
                                small group of people who agreed to help me build this, a set of
                                tools we think are honest, and the belief that this shouldn&apos;t
                                be as hard as the system is making it.
                            </p>
                            <p>
                                I built it because I couldn&apos;t accept that families and older
                                Australians were left working out the same twelve-page statement
                                from scratch, alone, at 11pm. I still can&apos;t. If Wayly helps
                                you, that&apos;s why.
                            </p>
                            <p>
                                If something on this site is wrong, or if you use Wayly and it
                                breaks, write to me at{" "}
                                <a
                                    className="text-primary-k underline decoration-primary-k/40 underline-offset-4 hover:decoration-primary-k"
                                    href="mailto:support@wayly.com.au"
                                >
                                    support@wayly.com.au
                                </a>
                                . I read every message. I fix what I can, quickly. If I can&apos;t,
                                I say why.
                            </p>
                            <p>We&apos;re trying to be worth your trust.</p>
                        </div>
                        <div className="mt-12 flex items-center gap-4">
                            <span aria-hidden className="font-heading italic text-3xl text-primary-k">
                                Antony
                            </span>
                            <span className="h-px flex-1 bg-kindred" aria-hidden />
                        </div>
                        <div className="mt-2 text-sm text-muted-k">Founder, Wayly</div>
                    </div>
                </section>

                {/* -----------------------------------------------------
                    Section XI, Try Wayly CTA (wide).
                    ----------------------------------------------------- */}
                <section
                    className="about-try-section mx-auto max-w-[1600px] px-6 lg:px-12 py-20 sm:py-28"
                    data-testid="about-section-try"
                >
                    <div className="grid grid-cols-12 gap-x-8 lg:gap-x-16 items-end">
                        <div className="col-span-12 lg:col-span-6">
                            <div className="about-try-eyebrow inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-k">
                                <Compass className="h-3.5 w-3.5" aria-hidden />
                                Take the First Step
                            </div>
                            <h2 className="about-try-heading mt-6 font-heading text-3xl sm:text-5xl text-primary-k tracking-tight leading-tight">
                                Try Wayly
                            </h2>
                        </div>
                        <div className="col-span-12 lg:col-span-6 mt-8 lg:mt-0">
                    <p className="about-try-body mt-6 text-base sm:text-lg text-primary-k leading-relaxed">
                        Every Wayly tool is free to try. Start with a 7-day free trial of any
                        paid plan, no credit card required.
                    </p>
                    <p className="about-try-body mt-4 text-base sm:text-lg text-primary-k leading-relaxed">
                        If you&apos;re not ready for a trial, the Statement Decoder gives you one
                        free decode every 120 days, no signup needed. Just paste the statement or
                        upload the PDF and we&apos;ll do the rest.
                    </p>
                            <div className="mt-8 flex flex-wrap gap-3">
                                <Link
                                    to="/ai-tools/statement-decoder"
                                    data-testid="about-cta-decode"
                                    className="about-try-cta-primary inline-flex items-center gap-2 rounded-full bg-wayly-clay-500 hover:bg-wayly-clay-600 text-white px-6 py-3 text-sm font-semibold shadow-md transition-colors"
                                >
                                    Decode a Statement
                                    <ArrowRight className="h-4 w-4" aria-hidden />
                                </Link>
                                <Link
                                    to="/pricing"
                                    data-testid="about-cta-plans"
                                    className="about-try-cta-secondary inline-flex items-center gap-2 rounded-full bg-wayly-clay-700 text-white px-6 py-3 text-sm font-semibold shadow-md hover:bg-wayly-clay-800 transition-colors"
                                >
                                    See Our Plans
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}

// ---------------------------------------------------------------------
// Presentation primitives. Kept in this file so the About page is a
// single-file read for editors.
// ---------------------------------------------------------------------

/**
 * Section, wide 12-column editorial layout.
 *   Left column (lg:col-span-4): sticky roman numeral + H2 heading.
 *   Right column (lg:col-span-8): body prose, scenes, cards.
 */
function Section({ num: _num, title, testid, first = false, children }) {
    return (
        <section
            id={testid}
            className={`${first ? "mt-10 sm:mt-14" : "mt-24 sm:mt-32"} scroll-mt-24`}
            data-testid={testid}
        >
            <div className="grid grid-cols-12 gap-x-8 lg:gap-x-16">
                <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
                    <span className="block h-1 w-16 rounded-full" style={{ background: "#A5512B" }} aria-hidden />
                    <h2 className="mt-6 font-heading text-3xl sm:text-4xl text-primary-k tracking-tight leading-tight">
                        {title}
                    </h2>
                </div>
                <div className="col-span-12 lg:col-span-8 mt-8 lg:mt-0 space-y-5">{children}</div>
            </div>
        </section>
    );
}

/**
 * WideSection, used for sections whose card grids need the full container
 * width (e.g. Section V beliefs and Section VI clusters). The heading sits
 * across the top and the children span the entire width below.
 */
function WideSection({ num: _num, title, testid, lead, children }) {
    return (
        <section
            id={testid}
            className="mt-24 sm:mt-32 scroll-mt-24"
            data-testid={testid}
        >
            <div className="grid grid-cols-12 gap-x-8 lg:gap-x-16">
                <div className="col-span-12 lg:col-span-5">
                    <span className="block h-1 w-16 rounded-full" style={{ background: "#A5512B" }} aria-hidden />
                    <h2 className="mt-6 font-heading text-3xl sm:text-4xl lg:text-5xl text-primary-k tracking-tight leading-tight">
                        {title}
                    </h2>
                </div>
                {lead && (
                    <div className="col-span-12 lg:col-span-7 mt-8 lg:mt-0 space-y-5 self-end">
                        {lead}
                    </div>
                )}
            </div>
            <div className="mt-12 lg:mt-16">{children}</div>
        </section>
    );
}

function P({ children, className = "" }) {
    return (
        <p className={`text-sm sm:text-base text-primary-k leading-relaxed max-w-3xl ${className}`}>
            {children}
        </p>
    );
}

function PullQuote({ children }) {
    return (
        <blockquote className="my-10 sm:my-12 border-l-4 pl-6 max-w-3xl" style={{ borderColor: "#A5512B" }}>
            <p className="font-heading italic text-xl sm:text-2xl leading-snug" style={{ color: "#A5512B" }}>
                {children}
            </p>
        </blockquote>
    );
}

function Scene({ icon: Icon, label, children }) {
    return (
        <Reveal className="h-full">
        <div className="rounded-2xl border border-kindred bg-surface p-6 sm:p-8 h-full">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-k">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-primary-k">
                    <Icon className="h-4 w-4" aria-hidden />
                </span>
                {label}
            </div>
            <div className="mt-5 space-y-5">{children}</div>
        </div>
        </Reveal>
    );
}

function StatRow({ children }) {
    return (
        <div className="my-8 grid grid-cols-3 gap-3 rounded-2xl border border-kindred bg-surface p-4 sm:p-6 max-w-3xl">
            {children}
        </div>
    );
}

function Stat({ value, label }) {
    return (
        <div className="text-center">
            <div className="font-heading text-3xl sm:text-4xl tabular-nums" style={{ color: "#A5512B" }}>
                {value}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-muted-k leading-tight">
                {label}
            </div>
        </div>
    );
}

function LessonCard({ n, children }) {
    return (
        <Reveal className="h-full">
        <div className="flex gap-5 rounded-2xl border border-kindred bg-surface p-5 sm:p-6 h-full transition-colors hover:border-[#A5512B]/40">
            <span
                className="font-heading text-2xl tabular-nums select-none"
                style={{ color: "rgba(165,81,43,0.55)" }}
                aria-hidden
            >
                {n}
            </span>
            <p className="text-sm sm:text-base text-primary-k leading-relaxed">{children}</p>
        </div>
        </Reveal>
    );
}

function Belief({ icon: Icon, title, children }) {
    return (
        <Reveal className="h-full">
        <div className="rounded-2xl border border-kindred bg-surface p-6 sm:p-8 h-full transition-colors hover:border-[#A5512B]/40">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "#FBEEE7", color: "#A5512B" }}>
                <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 font-heading text-lg sm:text-xl tracking-tight leading-snug" style={{ color: "#A5512B" }}>
                {title}
            </h3>
            <p className="mt-4 text-sm sm:text-base text-primary-k leading-relaxed">{children}</p>
        </div>
        </Reveal>
    );
}

function ClusterCard({ icon: Icon, title, to, children }) {
    const cardCls =
        "group rounded-2xl border border-kindred bg-surface p-6 transition-all h-full flex flex-col hover:border-[#A5512B]/40 hover:shadow-sm";
    const inner = (
        <>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "#FBEEE7", color: "#A5512B" }}>
                <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 font-heading text-lg sm:text-xl text-primary-k tracking-tight leading-snug">
                {title}
            </h3>
            <p className="mt-3 text-sm sm:text-base text-primary-k leading-relaxed">{children}</p>
            {to && (
                <span className="mt-5 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em]" style={{ color: "#A5512B" }}>
                    Open the Tool
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
            )}
        </>
    );
    let el;
    if (to) {
        // Append ?from=about so the destination tool page can show a
        // "Back to About" breadcrumb (see components/AboutBackLink.jsx).
        const withFrom = to.includes("?") ? `${to}&from=about` : `${to}?from=about`;
        el = (
            <Link to={withFrom} className={cardCls} data-testid="about-cluster-card">
                {inner}
            </Link>
        );
    } else {
        el = (
            <div className={cardCls} data-testid="about-cluster-card">
                {inner}
            </div>
        );
    }
    return <Reveal className="h-full">{el}</Reveal>;
}
