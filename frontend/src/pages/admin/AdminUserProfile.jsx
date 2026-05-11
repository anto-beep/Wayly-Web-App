import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { adminApi, useAdminAuth } from "./AdminAuthContext";

function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
}
function fmtMoney(n, currency = "AUD") {
    if (n == null) return "—";
    try { return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase() }).format(Number(n)); }
    catch { return `$${n}`; }
}
function extractMsg(err, fallback = "Something went wrong") {
    const d = err?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (d?.message) return d.message;
    return fallback;
}
function Badge({ children, tone = "info" }) {
    return <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;
}

const TABS = [
    { id: "overview", label: "Overview", testid: "tab-overview" },
    { id: "subscription", label: "Subscription & Billing", testid: "tab-subscription" },
    { id: "usage", label: "AI Tool Usage", testid: "tab-usage" },
    { id: "audit", label: "Audit Log", testid: "tab-audit" },
    { id: "notes", label: "Internal Notes", testid: "tab-notes" },
];

export default function AdminUserProfile() {
    const { userId } = useParams();
    const nav = useNavigate();
    const { admin: me } = useAdminAuth();
    const [data, setData] = useState(null);
    const [tab, setTab] = useState("overview");
    const [busy, setBusy] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const load = useCallback(async () => {
        try {
            const r = await adminApi.get(`/admin/users/${userId}/profile`);
            setData(r.data);
        } catch (e) {
            toast.error(extractMsg(e));
        }
    }, [userId]);
    useEffect(() => { load(); }, [load, refreshKey]);

    const act = async (label, fn) => {
        if (busy) return;
        setBusy(true);
        try { await fn(); toast.success(label); setRefreshKey((k) => k + 1); }
        catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };

    const startImpersonation = async () => {
        try {
            const r = await adminApi.post(`/admin/users/${userId}/impersonate`);
            // Store impersonation token in localStorage. AuthContext on app side
            // detects this key on next refresh.
            localStorage.setItem("wayly_impersonation_token", r.data.token);
            localStorage.setItem("wayly_impersonation_target", data.user.email);
            toast.success(`Impersonating ${data.user.email} (read-only, 60 min)`);
            window.open("/app", "_blank");
        } catch (e) {
            toast.error(extractMsg(e));
        }
    };

    const extendTrial = async () => {
        const days = parseInt(window.prompt("Extend trial by how many days? (1-90)", "7") || "0", 10);
        if (!days) return;
        await act(`Trial extended by ${days} days`, () =>
            adminApi.post(`/admin/users/${userId}/extend-trial`, { days })
        );
    };

    const suspendUser = async () => {
        const reason = window.prompt("Suspension reason (shown to user):");
        if (!reason) return;
        await act("User suspended", () =>
            adminApi.post(`/admin/users/${userId}/suspend`, { reason })
        );
    };

    if (!data) return <p style={{ color: "var(--admin-muted)" }}>Loading…</p>;
    const u = data.user;
    const sub = data.subscription;

    return (
        <div data-testid="admin-user-profile">
            <div style={{ marginBottom: 16, fontSize: 12 }}>
                <Link to="/admin/users" style={{ color: "var(--admin-info)" }}>← Back to users</Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 240px", gap: 16 }}>
                {/* LEFT — User summary */}
                <div className="admin-card" style={{ padding: 16, height: "fit-content" }} data-testid="user-summary">
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--admin-bg)", color: "var(--admin-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                        {(u.name || u.email || "?")[0].toUpperCase()}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{u.name || "—"}</div>
                    <div style={{ fontSize: 13, color: "var(--admin-muted)", marginBottom: 12 }}>{u.email}</div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                        <Badge tone={u.plan === "family" ? "info" : u.plan === "solo" ? "info" : "muted"}>{u.plan}</Badge>
                        {u.suspended ? <Badge tone="suspended">Suspended</Badge> : <Badge tone="active">Active</Badge>}
                        {u.admin_role && <Badge tone="red">{u.admin_role.replace("_", " ")}</Badge>}
                    </div>

                    <dl style={{ fontSize: 12, margin: 0 }}>
                        <Row k="Role" v={u.role} />
                        <Row k="Joined" v={fmtDate(u.created_at)} />
                        <Row k="Statements" v={data.statements?.length || 0} />
                        <Row k="LLM calls" v={data.llm_usage?.length || 0} />
                        <Row k="Email verified" v={u.email_verified ? "Yes" : "No"} />
                        <Row k="User ID" v={<code className="admin-mono" style={{ fontSize: 10 }}>{u.id?.slice(0, 12)}…</code>} />
                    </dl>
                </div>

                {/* CENTRE — Tabs */}
                <div>
                    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--admin-border)", marginBottom: 16 }} data-testid="profile-tabs">
                        {TABS.map((t) => (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                data-testid={t.testid}
                                className="admin-btn"
                                style={{
                                    background: tab === t.id ? "var(--admin-card)" : "transparent",
                                    color: tab === t.id ? "var(--admin-text)" : "var(--admin-muted)",
                                    borderRadius: "6px 6px 0 0",
                                    borderBottom: tab === t.id ? "2px solid var(--admin-red)" : "2px solid transparent",
                                    fontSize: 13, fontWeight: 500,
                                }}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {tab === "overview" && <OverviewTab data={data} />}
                    {tab === "subscription" && <SubscriptionTab data={data} />}
                    {tab === "usage" && <UsageTab data={data} />}
                    {tab === "audit" && <AuditTab data={data} />}
                    {tab === "notes" && <NotesTab userId={userId} data={data} onReload={() => setRefreshKey((k) => k + 1)} />}
                </div>

                {/* RIGHT — Actions panel */}
                <div className="admin-card" style={{ padding: 16, height: "fit-content" }} data-testid="actions-panel">
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)", marginBottom: 12 }}>Actions</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button disabled={busy} onClick={() => act("Reset email sent", () => adminApi.post(`/admin/users/${userId}/reset-password`))}
                            className="admin-btn admin-btn-secondary" data-testid="action-reset">Send password reset</button>
                        <button disabled={busy} onClick={() => act(u.is_admin ? "Admin removed" : "Admin granted", () => adminApi.put(`/admin/users/${userId}/admin`, { is_admin: !u.is_admin }))}
                            className="admin-btn admin-btn-secondary" data-testid="action-toggle-admin">{u.is_admin ? "Remove admin" : "Make admin"}</button>
                        <select disabled={busy} value={u.plan}
                            onChange={(e) => act(`Plan → ${e.target.value}`, () => adminApi.put(`/admin/users/${userId}/plan`, { plan: e.target.value }))}
                            className="admin-input" style={{ fontSize: 12, padding: "6px 10px" }} data-testid="action-plan">
                            <option value="free">Plan: free</option>
                            <option value="solo">Plan: solo</option>
                            <option value="family">Plan: family</option>
                        </select>
                        <button disabled={busy} onClick={extendTrial}
                            className="admin-btn admin-btn-secondary" data-testid="action-extend-trial">Extend trial…</button>
                        <button disabled={busy} onClick={startImpersonation}
                            className="admin-btn admin-btn-secondary" data-testid="action-impersonate" style={{ borderColor: "var(--admin-warning)", color: "var(--admin-warning)" }}>Impersonate (read-only)</button>
                        {sub && ["trialing", "active"].includes(sub.status) && (
                            <button disabled={busy} onClick={() => act("Subscription cancelled", () => adminApi.post(`/admin/users/${userId}/cancel-subscription`))}
                                className="admin-btn" style={{ background: "transparent", border: "1px solid var(--admin-red)", color: "var(--admin-red)" }}
                                data-testid="action-cancel-sub">Cancel subscription</button>
                        )}
                        {!u.suspended ? (
                            <button disabled={busy || u.id === me?.id} onClick={suspendUser}
                                className="admin-btn" style={{ background: "transparent", border: "1px solid var(--admin-warning)", color: "var(--admin-warning)" }}
                                data-testid="action-suspend">Suspend account</button>
                        ) : (
                            <button disabled={busy} onClick={() => act("Reinstated", () => adminApi.post(`/admin/users/${userId}/reinstate`))}
                                className="admin-btn admin-btn-secondary" data-testid="action-reinstate">Reinstate account</button>
                        )}
                        {u.id !== me?.id && me?.admin_role === "super_admin" && (
                            <button disabled={busy} onClick={() => {
                                if (window.prompt(`Type "${u.email}" to confirm deletion`) !== u.email) return;
                                act("Deleted", () => adminApi.delete(`/admin/users/${userId}`)).then(() => nav("/admin/users"));
                            }} className="admin-btn" data-testid="action-delete">Delete account</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------- Tabs ----------

function Row({ k, v }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
            <dt style={{ color: "var(--admin-muted)" }}>{k}</dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>{v}</dd>
        </div>
    );
}

function OverviewTab({ data }) {
    const u = data.user;
    return (
        <div className="admin-card" style={{ padding: 16 }} data-testid="tab-pane-overview">
            <Row k="Email verified" v={u.email_verified ? "Yes" : "No"} />
            <Row k="Auth method" v={u.auth_method || "password"} />
            <Row k="Onboarding complete" v={u.onboarding_complete ? "Yes" : "No"} />
            {u.suspended && (
                <>
                    <Row k="Suspended at" v={fmtDate(u.suspended_at)} />
                    <Row k="Reason" v={u.suspended_reason || "—"} />
                </>
            )}
            {data.sessions?.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--admin-border)" }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)", marginBottom: 8 }}>Recent sessions</h4>
                    <table className="admin-table" style={{ fontSize: 12 }}>
                        <thead><tr><th>When</th><th>Device</th><th>IP</th></tr></thead>
                        <tbody>{data.sessions.map((s, i) => (
                            <tr key={i}>
                                <td className="admin-mono">{fmtDate(s.created_at)}</td>
                                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.ua || "—"}</td>
                                <td className="admin-mono">{s.ip || "—"}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            {data.household && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--admin-border)" }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)", marginBottom: 8 }}>Household</h4>
                    <Row k="Participant" v={data.household.participant_name} />
                    <Row k="Classification" v={data.household.classification} />
                    <Row k="Provider" v={data.household.provider_name} />
                </div>
            )}
        </div>
    );
}

