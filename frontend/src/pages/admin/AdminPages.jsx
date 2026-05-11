import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { adminApi, useAdminAuth } from "./AdminAuthContext";

// ---------- Helpers ----------

function fmtDate(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
}

function fmtMoney(n, currency = "AUD") {
    if (n == null) return "—";
    try {
        return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase() }).format(Number(n));
    } catch { return `$${n}`; }
}

function extractMsg(err, fallback = "Something went wrong") {
    const d = err?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && typeof d.message === "string") return d.message;
    return fallback;
}

function Badge({ children, tone = "info" }) {
    return <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;
}

function planTone(plan) {
    return plan === "family" ? "info" : plan === "solo" ? "info" : "muted";
}

// ---------- Placeholder for not-yet-built pages (Phase B+) ----------

export function Placeholder({ label }) {
    return (
        <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>{label}</h1>
            <div className="admin-card" style={{ padding: 32, textAlign: "center" }}>
                <p style={{ color: "var(--admin-muted)", margin: 0 }}>This admin section will be built in an upcoming phase.</p>
                <p style={{ color: "var(--admin-muted)", fontSize: 13, marginTop: 6 }}>Phase A delivered: auth + RBAC + sidebar + design system. Coming next: overview metrics, full user tables, billing.</p>
            </div>
        </div>
    );
}

// ---------- Analytics (Overview) ----------

