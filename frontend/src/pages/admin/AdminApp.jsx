import React, { useEffect, useState, useCallback, useMemo } from "react";
import { NavLink, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import "./admin.css";
import {
    LayoutDashboard, Users, CreditCard, Bot, Headphones, Megaphone, FileText,
    LineChart, Lock, Settings, UserCog, Search, Bell, LogOut, ShieldAlert,
    Menu,
} from "lucide-react";
import { AdminAuthProvider, useAdminAuth, adminApi } from "./AdminAuthContext";
import AdminLogin from "./AdminLogin";
import AdminAcceptInvite from "./AdminAcceptInvite";

// ---------- Sidebar nav model (Section 1) ----------

const NAV = [
    {
        section: null,
        items: [{ to: "/admin", label: "Overview", icon: LayoutDashboard, end: true, testid: "admin-nav-overview" }],
    },
    {
        section: "User Management",
        items: [
            { to: "/admin/users", label: "All Users", icon: Users, testid: "admin-nav-users" },
            { to: "/admin/households", label: "Households", icon: Users, testid: "admin-nav-households" },
            { to: "/admin/flagged", label: "Flagged Accounts", icon: ShieldAlert, testid: "admin-nav-flagged" },
        ],
    },
    {
        section: "Subscriptions & Billing",
        items: [
            { to: "/admin/subscriptions", label: "Active", icon: CreditCard, testid: "admin-nav-subs" },
            { to: "/admin/payments", label: "Payments", icon: CreditCard, testid: "admin-nav-payments" },
            { to: "/admin/refunds", label: "Refunds", icon: CreditCard, testid: "admin-nav-refunds" },
            { to: "/admin/revenue", label: "Revenue Reports", icon: LineChart, testid: "admin-nav-revenue" },
        ],
    },
    {
        section: "AI & Tools",
        items: [
            { to: "/admin/decoder-log", label: "Decoder Log", icon: Bot, testid: "admin-nav-decoder" },
            { to: "/admin/anomaly-log", label: "Anomaly Log", icon: Bot, testid: "admin-nav-anomaly" },
            { to: "/admin/tool-stats", label: "Tool Usage", icon: LineChart, testid: "admin-nav-tools" },
            { to: "/admin/review-queue", label: "Review Queue", icon: ShieldAlert, testid: "admin-nav-review" },
        ],
    },
    {
        section: "Support",
        items: [
            { to: "/admin/tickets", label: "Tickets", icon: Headphones, testid: "admin-nav-tickets" },
            { to: "/admin/macros", label: "Macros", icon: FileText, testid: "admin-nav-macros" },
        ],
    },
    {
        section: "Communications",
        items: [
            { to: "/admin/campaigns", label: "Campaigns", icon: Megaphone, testid: "admin-nav-campaigns" },
            { to: "/admin/email-templates", label: "Templates", icon: FileText, testid: "admin-nav-emailtpl" },
            { to: "/admin/notifications", label: "Notification Log", icon: Bell, testid: "admin-nav-notiflog" },
        ],
    },
    {
        section: "Content",
        items: [
            { to: "/admin/blog", label: "Blog", icon: FileText, testid: "admin-nav-blog" },
            { to: "/admin/glossary", label: "Glossary", icon: FileText, testid: "admin-nav-glossary" },
            { to: "/admin/templates-library", label: "Templates Library", icon: FileText, testid: "admin-nav-tpllib" },
            { to: "/admin/changelog", label: "Changelog", icon: FileText, testid: "admin-nav-changelog" },
        ],
    },
    {
        section: "Analytics",
        items: [
            { to: "/admin/analytics-product", label: "Product Analytics", icon: LineChart, testid: "admin-nav-pa" },
            { to: "/admin/funnels", label: "Funnels", icon: LineChart, testid: "admin-nav-funnels" },
            { to: "/admin/cohorts", label: "Cohorts", icon: LineChart, testid: "admin-nav-cohorts" },
        ],
    },
    {
        section: "Security",
        items: [
            { to: "/admin/audit-log", label: "Audit Log", icon: Lock, testid: "admin-nav-audit" },
            { to: "/admin/sessions", label: "Admin Sessions", icon: Lock, testid: "admin-nav-sessions" },
            { to: "/admin/data-requests", label: "Data Requests", icon: Lock, testid: "admin-nav-datareq" },
        ],
    },
    {
        section: "System",
        items: [
            { to: "/admin/feature-flags", label: "Feature Flags", icon: Settings, testid: "admin-nav-ff" },
            { to: "/admin/health", label: "System Health", icon: Settings, testid: "admin-nav-health" },
            { to: "/admin/maintenance", label: "Maintenance", icon: Settings, testid: "admin-nav-maint" },
        ],
        rolesAllowed: ["super_admin", "operations_admin"],
    },
    {
        section: "Admin",
        items: [
            { to: "/admin/admins", label: "Admin Accounts", icon: UserCog, testid: "admin-nav-admins" },
            { to: "/admin/statements", label: "All Statements", icon: FileText, testid: "admin-nav-statements" },
        ],
        rolesAllowed: ["super_admin"],
    },
];

// ---------- Guards & layout ----------

function RequireAdmin({ children }) {
    const { admin, loading } = useAdminAuth();
    if (loading) return <div className="admin-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--admin-muted)" }}>Checking session…</div>;
    if (!admin) return <Navigate to="/admin/login" replace />;
    return children;
}

