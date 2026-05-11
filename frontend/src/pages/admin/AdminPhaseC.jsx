import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { adminApi } from "./AdminAuthContext";

// ---------- helpers (duplicated from AdminPages for self-containment) ----------
const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const fmtMoney = (n, c = "AUD") => { if (n == null) return "—"; try { return new Intl.NumberFormat("en-AU", { style: "currency", currency: c.toUpperCase() }).format(Number(n)); } catch { return `$${n}`; } };
const extractMsg = (e, f = "Error") => { const d = e?.response?.data?.detail; if (typeof d === "string") return d; if (d?.message) return d.message; return f; };
const Badge = ({ children, tone = "info" }) => <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;

function Page({ title, total, children, exportPath, testid }) {
    return (
        <div data-testid={testid}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>{title} {total != null && <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({total})</span>}</h1>
                {exportPath && <a href={`${process.env.REACT_APP_BACKEND_URL}${exportPath}`} target="_blank" rel="noreferrer" style={{ color: "var(--admin-info)", fontSize: 13 }}>Export CSV</a>}
            </div>
            {children}
        </div>
    );
}

function Pagination({ page, pageSize, total, onPage }) {
    if (!total || total <= pageSize) return null;
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, fontSize: 13 }}>
            <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="admin-btn admin-btn-secondary">← Prev</button>
            <span style={{ color: "var(--admin-muted)" }}>Page {page} / {Math.ceil(total / pageSize)}</span>
            <button disabled={page * pageSize >= total} onClick={() => onPage(page + 1)} className="admin-btn admin-btn-secondary">Next →</button>
        </div>
    );
}

// ---------- Decoder Log ----------

