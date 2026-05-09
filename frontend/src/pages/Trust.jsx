import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Lock, Server, Eye, FileText, ShieldCheck, Phone, AlertCircle, ScrollText } from "lucide-react";

const SECTIONS = [
    {
        icon: Server,
        title: "Where your data lives",
        body: "Australian Privacy Principles compliant. AWS Sydney region only. Encrypted at rest with per-household keys. Data never leaves Australia for storage.",
    },
    {
        icon: Eye,
        title: "Who can see your data",
        body: "Only the people you invite. Per-feature, role-based permissions. The participant always retains the right to revoke any other user's access — instantly, without explanation.",
    },
    {
        icon: Lock,
        title: "What we do not do",
        body: "We never sell data. We never accept commissions from aged-care providers. We do not use your health data to train AI models without your explicit, granular consent.",
    },
    {
        icon: FileText,
        title: "Compliance",
        body: "Australian Privacy Principles · Notifiable Data Breaches scheme · Aged Care Act 2024 alignment · Voluntary AI Safety Standard adopted · SOC 2 Type II target by year 2.",
    },
    {
        icon: ScrollText,
        title: "Audit log",
        body: "Every household sees every action by every user — uploads, edits, family-thread posts, decision approvals — in a WORM-equivalent immutable log. Useful for peace of mind today and ready if you ever need to escalate.",
    },
    {
        icon: ShieldCheck,
        title: "Elder protection",
        body: "When a Power-of-Attorney holder takes a financial action, the participant gets a notification — visible in their audit log even if they aren't notified another way. We make abuse harder to hide.",
    },
    {
        icon: AlertCircle,
        title: "Independent oversight",
        body: "Annual third-party penetration test (summary published). Privacy advisory board with one OPAN representative, one privacy lawyer, and one ex-ACQSC staff member.",
    },
];

const CRISIS = [
    { name: "1800ELDERHelp", number: "1800 353 374", desc: "Free elder abuse helpline (Compass)" },
    { name: "OPAN", number: "1800 700 600", desc: "Older Persons Advocacy Network" },
    { name: "Beyond Blue", number: "1300 22 4636", desc: "Mental health support, 24/7" },
    { name: "Lifeline", number: "13 11 14", desc: "Crisis support, 24/7" },
];

export default function Trust() {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />

            <section className="mx-auto max-w-4xl px-6 pt-12 pb-8">
                <span className="overline">Trust &amp; privacy</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight">Built for the most vulnerable data of all.</h1>
                <p className="mt-5 text-lg text-muted-k leading-relaxed">
                    Wayly handles health information for older Australians and detailed financial information for their families. We treat that responsibility as the entire product, not a footer link.
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-12">
                <div className="space-y-4" data-testid="trust-sections">
                    {SECTIONS.map((s) => (
                        <div key={s.title} className="bg-surface border border-kindred rounded-xl p-6 flex items-start gap-4">
                            <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0">
                                <s.icon className="h-5 w-5 text-primary-k" />
                            </div>
                            <div>
                                <h2 className="font-heading text-xl text-primary-k">{s.title}</h2>
                                <p className="mt-2 text-sm text-muted-k leading-relaxed">{s.body}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-12">
                <div className="bg-surface-2 border border-kindred rounded-xl p-6">
                    <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-terracotta" />
                        <h2 className="font-heading text-xl text-primary-k">Crisis resources (current Australian numbers)</h2>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm" data-testid="trust-crisis-list">
                        {CRISIS.map((c) => (
                            <li key={c.name} className="flex flex-wrap items-baseline gap-x-3">
                                <span className="font-medium text-primary-k">{c.name}</span>
                                <a href={`tel:${c.number.replace(/\s/g, "")}`} className="tabular-nums text-primary-k underline">{c.number}</a>
                                <span className="text-muted-k">— {c.desc}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-16">
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Legal</h2>
                <div className="mt-4 grid sm:grid-cols-3 gap-3">
                    {[
                        { to: "/legal/privacy", label: "Privacy Policy" },
                        { to: "/legal/terms", label: "Terms of Service" },
                        { to: "/legal/dpa", label: "Data Processing Addendum" },
                    ].map((l) => (
                        <Link key={l.to} to={l.to} className="bg-surface border border-kindred rounded-xl p-4 hover:bg-surface-2">
                            <div className="text-sm text-primary-k font-medium">{l.label}</div>
                            <div className="text-xs text-muted-k mt-1">Plain-English / lawyer-readable toggle</div>
                        </Link>
                    ))}
                </div>
            </section>

            <Footer />
        </div>
    );
}