function AdminShell({ children }) {
    const { admin, logout } = useAdminAuth();
    const nav = useNavigate();
    const [cmdkOpen, setCmdkOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setCmdkOpen((v) => !v);
            }
            if (e.key === "Escape") setCmdkOpen(false);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    const filteredNav = useMemo(() =>
        NAV.filter((s) => !s.rolesAllowed || s.rolesAllowed.includes(admin?.admin_role)),
    [admin]);

    const onLogout = async () => {
        await logout();
        nav("/admin/login", { replace: true });
    };

    return (
        <div className="admin-root" style={{ display: "flex", minHeight: "100vh" }}>
            {/* Mobile overlay */}
            {drawerOpen && (
                <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 30 }} />
            )}

            {/* Sidebar */}
            <aside className="admin-sidebar"
                style={{
                    width: 240, flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto",
                    zIndex: 40,
                    transform: drawerOpen ? "translateX(0)" : undefined,
                }}
                data-testid="admin-sidebar"
            >
                <div style={{ padding: "16px 14px", borderBottom: "1px solid var(--admin-border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--admin-muted)" }}>Wayly</span>
                    <span style={{ color: "var(--admin-red)", fontWeight: 800, fontSize: 16 }}>Admin</span>
                </div>
                <nav style={{ padding: "8px 0" }}>
                    {filteredNav.map((sec, i) => (
                        <div key={i}>
                            {sec.section && <div className="admin-nav-section">{sec.section}</div>}
                            {sec.items.map((it) => (
                                <NavLink key={it.to} to={it.to} end={it.end}
                                    onClick={() => setDrawerOpen(false)}
                                    data-testid={it.testid}
                                    className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}>
                                    <it.icon size={15} />
                                    <span>{it.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Main */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <header className="admin-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", position: "sticky", top: 0, zIndex: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button onClick={() => setDrawerOpen(true)} className="admin-btn admin-btn-secondary" style={{ padding: "6px", display: "none" }} data-testid="admin-mobile-menu">
                            <Menu size={16} />
                        </button>
                        <button onClick={() => setCmdkOpen(true)} className="admin-btn admin-btn-secondary"
                            style={{ display: "flex", alignItems: "center", gap: 8, width: 320, justifyContent: "flex-start", color: "var(--admin-muted)" }}
                            data-testid="admin-search-trigger">
                            <Search size={14} />
                            <span style={{ flex: 1, textAlign: "left" }}>Search users, households, tickets…</span>
                            <kbd style={{ fontSize: 11, padding: "2px 6px", background: "var(--admin-bg)", borderRadius: 4, border: "1px solid var(--admin-border)" }}>⌘K</kbd>
                        </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <button className="admin-btn admin-btn-secondary" style={{ padding: "6px" }} title="Notifications" data-testid="admin-bell">
                            <Bell size={15} />
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{admin?.name}</div>
                                <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{admin?.admin_role?.replace("_", " ")}</div>
                            </div>
                            <button onClick={onLogout} className="admin-btn admin-btn-secondary" style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 4 }} data-testid="admin-logout">
                                <LogOut size={13} />
                            </button>
                        </div>
                    </div>
                </header>
                <main style={{ padding: 24 }}>{children}</main>
            </div>

            {cmdkOpen && <CmdK onClose={() => setCmdkOpen(false)} />}
        </div>
    );
}

// ---------- Cmd+K skeleton ----------
function CmdK({ onClose }) {
    const [q, setQ] = useState("");
    const nav = useNavigate();
    const items = NAV.flatMap((s) => s.items).filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));
    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid="admin-cmdk">
            <div className="admin-cmdk" onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: 12, borderBottom: "1px solid var(--admin-border)" }}>
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder="Search users, households, tickets, pages…"
                        className="admin-input" style={{ border: 0, fontSize: 16 }} data-testid="admin-cmdk-input" />
                </div>
                <div style={{ maxHeight: 360, overflowY: "auto", padding: "8px 0" }}>
                    {items.length === 0 ? (
                        <div style={{ padding: 16, color: "var(--admin-muted)", fontSize: 13 }}>No matches.</div>
                    ) : items.slice(0, 12).map((it) => (
                        <div key={it.to}
                            onClick={() => { nav(it.to); onClose(); }}
                            className="admin-nav-item" style={{ borderLeft: 0, cursor: "pointer" }}>
                            <it.icon size={14} />
                            <span>{it.label}</span>
                        </div>
                    ))}
                </div>
                <div style={{ padding: "8px 12px", borderTop: "1px solid var(--admin-border)", fontSize: 11, color: "var(--admin-muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>↑↓ navigate · ↵ select</span>
                    <span>esc to close</span>
                </div>
            </div>
        </div>
    );
}

