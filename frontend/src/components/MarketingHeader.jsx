import React, { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { HeartHandshake, Menu, X, ChevronDown, LogOut, User, CreditCard, Users, Settings, HelpCircle } from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";

const NAV = [
    { to: "/features", label: "Features" },
    { to: "/ai-tools", label: "AI Tools" },
    { to: "/pricing", label: "Pricing" },
    { to: "/resources", label: "Resources" },
    { to: "/demo", label: "Demo" },
    { to: "/contact", label: "Contact" },
];

const PLAN_LABEL = { free: "FREE", solo: "SOLO", family: "FAMILY" };

function PlanBadge({ plan }) {
    const tone = plan === "family" ? "bg-[#D4A24E] text-[#1F3A5F]" : plan === "solo" ? "bg-[#7A9B7E] text-white" : "bg-white/15 text-white";
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
            className="h-9 w-9 rounded-full bg-[#D4A24E] text-[#1F3A5F] font-semibold text-sm inline-flex items-center justify-center hover:ring-2 hover:ring-white/30 transition-all"
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
        { to: "/settings", icon: Settings, label: "Profile & settings" },
        { to: "/settings/billing", icon: CreditCard, label: "Plan & billing" },
        ...(user.plan === "family" ? [{ to: "/settings/members", icon: Users, label: "Members" }] : []),
        { to: "/contact", icon: HelpCircle, label: "Help & support" },
    ];

    return (
        <div className="flex items-center gap-3" ref={menuRef}>
            <NotificationsBell />
            <PlanBadge plan={user.plan || "free"} />
            <div className="relative">
                <div className="flex items-center gap-1">
                    <Avatar user={user} onClick={() => setOpen((o) => !o)} dataTestId="nav-avatar" />
                    <button onClick={() => setOpen((o) => !o)} className="text-white/70 hover:text-white" aria-label="User menu">
                        <ChevronDown className="h-4 w-4" />
                    </button>
                </div>
                {open && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-[#E8E2D9] overflow-hidden z-50" data-testid="nav-dropdown">
                        <div className="px-4 py-3 border-b border-[#E8E2D9]">
                            <div className="text-sm font-semibold text-[#1F3A5F]">{user.name}</div>
                            <div className="text-xs text-[#6B7280] mt-0.5">{user.email}</div>
                        </div>
                        <div className="py-1">
                            {menuItems.map((m) => (
                                <Link
                                    key={m.label}
                                    to={m.to}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#1F3A5F] hover:bg-[#FAF7F2] transition-colors"
                                >
                                    <m.icon className="h-4 w-4 text-[#6B7280]" />
                                    {m.label}
                                </Link>
                            ))}
                        </div>
                        <div className="border-t border-[#E8E2D9] py-1">
                            <button
                                type="button"
                                onClick={handleSignOut}
                                data-testid="nav-signout"
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#C5734D] hover:bg-[#FAF7F2] transition-colors"
                            >
                                <LogOut className="h-4 w-4" />
                                Sign out
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
                className="text-sm text-white border border-white/40 rounded-lg px-4 py-2 hover:bg-white hover:text-[#1F3A5F] transition-all duration-200"
            >
                Sign in
            </Link>
            <Link
                to="/signup?plan=family"
                data-testid="nav-start-trial"
                className="inline-flex items-center text-sm font-semibold bg-[#D4A24E] text-[#1F3A5F] rounded-lg px-5 py-2 shadow-[0_2px_8px_rgba(212,162,78,0.40)] hover:bg-[#DDB567] hover:shadow-[0_4px_14px_rgba(212,162,78,0.55)] hover:-translate-y-px active:scale-[0.97] transition-all duration-200"
            >
                Start free trial
            </Link>
        </div>
    );
}

export default function MarketingHeader() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    return (
        <header className="sticky top-0 z-40 bg-[#1F3A5F] border-b border-[#16294a] h-16" data-testid="marketing-header">
            <div className="mx-auto max-w-7xl h-full flex items-center justify-between px-6">
                <Link to="/" data-testid="nav-logo" className="flex items-center gap-2 group">
                    <div className="h-7 w-7 rounded-md bg-[#D4A24E] inline-flex items-center justify-center">
                        <HeartHandshake className="h-4 w-4 text-[#1F3A5F]" />
                    </div>
                    <span className="font-heading text-[22px] text-white tracking-tight">Kindred</span>
                </Link>
                <nav className="hidden md:flex items-center gap-8">
                    {NAV.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            data-testid={`nav-link-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                            className={({ isActive }) =>
                                `relative text-sm font-medium text-white/85 hover:text-white transition-colors py-1 ${
                                    isActive ? "text-white after:absolute after:inset-x-0 after:-bottom-1 after:h-[2px] after:bg-[#D4A24E]" : "hover:after:absolute hover:after:inset-x-0 hover:after:-bottom-1 hover:after:h-[2px] hover:after:bg-[#D4A24E]"
                                }`
                            }
                        >
                            {n.label}
                        </NavLink>
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
            {open && (
                <div className="md:hidden fixed inset-0 top-16 bg-[#1F3A5F] z-50 p-6 animate-in slide-in-from-right duration-200" data-testid="nav-mobile-drawer">
                    <nav className="flex flex-col">
                        {NAV.map((n) => (
                            <Link
                                key={n.to}
                                to={n.to}
                                onClick={() => setOpen(false)}
                                className="py-3 text-base font-medium text-white border-b border-white/10"
                            >
                                {n.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="mt-8 space-y-3">
                        {user ? (
                            <>
                                <Link to="/app" onClick={() => setOpen(false)} className="block w-full text-center bg-[#D4A24E] text-[#1F3A5F] font-semibold rounded-lg py-3">Go to dashboard</Link>
                                <Link to="/settings" onClick={() => setOpen(false)} className="block w-full text-center border border-white/40 text-white rounded-lg py-3">Settings</Link>
                            </>
                        ) : (
                            <>
                                <Link to="/login" onClick={() => setOpen(false)} className="block w-full text-center border border-white/40 text-white rounded-lg py-3">Sign in</Link>
                                <Link to="/signup?plan=family" onClick={() => setOpen(false)} className="block w-full text-center bg-[#D4A24E] text-[#1F3A5F] font-semibold rounded-lg py-3">Start free trial</Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </header>
    );
}