export function AdminAnalytics() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => {
        adminApi.get("/admin/analytics")
            .then((r) => setData(r.data))
            .catch((e) => setErr(extractMsg(e)));
    }, []);
    if (err) return <p style={{ color: "var(--admin-critical)" }} data-testid="admin-analytics-error">{err}</p>;
    if (!data) return <p style={{ color: "var(--admin-muted)" }}>Loading…</p>;
    return (
        <div data-testid="admin-analytics">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 24 }}>Overview</h1>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
                <div className="admin-stat"><div className="admin-stat-label">Total users</div><div className="admin-stat-value">{data.users.total}</div><div className="admin-stat-sub admin-stat-up">+{data.users.last_7d} this week</div></div>
                <div className="admin-stat"><div className="admin-stat-label">Households</div><div className="admin-stat-value">{data.households.total}</div></div>
                <div className="admin-stat"><div className="admin-stat-label">Statements</div><div className="admin-stat-value">{data.statements.total}</div><div className="admin-stat-sub">+{data.statements.last_7d} this week</div></div>
                <div className="admin-stat"><div className="admin-stat-label">Revenue (paid)</div><div className="admin-stat-value">{fmtMoney(data.payments.revenue_total)}</div><div className="admin-stat-sub">{data.payments.paid_count} transactions</div></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                <div className="admin-card" style={{ padding: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)" }}>Plans</h3>
                    {Object.entries(data.plans).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                            <span style={{ textTransform: "capitalize" }}>{k}</span>
                            <span style={{ fontWeight: 600 }}>{v}</span>
                        </div>
                    ))}
                </div>
                <div className="admin-card" style={{ padding: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)" }}>Subscriptions</h3>
                    {Object.entries(data.subscriptions).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                            <span style={{ textTransform: "capitalize" }}>{k}</span>
                            <span style={{ fontWeight: 600 }}>{v}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="admin-card" style={{ padding: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)" }}>Top active households</h3>
                {data.top_active_households?.length ? (
                    <table className="admin-table">
                        <thead><tr><th>Participant</th><th>Owner</th><th style={{ textAlign: "right" }}>Statements</th></tr></thead>
                        <tbody>{data.top_active_households.map((h, i) => (
                            <tr key={i}><td>{h.participant}</td><td>{h.owner_name} <span style={{ color: "var(--admin-muted)" }}>({h.owner_email})</span></td><td style={{ textAlign: "right", fontWeight: 600 }}>{h.statement_count}</td></tr>
                        ))}</tbody>
                    </table>
                ) : <p style={{ color: "var(--admin-muted)", fontSize: 13, margin: 0 }}>No data yet.</p>}
            </div>
        </div>
    );
}

// ---------- Users ----------

export function AdminUsers() {
    const [q, setQ] = useState("");
    const [planFilter, setPlanFilter] = useState("");
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [selectedId, setSelectedId] = useState(null);
    const PAGE_SIZE = 25;

    const load = useCallback(async () => {
        try {
            const params = { page, page_size: PAGE_SIZE };
            if (q) params.q = q;
            if (planFilter) params.plan = planFilter;
            const r = await adminApi.get("/admin/users", { params });
            setData(r.data);
        } catch (e) { toast.error(extractMsg(e)); }
    }, [q, planFilter, page]);
    useEffect(() => { load(); }, [load]);

    return (
        <div data-testid="admin-users">
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Users {data && <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data.total})</span>}</h1>
                <a href={`${process.env.REACT_APP_BACKEND_URL}/api/admin/export/users.csv`} target="_blank" rel="noreferrer" style={{ color: "var(--admin-info)", fontSize: 13, textDecoration: "underline" }} data-testid="admin-export-users-csv">Export CSV</a>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search by email or name…"
                    className="admin-input" style={{ flex: 1, minWidth: 220 }} data-testid="admin-users-search" />
                <select value={planFilter} onChange={(e) => { setPage(1); setPlanFilter(e.target.value); }}
                    className="admin-input" style={{ width: 160 }} data-testid="admin-users-plan-filter">
                    <option value="">All plans</option>
                    <option value="free">Free</option>
                    <option value="solo">Solo</option>
                    <option value="family">Family</option>
                </select>
            </div>
            <div className="admin-card" style={{ overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                    <table className="admin-table">
                        <thead>
                            <tr><th>Email</th><th>Name</th><th>Plan</th><th>Sub</th><th>Role</th><th>Joined</th></tr>
                        </thead>
                        <tbody>
                            {data?.users.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No users match.</td></tr>
                            ) : data?.users.map((u) => (
                                <tr key={u.id} onClick={() => setSelectedId(u.id)} style={{ cursor: "pointer" }} data-testid={`admin-user-row-${u.id}`}>
                                    <td><div>{u.email}</div>{u.admin_role && <Badge tone="red">{u.admin_role.replace("_", " ")}</Badge>}</td>
                                    <td>{u.name}</td>
                                    <td><Badge tone={planTone(u.plan)}>{u.plan}</Badge></td>
                                    <td>{u.subscription_status ? <Badge tone={u.subscription_status === "trialing" ? "trial" : u.subscription_status === "active" ? "active" : "muted"}>{u.subscription_status}</Badge> : <span style={{ color: "var(--admin-muted)" }}>—</span>}</td>
                                    <td style={{ textTransform: "capitalize" }}>{u.role}</td>
                                    <td className="admin-mono" style={{ color: "var(--admin-muted)", fontSize: 12 }}>{fmtDate(u.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {data && data.total > PAGE_SIZE && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, fontSize: 13 }}>
                    <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="admin-btn admin-btn-secondary">← Prev</button>
                    <span style={{ color: "var(--admin-muted)" }}>Page {page} / {Math.ceil(data.total / PAGE_SIZE)}</span>
                    <button disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage((p) => p + 1)} className="admin-btn admin-btn-secondary">Next →</button>
                </div>
            )}
            {selectedId && <UserDrawer userId={selectedId} onClose={() => setSelectedId(null)} onMutate={load} />}
        </div>
    );
}

function UserDrawer({ userId, onClose, onMutate }) {
    const { admin: me } = useAdminAuth();
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try { const r = await adminApi.get(`/admin/users/${userId}`); setDetail(r.data); }
        catch (e) { toast.error(extractMsg(e)); }
    }, [userId]);
    useEffect(() => { load(); }, [load]);

    const act = async (label, fn) => {
        if (busy) return; setBusy(true);
        try { await fn(); toast.success(label); await load(); onMutate?.(); }
        catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };

    const u = detail?.user;
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
            <div className="admin-card" style={{ width: "100%", maxWidth: 560, height: "100%", overflowY: "auto", padding: 24, borderRadius: 0, borderLeft: "1px solid var(--admin-border)" }} onClick={(e) => e.stopPropagation()} data-testid="admin-user-drawer">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 600 }}>{u?.name || "—"}</h2>
                        <p style={{ color: "var(--admin-muted)", fontSize: 13 }}>{u?.email}</p>
                    </div>
                    <button onClick={onClose} style={{ background: "transparent", color: "var(--admin-muted)", fontSize: 20, border: 0, cursor: "pointer" }} data-testid="admin-drawer-close">×</button>
                </div>
                {!detail ? <p style={{ color: "var(--admin-muted)" }}>Loading…</p> : (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
                            <div className="admin-card" style={{ padding: 10, background: "var(--admin-bg)" }}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--admin-muted)", letterSpacing: "0.06em" }}>Plan</div>
                                <Badge tone={planTone(u.plan)}>{u.plan}</Badge>
                            </div>
                            <div className="admin-card" style={{ padding: 10, background: "var(--admin-bg)" }}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--admin-muted)", letterSpacing: "0.06em" }}>Admin role</div>
                                <div style={{ fontSize: 13 }}>{u.admin_role ? u.admin_role.replace("_", " ") : "—"}</div>
                            </div>
                            <div className="admin-card" style={{ padding: 10, background: "var(--admin-bg)" }}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--admin-muted)", letterSpacing: "0.06em" }}>Role</div>
                                <div style={{ textTransform: "capitalize", fontSize: 13 }}>{u.role}</div>
                            </div>
                            <div className="admin-card" style={{ padding: 10, background: "var(--admin-bg)" }}>
                                <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--admin-muted)", letterSpacing: "0.06em" }}>Joined</div>
                                <div className="admin-mono" style={{ fontSize: 12 }}>{fmtDate(u.created_at)}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--admin-border)" }}>
                            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)", marginBottom: 8 }}>Actions</h3>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                <button disabled={busy} onClick={() => act("Reset email sent", () => adminApi.post(`/admin/users/${userId}/reset-password`))} className="admin-btn admin-btn-secondary" data-testid="admin-action-reset-password">Send reset</button>
                                <button disabled={busy} onClick={() => act(u.is_admin ? "Admin removed" : "Admin granted", () => adminApi.put(`/admin/users/${userId}/admin`, { is_admin: !u.is_admin }))} className="admin-btn admin-btn-secondary" data-testid="admin-action-toggle-admin">{u.is_admin ? "Remove admin" : "Make admin"}</button>
                                <select disabled={busy} value={u.plan} onChange={(e) => act(`Plan → ${e.target.value}`, () => adminApi.put(`/admin/users/${userId}/plan`, { plan: e.target.value }))} className="admin-input" style={{ width: 100 }} data-testid="admin-action-set-plan">
                                    <option value="free">free</option><option value="solo">solo</option><option value="family">family</option>
                                </select>
                                {detail.subscription && ["trialing", "active"].includes(detail.subscription.status) && (
                                    <button disabled={busy} onClick={() => act("Cancelled", () => adminApi.post(`/admin/users/${userId}/cancel-subscription`))} className="admin-btn" style={{ background: "transparent", border: "1px solid var(--admin-red)", color: "var(--admin-red)" }} data-testid="admin-action-cancel-sub">Cancel sub</button>
                                )}
                                {u.id !== me?.id && me?.admin_role === "super_admin" && (
                                    <button disabled={busy} onClick={() => { if (window.confirm(`Delete ${u.email}?`)) act("Deleted", () => adminApi.delete(`/admin/users/${userId}`)).then(onClose); }} className="admin-btn" data-testid="admin-action-delete-user">Delete</button>
                                )}
                            </div>
                        </div>
                        {detail.household && (
                            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--admin-border)" }}>
                                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)", marginBottom: 8 }}>Household</h3>
                                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                                    <div><span style={{ color: "var(--admin-muted)" }}>Participant:</span> {detail.household.participant_name}</div>
                                    <div><span style={{ color: "var(--admin-muted)" }}>Classification:</span> {detail.household.classification}</div>
                                    <div><span style={{ color: "var(--admin-muted)" }}>Provider:</span> {detail.household.provider_name}</div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ---------- Households / Payments / Statements (compact) ----------