export function AdminDecoderLog() {
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const SIZE = 25;
    useEffect(() => {
        adminApi.get("/admin/decoder-log", { params: { page, page_size: SIZE } })
            .then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, [page]);
    return (
        <Page title="Statement Decoder Log" total={data?.total} testid="admin-decoder-log">
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>When</th><th>Participant</th><th>Provider</th><th style={{ textAlign: "center" }}>Class</th><th style={{ textAlign: "right" }}>Gross</th><th style={{ textAlign: "right" }}>Items</th><th>Anomalies</th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No statements yet.</td></tr>
                            : data.rows.map((s) => (
                                <tr key={s.id}>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(s.uploaded_at)}</td>
                                    <td><Link to={`/admin/users/${s.uploaded_by}`} style={{ color: "var(--admin-info)" }}>{s.participant_name || "—"}</Link></td>
                                    <td>{s.provider_name || "—"}</td>
                                    <td style={{ textAlign: "center" }}>{s.classification ?? "—"}</td>
                                    <td style={{ textAlign: "right" }}>{fmtMoney(s.reported_total_gross)}</td>
                                    <td style={{ textAlign: "right" }}>{s.line_items_count ?? "—"}</td>
                                    <td>
                                        {s.anomaly_summary?.total ? (
                                            <span style={{ display: "flex", gap: 4 }}>
                                                {s.anomaly_summary.high > 0 && <Badge tone="suspended">H {s.anomaly_summary.high}</Badge>}
                                                {s.anomaly_summary.medium > 0 && <Badge tone="trial">M {s.anomaly_summary.medium}</Badge>}
                                                {s.anomaly_summary.low > 0 && <Badge tone="muted">L {s.anomaly_summary.low}</Badge>}
                                            </span>
                                        ) : <span style={{ color: "var(--admin-muted)" }}>—</span>}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} pageSize={SIZE} total={data?.total} onPage={setPage} />
        </Page>
    );
}

// ---------- Anomaly Log ----------

export function AdminAnomalyLog() {
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [severity, setSeverity] = useState("");
    const SIZE = 25;
    useEffect(() => {
        adminApi.get("/admin/anomaly-log", { params: { page, page_size: SIZE, ...(severity && { severity }) } })
            .then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, [page, severity]);
    const stats = data?.stats_30d;
    return (
        <Page title="Anomaly Detection Log" total={data?.total} testid="admin-anomaly-log">
            {stats && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
                    <div className="admin-stat"><div className="admin-stat-label">High (30d)</div><div className="admin-stat-value" style={{ color: "var(--admin-critical)" }}>{stats.by_severity.HIGH}</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Medium (30d)</div><div className="admin-stat-value" style={{ color: "var(--admin-warning)" }}>{stats.by_severity.MEDIUM}</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Low (30d)</div><div className="admin-stat-value" style={{ color: "var(--admin-muted)" }}>{stats.by_severity.LOW}</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">$ Impact</div><div className="admin-stat-value">{fmtMoney(stats.total_impact_aud)}</div></div>
                </div>
            )}
            <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
                {["", "HIGH", "MEDIUM", "LOW"].map((sev) => (
                    <button key={sev} onClick={() => { setSeverity(sev); setPage(1); }}
                        className="admin-btn admin-btn-secondary"
                        style={{ borderColor: severity === sev ? "var(--admin-red)" : "var(--admin-border)", color: severity === sev ? "var(--admin-red)" : "var(--admin-text)" }}>
                        {sev || "All"}
                    </button>
                ))}
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>When</th><th>Severity</th><th>Headline</th><th style={{ textAlign: "right" }}>$ Impact</th><th>Participant</th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No anomalies.</td></tr>
                            : data.rows.map((r, i) => (
                                <tr key={`${r.statement_id}-${i}`}>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(r.uploaded_at)}</td>
                                    <td><Badge tone={r.severity === "HIGH" ? "suspended" : r.severity === "MEDIUM" ? "trial" : "muted"}>{r.severity}</Badge></td>
                                    <td style={{ maxWidth: 360 }}>{r.headline}</td>
                                    <td style={{ textAlign: "right", fontWeight: 600 }}>{r.dollar_impact ? fmtMoney(r.dollar_impact) : "—"}</td>
                                    <td>{r.participant_name || "—"}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} pageSize={SIZE} total={data?.total} onPage={setPage} />
        </Page>
    );
}

// ---------- Tool Stats ----------

export function AdminToolStats() {
    const [data, setData] = useState(null);
    useEffect(() => { adminApi.get("/admin/tool-stats").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e))); }, []);
    if (!data) return <p style={{ color: "var(--admin-muted)" }}>Loading…</p>;
    const tools = new Set([...Object.keys(data.today || {}), ...Object.keys(data.week || {}), ...Object.keys(data.month || {})]);
    const rows = Array.from(tools).map((tool) => ({
        tool,
        today: data.today[tool] || { calls: 0, cost_aud: 0, errors: 0, avg_ms: 0 },
        week: data.week[tool] || { calls: 0, cost_aud: 0, errors: 0, avg_ms: 0 },
        month: data.month[tool] || { calls: 0, cost_aud: 0, errors: 0, avg_ms: 0 },
    })).sort((a, b) => b.month.cost_aud - a.month.cost_aud);
    return (
        <Page title="Tool Usage Stats" testid="admin-tool-stats">
            {rows.length === 0 ? (
                <div className="admin-card" style={{ padding: 24, textAlign: "center", color: "var(--admin-muted)" }}>
                    No LLM activity recorded yet. Tool stats start populating as soon as users run AI tools.
                </div>
            ) : (
                <div className="admin-card" style={{ overflowX: "auto" }}>
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th rowSpan={2}>Tool</th>
                                <th colSpan={2} style={{ textAlign: "center", borderRight: "1px solid var(--admin-border)" }}>Today</th>
                                <th colSpan={2} style={{ textAlign: "center", borderRight: "1px solid var(--admin-border)" }}>Week</th>
                                <th colSpan={3} style={{ textAlign: "center" }}>Month</th>
                            </tr>
                            <tr>
                                <th style={{ textAlign: "right" }}>Calls</th><th style={{ textAlign: "right", borderRight: "1px solid var(--admin-border)" }}>Cost</th>
                                <th style={{ textAlign: "right" }}>Calls</th><th style={{ textAlign: "right", borderRight: "1px solid var(--admin-border)" }}>Cost</th>
                                <th style={{ textAlign: "right" }}>Calls</th><th style={{ textAlign: "right" }}>Cost</th><th style={{ textAlign: "right" }}>Errors</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.tool}>
                                    <td>{r.tool}</td>
                                    <td style={{ textAlign: "right" }}>{r.today.calls}</td>
                                    <td style={{ textAlign: "right", borderRight: "1px solid var(--admin-border)" }}>{fmtMoney(r.today.cost_aud)}</td>
                                    <td style={{ textAlign: "right" }}>{r.week.calls}</td>
                                    <td style={{ textAlign: "right", borderRight: "1px solid var(--admin-border)" }}>{fmtMoney(r.week.cost_aud)}</td>
                                    <td style={{ textAlign: "right" }}>{r.month.calls}</td>
                                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.month.cost_aud)}</td>
                                    <td style={{ textAlign: "right", color: r.month.errors > 0 ? "var(--admin-critical)" : "inherit" }}>{r.month.errors}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Page>
    );
}

