import React, { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Menu, X, ChevronDown, LogOut, User, CreditCard, Users, Settings, HelpCircle } from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";
import WaylyLogo from "@/components/WaylyLogo";
import { useInLayout } from "@/context/LayoutContext";
import ToolsMegaMenu from "@/components/ToolsMegaMenu";
import { TOOLS_ORDERED } from "@/config/toolRegistry";

const NAV = [
    { to: "/about", label: "About" },
    { to: "/features", label: "Features" },
    { to: "/ai-tools", label: "Tools", mega: true },
    { to: "/pricing", label: "Pricing" },
    { to: "/resources", label: "Resources" },
    { to: "/contact", label: "Contact" },
];

const PLAN_LABEL = { free: "FREE", solo: "SOLO", family: "FAMILY" };

function PlanBadge({ plan }) {
    const tone = plan === "family" ? "bg-[#2BC4D6] text-white" : plan === "solo" ? "bg-[#3DB8A8] text-white" : "bg-white/15 text-white";
    return (
        <span className={`text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 ${tone}`} data-testid="nav-plan-badge">
            {PLAN_LABEL[plan] || "FREE"}
        </span>
    );
}

function Avatar({ user, onClick, dataTestId }) {
    const initials = (user.name || user.email || "K").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
    return (
        <button
            onClick={onClick}
            data-testid={dataTestId}
            className="h-9 w-9 rounded-full bg-[#2BC4D6] text-white font-semibold text-sm inline-flex items-center justify-center hover:ring-2 hover:ring-white/40 transition-all"
            title={user.name || user.email}
        >
            {user.picture ? (
                <img src={user.picture} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : initials}
        </button>
    );
}

function SignedInControls({ user }) {
    const { logout } = useAuth();
    const [open, setOpen] = useState(false);
    const nav = useNavigate();
    const menuRef = useRef(null);
    useEffect(() => {
        const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);
    const handleSignOut = async () => { await logout(); nav("/"); };

    const menuItems = [
        { to: "/app", icon: User, label: "Dashboard" },
        { to: "/settings", icon: Settings, label: "Profile & Settings" },
        { to: "/settings/billing", icon: CreditCard, label: "Plan & Billing" },
        ...(user.plan === "family" ? [{ to: "/settings/members", icon: Users, label: "Members" }] : []),
        { to: "/contact", icon: HelpCircle, label: "Help & support" },
    ];

    return (
        <div className="flex items-center gap-3" ref={menuRef}>
            <NotificationsBell tone="dark" />
            <PlanBadge plan={user.plan || "free"} />
            <div className="relative">
                <div className="flex items-center gap-1">
                    <Avatar user={user} onClick={() => setOpen((o) => !o)} dataTestId="nav-avatar" />
                    <button onClick={() => setOpen((o) => !o)} className="text-white/70 hover:text-white" aria-label="User menu">
                        <ChevronDown className="h-4 w-4" />
                    </button>
                </div>
                {open && (
                    <div className="absolute right-0 mt-3 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_30px_80px_rgba(14,77,82,0.30)] border border-[#0E4D52]/12 overflow-hidden z-50" data-testid="nav-dropdown">
                        <div className="px-4 py-3 border-b border-[#0E4D52]/10">
                            <div className="text-sm font-semibold text-[#0E2A47]">{user.name}</div>
                            <div className="text-xs text-[#6B7280] mt-0.5">{user.email}</div>
                        </div>
                        <div className="py-1">
                            {menuItems.map((m) => (
                                <Link
                                    key={m.label}
                                    to={m.to}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#0E2A47] hover:bg-[#0E4D52]/[0.06] transition-colors"
                                >
                                    <m.icon className="h-4 w-4 text-[#6B7280]" />
                                    {m.label}
                                </Link>
                            ))}
                        </div>
                        <div className="border-t border-[#0E4D52]/10 py-1">
                            <button
                                type="button"
                                onClick={handleSignOut}
                                data-testid="nav-signout"
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#E07A5F] hover:bg-[#0E4D52]/[0.06] transition-colors"
                            >
                                <LogOut className="h-4 w-4" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function SignedOutControls() {
    return (
        <div className="flex items-center gap-3">
            <Link
                to="/login"
                data-testid="nav-login"
                className="text-sm font-medium text-white/90 hover:text-white px-3 py-2 transition-colors"
            >
                Log In
            </Link>
            <Link
                to="/signup?plan=family"
                data-testid="nav-start-trial"
                className="cta-bloom inline-flex items-center text-sm font-semibold bg-[#A5512B] text-white rounded-lg px-5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_5px_rgba(0,0,0,0.2),0_6px_18px_rgba(165,81,43,0.42)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_28px_rgba(165,81,43,0.58)] active:scale-[0.97] transition-all duration-200"
            >
                Start Free Trial
            </Link>
        </div>
    );
}

export default function MarketingHeader() {
    const { user } = useAuth();
    const inLayout = useInLayout();
    const [open, setOpen] = useState(false);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
    const [activeTool, setActiveTool] = useState(TOOLS_ORDERED[0]?.slug);
    const closeTimer = useRef(null);

    const openTools = () => { clearTimeout(closeTimer.current); setToolsOpen(true); };
    const scheduleClose = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setToolsOpen(false), 160); };

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") setToolsOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    // When rendered inside the authenticated app Layout, the dashboard header
    // (with its own logo, search, bell, avatar) is already visible above us.
    if (inLayout) return null;

    return (
        <>
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-[#0E4D52] focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:ring-2 focus:ring-[#2BC4D6]"
                data-testid="skip-to-content"
            >
                Skip to main content
            </a>
            <header className="sticky top-0 z-40 bg-[#0E4D52] border-b border-black/10 shadow-sm" data-testid="marketing-header">
                <div className="relative mx-auto max-w-7xl px-6" onMouseLeave={scheduleClose}>
                    <div className="flex items-center justify-between gap-4 h-16">
                            <Link to="/" data-testid="nav-logo" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" })} className="flex items-center gap-2 group">
                                <WaylyLogo size={28} className="rounded-md" />
                                <span className="font-heading text-[22px] text-white tracking-tight">Wayly</span>
                            </Link>
                            <nav className="hidden md:flex items-center gap-10">
                                {NAV.map((n) => (
                                    n.mega ? (
                                        <button
                                            key={n.to}
                                            type="button"
                                            data-testid="nav-tools-trigger"
                                            aria-expanded={toolsOpen}
                                            onMouseEnter={openTools}
                                            onClick={() => setToolsOpen((o) => !o)}
                                            className="relative inline-flex items-center gap-1 text-[15px] font-medium tracking-wide text-white py-1"
                                        >
                                            {n.label}
                                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${toolsOpen ? "rotate-180" : ""}`} />
                                        </button>
                                    ) : (
                                        <NavLink
                                            key={n.to}
                                            to={n.to}
                                            data-testid={`nav-link-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                                            onMouseEnter={() => setToolsOpen(false)}
                                            className={({ isActive }) =>
                                                `relative text-[15px] font-medium tracking-wide text-white transition-colors py-1 no-underline ${
                                                    isActive ? "after:absolute after:inset-x-0 after:-bottom-1.5 after:h-[2px] after:bg-wayly-clay-400 after:content-['']" : "hover:after:absolute hover:after:inset-x-0 hover:after:-bottom-1.5 hover:after:h-[2px] hover:after:bg-wayly-clay-400 hover:after:content-['']"
                                                }`
                                            }
                                        >
                                            {n.label}
                                        </NavLink>
                                    )
                                ))}
                            </nav>
                            <div className="hidden md:block">
                                {user ? <SignedInControls user={user} /> : <SignedOutControls />}
                            </div>
                            <button
                                type="button"
                                className="md:hidden text-white p-2"
                                onClick={() => setOpen((o) => !o)}
                                aria-label={open ? "Close menu" : "Open menu"}
                                data-testid="nav-mobile-toggle"
                            >
                                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                            </button>
                        </div>

                    {toolsOpen && (
                        <ToolsMegaMenu
                            active={activeTool}
                            setActive={setActiveTool}
                            onClose={() => setToolsOpen(false)}
                            onMouseEnter={openTools}
                        />
                    )}
                </div>

                {open && (
                    <div className="md:hidden fixed inset-0 top-16 bg-[#0E4D52] z-50 p-6 animate-in slide-in-from-right duration-200" data-testid="nav-mobile-drawer">
                        <nav className="flex flex-col">
                            {NAV.map((n) => (
                                n.mega ? (
                                    <div key={n.to} className="border-b border-white/10">
                                        <button
                                            type="button"
                                            data-testid="mobile-tools-toggle"
                                            aria-expanded={mobileToolsOpen}
                                            onClick={() => setMobileToolsOpen((o) => !o)}
                                            className="w-full flex items-center justify-between py-3 text-base font-medium text-white"
                                        >
                                            {n.label}
                                            <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${mobileToolsOpen ? "rotate-180" : ""}`} />
                                        </button>
                                        {mobileToolsOpen && (
                                            <div className="pb-3 flex flex-col gap-0.5" data-testid="mobile-tools-panel">
                                                {TOOLS_ORDERED.map((t) => {
                                                    const Icon = t.IconComponent;
                                                    return (
                                                        <Link
                                                            key={t.slug}
                                                            to={t.marketingRoute || t.route}
                                                            onClick={() => { setMobileToolsOpen(false); setOpen(false); }}
                                                            data-testid={`mobile-tool-${t.slug}`}
                                                            className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] text-white/90 hover:bg-white/10 transition-colors"
                                                        >
                                                            <span className="h-8 w-8 flex-none rounded-lg bg-white/10 flex items-center justify-center">
                                                                {Icon ? <Icon className="h-4 w-4 text-[#2BC4D6]" strokeWidth={2} /> : null}
                                                            </span>
                                                            <span>{t.name}</span>
                                                        </Link>
                                                    );
                                                })}
                                                <Link
                                                    to="/ai-tools"
                                                    onClick={() => { setMobileToolsOpen(false); setOpen(false); }}
                                                    data-testid="mobile-see-all-tools"
                                                    className="mt-1.5 ml-2 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-[#2BC4D6]"
                                                >
                                                    See All Tools
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Link
                                        key={n.to}
                                        to={n.to}
                                        onClick={() => setOpen(false)}
                                        className="py-3 text-base font-medium text-white border-b border-white/10"
                                    >
                                        {n.label}
                                    </Link>
                                )
                            ))}
                        </nav>
                        <div className="mt-8 space-y-3">
                            {user ? (
                                <>
                                    <Link to="/app" onClick={() => setOpen(false)} className="block w-full text-center bg-[#2BC4D6] text-[#0E2A47] font-semibold rounded-lg py-3">Go to dashboard</Link>
                                    <Link to="/settings" onClick={() => setOpen(false)} className="block w-full text-center border border-white/40 text-white rounded-lg py-3">Settings</Link>
                                </>
                            ) : (
                                <>
                                    <Link to="/login" onClick={() => setOpen(false)} className="block w-full text-center text-white rounded-lg py-3">Log In</Link>
                                    <Link to="/signup?plan=family" onClick={() => setOpen(false)} className="block w-full text-center bg-[#A5512B] text-white font-semibold rounded-lg py-3">Start Free Trial</Link>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </header>
        </>
    );
}
