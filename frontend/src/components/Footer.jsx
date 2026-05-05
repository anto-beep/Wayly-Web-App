import React from "react";
import { Link } from "react-router-dom";
import { HeartHandshake } from "lucide-react";
import AppStoreBadges from "@/components/AppStoreBadges";

const PRODUCT = [
    { to: "/features", label: "Features" },
    { to: "/ai-tools", label: "AI Tools" },
    { to: "/pricing", label: "Pricing" },
    { to: "/demo", label: "Demo" },
    { to: "/for-advisors", label: "For Advisors" },
    { to: "/for-gps", label: "For GPs" },
];

const RESOURCES = [
    { to: "/resources/articles", label: "Blog" },
    { to: "/resources/guides", label: "Guides" },
    { to: "/resources/glossary", label: "Glossary" },
    { to: "/resources/templates", label: "Templates" },
    { to: "/resources/webinars", label: "Webinars" },
    { to: "/resources", label: "What's New" },
];

const LEGAL_COMPANY = [
    { to: "/legal/terms", label: "Terms of Service" },
    { to: "/legal/privacy", label: "Privacy Policy" },
    { to: "/legal/ai-disclaimer", label: "AI Disclaimer" },
    { to: "/legal/accessibility", label: "Accessibility Statement" },
    { to: "/legal/cookies", label: "Cookie Policy" },
    { to: "/trust", label: "Trust & Security" },
    { to: "/contact", label: "Contact" },
    { to: "/press", label: "Press" },
];

const CRISIS_LINES = [
    { name: "My Aged Care", number: "1800 200 422" },
    { name: "OPAN (Older Persons Advocacy Network)", number: "1800 700 600" },
    { name: "1800ELDERHelp", number: "1800 353 374" },
    { name: "Lifeline", number: "13 11 14" },
    { name: "Beyond Blue", number: "1300 22 4636" },
];

export default function Footer() {
    return (
        <footer
            className="text-white"
            style={{ backgroundColor: "#1F3A5F" }}
            data-testid="site-footer"
        >
            <div className="mx-auto max-w-7xl px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {/* Column 1 — Brand */}
                <div>
                    <Link to="/" className="flex items-center gap-2.5" data-testid="footer-brand-link">
                        <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center">
                            <HeartHandshake className="h-5 w-5 text-white" />
                        </div>
                        <span className="font-heading text-xl text-white">Kindred</span>
                    </Link>
                    <p className="text-sm text-white/80 mt-4 leading-relaxed">
                        Support at Home, finally explained.
                    </p>
                    <div className="mt-5">
                        <AppStoreBadges align="start" />
                    </div>
                    <p className="text-xs text-white/60 mt-5">ABN: [ABN placeholder]</p>
                    <p className="text-xs text-white/60 mt-1">© 2026 Kindred Pty Ltd. All rights reserved.</p>
                </div>

                {/* Column 2 — Product */}
                <div>
                    <div className="text-xs uppercase tracking-wider text-white/60 font-medium">Product</div>
                    <ul className="mt-4 space-y-2.5 text-sm">
                        {PRODUCT.map((it) => (
                            <li key={it.to}>
                                <Link to={it.to} className="text-white/90 hover:text-white transition-colors">
                                    {it.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Column 3 — Resources */}
                <div>
                    <div className="text-xs uppercase tracking-wider text-white/60 font-medium">Resources</div>
                    <ul className="mt-4 space-y-2.5 text-sm">
                        {RESOURCES.map((it) => (
                            <li key={it.to}>
                                <Link to={it.to} className="text-white/90 hover:text-white transition-colors">
                                    {it.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Column 4 — Legal & Company */}
                <div>
                    <div className="text-xs uppercase tracking-wider text-white/60 font-medium">Legal & Company</div>
                    <ul className="mt-4 space-y-2.5 text-sm">
                        {LEGAL_COMPANY.map((it) => (
                            <li key={it.to}>
                                <Link to={it.to} className="text-white/90 hover:text-white transition-colors">
                                    {it.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Gold divider line */}
            <div className="h-px w-full" style={{ backgroundColor: "#D4A24E" }} aria-hidden="true" />

            {/* Legal disclaimer + crisis support */}
            <div className="mx-auto max-w-7xl px-6 py-8 space-y-5">
                <p
                    className="text-center text-white/85 leading-relaxed"
                    style={{ fontSize: "13px" }}
                    data-testid="footer-legal-disclaimer"
                >
                    Kindred is not a registered Support at Home provider, financial adviser, legal adviser, or healthcare provider. All AI-generated content is for information purposes only and may contain errors. Always verify important information with your provider, My Aged Care, or a qualified professional before taking action. Nothing on this site constitutes financial, legal, or clinical advice.
                </p>

                <div
                    className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-white/85"
                    style={{ fontSize: "13px" }}
                    data-testid="footer-crisis-resources"
                >
                    <span className="font-medium" style={{ color: "#D4A24E" }}>Support lines:</span>
                    {CRISIS_LINES.map((c, i) => (
                        <React.Fragment key={c.name}>
                            <a
                                href={`tel:${c.number.replace(/\s/g, "")}`}
                                className="hover:text-white transition-colors"
                                data-testid={`footer-crisis-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`}
                            >
                                {c.name}: <span className="tabular-nums whitespace-nowrap">{c.number}</span>
                            </a>
                            {i < CRISIS_LINES.length - 1 && <span className="text-white/40" aria-hidden="true">•</span>}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </footer>
    );
}
