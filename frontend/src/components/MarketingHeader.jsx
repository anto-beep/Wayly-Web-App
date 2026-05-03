import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X, HeartHandshake } from "lucide-react";

const NAV = [
    { to: "/features", label: "Features" },
    { to: "/ai-tools", label: "AI Tools" },
    { to: "/pricing", label: "Pricing" },
    { to: "/trust", label: "Trust" },
];

export default function MarketingHeader() {
    const [open, setOpen] = useState(false);

    return (
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-[rgba(250,247,242,0.85)] border-b border-kindred">
            <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
                <Link to="/" className="flex items-center gap-2.5" data-testid="brand-link">
                    <div className="h-9 w-9 rounded-full bg-primary-k flex items-center justify-center">
                        <HeartHandshake className="h-5 w-5 text-white" />
                    </div>
                    <div className="leading-tight">
                        <div className="font-heading text-xl text-primary-k">Kindred</div>
                        <div className="overline" style={{ fontSize: "0.62rem" }}>Support at Home, in plain English</div>
                    </div>
                </Link>

                <nav className="hidden lg:flex items-center gap-1" data-testid="marketing-nav">
                    {NAV.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                            className={({ isActive }) =>
                                `text-sm px-3 py-2 rounded-md transition-colors ${
                                    isActive ? "text-primary-k bg-surface-2" : "text-muted-k hover:text-primary-k hover:bg-surface-2"
                                }`
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="hidden lg:flex items-center gap-2">
                    <Link to="/login" data-testid="header-login" className="text-sm text-muted-k hover:text-primary-k px-3 py-2">
                        Sign in
                    </Link>
                    <Link
                        to="/signup"
                        data-testid="header-cta"
                        className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a] transition-colors"
                    >
                        Start free
                    </Link>
                </div>

                <button
                    className="lg:hidden p-2 text-primary-k"
                    onClick={() => setOpen((o) => !o)}
                    data-testid="mobile-menu-toggle"
                    aria-label="Toggle menu"
                >
                    {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
            </div>

            {open && (
                <div className="lg:hidden border-t border-kindred bg-surface" data-testid="mobile-menu">
                    <div className="mx-auto max-w-7xl px-6 py-4 flex flex-col gap-1">
                        {NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setOpen(false)}
                                className={({ isActive }) =>
                                    `text-base py-2.5 px-3 rounded-md ${isActive ? "text-primary-k bg-surface-2" : "text-muted-k"}`
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                        <div className="mt-2 flex gap-2">
                            <Link to="/login" onClick={() => setOpen(false)} className="flex-1 text-center text-sm border border-kindred rounded-full py-2.5">
                                Sign in
                            </Link>
                            <Link to="/signup" onClick={() => setOpen(false)} className="flex-1 text-center text-sm bg-primary-k text-white rounded-full py-2.5">
                                Start free
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
