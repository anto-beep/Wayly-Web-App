import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
    LayoutDashboard, DollarSign, Users, Headphones, Megaphone,
    ShieldAlert, CheckSquare, Activity, BookOpen,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    return f;
};
const aud = (n) => `A$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function fmtDate(iso) {
    if (!iso) return "no data yet";
    try { return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
    catch { return String(iso); }
}

function Section({ icon: Icon, title, block, children, to }) {
    const empty = block?.status === "empty";
    return (
        <div className="admin-card" data-testid={`cc-section-${title.toLowerCase().replace(/\s+/g, "-")}`} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon size={17} />
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>
                </div>
                {to && <Link to={to} className="admin-btn" style={{ fontSize: 11, padding: "3px 10px" }} data-testid={`cc-drill-${title.toLowerCase().replace(/\s+/g, "-")}`}>View</Link>}
            </div>
            {empty ? (
                <div style={{ color: "var(--admin-muted)", fontSize: 13, padding: "10px 0" }} data-testid="cc-empty">
                    No data entered yet.
                </div>
            ) : children}
            <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 12, borderTop: "1px solid var(--admin-border)", paddingTop: 8 }}>
                Source: {block?.source || "—"} · Updated {fmtDate(block?.last_updated)}
            </div>
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

export default function AdminCommandCentre() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const r = await adminApi.get("/admin/command-centre/summary");
                setData(r.data);
            } catch (e) {
                setErr(extractMsg(e, "Could not load the command centre."));
                toast.error(extractMsg(e, "Could not load the command centre."));
            }
        })();
    }, []);

    if (err) return <div data-testid="cc-error" style={{ padding: 24, color: "var(--admin-muted)" }}>{err}</div>;
    if (!data) return <div data-testid="cc-loading" style={{ padding: 24, color: "var(--admin-muted)" }}>Loading…</div>;

    const b = data.blocks;
    const rev = b.revenue.data, gr = b.growth.data, sup = b.support.data;
    const mk = b.marketing.data, al = b.alerts.data, ap = b.approvals.data;
    const hc = b.help_centre?.data || {};

    return (
        <div data-testid="admin-command-centre">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <LayoutDashboard size={22} />
                <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Founder Command Centre</h1>
            </div>
            <p style={{ color: "var(--admin-muted)", marginTop: 0, fontSize: 13 }}>
                Verified business metrics from stored Wayly records. Figures are never fabricated — empty blocks mean no data yet.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginTop: 16 }}>
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
                        <Metric label={`Total (${mk.period?.label || "this month"})`} value={aud(mk.totals?.total_investment_aud)} />
                        <Metric label="Paid media" value={aud(mk.totals?.paid_media_spend_aud)} />
                        <Metric label="Committed" value={aud(mk.totals?.committed_unpaid_aud)} />
                        <Metric label="Planned" value={aud(mk.totals?.planned_aud)} />
                    </div>
                </Section>

                {b.help_centre && (
                    <Section icon={BookOpen} title="Help Centre" block={b.help_centre} to="/admin/help-centre">
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <Metric label="Published" value={hc.published_articles ?? 0} />
                            <Metric label="Pending approval" value={hc.pending_approval ?? 0} />
                            <Metric label="Unanswered (30d)" value={hc.unanswered_searches_30d ?? 0} />
                            <Metric label="Helpful %" value={hc.feedback_helpful_pct_30d != null ? `${hc.feedback_helpful_pct_30d}%` : "—"} />
                            <Metric label="Outdated" value={hc.outdated_articles ?? 0} />
                        </div>
                    </Section>
                )}

                <Section icon={ShieldAlert} title="Operational Alerts" block={b.alerts}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Metric label="Security alerts" value={al.open_security_alerts} />
                        <Metric label="SLA breached" value={al.sla_breached_tickets} />
                    </div>
                </Section>

                <Section icon={CheckSquare} title="Pending Approvals" block={b.approvals} to="/admin/marketing-spend">
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <Metric label="Marketing to approve" value={ap.marketing_expenses_pending} />
                    </div>
                </Section>
            </div>

            {/* Data-source health */}
            <div className="admin-card" style={{ padding: 18, marginTop: 14 }} data-testid="cc-source-health">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Activity size={16} /><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Data-source health</h3>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {data.data_source_health.map((h, i) => {
                        const ok = h.status === "connected";
                        const warn = h.status === "no_data_yet";
                        const color = ok ? "#2f7d4a" : warn ? "#A5512B" : "#9aa0a6";
                        return (
                            <div key={i} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--admin-border)", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
                                <span style={{ fontWeight: 600 }}>{h.source}</span>
                                <span style={{ color: "var(--admin-muted)" }}>{h.status.replace(/_/g, " ")}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
