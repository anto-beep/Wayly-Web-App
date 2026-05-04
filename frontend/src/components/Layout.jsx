import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, FileText, MessageCircle, Users, ScrollText, LogOut, HeartHandshake, UserCircle2, Settings as SettingsIcon, Sparkles } from "lucide-react";

const navItems = [
    { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/app/statements", label: "Statements", icon: FileText },
    { to: "/app/chat", label: "Ask Kindred", icon: MessageCircle },
    { to: "/app/family", label: "Family thread", icon: Users },
    { to: "/app/audit", label: "Audit log", icon: ScrollText },
];

const secondaryItems = [
    { to: "/ai-tools", label: "AI Tools", icon: Sparkles },
    { to: "/settings/profile", label: "Settings", icon: SettingsIcon },
];

export default function Layout({ children }) {
    const { user, household, logout } = useAuth();
    const nav = useNavigate();

    const handleLogout = () => {
        logout();
        nav("/");
    };

    return (
        <div className="min-h-screen bg-kindred">
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/75 border-b border-kindred">
                <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
                    <Link to="/app" className="flex items-center gap-2.5" data-testid="brand-link">
                        <div className="h-9 w-9 rounded-full bg-primary-k flex items-center justify-center">
                            <HeartHandshake className="h-5 w-5 text-white" />
                        </div>
                        <div className="leading-tight">
                            <div className="font-heading text-lg font-medium tracking-tight text-primary-k">Kindred</div>
                            <div className="overline">Support at Home, in plain English</div>
                        </div>
                    </Link>
                    <div className="flex items-center gap-3">
                        {household && (
                            <div className="hidden sm:flex flex-col text-right">
                                <span className="text-sm font-medium text-primary-k">{household.participant_name}</span>
                                <span className="text-xs text-muted-k">Classification {household.classification} · {household.provider_name}</span>
                            </div>
                        )}
                        {user && (
                            <Link
                                to="/settings/billing"
                                data-testid="layout-plan-badge"
                                className="hidden md:inline-flex items-center gap-2 rounded-full bg-surface-2 border border-kindred px-3 py-1.5 text-xs hover:bg-surface transition-colors"
                                title="Manage plan"
                            >
                                <span className="font-medium text-primary-k uppercase tracking-wider">{user.plan || "free"}</span>
                                <span className="text-muted-k">plan</span>
                            </Link>
                        )}
                        <Link
                            to="/participant"
                            data-testid="participant-view-link"
                            className="hidden md:inline-flex items-center gap-2 rounded-full border border-kindred px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors"
                        >
                            <UserCircle2 className="h-4 w-4" /> Participant view
                        </Link>
                        <button
                            onClick={handleLogout}
                            data-testid="logout-button"
                            className="inline-flex items-center gap-2 text-sm text-muted-k hover:text-primary-k transition-colors"
                        >
                            <LogOut className="h-4 w-4" /> {user?.name}
                        </button>
                    </div>
                </div>
            </header>
            <div className="mx-auto max-w-7xl flex flex-col md:flex-row gap-6 px-6 py-8">
                <aside className="md:w-56 flex-shrink-0">
                    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible" data-testid="primary-nav">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                                        isActive
                                            ? "bg-primary-k text-white"
                                            : "text-muted-k hover:bg-surface-2 hover:text-primary-k"
                                    }`
                                }
                            >
                                <item.icon className="h-4 w-4" />
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                        <div className="md:pt-3 md:mt-3 md:border-t md:border-kindred flex md:flex-col gap-1">
                            {secondaryItems.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                                            isActive
                                                ? "bg-primary-k text-white"
                                                : "text-muted-k hover:bg-surface-2 hover:text-primary-k"
                                        }`
                                    }
                                >
                                    <item.icon className="h-4 w-4" />
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    </nav>
                </aside>
                <main className="flex-1 min-w-0">{children}</main>
            </div>
        </div>
    );
}
