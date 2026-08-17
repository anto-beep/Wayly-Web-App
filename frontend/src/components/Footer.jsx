import React from "react";
import { Link } from "react-router-dom";
import WaylyLogo from "@/components/WaylyLogo";
import AppStoreBadges from "@/components/AppStoreBadges";

const PRODUCT = [
    { to: "/features", label: "Features" },
    { to: "/ai-tools", label: "AI Tools" },
    { to: "/services", label: "Services" },
    { to: "/policy", label: "Policy Explainers" },
    { to: "/pricing", label: "Pricing" },
    { to: "/demo", label: "Demo" },
];

const RESOURCES = [
    { to: "/guides", label: "Caregiver Guides" },
    { to: "/faq", label: "FAQ" },
    { to: "/ask-wayly", label: "Ask Wayly" },
    { to: "/support-at-home-levels", label: "Support at Home Levels" },
    { to: "/resources/articles", label: "Articles" },
    { to: "/resources/glossary", label: "Glossary" },
];

const LEGAL_COMPANY = [
    { to: "/about", label: "About Wayly" },
    { to: "/legal/terms", label: "Terms of Service" },
    { to: "/legal/privacy", label: "Privacy Policy" },
    { to: "/legal/ai-disclaimer", label: "AI Disclaimer" },
    { to: "/legal/accessibility", label: "Accessibility Statement" },
    { to: "/contact", label: "Contact" },
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
            style={{ backgroundColor: "#0E4D52" }}
            data-testid="site-footer"
        >
            <div className="mx-auto max-w-7xl px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {/* Column 1, Brand */}
                <div>
                    <Link to="/" className="flex items-center gap-2.5" data-testid="footer-brand-link">
                        <WaylyLogo size={36} className="rounded-lg" />
                        <span className="font-heading text-xl text-white">Wayly</span>
                    </Link>
                    <p className="font-heading text-2xl sm:text-3xl text-white mt-4 leading-tight tracking-tight">
                        Aged Care, <span style={{ color: "#E8956B" }}>Made Clear.</span>
                    </p>
                    <div className="mt-5">
                        <AppStoreBadges align="start" />
                    </div>
                    <p className="text-xs text-white/60 mt-5">ABN 66 701 311 373 · ACN 701 311 373</p>
                    <p className="text-xs text-white/60 mt-1">© 2026 Wayly Pty Ltd. All rights reserved.</p>
                </div>

                {/* Column 2, Product */}
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

                {/* Column 3, Resources */}
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

                {/* Column 4, Legal & Company */}
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
            <div className="h-px w-full" style={{ backgroundColor: "#2BC4D6" }} aria-hidden="true" />

            {/* Legal disclaimer + crisis support */}
            <div className="mx-auto max-w-7xl px-6 py-8 space-y-5">
                <p
                    className="text-center text-white/85 leading-relaxed"
                    style={{ fontSize: "13px" }}
                    data-testid="footer-legal-disclaimer"
                >
                    Wayly is not a registered Support at Home provider, financial adviser, legal adviser, or healthcare provider. All AI-generated content is for information purposes only and may contain errors. Always verify important information with your provider, My Aged Care, or a qualified professional before taking action. Nothing on this site constitutes financial, legal, or clinical advice.
                </p>

                <div
                    className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-white/85"
                    style={{ fontSize: "13px" }}
                    data-testid="footer-crisis-resources"
                >
                    <span className="font-medium" style={{ color: "#2BC4D6" }}>Support lines:</span>
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
