import React from "react";
import { Link } from "react-router-dom";
import { HeartHandshake, Phone } from "lucide-react";

const CRISIS_LINES = [
    { name: "1800ELDERHelp", number: "1800 353 374", desc: "Free elder abuse helpline (Compass)" },
    { name: "OPAN", number: "1800 700 600", desc: "Older Persons Advocacy Network" },
    { name: "Beyond Blue", number: "1300 22 4636", desc: "Mental health support, 24/7" },
    { name: "Lifeline", number: "13 11 14", desc: "Crisis support, 24/7" },
];

const PRODUCT = [
    { to: "/features", label: "Features" },
    { to: "/ai-tools", label: "AI Tools" },
    { to: "/pricing", label: "Pricing" },
    { to: "/demo", label: "Demo" },
];

const RESOURCES = [
    { to: "/resources", label: "Resources" },
    { to: "/resources/glossary", label: "Glossary" },
    { to: "/resources/templates", label: "Templates" },
    { to: "/trust", label: "Trust & privacy" },
];

const COMPANY = [
    { to: "/about", label: "About" },
    { to: "/for-advisors", label: "For advisors" },
    { to: "/for-gps", label: "For GPs" },
    { to: "/contact", label: "Contact" },
];

const LEGAL = [
    { to: "/legal/privacy", label: "Privacy Policy" },
    { to: "/legal/terms", label: "Terms of Service" },
    { to: "/legal/dpa", label: "Data Processing" },
];

export default function Footer() {
    return (
        <footer className="border-t border-kindred bg-surface" data-testid="site-footer">
            {/* Crisis resources strip — placed prominently above the rest of the footer */}
            <div className="bg-surface-2 border-b border-kindred">
                <div className="mx-auto max-w-7xl px-6 py-6">
                    <div className="flex items-start gap-3">
                        <Phone className="h-5 w-5 text-terracotta mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <div className="overline">If you need help right now</div>
                            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm" data-testid="crisis-resources">
                                {CRISIS_LINES.map((c) => (
                                    <a
                                        key={c.name}
                                        href={`tel:${c.number.replace(/\s/g, "")}`}
                                        className="flex flex-wrap items-baseline gap-x-2 hover:text-primary-k transition-colors"
                                    >
                                        <span className="font-medium text-primary-k">{c.name}</span>
                                        <span className="tabular-nums text-primary-k">{c.number}</span>
                                        <span className="text-muted-k text-xs">— {c.desc}</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-6 py-12 grid grid-cols-2 md:grid-cols-5 gap-8">
                <div className="col-span-2 md:col-span-1">
                    <Link to="/" className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-full bg-primary-k flex items-center justify-center">
                            <HeartHandshake className="h-5 w-5 text-white" />
                        </div>
                        <span className="font-heading text-xl text-primary-k">Kindred</span>
                    </Link>
                    <p className="text-sm text-muted-k mt-4 leading-relaxed">
                        The AI co-pilot for Australia's Support at Home program. Built for families. Independent. Australian-hosted.
                    </p>
                </div>

                {[
                    { title: "Product", items: PRODUCT },
                    { title: "Resources", items: RESOURCES },
                    { title: "Company", items: COMPANY },
                    { title: "Legal", items: LEGAL },
                ].map((col) => (
                    <div key={col.title}>
                        <div className="overline">{col.title}</div>
                        <ul className="mt-3 space-y-2 text-sm">
                            {col.items.map((it) => (
                                <li key={it.to}>
                                    <Link to={it.to} className="text-muted-k hover:text-primary-k transition-colors">
                                        {it.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            <div className="border-t border-kindred">
                <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between text-xs text-muted-k">
                    <span>© Kindred 2026. Made in Australia for Australian families.</span>
                    <span>Not affiliated with Services Australia, My Aged Care, or any provider.</span>
                </div>
            </div>
        </footer>
    );
}