function SubscriptionTab({ data }) {
    return (
        <div className="admin-card" style={{ padding: 16 }} data-testid="tab-pane-subscription">
            {data.subscription ? (
                <>
                    <Row k="Status" v={<Badge tone={data.subscription.status === "active" ? "active" : data.subscription.status === "trialing" ? "trial" : "muted"}>{data.subscription.status}</Badge>} />
                    <Row k="Plan" v={data.subscription.plan} />
                    <Row k="Trial ends" v={fmtDate(data.subscription.trial_ends_at)} />
                    <Row k="Cancel at period end" v={data.subscription.cancel_at_period_end ? "Yes" : "No"} />
                </>
            ) : <p style={{ color: "var(--admin-muted)", fontSize: 13 }}>No subscription.</p>}
            {data.payments?.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--admin-border)" }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)", marginBottom: 8 }}>Payments</h4>
                    <table className="admin-table" style={{ fontSize: 12 }}>
                        <thead><tr><th>When</th><th>Plan</th><th style={{ textAlign: "right" }}>Amount</th><th>Status</th></tr></thead>
                        <tbody>{data.payments.map((p, i) => (
                            <tr key={i}>
                                <td className="admin-mono">{fmtDate(p.ts)}</td>
                                <td style={{ textTransform: "capitalize" }}>{p.plan}</td>
                                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(p.amount, p.currency)}</td>
                                <td><Badge tone={p.payment_status === "paid" ? "active" : "muted"}>{p.payment_status}</Badge></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function UsageTab({ data }) {
    const total = data.llm_usage?.length || 0;
    const totalCost = (data.llm_usage || []).reduce((sum, u) => sum + (u.cost_aud_est || 0), 0);
    return (
        <div className="admin-card" style={{ padding: 16 }} data-testid="tab-pane-usage">
            {total === 0 ? <p style={{ color: "var(--admin-muted)", fontSize: 13 }}>No AI tool usage yet.</p> : (
                <>
                    <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 13 }}>
                        <span><strong>{total}</strong> recent calls</span>
                        <span><strong>{fmtMoney(totalCost)}</strong> estimated cost</span>
                    </div>
                    <table className="admin-table" style={{ fontSize: 12 }}>
                        <thead><tr><th>When</th><th>Tool</th><th>Model</th><th style={{ textAlign: "right" }}>Cost</th><th style={{ textAlign: "right" }}>Tokens (i/o)</th></tr></thead>
                        <tbody>{data.llm_usage.map((u, i) => (
                            <tr key={i}>
                                <td className="admin-mono">{fmtDate(u.ts)}</td>
                                <td>{u.tool}</td>
                                <td className="admin-mono" style={{ fontSize: 10 }}>{u.model}</td>
                                <td style={{ textAlign: "right" }}>{fmtMoney(u.cost_aud_est)}</td>
                                <td style={{ textAlign: "right", fontSize: 11, color: "var(--admin-muted)" }}>{u.input_tokens_est} / {u.output_tokens_est}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </>
            )}
        </div>
    );
}

function AuditTab({ data }) {
    return (
        <div className="admin-card" style={{ padding: 16 }} data-testid="tab-pane-audit">
            {!data.audit_events?.length ? <p style={{ color: "var(--admin-muted)", fontSize: 13 }}>No audit events.</p> : (
                <table className="admin-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>When</th><th>Action</th><th>Result</th><th>By</th></tr></thead>
                    <tbody>{data.audit_events.map((e, i) => (
                        <tr key={i}>
                            <td className="admin-mono">{fmtDate(e.ts)}</td>
                            <td>{e.action}</td>
                            <td>{e.result === "success" ? <Badge tone="active">ok</Badge> : <Badge tone="suspended">{e.result}</Badge>}</td>
                            <td className="admin-mono" style={{ fontSize: 10 }}>{e.actor_id?.slice(0, 10) || "—"}</td>
                        </tr>
                    ))}</tbody>
                </table>
            )}
        </div>
    );
}

function NotesTab({ userId, data, onReload }) {
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        try {
            await adminApi.post(`/admin/users/${userId}/notes`, { text });
            setText("");
            toast.success("Note added");
            onReload?.();
        } catch (err) {
            toast.error(extractMsg(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="admin-card" style={{ padding: 16 }} data-testid="tab-pane-notes">
            <form onSubmit={submit} style={{ marginBottom: 16 }}>
                <textarea value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="Add an internal note (visible only to admins)…"
                    rows={3} className="admin-input" data-testid="note-input" />
                <button type="submit" disabled={busy || !text.trim()} className="admin-btn" style={{ marginTop: 8 }} data-testid="note-submit">
                    {busy ? "Saving…" : "Add note"}
                </button>
            </form>
            {data.notes?.length === 0 ? <p style={{ color: "var(--admin-muted)", fontSize: 13 }}>No notes yet.</p> : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {data.notes.map((n) => (
                        <li key={n.id} style={{ padding: 12, marginBottom: 8, background: "var(--admin-bg)", borderRadius: 6, borderLeft: "3px solid var(--admin-info)" }}>
                            <div style={{ fontSize: 11, color: "var(--admin-muted)", marginBottom: 4 }}>
                                <strong>{n.actor_email}</strong> · <span className="admin-mono">{fmtDate(n.ts)}</span>
                            </div>
                            <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{n.text}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
