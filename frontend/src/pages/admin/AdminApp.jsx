import React, { useEffect, useState, useCallback } from "react";
import { NavLink, Routes, Route, useParams, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ---------- AdminLayout ----------

const NAV = [
    { to: "/admin", label: "Overview", end: true, testid: "admin-nav-analytics" },
    { to: "/admin/users", label: "Users", testid: "admin-nav-users" },
    { to: "/admin/households", label: "Households", testid: "admin-nav-households" },
    { to: "/admin/payments", label: "Payments", testid: "admin-nav-payments" },
    { to: "/admin/statements", label: "Statements", testid: "admin-nav-statements" },
];

function AdminShell({ children }) {
    return (
        <div className="min-h-screen bg-kindred">
            <header className="border-b border-kindred bg-primary-k text-white sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-xs uppercase tracking-widest font-medium opacity-80">Wayly Admin</span>
                        <span className="px-2 py-0.5 rounded-full bg-[#D4A24E] text-[#1F3A5F] text-[10px] font-bold uppercase tracking-wider">System Owner</span>
                    </div>
                    <Link to="/app" className="text-sm opacity-90 hover:opacity-100 underline" data-testid="admin-back-to-app">← Back to app</Link>
                </div>
                <nav className="max-w-7xl mx-auto px-6 pb-2 flex gap-1 overflow-x-auto">
                    {NAV.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.end}
                            data-testid={n.testid}
                            className={({ isActive }) =>
                                `px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors whitespace-nowrap ${
                                    isActive ? "bg-kindred text-primary-k" : "text-white/80 hover:text-white"
                                }`
                            }
                        >
                            {n.label}
                        </NavLink>
                    ))}
                </nav>
            </header>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        </div>
    );
}

function RequireAdmin({ children }) {
    const { user, loading } = useAuth();
    const nav = useNavigate();
    useEffect(() => {
        if (!loading && (!user || !user.is_admin)) {
            toast.error("Admin access required");
            nav("/app", { replace: true });
        }
    }, [user, loading, nav]);
    if (loading || !user || !user.is_admin) {
        return <div className="min-h-screen flex items-center justify-center text-muted-k">Checking admin access…</div>;
    }
    return children;
}

// ---------- Shared UI ----------

function StatCard({ label, value, sub }) {
    return (
        <div className="bg-surface rounded-xl border border-kindred p-4">
            <div className="text-xs uppercase tracking-wider text-muted-k font-medium">{label}</div>
            <div className="mt-1 font-heading text-3xl text-primary-k">{value}</div>
            {sub && <div className="mt-1 text-xs text-muted-k">{sub}</div>}
        </div>
    );
}

function Pill({ children, tone = "navy" }) {
    const tones = {
        navy: "bg-[#1F3A5F] text-white",
        gold: "bg-[#D4A24E] text-[#1F3A5F]",
        sage: "bg-[#7A9B7E] text-white",
        terracotta: "bg-[#C5734D] text-white",
        muted: "bg-[#E8E2D6] text-[#1A1A1A]",
    };
    return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}>{children}</span>;
}

function planTone(plan) {
    return plan === "family" ? "gold" : plan === "solo" ? "navy" : plan === "advisor" || plan === "advisor_pro" ? "sage" : "muted";
}

function fmtDate(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
        return iso;
    }
}

function fmtMoney(n, currency = "AUD") {
    if (n == null) return "—";
    try {
        return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase() }).format(Number(n));
    } catch {
        return `$${n}`;
    }
}

// ---------- Analytics ----------

