import React, { useState, useEffect, useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { titleForPath } from "@/lib/appPageTitles";
import { useAuth } from "@/context/AuthContext";
import {
    LayoutDashboard, FileText, MessageCircle, Users, ScrollText, LogOut,
    Settings as SettingsIcon, Sparkles, Menu, X,
    ShieldCheck, FolderArchive, Calendar, Bell, Repeat, Wrench, Mail, Share2, Star, FileBarChart,
    HeartPulse, Heart, FilePenLine, UserPlus, ChevronDown, ChevronRight, Wallet, ClipboardEdit, ClipboardList, Activity,
    LifeBuoy, Phone, Timer, User as UserIcon, ReceiptText, TrendingUp,
} from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";
import AccountHealthMenu from "@/components/AccountHealthMenu";
import WaylyLogo from "@/components/WaylyLogo";
import TrialCountdownBanner from "@/components/TrialCountdownBanner";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import GlobalSearch from "@/components/GlobalSearch";
import ParticipantSwitcher from "@/components/ParticipantSwitcher";
import PlanComplianceGuard from "@/components/PlanComplianceGuard";
import { useParticipants } from "@/context/ParticipantsContext";
import { LayoutContext } from "@/context/LayoutContext";
import { TOOLS_ORDERED, isBadgeActive } from "@/config/toolRegistry";

/**
 * AccountMenu — a single tidy dropdown on the far right of the header that
 * consolidates identity, plan and sign-out, so the top bar stays uncluttered.
 */
function AccountMenu({ user, onLogout }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);
    const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                data-testid="account-menu-toggle"
                className="flex items-center gap-2 rounded-full border border-kindred bg-surface hover:bg-surface-2 pl-1 pr-1 lg:pr-2.5 py-1 transition-colors"
                title="Account"
                aria-label="Account menu"
            >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-k text-white text-xs font-semibold">{initial}</span>
                <span className="hidden lg:block text-sm text-primary-k font-medium max-w-[110px] truncate">{user?.name?.split(" ")[0] || "Account"}</span>
                <ChevronDown className="hidden lg:block h-3.5 w-3.5 text-muted-k" />
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-kindred bg-surface shadow-xl overflow-hidden z-50" data-testid="account-menu">
                    <div className="px-4 py-3 border-b border-kindred">
                        <div className="text-sm font-semibold text-primary-k truncate">{user?.name || "Your account"}</div>
                        {user?.email && <div className="text-xs text-muted-k truncate mt-0.5">{user.email}</div>}
                    </div>
                    <Link to="/settings/billing" onClick={() => setOpen(false)} data-testid="layout-plan-badge" className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors">
                        <span className="text-sm text-primary-k">Plan &amp; Billing</span>
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-clay">{user?.plan || "free"}</span>
                    </Link>
                    <Link to="/settings/profile" onClick={() => setOpen(false)} data-testid="account-menu-settings" className="flex items-center gap-2.5 px-4 py-3 hover:bg-surface-2 transition-colors text-sm text-primary-k">
                        <SettingsIcon className="h-4 w-4 text-muted-k" /> Settings
                    </Link>
                    <button type="button" onClick={() => { setOpen(false); onLogout(); }} data-testid="logout-button" className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-surface-2 transition-colors text-sm text-primary-k border-t border-kindred">
                        <LogOut className="h-4 w-4 text-muted-k" /> Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Grouped nav. Keep the dashboard sidebar visually calm by clustering the
 * 20+ modules into ~5 named groups. Each group is collapsible and remembers
 * its open state across page navigations (sessionStorage).
 *
 * The "AI Tools" group is derived from ``TOOLS_ORDERED`` (INV-1 WS16), so
 * adding a tool to the registry surfaces it in the sidebar automatically.
 */
const aiToolItems = TOOLS_ORDERED.map((t) => ({
    to: t.route,
    label: t.name,
    icon: t.IconComponent,
    badge: isBadgeActive(t) ? "new" : null,
}));

const navGroups = [
    {
        key: "today",
        label: "Today",
        items: [
            { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, mobile: true },
            { to: "/app/me", label: "Profile", icon: UserIcon, matchPrefix: "/app/participants/" },
            { to: "/app/wall", label: "Family Wall", icon: Heart },
            { to: "/ai-tools", label: "AI Tools", icon: Sparkles, mobile: true },
        ],
    },
    {
        key: "ai_tools",
        label: "AI Tools",
        items: aiToolItems,
    },
    {
        key: "money",
        label: "Money & Statements",
        items: [
            { to: "/app/pacing", label: "Quarterly Pacing", icon: Timer },
            { to: "/app/statements", label: "Statements", icon: FileText, mobile: true },
            { to: "/app/invoices", label: "Invoices", icon: ReceiptText },
            { to: "/app/contribution-position", label: "Contribution Position", icon: TrendingUp },
            { to: "/app/budget-alerts", label: "Budget Alerts", icon: Bell },
            { to: "/app/budget-scenarios", label: "Budget Scenarios", icon: Wallet },
            { to: "/app/reports", label: "Reports", icon: FileBarChart },
        ],
    },
    {
        key: "guided_journeys",
        label: "Guided Journeys",
        items: [
            { to: "/app/ask-wayly", label: "Ask Wayly", icon: MessageCircle },
            { to: "/app/short-term-pathways", label: "Short-Term Pathways", icon: HeartPulse },
            { to: "/app/carer/self-assessment", label: "Carer Self-Check", icon: Heart },
            { to: "/app/carer/handover-pack", label: "Handover Pack", icon: ClipboardEdit },
            { to: "/app/csc/stream-mix-and-iat", label: "Classification Prep", icon: ClipboardList },
            { to: "/app/athm/projects", label: "AT & HM Projects", icon: Wrench },
            { to: "/app/chsp/tools", label: "CHSP Tools", icon: HeartPulse },
            { to: "/tools/letters-and-follow-ups/log", label: "Letters & Follow-ups", icon: Mail },
            { to: "/app/provider-switch", label: "Switch Provider", icon: Repeat },
        ],
    },
    {
        key: "care",
        label: "Their Care",
        items: [
            { to: "/app/family", label: "Care Team", icon: Users },
            { to: "/app?contacts=open", label: "Key Contacts", icon: Phone },
            { to: "/app/calendar", label: "Calendar", icon: Calendar },
            { to: "/app/hospital", label: "Hospital Mode", icon: HeartPulse },
            { to: "/app/care-plans", label: "Care Plans", icon: ClipboardList },
            { to: "/app/amendments", label: "Care-Plan Changes", icon: FilePenLine },
            { to: "/app/scenarios", label: "Log a Scenario", icon: ClipboardEdit },
            { to: "/app/timeline", label: "Timeline", icon: Activity },
        ],
    },
    {
        key: "providers",
        label: "Providers & Paperwork",
        items: [
            { to: "/app/documents", label: "Documents", icon: FolderArchive },
            { to: "/app/correspondence", label: "Correspondence", icon: Mail },
            { to: "/app/tools/provider-price-checker/compare", label: "Compare Providers", icon: Star },
            { to: "/app/ratings", label: "Ratings", icon: Star },
        ],
    },
    {
        key: "account",
        label: "Your Account",
        items: [
            { to: "/app/participants", label: "Participants", icon: UserPlus },
            { to: "/app/referrals", label: "Referrals", icon: Share2 },
            { to: "/app/audit", label: "Audit Log", icon: ScrollText },
            { to: "/support", label: "Support", icon: LifeBuoy },
            { to: "/settings/profile", label: "Settings", icon: SettingsIcon, mobile: true },
        ],
    },
];

// Flattened version still used by mobile bottom nav + drawer
const primaryNav = navGroups.flatMap((g) => g.items);

// Empty: AI Tools + Settings are now inside Today / Your Account groups.
const secondaryNav = [];

// Bottom-nav shows 4 items on mobile: 3 mobile-flagged + the More menu.
const bottomNavItems = primaryNav.filter((n) => n.mobile);

// Mobile drawer: each category collapses by default (matches desktop sidebar
// behaviour), but the group containing the current route auto-opens so users
// see where they are.
function MobileDrawerGroup({ group, drawerPathname, onNavigate }) {
    const hasActive = group.items.some((it) => {
        if (typeof it.to !== "string") return false;
        if (it.matchPrefix && drawerPathname.startsWith(it.matchPrefix)) return true;
        // Ignore modal-trigger routes containing "?" for active detection
        if (it.to.includes("?")) return false;
        if (it.end) return drawerPathname === it.to;
        return drawerPathname === it.to || drawerPathname.startsWith(it.to + "/");
    });
    const [open, setOpen] = useState(hasActive);
    useEffect(() => {
        if (hasActive) setOpen(true);
    }, [hasActive]);
    return (
        <div className="border-b border-kindred last:border-0 py-1" data-testid={`drawer-group-${group.key}`}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                data-testid={`drawer-group-toggle-${group.key}`}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-k hover:text-primary-k"
            >
                <span>{group.label}</span>
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {open && (
                <div className="flex flex-col gap-0.5 pb-1">
                    {group.items.map((item) => {
                        const isModalTrigger = typeof item.to === "string" && item.to.includes("?");
                        const matchesPrefix = !!(item.matchPrefix && drawerPathname.startsWith(item.matchPrefix));
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                onClick={onNavigate}
                                data-testid={`drawer-nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                                className={({ isActive }) => {
                                    const active = (isActive || matchesPrefix) && !isModalTrigger;
                                    return `tap-target flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                                        active ? "bg-primary-k text-white" : "text-primary-k hover:bg-surface-2"
                                    }`;
                                }}
                            >
                                <item.icon className="h-4.5 w-4.5" />
                                <span>{item.label}</span>
                            </NavLink>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function Layout({ children }) {
    const { user, household, logout } = useAuth();
    const { active: activeParticipant } = useParticipants();
    const headerName = activeParticipant
        ? `${activeParticipant.first_name || ""} ${activeParticipant.last_name || ""}`.trim()
        : household?.participant_name;
    const headerClass = activeParticipant?.classification ?? household?.classification;
    const headerProvider = activeParticipant?.provider_name || household?.provider_name;
    const nav = useNavigate();
    const location = useLocation();
    const drawerPathname = location.pathname;
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Give every authenticated app page a friendly browser-tab title
    // (e.g. "Letters Mailbox | Wayly") instead of falling back to the raw URL.
    // /ai-tools/* pages return null here so their own <SeoHead> title wins.
    const pageTitle = titleForPath(location.pathname, { participantName: headerName });

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
        <LayoutContext.Provider value={{ inLayout: true }}>
        {pageTitle && (
            <Helmet>
                <title>{`${pageTitle} | Wayly`}</title>
            </Helmet>
        )}
        <div className="min-h-screen bg-kindred has-bottom-nav app-shell">
            <ReadOnlyBanner />
            {/* ---- HEADER (compact on mobile) ---- */}
            <header className="app-topbar sticky top-0 z-40 backdrop-blur-xl border-b border-kindred safe-top">
                <div className="mx-auto max-w-[1720px] flex items-center justify-between px-3 md:px-4 lg:px-8 py-3 md:py-4 gap-2">
                    <Link to="/app" className="flex items-center gap-2 min-w-0" data-testid="brand-link" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" })}>
                        <WaylyLogo size={36} className="h-8 w-8 md:h-9 md:w-9 flex-none rounded-lg" />
                        <div className="leading-tight min-w-0">
                            <div className="font-heading text-base md:text-lg font-medium tracking-tight text-primary-k truncate">Wayly</div>
                        </div>
                    </Link>
                    <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
                        {user && <div className="hidden lg:block mr-1"><GlobalSearch /></div>}
                        {/* One notifications bell (personal + aged-care updates) beside the
                            account-setup ring — grouped with clear spacing so each stands out. */}
                        {user && (
                            <div className="flex items-center gap-1.5">
                                <NotificationsBell tone="light" />
                                <AccountHealthMenu />
                            </div>
                        )}
                        {user && <span className="hidden lg:block h-6 w-px bg-primary-k/15 mx-1" aria-hidden="true" />}
                        {/* Who you're caring for (clearly labelled, distinct from the account) */}
                        {user && <ParticipantSwitcher tone="light" />}
                        {user && <span className="hidden lg:block h-6 w-px bg-primary-k/15 mx-1" aria-hidden="true" />}
                        {/* Logged-in account (plan + sign out live inside the menu) */}
                        {user && <AccountMenu user={user} onLogout={handleLogout} />}
                        {/* Mobile drawer trigger */}
                        <button
                            type="button"
                            onClick={() => setDrawerOpen(true)}
                            aria-label="Open menu"
                            data-testid="layout-menu-button"
                            className="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-md text-primary-k hover:bg-surface-2"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ---- BODY: sidebar (lg+) + main. Uses lg (1024px) so landscape
                 mobile phones (852px) get the mobile layout too, avoiding the
                 squeezed-column bug when the sidebar tries to share a narrow
                 landscape viewport with the main content. ---- */}
            <div className="mx-auto max-w-[1720px] flex flex-col lg:flex-row gap-6 px-3 lg:px-6 xl:px-8 py-5 lg:py-8">
                <aside className="hidden lg:block lg:w-56 flex-shrink-0">
                    <nav className="flex flex-col gap-3" data-testid="primary-nav">
                        {navGroups.map((g) => <NavGroup key={g.key} group={g} />)}
                        <div className="pt-3 mt-1 border-t border-kindred flex flex-col gap-1">
                            {secondaryNav.map((item) => (
                                <NavItem key={item.to} item={item} />
                            ))}
                            {user?.is_admin && (
                                <NavItem item={{ to: "/admin/login", label: "Admin", icon: ShieldCheck }} />
                            )}
                        </div>
                    </nav>
                </aside>
                <main className="flex-1 min-w-0" key={activeParticipant?.id || "no-participant"}>
                    <div className="app-page">
                        <TrialCountdownBanner className="mb-4 md:mb-5" />
                        {children}
                    </div>
                </main>
            </div>
            <PlanComplianceGuard />

            {/* ---- MOBILE BOTTOM NAV ---- */}
            <nav
                aria-label="Primary"
                data-testid="mobile-bottom-nav"
                className="app-bottomnav lg:hidden fixed bottom-0 left-0 right-0 z-30 backdrop-blur-xl border-t border-kindred safe-bottom"
            >
                <div className="grid grid-cols-4 max-w-md mx-auto">
                    {bottomNavItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                            className={({ isActive }) =>
                                `tap-target flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] whitespace-nowrap transition-colors ${
                                    isActive ? "text-primary-k" : "text-muted-k hover:text-primary-k"
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <item.icon className={`h-4.5 w-4.5 ${isActive ? "text-gold" : ""}`} />
                                    <span className="font-medium leading-none">{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </div>
            </nav>

            {/* ---- MOBILE DRAWER ---- */}
            {drawerOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Menu"
                    data-testid="mobile-drawer"
                    className="lg:hidden fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
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
                                <div className="text-sm font-medium text-primary-k mt-0.5">{headerName}</div>
                                <div className="text-xs text-muted-k">{headerClass ? `Classification ${headerClass}` : ""}{headerProvider ? ` · ${headerProvider}` : ""}</div>
                            </div>
                        )}
                        <nav className="flex flex-col p-2 gap-1" data-testid="drawer-nav-grouped">
                            {navGroups.map((group) => (
                                <MobileDrawerGroup
                                    key={group.key}
                                    group={group}
                                    drawerPathname={drawerPathname}
                                    onNavigate={() => setDrawerOpen(false)}
                                />
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
                                <span>Plan & Billing</span>
                                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-k">{user?.plan || "free"}</span>
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
        </LayoutContext.Provider>
    );
}

function NavItem({ item }) {
    // Query-string-triggered links (e.g. `/app?contacts=open`) open drawers
    // rather than routing to a new page. They must never light up as
    // "active", otherwise multiple items highlight simultaneously.
    const isModalTrigger = typeof item.to === "string" && item.to.includes("?");
    const { pathname } = useLocation();
    // Some nav items point to a shortcut route (e.g., /app/me) that
    // immediately redirects to a canonical URL (e.g., /app/participants/:id).
    // In those cases the NavLink stops highlighting after the redirect. Allow
    // callers to declare a `matchPrefix` so the link stays highlighted when
    // the user is on the canonical URL too.
    const matchesPrefix = !!(item.matchPrefix && pathname.startsWith(item.matchPrefix));
    return (
        <NavLink
            to={item.to}
            end={item.end}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
            className={({ isActive }) => {
                const active = (isActive || matchesPrefix) && !isModalTrigger;
                return `tap-target flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    active
                        ? "bg-primary-k text-white"
                        : "text-muted-k hover:bg-surface-2 hover:text-primary-k"
                }`;
            }}
        >
            <item.icon className="h-4 w-4" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge === "new" && (
                <span className="text-[9px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-clay text-white">
                    New
                </span>
            )}
        </NavLink>
    );
}

function NavGroup({ group }) {
    const storageKey = `wayly_nav_group_${group.key}`;
    // Collapsed by default so the sidebar isn't overwhelming. The primary
    // "Today" group stays open so Dashboard and Profile are always reachable.
    const defaultOpen = group.key === "today";
    const [open, setOpen] = useState(() => {
        try { const v = sessionStorage.getItem(storageKey); return v === null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
    });
    const toggle = () => {
        setOpen((prev) => {
            const next = !prev;
            try { sessionStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* ignore */ }
            return next;
        });
    };
    return (
        <div data-testid={`nav-group-${group.key}`}>
            <button
                type="button"
                onClick={toggle}
                data-testid={`nav-group-toggle-${group.key}`}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-primary-k hover:text-clay transition-colors"
                aria-expanded={open}
            >
                <span className="whitespace-nowrap truncate">{group.label}</span>
                {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            </button>
            {open && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                    {group.items.map((item) => <NavItem key={item.to} item={item} />)}
                </div>
            )}
        </div>
    );
}