function SimpleTable({ endpoint, columns, testid, searchPlaceholder, exportPath }) {
    const [q, setQ] = useState("");
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 25;
    useEffect(() => {
        const params = { page, page_size: PAGE_SIZE };
        if (q) params.q = q;
        adminApi.get(endpoint, { params }).then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, [endpoint, q, page]);
    const rows = data ? Object.values(data).find(Array.isArray) || [] : [];
    const total = data?.total ?? 0;
    return (
        <div data-testid={testid}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>{testid.replace("admin-", "").replace(/^./, (c) => c.toUpperCase())} <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({total})</span></h1>
                {exportPath && <a href={`${process.env.REACT_APP_BACKEND_URL}${exportPath}`} target="_blank" rel="noreferrer" style={{ color: "var(--admin-info)", fontSize: 13 }} data-testid={`${testid}-export`}>Export CSV</a>}
            </div>
            {searchPlaceholder && (
                <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder={searchPlaceholder}
                    className="admin-input" style={{ marginBottom: 16, maxWidth: 400 }} data-testid={`${testid}-search`} />
            )}
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr>{columns.map((c) => <th key={c.key} style={c.thStyle}>{c.label}</th>)}</tr></thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={columns.length} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No results.</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={r.id || r.session_id || i}>
                                {columns.map((c) => <td key={c.key} style={c.tdStyle}>{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function AdminHouseholds() {
    return <SimpleTable endpoint="/admin/households" testid="admin-households"
        searchPlaceholder="Search by participant or provider…"
        columns={[
            { key: "participant_name", label: "Participant" },
            { key: "classification", label: "Class" },
            { key: "provider_name", label: "Provider" },
            { key: "member_count", label: "Members", tdStyle: { textAlign: "right" }, thStyle: { textAlign: "right" } },
            { key: "statement_count", label: "Statements", tdStyle: { textAlign: "right" }, thStyle: { textAlign: "right" } },
            { key: "created_at", label: "Created", render: (r) => <span className="admin-mono" style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</span> },
        ]}
    />;
}

export function AdminPayments() {
    return <SimpleTable endpoint="/admin/payments" testid="admin-payments" exportPath="/api/admin/export/payments.csv"
        columns={[
            { key: "user", label: "User", render: (r) => <div><div>{r.user_name || "—"}</div><div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{r.user_email}</div></div> },
            { key: "plan", label: "Plan", render: (r) => <span style={{ textTransform: "capitalize" }}>{r.plan}</span> },
            { key: "amount", label: "Amount", render: (r) => fmtMoney(r.amount, r.currency), tdStyle: { textAlign: "right", fontWeight: 600 }, thStyle: { textAlign: "right" } },
            { key: "payment_status", label: "Status", render: (r) => <Badge tone={r.payment_status === "paid" ? "active" : r.payment_status === "failed" ? "suspended" : "muted"}>{r.payment_status}</Badge> },
            { key: "session_id", label: "Session", render: (r) => <span className="admin-mono" style={{ fontSize: 10, color: "var(--admin-muted)" }}>{(r.session_id || "").slice(0, 22)}…</span> },
            { key: "ts", label: "When", render: (r) => <span className="admin-mono" style={{ fontSize: 12, color: "var(--admin-muted)" }}>{fmtDate(r.ts)}</span> },
        ]}
    />;
}

export function AdminStatements() {
    return <SimpleTable endpoint="/admin/statements" testid="admin-statements" exportPath="/api/admin/export/statements.csv"
        searchPlaceholder="Search by participant…"
        columns={[
            { key: "participant_name", label: "Participant" },
            { key: "statement_period", label: "Period" },
            { key: "reported_total_gross", label: "Gross", render: (r) => fmtMoney(r.reported_total_gross), tdStyle: { textAlign: "right" }, thStyle: { textAlign: "right" } },
            { key: "anomaly_count", label: "Anomalies", render: (r) => r.anomaly_count ?? (r.anomalies?.length ?? "—"), tdStyle: { textAlign: "right" }, thStyle: { textAlign: "right" } },
            { key: "uploaded_at", label: "Uploaded", render: (r) => <span className="admin-mono" style={{ fontSize: 12, color: "var(--admin-muted)" }}>{fmtDate(r.uploaded_at)}</span> },
        ]}
    />;
}