// ---------- Pages (Overview, Users, Statements/Households/Payments imported below) ----------

import { AdminAnalytics, AdminUsers, AdminHouseholds, AdminPayments, AdminStatements, Placeholder } from "./AdminPages";
import AdminUserProfile from "./AdminUserProfile";
import {
    AdminDecoderLog, AdminAnomalyLog, AdminToolStats, AdminSubscriptions,
    AdminFailedPayments, AdminRefunds, AdminRevenue,
} from "./AdminPhaseC";
import {
    AdminTickets, AdminTicketDetail, AdminMacros, AdminCampaigns,
    AdminEmailTemplates, AdminNotificationLog, AdminSubscribers,
} from "./AdminPhaseD";
import {
    AdminAuditLog, AdminSessions, AdminDataRequests,
    AdminFeatureFlags, AdminSystemHealth, AdminAccounts,
} from "./AdminPhaseE";
import {
    AdminArticles, AdminGlossary, AdminTemplatesLibrary, AdminChangelog,
} from "./AdminPhaseE2";

function AdminRoutes() {
    return (
        <AdminShell>
            <Routes>
                <Route index element={<AdminAnalytics />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/:userId" element={<AdminUserProfile />} />
                <Route path="households" element={<AdminHouseholds />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="statements" element={<AdminStatements />} />
                {/* Phase C */}
                <Route path="decoder-log" element={<AdminDecoderLog />} />
                <Route path="anomaly-log" element={<AdminAnomalyLog />} />
                <Route path="tool-stats" element={<AdminToolStats />} />
                <Route path="subscriptions" element={<AdminSubscriptions defaultStatus="active" label="Active Subscriptions" testid="admin-subs" />} />
                <Route path="refunds" element={<AdminRefunds />} />
                <Route path="revenue" element={<AdminRevenue />} />
                {/* Phase D */}
                <Route path="tickets" element={<AdminTickets />} />
                <Route path="tickets/:ticketId" element={<AdminTicketDetail />} />
                <Route path="macros" element={<AdminMacros />} />
                <Route path="campaigns" element={<AdminCampaigns />} />
                <Route path="email-templates" element={<AdminEmailTemplates />} />
                <Route path="notifications" element={<AdminNotificationLog />} />
                <Route path="newsletter-subscribers" element={<AdminSubscribers />} />
                {/* Phase E1 — Security / System / Admin CRUD */}
                <Route path="audit-log" element={<AdminAuditLog />} />
                <Route path="sessions" element={<AdminSessions />} />
                <Route path="data-requests" element={<AdminDataRequests />} />
                <Route path="feature-flags" element={<AdminFeatureFlags />} />
                <Route path="health" element={<AdminSystemHealth />} />
                <Route path="maintenance" element={<AdminSystemHealth />} />
                <Route path="admins" element={<AdminAccounts />} />
                {/* Phase E2 — Content CMS */}
                <Route path="blog" element={<AdminArticles />} />
                <Route path="glossary" element={<AdminGlossary />} />
                <Route path="templates-library" element={<AdminTemplatesLibrary />} />
                <Route path="changelog" element={<AdminChangelog />} />
                {/* Fallback placeholders for not-yet-built sections */}
                {NAV.flatMap((s) => s.items).map((it) => {
                    const path = it.to.replace("/admin/", "").replace("/admin", "");
                    if (!path) return null;
                    if ([
                        "users", "households", "payments", "statements",
                        "decoder-log", "anomaly-log", "tool-stats",
                        "subscriptions", "refunds", "revenue",
                        "tickets", "macros", "campaigns",
                        "email-templates", "notifications", "newsletter-subscribers",
                        "audit-log", "sessions", "data-requests",
                        "feature-flags", "health", "maintenance", "admins",
                        "blog", "glossary", "templates-library", "changelog",
                    ].includes(path)) return null;
                    return <Route key={it.to} path={path} element={<Placeholder label={it.label} />} />;
                })}
            </Routes>
        </AdminShell>
    );
}

// ---------- Root component (handles login route inline) ----------

export default function AdminApp() {
    return (
        <AdminAuthProvider>
            <Routes>
                <Route path="login" element={<AdminLogin />} />
                <Route path="accept-invite" element={<AdminAcceptInvite />} />
                <Route path="*" element={<RequireAdmin><AdminRoutes /></RequireAdmin>} />
            </Routes>
        </AdminAuthProvider>
    );
}

export { adminApi };