// ---------- Subscriptions / Trials / Churned ----------

export function AdminSubscriptions({ defaultStatus = "active", label = "Active Subscriptions", testid = "admin-subs" }) {
    const [data, setData] = useState(null);
    const [status, setStatus] = useState(defaultStatus);
    const [page, setPage] = useState(1);
    const SIZE = 25;
    useEffect(() => {
        adminApi.get("/admin/subscriptions", { params: { status, page, page_size: SIZE } })
            .then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, [status, page]);
    return (
        <Page title={label} total={data?.total} testid={testid}>
            <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
                {[
                    ["active", "Active"], ["trialing", "Trialing"],
                    ["cancelled", "Cancelled"], ["expired", "Expired"],
                ].map(([k, lbl]) => (
                    <button key={k} onClick={() => { setStatus(k); setPage(1); }}
                        className="admin-btn admin-btn-secondary"
                        style={{ borderColor: status === k ? "var(--admin-red)" : "var(--admin-border)", color: status === k ? "var(--admin-red)" : "var(--admin-text)" }}>
                        {lbl}
                    </button>
                ))}
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Trial ends</th><th>Created</th><th>Cancelled</th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>None match.</td></tr>
                            : data.rows.map((s) => (
                                <tr key={s.user_id}>
                                    <td><Link to={`/admin/users/${s.user_id}`} style={{ color: "var(--admin-info)" }}>{s.user_email || s.user_id?.slice(0, 12)}</Link><div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{s.user_name}</div></td>
                                    <td style={{ textTransform: "capitalize" }}>{s.plan}</td>
                                    <td><Badge tone={s.status === "active" ? "active" : s.status === "trialing" ? "trial" : "muted"}>{s.status}</Badge></td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(s.trial_ends_at)}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(s.created_at)}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(s.cancelled_at)}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} pageSize={SIZE} total={data?.total} onPage={setPage} />
        </Page>
    );
}

// ---------- Failed Payments ----------

export function AdminFailedPayments() {
    const [data, setData] = useState(null);
    useEffect(() => { adminApi.get("/admin/failed-payments").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e))); }, []);
    return (
        <Page title="Failed Payments (30d)" total={data?.total} testid="admin-failed-payments">
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>When</th><th>User</th><th>Plan</th><th style={{ textAlign: "right" }}>Amount</th><th>Session</th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No failed payments in the last 30 days. 🎉</td></tr>
                            : data.rows.map((p) => (
                                <tr key={p.session_id}>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(p.ts)}</td>
                                    <td>{p.user_email}</td>
                                    <td style={{ textTransform: "capitalize" }}>{p.plan}</td>
                                    <td style={{ textAlign: "right" }}>{fmtMoney(p.amount, p.currency)}</td>
                                    <td className="admin-mono" style={{ fontSize: 10, color: "var(--admin-muted)" }}>{(p.session_id || "").slice(0, 22)}…</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </Page>
    );
}

