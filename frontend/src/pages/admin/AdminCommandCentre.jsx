import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
    LayoutDashboard, DollarSign, Users, Headphones, Megaphone,
    ShieldAlert, CheckSquare, Activity, BookOpen, TrendingUp, TrendingDown,
    Minus, AlertTriangle, FileText, CheckCircle2, XCircle, Edit3, RefreshCw,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    return f;
};
const aud = (n) => (n == null ? "—" : `A$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
function fmtDate(iso) {
    if (!iso) return "no data yet";
    try { return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
    catch { return String(iso); }
}
const SEV_COLOR = { critical: "#B42318", high: "#B42318", medium: "#A5512B", low: "#6b6b6b" };

function Section({ icon: Icon, title, block, children, to, testid }) {
    const empty = block?.status === "empty";
    return (
        <div className="admin-card" data-testid={testid || `cc-section-${title.toLowerCase().replace(/\s+/g, "-")}`} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon size={17} />
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>
                </div>
                {to && <Link to={to} className="admin-btn" style={{ fontSize: 11, padding: "3px 10px" }}>View</Link>}
            </div>
            {empty ? (
                <div style={{ color: "var(--admin-muted)", fontSize: 13, padding: "10px 0" }}>No data entered yet.</div>
            ) : children}
            {block && <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 12, borderTop: "1px solid var(--admin-border)", paddingTop: 8 }}>
                Source: {block?.source || "—"} · Updated {fmtDate(block?.last_updated)}
            </div>}
        </div>
    );
}
function Metric({ label, value }) {
    return (
        <div style={{ flex: 1, minWidth: 110 }}>
            <div style={{ fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
        </div>
    );
}

function TrendCard({ m }) {
    const up = m.pct_change != null && m.pct_change > 0;
    const down = m.pct_change != null && m.pct_change < 0;
    const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
    const color = m.pct_change == null ? "#6b6b6b" : up ? "#2f7d4a" : down ? "#B42318" : "#6b6b6b";
    const isMoney = m.key.endsWith("_aud");
    return (
        <div className="admin-card" style={{ padding: "12px 14px" }} data-testid={`cc-trend-${m.key}`}>
            <div style={{ fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{isMoney ? aud(m.current) : m.current}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 12, color }}>
                <Icon size={13} />
                <span>{m.pct_change == null ? "N/A" : `${m.pct_change > 0 ? "+" : ""}${m.pct_change}%`}</span>
                <span style={{ color: "var(--admin-muted)" }}>vs prev ({isMoney ? aud(m.previous) : m.previous})</span>
            </div>
        </div>
    );
}

export default function AdminCommandCentre() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [period, setPeriod] = useState("30d");
    const [trends, setTrends] = useState(null);
    const [alerts, setAlerts] = useState(null);
    const [approvals, setApprovals] = useState(null);
    const [needs, setNeeds] = useState(null);
    const [integrations, setIntegrations] = useState(null);
    const [briefing, setBriefing] = useState(null);
    const [briefType, setBriefType] = useState("daily");
    const [briefBusy, setBriefBusy] = useState(false);

    const loadCore = useCallback(async () => {
        try {
            const [s, al, ap, nd, ig] = await Promise.all([
                adminApi.get("/admin/command-centre/summary"),
                adminApi.get("/admin/command-centre/alerts"),
                adminApi.get("/admin/command-centre/approvals"),
                adminApi.get("/admin/command-centre/needs-attention"),
                adminApi.get("/admin/command-centre/integrations"),
            ]);
            setData(s.data); setAlerts(al.data); setApprovals(ap.data);
            setNeeds(nd.data); setIntegrations(ig.data);
        } catch (e) {
            setErr(extractMsg(e, "Could not load the command centre."));
        }
    }, []);
    const loadTrends = useCallback(async () => {
        try {
            const r = await adminApi.get("/admin/command-centre/trends", { params: { period } });
            setTrends(r.data);
        } catch (e) { toast.error(extractMsg(e, "Could not load trends.")); }
    }, [period]);

    useEffect(() => { loadCore(); }, [loadCore]);
    useEffect(() => { loadTrends(); }, [loadTrends]);

    const runBriefing = async () => {
        setBriefBusy(true);
        try {
            const r = await adminApi.get("/admin/command-centre/briefing", { params: { type: briefType } });
            setBriefing(r.data);
        } catch (e) { toast.error(extractMsg(e, "Could not generate the briefing.")); }
        finally { setBriefBusy(false); }
    };
    const ackAlert = async (id) => {
        try { await adminApi.post(`/admin/command-centre/alerts/${id}/acknowledge`, {}); toast.success("Acknowledged"); loadCore(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const resolveAlert = async (id) => {
        try { await adminApi.post(`/admin/command-centre/alerts/${id}/resolve`, {}); toast.success("Resolved"); loadCore(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const doApproval = async (item, action) => {
        try {
            await adminApi.post(`${item.action_base}/${action}`, {});
            toast.success(action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Changes requested");
            loadCore();
        } catch (e) { toast.error(extractMsg(e, "Action failed.")); }
    };

    if (err) return <div data-testid="cc-error" style={{ padding: 24, color: "var(--admin-muted)" }}>{err}</div>;
    if (!data) return <div data-testid="cc-loading" style={{ padding: 24, color: "var(--admin-muted)" }}>Loading…</div>;

    const b = data.blocks;
    const rev = b.revenue.data, gr = b.growth.data, sup = b.support.data;
    const mk = b.marketing.data, hc = b.help_centre?.data || {};

    return (
        <div data-testid="admin-command-centre">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <LayoutDashboard size={22} />
                <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Founder Command Centre</h1>
            </div>
            <p style={{ color: "var(--admin-muted)", marginTop: 0, fontSize: 13 }}>
                Verified business metrics from stored Wayly records (Australia/Sydney). Figures are never fabricated — missing data shows as N/A.
            </p>

            {/* Needs Your Attention */}
            <div className="admin-card" style={{ padding: 18, marginBottom: 14, borderLeft: "3px solid #B42318" }} data-testid="cc-needs-attention">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <AlertTriangle size={17} /><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Needs Your Attention</h3>
                </div>
                {!needs?.priorities?.length ? (
                    <div style={{ color: "var(--admin-muted)", fontSize: 13 }} data-testid="cc-needs-empty">Nothing urgent right now.</div>
                ) : needs.priorities.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < needs.priorities.length - 1 ? "1px solid var(--admin-border)" : "none" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: SEV_COLOR[p.severity] || "#6b6b6b" }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                            <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{p.action}</div>
                        </div>
                        {p.link && <Link to={p.link} className="admin-btn" style={{ fontSize: 11, padding: "3px 10px" }}>Open</Link>}
                    </div>
                ))}
            </div>

            {/* Trends */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Business Trends</h2>
                <select className="admin-input" data-testid="cc-trend-period" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ fontSize: 13, padding: "5px 10px" }}>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 18 }} data-testid="cc-trends">
                {trends?.metrics?.map((m) => <TrendCard key={m.key} m={m} />)}
            </div>

            {/* Summary blocks */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 18 }}>
                <Section icon={DollarSign} title="Revenue" block={b.revenue} to="/admin/revenue">
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Metric label="MRR" value={aud(rev.mrr_aud)} />
                        <Metric label="Paid subs" value={rev.paid_subscribers} />
                        <Metric label="Trials" value={rev.active_trials} />
                        <Metric label="Churn 30d" value={rev.churn_30d} />
                    </div>
                </Section>
                <Section icon={Users} title="Customer Growth" block={b.growth} to="/admin/users">
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Metric label="Total users" value={gr.total_users} />
                        <Metric label="New today" value={gr.signups_today} />
                        <Metric label="New 30d" value={gr.signups_30d} />
                    </div>
                </Section>
                <Section icon={Headphones} title="Support" block={b.support} to="/admin/support-inbox">
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Metric label="Open tickets" value={sup.open_tickets} />
                        <Metric label="New enquiries" value={sup.new_enquiries} />
                        <Metric label="SLA breached" value={sup.sla_breached} />
                        <Metric label="Avg CSAT" value={sup.avg_csat ? `${sup.avg_csat.avg} (${sup.avg_csat.n})` : "—"} />
                    </div>
                </Section>
                <Section icon={Megaphone} title="Marketing Investment" block={b.marketing} to="/admin/marketing-spend">
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Metric label={`Total (${mk.period?.label || "month"})`} value={aud(mk.totals?.total_investment_aud)} />
                        <Metric label="Committed" value={aud(mk.totals?.committed_aud)} />
                        <Metric label="Incurred" value={aud(mk.totals?.incurred_aud)} />
                        <Metric label="Paid" value={aud(mk.totals?.paid_aud)} />
                    </div>
                </Section>
                {b.help_centre && (
                    <Section icon={BookOpen} title="Help Centre" block={b.help_centre} to="/admin/help-centre">
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <Metric label="Published" value={hc.published_articles ?? 0} />
                            <Metric label="Pending approval" value={hc.pending_approval ?? 0} />
                            <Metric label="Helpful %" value={hc.feedback_helpful_pct_30d != null ? `${hc.feedback_helpful_pct_30d}%` : "N/A"} />
                            <Metric label="Outdated" value={hc.outdated_articles ?? 0} />
                        </div>
                    </Section>
                )}
            </div>

            {/* Approval Centre */}
            <div className="admin-card" style={{ padding: 18, marginBottom: 14 }} data-testid="cc-approval-centre">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <CheckSquare size={17} /><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Founder Approval Centre</h3>
                </div>
                <p style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 0 }}>{approvals?.note}</p>
                {!approvals?.approvals?.length ? (
                    <div style={{ color: "var(--admin-muted)", fontSize: 13 }} data-testid="cc-approvals-empty">Nothing awaiting your decision.</div>
                ) : approvals.approvals.map((it) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--admin-border)", flexWrap: "wrap" }} data-testid={`cc-approval-${it.id}`}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#0E4D52", textTransform: "uppercase" }}>{(it.kind || "").replace(/_/g, " ")}</span>
                        <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{it.title}</div>
                            <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{it.reason}</div>
                        </div>
                        <button className="admin-btn admin-btn-primary" style={{ fontSize: 11, padding: "4px 10px" }} data-testid={`cc-approve-${it.id}`} onClick={() => doApproval(it, "approve")}><CheckCircle2 size={12} /> Approve</button>
                        {it.actions?.includes("request-changes") && <button className="admin-btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => doApproval(it, "request-changes")}><Edit3 size={12} /> Changes</button>}
                        {it.actions?.includes("reject") && <button className="admin-btn" style={{ fontSize: 11, padding: "4px 10px", color: "#B42318" }} onClick={() => doApproval(it, "reject")}><XCircle size={12} /> Reject</button>}
                    </div>
                ))}
            </div>

            {/* Alerts */}
            <div className="admin-card" style={{ padding: 18, marginBottom: 14 }} data-testid="cc-alerts">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <ShieldAlert size={17} /><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Operational Alerts</h3>
                    <span style={{ fontSize: 12, color: "var(--admin-muted)", marginLeft: "auto" }}>
                        {alerts ? `${alerts.active_by_severity.critical + alerts.active_by_severity.high} high · ${alerts.active_by_severity.medium} medium · ${alerts.resolved_count} resolved` : ""}
                    </span>
                </div>
                {!alerts?.alerts?.length ? (
                    <div style={{ color: "var(--admin-muted)", fontSize: 13 }} data-testid="cc-alerts-empty">No active alerts. </div>
                ) : alerts.alerts.slice(0, 12).map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--admin-border)", flexWrap: "wrap" }} data-testid={`cc-alert-${a.id}`}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: SEV_COLOR[a.severity], borderRadius: 4, padding: "2px 6px", textTransform: "uppercase" }}>{a.severity}</span>
                        <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                            <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{a.description}</div>
                            {a.suggested_investigation && <div style={{ fontSize: 11, color: "#0E4D52" }}>→ {a.suggested_investigation}</div>}
                        </div>
                        {a.record_link && <Link to={a.record_link} className="admin-btn" style={{ fontSize: 11, padding: "3px 8px" }}>Open</Link>}
                        {a.status !== "acknowledged" && <button className="admin-btn" style={{ fontSize: 11, padding: "3px 8px" }} data-testid={`cc-alert-ack-${a.id}`} onClick={() => ackAlert(a.id)}>Ack</button>}
                        <button className="admin-btn" style={{ fontSize: 11, padding: "3px 8px", color: "#2f7d4a" }} data-testid={`cc-alert-resolve-${a.id}`} onClick={() => resolveAlert(a.id)}>Resolve</button>
                    </div>
                ))}
            </div>

            {/* Briefing */}
            <div className="admin-card" style={{ padding: 18, marginBottom: 14 }} data-testid="cc-briefing">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <FileText size={17} /><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Founder Briefing</h3>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <select className="admin-input" value={briefType} onChange={(e) => setBriefType(e.target.value)} style={{ fontSize: 13, padding: "5px 10px" }} data-testid="cc-brief-type">
                            <option value="daily">Daily</option><option value="weekly">Weekly</option>
                        </select>
                        <button className="admin-btn admin-btn-primary" style={{ fontSize: 12 }} disabled={briefBusy} onClick={runBriefing} data-testid="cc-brief-run">
                            {briefBusy ? "Generating…" : "Generate"}
                        </button>
                    </div>
                </div>
                {!briefing ? (
                    <div style={{ color: "var(--admin-muted)", fontSize: 13 }}>Generate an on-demand briefing for the selected window.</div>
                ) : (
                    <div data-testid="cc-brief-result">
                        <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 8 }}>{briefing.period.label} · {briefing.period.timezone}</div>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Facts</div>
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
                            <Metric label="New signups" value={briefing.facts.new_signups} />
                            <Metric label="New subs" value={briefing.facts.new_subscriptions} />
                            <Metric label="Enquiries" value={briefing.facts.new_enquiries} />
                            <Metric label="Tickets" value={briefing.facts.tickets_created} />
                            <Metric label="Marketing" value={aud(briefing.facts.marketing_spend_aud)} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Recommendations <span style={{ fontWeight: 400, fontSize: 11, color: "var(--admin-muted)" }}>(rule-based, not facts)</span></div>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
                            {briefing.recommendations.map((rc, i) => <li key={i}>{rc}</li>)}
                        </ul>
                    </div>
                )}
            </div>

            {/* Integration & data-source health */}
            <div className="admin-card" style={{ padding: 18 }} data-testid="cc-integration-health">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Activity size={16} /><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Integration & Data-source Health</h3>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {[...(integrations?.internal || []), ...(integrations?.external || [])].map((h, i) => {
                        const ok = h.status === "connected";
                        const warn = h.status === "no_data_yet";
                        const color = ok ? "#2f7d4a" : warn ? "#A5512B" : "#9aa0a6";
                        return (
                            <div key={i} title={h.note || ""} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--admin-border)", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
                                <span style={{ fontWeight: 600 }}>{h.source}</span>
                                <span style={{ color: "var(--admin-muted)" }}>{(h.status || "").replace(/_/g, " ")}</span>
                            </div>
                        );
                    })}
                </div>
                <p style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 10 }}>{integrations?.note}</p>
            </div>
        </div>
    );
}