function AdminAnalytics() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => {
        api.get("/admin/analytics")
            .then((r) => setData(r.data))
            .catch((e) => setErr(extractErrorMessage(e)));
    }, []);
    if (err) return <p className="text-terracotta-k" data-testid="admin-analytics-error">{err}</p>;
    if (!data) return <p className="text-muted-k">Loading analytics…</p>;
    return (
        <div className="space-y-6" data-testid="admin-analytics">
            <h1 className="font-heading text-3xl text-primary-k">Overview</h1>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Total users" value={data.users.total} sub={`+${data.users.last_7d} this week`} />
                <StatCard label="Households" value={data.households.total} />
                <StatCard label="Statements decoded" value={data.statements.total} sub={`+${data.statements.last_7d} this week`} />
                <StatCard label="Revenue (paid)" value={fmtMoney(data.payments.revenue_total)} sub={`${data.payments.paid_count} transactions`} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-surface rounded-xl border border-kindred p-4">
                    <h3 className="font-heading text-lg text-primary-k mb-3">Plans</h3>
                    <ul className="space-y-1.5 text-sm">
                        {Object.entries(data.plans).map(([k, v]) => (
                            <li key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="font-medium">{v}</span></li>
                        ))}
                    </ul>
                </div>
                <div className="bg-surface rounded-xl border border-kindred p-4">
                    <h3 className="font-heading text-lg text-primary-k mb-3">Subscriptions</h3>
                    <ul className="space-y-1.5 text-sm">
                        {Object.entries(data.subscriptions).map(([k, v]) => (
                            <li key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="font-medium">{v}</span></li>
                        ))}
                    </ul>
                </div>
            </div>
            <div className="bg-surface rounded-xl border border-kindred p-4">
                <h3 className="font-heading text-lg text-primary-k mb-3">Top active households</h3>
                {data.top_active_households.length === 0 ? (
                    <p className="text-sm text-muted-k">No statement activity yet.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="text-muted-k text-xs uppercase tracking-wider">
                            <tr><th className="text-left py-1">Participant</th><th className="text-left">Owner</th><th className="text-right">Statements</th></tr>
                        </thead>
                        <tbody>
                            {data.top_active_households.map((h, i) => (
                                <tr key={i} className="border-t border-kindred">
                                    <td className="py-1.5">{h.participant}</td>
                                    <td>{h.owner_name} <span className="text-muted-k">({h.owner_email})</span></td>
                                    <td className="text-right font-medium">{h.statement_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ---------- Users ----------

function AdminUsers() {
    const [q, setQ] = useState("");
    const [planFilter, setPlanFilter] = useState("");
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const PAGE_SIZE = 25;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, page_size: PAGE_SIZE };
            if (q) params.q = q;
            if (planFilter) params.plan = planFilter;
            const r = await api.get("/admin/users", { params });
            setData(r.data);
        } catch (e) {
            toast.error(extractErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }, [q, planFilter, page]);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-4" data-testid="admin-users">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="font-heading text-3xl text-primary-k">Users {data && <span className="text-sm text-muted-k font-sans">({data.total})</span>}</h1>
                <a href={`${process.env.REACT_APP_BACKEND_URL}/api/admin/export/users.csv`} className="text-sm underline text-primary-k" target="_blank" rel="noreferrer" data-testid="admin-export-users-csv">Export CSV</a>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
                <input
                    value={q}
                    onChange={(e) => { setPage(1); setQ(e.target.value); }}
                    placeholder="Search by email or name…"
                    className="flex-1 min-w-[200px] rounded-lg border border-kindred px-3 py-2 text-sm bg-surface"
                    data-testid="admin-users-search"
                />
                <select
                    value={planFilter}
                    onChange={(e) => { setPage(1); setPlanFilter(e.target.value); }}
                    className="rounded-lg border border-kindred px-3 py-2 text-sm bg-surface"
                    data-testid="admin-users-plan-filter"
                >
                    <option value="">All plans</option>
                    <option value="free">Free</option>
                    <option value="solo">Solo</option>
                    <option value="family">Family</option>
                </select>
            </div>
            <div className="bg-surface rounded-xl border border-kindred overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-muted-k text-xs uppercase tracking-wider bg-surface-2">
                            <tr>
                                <th className="text-left px-3 py-2">Email</th>
                                <th className="text-left">Name</th>
                                <th className="text-left">Plan</th>
                                <th className="text-left">Status</th>
                                <th className="text-left">Role</th>
                                <th className="text-left">Joined</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && !data ? (
                                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-k">Loading…</td></tr>
                            ) : data && data.users.length === 0 ? (
                                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-k">No users match.</td></tr>
                            ) : (
                                data?.users.map((u) => (
                                    <tr key={u.id} className="border-t border-kindred hover:bg-surface-2 cursor-pointer" onClick={() => setSelectedId(u.id)} data-testid={`admin-user-row-${u.id}`}>
                                        <td className="px-3 py-2">
                                            <div className="font-medium">{u.email}</div>
                                            {u.is_admin && <Pill tone="gold">Admin</Pill>}
                                        </td>
                                        <td>{u.name}</td>
                                        <td><Pill tone={planTone(u.plan)}>{u.plan}</Pill></td>
                                        <td className="text-xs">
                                            {u.subscription_status ? <Pill tone={u.subscription_status === "trialing" ? "gold" : u.subscription_status === "active" ? "sage" : "muted"}>{u.subscription_status}</Pill> : <span className="text-muted-k">—</span>}
                                        </td>
                                        <td className="capitalize">{u.role}</td>
                                        <td className="text-xs text-muted-k">{fmtDate(u.created_at)}</td>
                                        <td className="pr-3 text-right text-xs underline text-primary-k">View</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {data && data.total > PAGE_SIZE && (
                <div className="flex items-center justify-between text-sm">
                    <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded border border-kindred disabled:opacity-50">← Prev</button>
                    <span className="text-muted-k">Page {page} of {Math.ceil(data.total / PAGE_SIZE)}</span>
                    <button disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded border border-kindred disabled:opacity-50">Next →</button>
                </div>
            )}
            {selectedId && <UserDetailDrawer userId={selectedId} onClose={() => setSelectedId(null)} onMutate={load} />}
        </div>
    );
}

function UserDetailDrawer({ userId, onClose, onMutate }) {
    const { user: me } = useAuth();
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/admin/users/${userId}`);
            setDetail(r.data);
        } catch (e) {
            toast.error(extractErrorMessage(e));
        }
    }, [userId]);
    useEffect(() => { load(); }, [load]);

    const act = async (label, fn) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            toast.success(label);
            await load();
            onMutate?.();
        } catch (e) {
            toast.error(extractErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const u = detail?.user;
    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
            <div className="bg-surface w-full max-w-xl h-full overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()} data-testid="admin-user-drawer">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="font-heading text-2xl text-primary-k">{u?.name || "—"}</h2>
                        <p className="text-sm text-muted-k">{u?.email}</p>
                    </div>
                    <button onClick={onClose} className="text-muted-k hover:text-primary-k text-lg" data-testid="admin-drawer-close">×</button>
                </div>
                {!detail ? <p className="text-muted-k">Loading…</p> : (
                    <>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-surface-2 rounded p-3"><div className="text-[10px] uppercase tracking-wider text-muted-k">Plan</div><Pill tone={planTone(u.plan)}>{u.plan}</Pill></div>
                            <div className="bg-surface-2 rounded p-3"><div className="text-[10px] uppercase tracking-wider text-muted-k">Role</div><div className="capitalize">{u.role}</div></div>
                            <div className="bg-surface-2 rounded p-3"><div className="text-[10px] uppercase tracking-wider text-muted-k">Admin</div><div>{u.is_admin ? "Yes" : "No"}</div></div>
                            <div className="bg-surface-2 rounded p-3"><div className="text-[10px] uppercase tracking-wider text-muted-k">Joined</div><div>{fmtDate(u.created_at)}</div></div>
                            {detail.subscription && <>
                                <div className="bg-surface-2 rounded p-3"><div className="text-[10px] uppercase tracking-wider text-muted-k">Subscription</div><div>{detail.subscription.status}</div></div>
                                <div className="bg-surface-2 rounded p-3"><div className="text-[10px] uppercase tracking-wider text-muted-k">Trial ends</div><div>{fmtDate(detail.subscription.trial_ends_at)}</div></div>
                            </>}
                        </div>

                        {/* Actions */}
                        <div className="border-t border-kindred pt-4 space-y-2">
                            <h3 className="font-heading text-sm text-primary-k uppercase tracking-wider">Admin actions</h3>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    disabled={busy}
                                    onClick={() => act("Password reset email sent", () => api.post(`/admin/users/${userId}/reset-password`))}
                                    className="text-xs px-3 py-1.5 rounded border border-kindred bg-surface hover:bg-surface-2 disabled:opacity-50"
                                    data-testid="admin-action-reset-password"
                                >Send password reset</button>
                                <button
                                    disabled={busy}
                                    onClick={() => act(u.is_admin ? "Admin removed" : "Admin granted", () => api.put(`/admin/users/${userId}/admin`, { is_admin: !u.is_admin }))}
                                    className="text-xs px-3 py-1.5 rounded border border-kindred bg-surface hover:bg-surface-2 disabled:opacity-50"
                                    data-testid="admin-action-toggle-admin"
                                >{u.is_admin ? "Remove admin" : "Make admin"}</button>
                                {detail.subscription && ["trialing", "active"].includes(detail.subscription.status) && (
                                    <button
                                        disabled={busy}
                                        onClick={() => act("Subscription cancelled", () => api.post(`/admin/users/${userId}/cancel-subscription`))}
                                        className="text-xs px-3 py-1.5 rounded border border-[#C5734D] text-[#C5734D] bg-surface hover:bg-[#FDF1E8] disabled:opacity-50"
                                        data-testid="admin-action-cancel-sub"
                                    >Cancel subscription</button>
                                )}
                                <select
                                    disabled={busy}
                                    value={u.plan}
                                    onChange={(e) => act(`Plan changed to ${e.target.value}`, () => api.put(`/admin/users/${userId}/plan`, { plan: e.target.value }))}
                                    className="text-xs px-2 py-1.5 rounded border border-kindred bg-surface"
                                    data-testid="admin-action-set-plan"
                                >
                                    <option value="free">free</option>
                                    <option value="solo">solo</option>
                                    <option value="family">family</option>
                                </select>
                                {u.id !== me?.id && (
                                    <button
                                        disabled={busy}
                                        onClick={() => {
                                            if (!window.confirm(`Permanently delete ${u.email}? This removes their account, subscriptions, household and statements.`)) return;
                                            act("User deleted", () => api.delete(`/admin/users/${userId}`)).then(() => onClose());
                                        }}
                                        className="text-xs px-3 py-1.5 rounded bg-[#C5734D] text-white hover:bg-[#A55C3C] disabled:opacity-50"
                                        data-testid="admin-action-delete-user"
                                    >Delete user</button>
                                )}
                            </div>
                        </div>

                        {detail.household && (
                            <div className="border-t border-kindred pt-4">
                                <h3 className="font-heading text-sm text-primary-k uppercase tracking-wider mb-2">Household</h3>
                                <div className="text-sm space-y-0.5">
                                    <div><span className="text-muted-k">Participant:</span> {detail.household.participant_name}</div>
                                    <div><span className="text-muted-k">Classification:</span> {detail.household.classification}</div>
                                    <div><span className="text-muted-k">Provider:</span> {detail.household.provider_name}</div>
                                </div>
                            </div>
                        )}

                        {detail.statements?.length > 0 && (
                            <div className="border-t border-kindred pt-4">
                                <h3 className="font-heading text-sm text-primary-k uppercase tracking-wider mb-2">Recent statements ({detail.statements.length})</h3>
                                <ul className="text-sm space-y-1">
                                    {detail.statements.slice(0, 10).map((s) => (
                                        <li key={s.id} className="flex justify-between border-b border-kindred py-1">
                                            <span>{s.participant_name || "—"} <span className="text-muted-k text-xs">· {s.statement_period}</span></span>
                                            <span className="text-xs text-muted-k">{fmtDate(s.uploaded_at)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {detail.payments?.length > 0 && (
                            <div className="border-t border-kindred pt-4">
                                <h3 className="font-heading text-sm text-primary-k uppercase tracking-wider mb-2">Payments ({detail.payments.length})</h3>
                                <ul className="text-sm space-y-1">
                                    {detail.payments.map((p, i) => (
                                        <li key={i} className="flex justify-between border-b border-kindred py-1">
                                            <span>{p.plan} <Pill tone={p.payment_status === "paid" ? "sage" : "muted"}>{p.payment_status}</Pill></span>
                                            <span className="text-xs">{fmtMoney(p.amount, p.currency || "AUD")}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {detail.audit?.length > 0 && (
                            <div className="border-t border-kindred pt-4">
                                <h3 className="font-heading text-sm text-primary-k uppercase tracking-wider mb-2">Audit trail</h3>
                                <ul className="text-xs space-y-1 text-muted-k">
                                    {detail.audit.slice(0, 10).map((a, i) => (
                                        <li key={i}>{fmtDate(a.ts)} · {a.kind}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ---------- Households ----------

function AdminHouseholds() {
    const [q, setQ] = useState("");
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 25;

    useEffect(() => {
        const params = { page, page_size: PAGE_SIZE };
        if (q) params.q = q;
        api.get("/admin/households", { params }).then((r) => setData(r.data)).catch((e) => toast.error(extractErrorMessage(e)));
    }, [q, page]);

    return (
        <div className="space-y-4" data-testid="admin-households">
            <h1 className="font-heading text-3xl text-primary-k">Households {data && <span className="text-sm text-muted-k font-sans">({data.total})</span>}</h1>
            <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search by participant or provider…" className="w-full max-w-md rounded-lg border border-kindred px-3 py-2 text-sm bg-surface" data-testid="admin-households-search" />
            <div className="bg-surface rounded-xl border border-kindred overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-muted-k text-xs uppercase tracking-wider bg-surface-2">
                        <tr><th className="text-left px-3 py-2">Participant</th><th className="text-left">Class</th><th className="text-left">Provider</th><th className="text-right">Members</th><th className="text-right">Statements</th><th className="text-left pr-3">Created</th></tr>
                    </thead>
                    <tbody>
                        {data?.households?.map((h) => (
                            <tr key={h.id} className="border-t border-kindred">
                                <td className="px-3 py-2 font-medium">{h.participant_name}</td>
                                <td>{h.classification}</td>
                                <td>{h.provider_name}</td>
                                <td className="text-right">{h.member_count}</td>
                                <td className="text-right">{h.statement_count}</td>
                                <td className="pr-3 text-xs text-muted-k">{fmtDate(h.created_at)}</td>
                            </tr>
                        ))}
                        {data && data.households.length === 0 && (
                            <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-k">No households yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------- Payments ----------

function AdminPayments() {
    const [data, setData] = useState(null);
    const [statusFilter, setStatusFilter] = useState("");
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 25;
    useEffect(() => {
        const params = { page, page_size: PAGE_SIZE };
        if (statusFilter) params.status = statusFilter;
        api.get("/admin/payments", { params }).then((r) => setData(r.data)).catch((e) => toast.error(extractErrorMessage(e)));
    }, [statusFilter, page]);

    return (
        <div className="space-y-4" data-testid="admin-payments">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="font-heading text-3xl text-primary-k">Payments {data && <span className="text-sm text-muted-k font-sans">({data.total})</span>}</h1>
                <a href={`${process.env.REACT_APP_BACKEND_URL}/api/admin/export/payments.csv`} className="text-sm underline text-primary-k" target="_blank" rel="noreferrer" data-testid="admin-export-payments-csv">Export CSV</a>
            </div>
            <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }} className="rounded-lg border border-kindred px-3 py-2 text-sm bg-surface" data-testid="admin-payments-status-filter">
                <option value="">All statuses</option>
                <option value="initiated">Initiated</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="expired">Expired</option>
            </select>
            <div className="bg-surface rounded-xl border border-kindred overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-muted-k text-xs uppercase tracking-wider bg-surface-2">
                        <tr><th className="text-left px-3 py-2">User</th><th className="text-left">Plan</th><th className="text-right">Amount</th><th className="text-left">Status</th><th className="text-left">Session</th><th className="text-left pr-3">When</th></tr>
                    </thead>
                    <tbody>
                        {data?.payments?.map((p) => (
                            <tr key={p.session_id} className="border-t border-kindred">
                                <td className="px-3 py-2"><div>{p.user_name || "—"}</div><div className="text-xs text-muted-k">{p.user_email}</div></td>
                                <td className="capitalize">{p.plan}</td>
                                <td className="text-right font-medium">{fmtMoney(p.amount, p.currency)}</td>
                                <td><Pill tone={p.payment_status === "paid" ? "sage" : p.payment_status === "failed" ? "terracotta" : "muted"}>{p.payment_status}</Pill></td>
                                <td className="font-mono text-[10px] text-muted-k">{(p.session_id || "").slice(0, 22)}…</td>
                                <td className="pr-3 text-xs text-muted-k">{fmtDate(p.ts)}</td>
                            </tr>
                        ))}
                        {data && data.payments.length === 0 && (
                            <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-k">No payments.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------- Statements ----------

function AdminStatements() {
    const [q, setQ] = useState("");
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 25;
    useEffect(() => {
        const params = { page, page_size: PAGE_SIZE };
        if (q) params.q = q;
        api.get("/admin/statements", { params }).then((r) => setData(r.data)).catch((e) => toast.error(extractErrorMessage(e)));
    }, [q, page]);

    return (
        <div className="space-y-4" data-testid="admin-statements">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="font-heading text-3xl text-primary-k">Statements {data && <span className="text-sm text-muted-k font-sans">({data.total})</span>}</h1>
                <a href={`${process.env.REACT_APP_BACKEND_URL}/api/admin/export/statements.csv`} className="text-sm underline text-primary-k" target="_blank" rel="noreferrer" data-testid="admin-export-statements-csv">Export CSV</a>
            </div>
            <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search by participant name…" className="w-full max-w-md rounded-lg border border-kindred px-3 py-2 text-sm bg-surface" data-testid="admin-statements-search" />
            <div className="bg-surface rounded-xl border border-kindred overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-muted-k text-xs uppercase tracking-wider bg-surface-2">
                        <tr><th className="text-left px-3 py-2">Participant</th><th className="text-left">Period</th><th className="text-right">Gross</th><th className="text-right">Anomalies</th><th className="text-left pr-3">Uploaded</th></tr>
                    </thead>
                    <tbody>
                        {data?.statements?.map((s) => (
                            <tr key={s.id} className="border-t border-kindred">
                                <td className="px-3 py-2">{s.participant_name || "—"}</td>
                                <td>{s.statement_period || "—"}</td>
                                <td className="text-right">{fmtMoney(s.reported_total_gross)}</td>
                                <td className="text-right">{s.anomaly_count ?? (s.anomalies?.length ?? "—")}</td>
                                <td className="pr-3 text-xs text-muted-k">{fmtDate(s.uploaded_at)}</td>
                            </tr>
                        ))}
                        {data && data.statements.length === 0 && (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-k">No statements.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------- Root export ----------

export default function AdminApp() {
    return (
        <RequireAdmin>
            <AdminShell>
                <Routes>
                    <Route index element={<AdminAnalytics />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="households" element={<AdminHouseholds />} />
                    <Route path="payments" element={<AdminPayments />} />
                    <Route path="statements" element={<AdminStatements />} />
                </Routes>
            </AdminShell>
        </RequireAdmin>
    );
}