// ---------- Refunds ----------

export function AdminRefunds() {
    const [data, setData] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    useEffect(() => { adminApi.get("/admin/refunds").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e))); }, [refreshKey]);
    const mark = async (id) => {
        try { await adminApi.post(`/admin/refunds/${id}/mark-processed`); toast.success("Marked processed"); setRefreshKey((k) => k + 1); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    return (
        <Page title="Refunds" total={data?.total} testid="admin-refunds">
            <div className="admin-card" style={{ padding: 12, marginBottom: 16, background: "rgba(99,179,237,0.1)", border: "1px solid var(--admin-info)", borderRadius: 6, fontSize: 12 }}>
                <strong>Note:</strong> The actual Stripe refund call is not yet wired. To issue a refund, raise it manually in your Stripe Dashboard, then click "Mark processed" here. Full Stripe integration is on the roadmap.
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>When</th><th>User</th><th style={{ textAlign: "right" }}>Amount</th><th>Reason</th><th>Status</th><th>By</th><th></th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No refunds yet.</td></tr>
                            : data.rows.map((r) => (
                                <tr key={r.id}>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(r.ts)}</td>
                                    <td>{r.user_email}</td>
                                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(r.amount_aud)}</td>
                                    <td style={{ fontSize: 12 }}>{r.reason}</td>
                                    <td><Badge tone={r.status === "processed" ? "active" : "trial"}>{r.status}</Badge></td>
                                    <td style={{ fontSize: 11 }}>{r.processed_by_email}</td>
                                    <td>{r.status === "pending_stripe" && <button onClick={() => mark(r.id)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }}>Mark processed</button>}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </Page>
    );
}

// ---------- Revenue Reports (MRR chart) ----------

export function AdminRevenue() {
    const [data, setData] = useState(null);
    useEffect(() => { adminApi.get("/admin/mrr-trend?months=12").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e))); }, []);
    const points = data?.points || [];
    const currentMRR = points.length ? points[points.length - 1].mrr_aud : 0;
    const prevMRR = points.length > 1 ? points[points.length - 2].mrr_aud : 0;
    const delta = currentMRR - prevMRR;
    return (
        <Page title="Revenue Reports" testid="admin-revenue">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 24 }}>
                <div className="admin-stat"><div className="admin-stat-label">Current MRR</div><div className="admin-stat-value">{fmtMoney(currentMRR)}</div></div>
                <div className="admin-stat"><div className="admin-stat-label">Δ vs last month</div><div className="admin-stat-value" style={{ color: delta >= 0 ? "var(--admin-success)" : "var(--admin-critical)" }}>{delta >= 0 ? "+" : ""}{fmtMoney(delta)}</div></div>
                <div className="admin-stat"><div className="admin-stat-label">Projected ARR</div><div className="admin-stat-value">{fmtMoney(currentMRR * 12)}</div></div>
            </div>
            <div className="admin-card" style={{ padding: 16 }} data-testid="mrr-chart">
                <h3 style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-muted)" }}>MRR (AUD) — last 12 months</h3>
                {points.length === 0 ? <p style={{ color: "var(--admin-muted)", fontSize: 13 }}>Loading…</p> : (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={points} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
                            <XAxis dataKey="label" stroke="var(--admin-muted)" style={{ fontSize: 11 }} />
                            <YAxis stroke="var(--admin-muted)" style={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: "var(--admin-card)", border: "1px solid var(--admin-border)", borderRadius: 6, fontSize: 12 }}
                                formatter={(v) => fmtMoney(v)} />
                            <Line type="monotone" dataKey="mrr_aud" stroke="#D4A24E" strokeWidth={2.5} dot={{ fill: "#D4A24E", r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        </Page>
    );
}
