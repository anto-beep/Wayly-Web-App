import React, { useState, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    LayoutDashboard, FileText, MessageCircle, Users, ScrollText, LogOut,
    HeartHandshake, UserCircle2, Settings as SettingsIcon, Sparkles, Menu, X,
    ShieldCheck,
} from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";
import TrialCountdownBanner from "@/components/TrialCountdownBanner";

const primaryNav = [
    { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, mobile: true },
    { to: "/app/statements", label: "Statements", icon: FileText, mobile: true },
    { to: "/app/chat", label: "Ask Wayly", icon: MessageCircle, mobile: true },
    { to: "/app/family", label: "Family", icon: Users },
    { to: "/app/audit", label: "Audit log", icon: ScrollText },
];

const secondaryNav = [
    { to: "/ai-tools", label: "AI Tools", icon: Sparkles },
    { to: "/settings/profile", label: "Settings", icon: SettingsIcon },
];

// Bottom-nav shows 4 items on mobile: 3 mobile-flagged + the More menu.
const bottomNavItems = primaryNav.filter((n) => n.mobile);

export default function Layout({ children }) {
    const { user, household, logout } = useAuth();
    const nav = useNavigate();
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Close drawer when route changes (Link clicks update URL but don't unmount)
    useEffect(() => {
        const onPop = () => setDrawerOpen(false);
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    const handleLogout = () => {
        logout();
        nav("/");
    };

    return (
        <div className="min-h-screen bg-kindred has-bottom-nav">
            {/* ---- HEADER (compact on mobile) ---- */}
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-kindred safe-top">
                <div className="mx-auto max-w-7xl flex items-center justify-between px-4 md:px-6 py-3 md:py-4 gap-2">
                    <Link to="/app" className="flex items-center gap-2 min-w-0" data-testid="brand-link">
                        <div className="h-8 w-8 md:h-9 md:w-9 flex-none rounded-full bg-primary-k flex items-center justify-center">
                            <HeartHandshake className="h-4 w-4 md:h-5 md:w-5 text-white" />
                        </div>
                        <div className="leading-tight min-w-0">
                            <div className="font-heading text-base md:text-lg font-medium tracking-tight text-primary-k truncate">Wayly</div>
                            <div className="overline hidden md:block">Support at Home, in plain English</div>
                        </div>
                    </Link>
                    <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
                        {user && <NotificationsBell tone="light" />}
                        {household && (
                            <div className="hidden lg:flex flex-col text-right min-w-0">
                                <span className="text-sm font-medium text-primary-k truncate max-w-[180px]">{household.participant_name}</span>
                                <span className="text-xs text-muted-k truncate max-w-[200px]">Classification {household.classification} · {household.provider_name}</span>
                            </div>
                        )}
                        {user && (
                            <Link
                                to="/settings/billing"
                                data-testid="layout-plan-badge"
                                className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-kindred px-2.5 py-1 text-[11px] hover:bg-surface transition-colors"
                                title="Manage plan"
                            >
                                <span className="font-medium text-primary-k uppercase tracking-wider">{user.plan || "free"}</span>
                                <span className="text-muted-k">plan</span>
                            </Link>
                        )}
                        <Link
                            to="/participant"
                            data-testid="participant-view-link"
                            className="hidden lg:inline-flex items-center gap-2 rounded-full border border-kindred px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors"
                        >
                            <UserCircle2 className="h-4 w-4" /> Participant view
                        </Link>
                        <button
                            onClick={handleLogout}
                            data-testid="logout-button"
                            className="hidden md:inline-flex items-center gap-2 text-sm text-muted-k hover:text-primary-k transition-colors"
                            title={`Sign out · ${user?.name || ""}`}
                        >
                            <LogOut className="h-4 w-4" /> <span className="hidden lg:inline">{user?.name?.split(" ")[0]}</span>
                        </button>
                        {/* Mobile drawer trigger */}
                        <button
                            type="button"
                            onClick={() => setDrawerOpen(true)}
                            aria-label="Open menu"
                            data-testid="layout-menu-button"
                            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md text-primary-k hover:bg-surface-2"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ---- BODY: sidebar (md+) + main ---- */}
            <div className="mx-auto max-w-7xl flex flex-col md:flex-row gap-6 px-4 md:px-6 py-5 md:py-8">
                <aside className="hidden md:block md:w-56 flex-shrink-0">
                    <nav className="flex flex-col gap-1" data-testid="primary-nav">
                        {primaryNav.map((item) => (
                            <NavItem key={item.to} item={item} />
                        ))}
                        <div className="pt-3 mt-3 border-t border-kindred flex flex-col gap-1">
                            {secondaryNav.map((item) => (
                                <NavItem key={item.to} item={item} />
                            ))}
                            {user?.is_admin && (
                                <NavItem item={{ to: "/admin", label: "Admin", icon: ShieldCheck }} />
                            )}
                        </div>
                    </nav>
                </aside>
                <main className="flex-1 min-w-0">
                    <TrialCountdownBanner className="mb-4 md:mb-5" />
                    {children}
                </main>
            </div>

            {/* ---- MOBILE BOTTOM NAV ---- */}
            <nav
                aria-label="Primary"
                data-testid="mobile-bottom-nav"
                className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl border-t border-kindred safe-bottom"
            >
                <div className="grid grid-cols-4 max-w-md mx-auto">
                    {bottomNavItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                            className={({ isActive }) =>
                                `tap-target flex flex-col items-center justify-center gap-1 py-2 text-[10px] transition-colors ${
                                    isActive ? "text-primary-k" : "text-muted-k hover:text-primary-k"
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <item.icon className={`h-5 w-5 ${isActive ? "text-gold" : ""}`} />
                                    <span className="font-medium">{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    ))}
                    <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        data-testid="mobile-nav-more"
                        className="tap-target flex flex-col items-center justify-center gap-1 py-2 text-[10px] text-muted-k hover:text-primary-k"
                    >
                        <Menu className="h-5 w-5" />
                        <span className="font-medium">More</span>
                    </button>
                </div>
            </nav>

            {/* ---- MOBILE DRAWER ---- */}
            {drawerOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Menu"
                    data-testid="mobile-drawer"
                    className="md:hidden fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
                    onClick={() => setDrawerOpen(false)}
                >
                    <div
                        className="absolute right-0 top-0 bottom-0 w-[min(320px,85vw)] bg-surface shadow-2xl overflow-y-auto safe-top"
                        onClick={(e) => e.stopPropagation()}
                        style={{ animation: "kindred-help-chat-in 200ms ease-out both" }}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-kindred">
                            <div>
                                <div className="font-heading text-lg text-primary-k">{user?.name?.split(" ")[0] || "Menu"}</div>
                                {user?.plan && (
                                    <div className="text-[11px] uppercase tracking-wider text-muted-k mt-0.5">{user.plan} plan</div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setDrawerOpen(false)}
                                aria-label="Close menu"
                                className="rounded-md p-1.5 text-primary-k hover:bg-surface-2"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        {household && (
                            <div className="px-4 py-3 bg-surface-2 border-b border-kindred">
                                <div className="text-xs uppercase tracking-wider text-muted-k">Caring for</div>
                                <div className="text-sm font-medium text-primary-k mt-0.5">{household.participant_name}</div>
                                <div className="text-xs text-muted-k">Classification {household.classification} · {household.provider_name}</div>
                            </div>
                        )}
                        <nav className="flex flex-col p-2 gap-1">
                            {[...primaryNav, ...secondaryNav].map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    onClick={() => setDrawerOpen(false)}
                                    data-testid={`drawer-nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                                    className={({ isActive }) =>
                                        `tap-target flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors ${
                                            isActive
                                                ? "bg-primary-k text-white"
                                                : "text-primary-k hover:bg-surface-2"
                                        }`
                                    }
                                >
                                    <item.icon className="h-5 w-5" />
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </nav>
                        <div className="border-t border-kindred px-2 py-2">
                            <Link
                                to="/settings/billing"
                                onClick={() => setDrawerOpen(false)}
                                data-testid="drawer-billing"
                                className="tap-target flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-primary-k hover:bg-surface-2"
                            >
                                <SettingsIcon className="h-5 w-5" />
                                <span>Plan & billing</span>
                                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-k">{user?.plan || "free"}</span>
                            </Link>
                            <Link
                                to="/participant"
                                onClick={() => setDrawerOpen(false)}
                                data-testid="drawer-participant"
                                className="tap-target flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-primary-k hover:bg-surface-2"
                            >
                                <UserCircle2 className="h-5 w-5" />
                                <span>Switch to Participant view</span>
                            </Link>
                            <button
                                type="button"
                                onClick={() => { setDrawerOpen(false); handleLogout(); }}
                                data-testid="drawer-logout"
                                className="tap-target w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-terracotta hover:bg-terracotta/10"
                            >
                                <LogOut className="h-5 w-5" />
                                <span>Sign out</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function NavItem({ item }) {
    return (
        <NavLink
            to={item.to}
            end={item.end}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
            className={({ isActive }) =>
                `tap-target flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    isActive
                        ? "bg-primary-k text-white"
                        : "text-muted-k hover:bg-surface-2 hover:text-primary-k"
                }`
            }
        >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
        </NavLink>
    );
}
