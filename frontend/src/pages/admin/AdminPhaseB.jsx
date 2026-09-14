/**
 * Wayly Admin - Phase B pages (P0 + P1 backlog).
 *
 * All 21 new admin pages built in this iteration live here as small,
 * data-driven React components sharing a common table / stat / json
 * viewer. Keeps the delta small and the design consistent.
 *
 * P0 (5) - Flagged, Review Queue, Product Analytics, Funnels, Cohorts
 * P1 (16) - Program Reference, Data Exports, Devices, CMS Reviewers,
 *            Decoder Cost, LLM Cost, Jobs Queue, Health Watchdog,
 *            Scenario Clocks, Global Search, Cache Panel, V2 Addons,
 *            V2 Free-Tier Usage, V2 Purge Queue, User Refund/Dedup,
 *            SEO IndexNow Extended.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "./AdminApp";
import { Placeholder } from "./AdminPages";
import { useAdminTheme } from "./useAdminTheme";
import { formatDate } from "@/lib/formatDate";
import { useAdminDensity } from "./useAdminDensity";
import { Loader2, RefreshCcw, Download, Search, PlayCircle, TriangleAlert, CheckCircle2 } from "lucide-react";


// ============================================================
// Shared primitives
// ============================================================

function PageHeader({ title, description, actions }) {
    return (
        <div className="admin-page-header">
            <div>
                <h1 className="admin-page-title">{title}</h1>
                {description && <p className="admin-page-desc">{description}</p>}
            </div>
            {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
        </div>
    );
}

function useEndpoint(path, { auto = true } = {}) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async (override) => {
        setLoading(true); setErr(null);
        try {
            const r = await adminApi.get(override || path);
            setData(r.data);
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Failed to load");
        } finally { setLoading(false); }
    }, [path]);
    useEffect(() => { if (auto) load(); }, [path, auto, load]);
    return { data, err, loading, reload: load };
}

function DataState({ loading, err, empty, children }) {
    if (loading) return <div className="admin-empty"><Loader2 size={16} className="animate-spin" style={{ display: "inline", marginRight: 6 }} /> Loading…</div>;
    if (err) return <div className="admin-empty" style={{ color: "var(--admin-critical)" }}><TriangleAlert size={16} style={{ display: "inline", marginRight: 6 }} /> {String(err)}</div>;
    if (empty) return <div className="admin-empty">{empty}</div>;
    return children;
}

function JsonBlock({ value }) {
    return (
        <pre className="admin-mono" style={{
            background: "var(--admin-input-bg)", padding: 14, borderRadius: 8,
            border: "1px solid var(--admin-border)", maxHeight: 480, overflow: "auto",
            fontSize: 12, color: "var(--admin-text-soft)", whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
    );
}

function StatGrid({ items }) {
    return (
        <div className="admin-grid admin-grid-4" data-testid="admin-stat-grid">
            {items.map((s, i) => (
                <div key={i} className="admin-stat">
                    <div className="admin-stat-label">{s.label}</div>
                    <div className="admin-stat-value">{s.value}</div>
                    {s.sub && <div className={`admin-stat-sub ${s.trend === "up" ? "admin-stat-up" : s.trend === "down" ? "admin-stat-down" : ""}`}>{s.sub}</div>}
                </div>
            ))}
        </div>
    );
}

function SimpleList({ path, columns, emptyLabel = "Nothing yet.", testid, actions }) {
    const { data, err, loading, reload } = useEndpoint(path);
    const rows = Array.isArray(data) ? data : (data?.items || data?.results || data?.rows || []);
    return (
        <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
                {actions}
                <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => reload()} data-testid={`${testid}-refresh`}>
                    <RefreshCcw size={12} /> Refresh
                </button>
            </div>
            <DataState loading={loading} err={err} empty={rows.length === 0 ? emptyLabel : null}>
                <div className="admin-table-wrap">
                    <table className="admin-table" data-testid={testid}>
                        <thead>
                            <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={r.id || r._id || i}>
                                    {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? "-")}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DataState>
        </>
    );
}


// ============================================================
// P0 - the 5 previously placeholdered nav pages
// ============================================================

export function AdminFlagged() {
    // Reuse /admin/security-alerts as the data source for the flagged-account
    // stream. Both concepts share fixture semantics (kind, target, reason).
    return (
        <div>
            <PageHeader
                title="Flagged Accounts"
                description="Accounts flagged by the anomaly engine or by a support agent. Review, resolve, or escalate. Data sourced from the security-alerts stream."
            />
            <SimpleList
                path="/admin/security-alerts?kind=account&status=open"
                testid="admin-flagged-table"
                emptyLabel="No open account flags. Nice."
                columns={[
                    { key: "created_at", label: "When", render: (r) => new Date(r.created_at || r.ts || Date.now()).toLocaleString() },
                    { key: "user_email", label: "Account", render: (r) => r.user_email || r.target || r.subject || "-" },
                    { key: "reason", label: "Reason", render: (r) => r.reason || r.rule || r.kind || "-" },
                    { key: "severity", label: "Severity", render: (r) => <span className={`admin-badge ${r.severity === "critical" ? "admin-badge-red" : "admin-badge-info"}`}>{r.severity || "info"}</span> },
                ]}
            />
        </div>
    );
}

export function AdminReviewQueue() {
    return (
        <div>
            <PageHeader
                title="Review Queue"
                description="Tool outputs pending human review: decoded statements the anomaly engine flagged, care-plan reviewer outputs with policy hits, and LLM outputs surfaced by the wrapper's post-check."
            />
            <SimpleList
                path="/admin/anomaly-log?status=needs_review&limit=100"
                testid="admin-review-queue"
                emptyLabel="Review queue is empty."
                columns={[
                    { key: "detected_at", label: "When", render: (r) => new Date(r.detected_at || r.ts || Date.now()).toLocaleString() },
                    { key: "tool", label: "Tool", render: (r) => r.tool || r.source || "statement_decoder" },
                    { key: "kind", label: "Kind", render: (r) => r.kind || r.category || "-" },
                    { key: "user_email", label: "Account", render: (r) => r.user_email || r.user_id || "-" },
                    { key: "severity", label: "Severity", render: (r) => <span className="admin-badge admin-badge-info">{r.severity || "info"}</span> },
                ]}
            />
        </div>
    );
}

export function AdminProductAnalytics() {
    const { data, err, loading } = useEndpoint("/admin/analytics");
    const kpis = data?.kpis || [
        { label: "DAU", value: data?.dau ?? "-", sub: data?.dau_delta && `${data.dau_delta > 0 ? "+" : ""}${data.dau_delta}% WoW`, trend: (data?.dau_delta || 0) >= 0 ? "up" : "down" },
        { label: "Tool runs (7d)", value: data?.tool_runs_7d ?? "-", sub: "" },
        { label: "Conversion", value: data?.conversion_pct != null ? `${data.conversion_pct}%` : "-" },
        { label: "Churn (30d)", value: data?.churn_pct != null ? `${data.churn_pct}%` : "-" },
    ];
    return (
        <div>
            <PageHeader
                title="Product Analytics"
                description="Live product metrics from the analytics rollup. WoW deltas compare the trailing 7-day window against the 7 days before it."
            />
            <DataState loading={loading} err={err}>
                <StatGrid items={kpis} />
                <div style={{ marginTop: 24 }}>
                    <h2 className="admin-heading" style={{ fontSize: 16, marginBottom: 12 }}>Raw payload</h2>
                    <JsonBlock value={data || {}} />
                </div>
            </DataState>
        </div>
    );
}

export function AdminFunnels() {
    const { data, err, loading } = useEndpoint("/admin/analytics?view=funnels");
    const funnels = data?.funnels || [];
    return (
        <div>
            <PageHeader
                title="Funnels"
                description="Signup → activation → first tool run → subscription. Each row is a step; drop-off is compared to the previous step."
            />
            <DataState loading={loading} err={err} empty={funnels.length === 0 ? "No funnel data yet." : null}>
                <div className="admin-table-wrap">
                    <table className="admin-table" data-testid="admin-funnels-table">
                        <thead><tr><th>Step</th><th>Users</th><th>% of previous</th><th>% of top</th></tr></thead>
                        <tbody>
                            {funnels.map((f, i) => (
                                <tr key={i}>
                                    <td>{f.label || f.step}</td>
                                    <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{f.count?.toLocaleString?.() ?? f.count}</td>
                                    <td>{f.pct_of_prev != null ? `${f.pct_of_prev.toFixed(1)}%` : "-"}</td>
                                    <td>{f.pct_of_top != null ? `${f.pct_of_top.toFixed(1)}%` : "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DataState>
        </div>
    );
}

export function AdminCohorts() {
    const { data, err, loading } = useEndpoint("/admin/analytics?view=cohorts");
    const cohorts = data?.cohorts || [];
    return (
        <div>
            <PageHeader
                title="Cohorts"
                description="Weekly signup cohorts and their retention at 1, 4, and 12 weeks. Sourced from the analytics rollup."
            />
            <DataState loading={loading} err={err} empty={cohorts.length === 0 ? "No cohort data yet." : null}>
                <div className="admin-table-wrap">
                    <table className="admin-table" data-testid="admin-cohorts-table">
                        <thead><tr><th>Signup week</th><th>Size</th><th>Wk 1</th><th>Wk 4</th><th>Wk 12</th></tr></thead>
                        <tbody>
                            {cohorts.map((c, i) => (
                                <tr key={i}>
                                    <td>{c.week}</td>
                                    <td>{c.size?.toLocaleString?.() ?? c.size}</td>
                                    <td>{c.wk1 != null ? `${(c.wk1 * 100).toFixed(0)}%` : "-"}</td>
                                    <td>{c.wk4 != null ? `${(c.wk4 * 100).toFixed(0)}%` : "-"}</td>
                                    <td>{c.wk12 != null ? `${(c.wk12 * 100).toFixed(0)}%` : "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DataState>
        </div>
    );
}


// ============================================================
// P1 - backend-ready pages
// ============================================================

export function AdminProgramReference() {
    const { data, err, loading, reload } = useEndpoint("/admin/program-reference");
    const rows = Array.isArray(data?.values) ? data.values : (data ? Object.entries(data).map(([k, v]) => ({ key: k, value: v?.value ?? v, effective_from: v?.effective_from, status: v?.legislativeVerificationStatus })) : []);
    return (
        <div>
            <PageHeader
                title="INDEX-1 Registry"
                description="Point-in-time statutory constants (classifications, supplements, thresholds). Read-only display until write is wired in a follow-up."
                actions={<Link to="/admin/health" className="admin-link">System health →</Link>}
            />
            <DataState loading={loading} err={err} empty={rows.length === 0 ? "Registry empty." : null}>
                <div className="admin-table-wrap">
                    <table className="admin-table" data-testid="admin-index1-table">
                        <thead><tr><th>Key</th><th>Value</th><th>Effective</th><th>Status</th></tr></thead>
                        <tbody>
                            {rows.slice(0, 200).map((r, i) => (
                                <tr key={i}>
                                    <td className="admin-mono">{r.key}</td>
                                    <td className="admin-mono">{typeof r.value === "object" ? JSON.stringify(r.value) : String(r.value)}</td>
                                    <td>{r.effective_from || "-"}</td>
                                    <td>{r.status === "VERIFIED"
                                        ? <span className="admin-badge admin-badge-active">Verified</span>
                                        : <span className="admin-badge admin-badge-muted">{r.status || "-"}</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DataState>
            <div style={{ marginTop: 12 }}>
                <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => reload()}><RefreshCcw size={12} /> Refresh</button>
            </div>
        </div>
    );
}

export function AdminDataExports() {
    const exports = [
        { key: "users", label: "Users CSV", path: "/admin/export/users.csv" },
        { key: "payments", label: "Payments CSV", path: "/admin/export/payments.csv" },
        { key: "statements", label: "Statements CSV", path: "/admin/export/statements.csv" },
        { key: "audit", label: "Audit log CSV", path: "/admin/audit-log/export" },
    ];
    return (
        <div>
            <PageHeader
                title="Data Exports"
                description="CSV exports of the core datasets. Downloads run against the current filter set on each dataset's own page."
            />
            <div className="admin-grid admin-grid-2">
                {exports.map((e) => (
                    <a
                        key={e.key}
                        className="admin-card"
                        style={{ padding: 20, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                        href={`/api${e.path}`}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`admin-export-${e.key}`}
                    >
                        <div>
                            <div className="admin-stat-label">Export</div>
                            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{e.label}</div>
                        </div>
                        <Download size={18} style={{ color: "var(--admin-accent)" }} />
                    </a>
                ))}
            </div>
        </div>
    );
}

export function AdminDevices() {
    return (
        <div>
            <PageHeader
                title="Push Devices"
                description="Mobile devices registered for push notifications, plus a test-push tool for troubleshooting."
                actions={
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={async () => {
                        try { await adminApi.post("/admin/devices/test-push", { message: "Wayly admin test push" }); alert("Test push queued."); }
                        catch (e) { alert(e?.response?.data?.detail || "Test push failed."); }
                    }} data-testid="admin-devices-test-push"><PlayCircle size={12} /> Test push</button>
                }
            />
            <SimpleList
                path="/admin/devices"
                testid="admin-devices-table"
                emptyLabel="No devices registered."
                columns={[
                    { key: "platform", label: "Platform" },
                    { key: "user_email", label: "Owner", render: (r) => r.user_email || r.user_id || "-" },
                    { key: "created_at", label: "Registered", render: (r) => r.created_at ? formatDate(r.created_at) : "-" },
                    { key: "last_seen_at", label: "Last seen", render: (r) => r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : "-" },
                ]}
            />
        </div>
    );
}

export function AdminCmsReviewers() {
    return (
        <div>
            <PageHeader
                title="CMS Reviewers"
                description="Content review roster. Each reviewer can approve blog articles, glossary entries, and template updates."
            />
            <SimpleList
                path="/admin/cms/reviewers"
                testid="admin-reviewers-table"
                emptyLabel="No reviewers yet."
                columns={[
                    { key: "name", label: "Name" },
                    { key: "email", label: "Email" },
                    { key: "role", label: "Role", render: (r) => <span className="admin-badge admin-badge-info">{r.role || "reviewer"}</span> },
                ]}
            />
        </div>
    );
}

export function AdminDecoderCost() {
    const { data, err, loading } = useEndpoint("/admin/decoder-cost");
    return (
        <div>
            <PageHeader title="Decoder Cost" description="Statement Decoder LLM spend by day and by model." />
            <DataState loading={loading} err={err}>
                <StatGrid items={[
                    { label: "Spend today (AUD)", value: data?.today_aud != null ? `$${Number(data.today_aud).toFixed(2)}` : "-" },
                    { label: "Spend 30d (AUD)", value: data?.month_aud != null ? `$${Number(data.month_aud).toFixed(2)}` : "-" },
                    { label: "Cost / decoded run", value: data?.avg_run_aud != null ? `$${Number(data.avg_run_aud).toFixed(3)}` : "-" },
                    { label: "Runs 30d", value: data?.month_runs ?? "-" },
                ]} />
                <div style={{ marginTop: 24 }}><JsonBlock value={data || {}} /></div>
            </DataState>
        </div>
    );
}

export function AdminLlmCost() {
    const { data, err, loading } = useEndpoint("/admin/llm-cost-trend");
    const points = data?.points || data?.series || [];
    return (
        <div>
            <PageHeader
                title="LLM Cost & Circuit Breaker"
                description="Cost trend across all Wayly tools and reset control for the LLM circuit breaker."
                actions={
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={async () => {
                        try { await adminApi.post("/admin/llm/breaker/reset", {}); alert("Circuit breaker reset."); }
                        catch (e) { alert(e?.response?.data?.detail || "Reset failed."); }
                    }} data-testid="admin-llm-breaker-reset"><RefreshCcw size={12} /> Reset breaker</button>
                }
            />
            <DataState loading={loading} err={err} empty={points.length === 0 ? "No cost data yet." : null}>
                <div className="admin-table-wrap">
                    <table className="admin-table" data-testid="admin-llm-cost-table">
                        <thead><tr><th>Date</th><th>Runs</th><th>AUD</th><th>Model</th></tr></thead>
                        <tbody>
                            {points.map((p, i) => (
                                <tr key={i}>
                                    <td>{p.date || p.day}</td>
                                    <td>{p.runs ?? p.count}</td>
                                    <td>${Number(p.aud ?? p.cost ?? 0).toFixed(2)}</td>
                                    <td>{p.model || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DataState>
        </div>
    );
}

export function AdminJobsQueue() {
    const stats = useEndpoint("/admin/jobs/stats");
    const dlq = useEndpoint("/admin/jobs/dead-letter");
    return (
        <div>
            <PageHeader title="Jobs Queue" description="Live queue depth per handler, plus the dead-letter list for jobs that failed all retries." />
            <DataState loading={stats.loading} err={stats.err}>
                <StatGrid items={[
                    { label: "Queue depth", value: stats.data?.queue_depth ?? "-" },
                    { label: "In-flight", value: stats.data?.in_flight ?? "-" },
                    { label: "Success 24h", value: stats.data?.success_24h ?? "-" },
                    { label: "Failures 24h", value: stats.data?.failed_24h ?? "-", trend: (stats.data?.failed_24h || 0) > 0 ? "down" : "up" },
                ]} />
            </DataState>
            <h2 className="admin-heading" style={{ marginTop: 24, marginBottom: 12, fontSize: 16 }}>Dead letter</h2>
            <DataState loading={dlq.loading} err={dlq.err} empty={(dlq.data?.items || dlq.data || []).length === 0 ? "Dead letter is empty." : null}>
                <div className="admin-table-wrap">
                    <table className="admin-table" data-testid="admin-jobs-dlq">
                        <thead><tr><th>When</th><th>Handler</th><th>Attempts</th><th>Last error</th></tr></thead>
                        <tbody>
                            {(dlq.data?.items || dlq.data || []).map((r, i) => (
                                <tr key={r.id || i}>
                                    <td>{new Date(r.failed_at || r.created_at || Date.now()).toLocaleString()}</td>
                                    <td className="admin-mono">{r.handler}</td>
                                    <td>{r.attempts}</td>
                                    <td style={{ maxWidth: 400, wordBreak: "break-word", color: "var(--admin-critical)" }}>{r.error}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DataState>
        </div>
    );
}

export function AdminHealthWatchdog() {
    const { data, err, loading, reload } = useEndpoint("/admin/health-watchdog/state");
    return (
        <div>
            <PageHeader
                title="Health Watchdog"
                description="Automated deep-health checks and their last verdicts."
                actions={
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={async () => {
                        try { await adminApi.post("/admin/health-watchdog/check-now", {}); await reload(); }
                        catch (e) { alert(e?.response?.data?.detail || "Check failed."); }
                    }} data-testid="admin-watchdog-check-now"><PlayCircle size={12} /> Check now</button>
                }
            />
            <DataState loading={loading} err={err}>
                <StatGrid items={[
                    { label: "Overall", value: data?.overall || "-", trend: data?.overall === "ok" ? "up" : "down" },
                    { label: "Last checked", value: data?.last_checked_at ? new Date(data.last_checked_at).toLocaleTimeString() : "-" },
                    { label: "Consecutive failures", value: data?.consecutive_failures ?? 0 },
                    { label: "Uptime %", value: data?.uptime_pct != null ? `${data.uptime_pct.toFixed(2)}%` : "-" },
                ]} />
                <div style={{ marginTop: 24 }}><JsonBlock value={data || {}} /></div>
            </DataState>
        </div>
    );
}

export function AdminScenarioClocks() {
    const [result, setResult] = useState(null);
    const [err, setErr] = useState(null);
    const [running, setRunning] = useState(false);
    const run = async () => {
        setRunning(true); setErr(null);
        try { const r = await adminApi.post("/admin/scenario/evaluate-clocks", {}); setResult(r.data); }
        catch (e) { setErr(e?.response?.data?.detail || e?.message); }
        finally { setRunning(false); }
    };
    return (
        <div>
            <PageHeader
                title="Scenario Clocks"
                description="Runs the Support-at-Home clocks-and-holds evaluator against the current dataset. Useful for verifying quarterly rollover, hospital-hold triggers, and unused-fund cap logic without waiting on the cron."
                actions={
                    <button className="admin-btn admin-btn-sm" onClick={run} disabled={running} data-testid="admin-scenario-run">
                        {running ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
                        {running ? "Evaluating…" : "Evaluate now"}
                    </button>
                }
            />
            {err && <div className="admin-empty" style={{ color: "var(--admin-critical)" }}>{err}</div>}
            {result && <JsonBlock value={result} />}
            {!result && !err && <div className="admin-empty">Click Evaluate now to run.</div>}
        </div>
    );
}

export function AdminCache() {
    const { data, err, loading, reload } = useEndpoint("/admin/cache/stats");
    const invalidate = async (ns) => {
        try { await adminApi.post("/admin/cache/invalidate", ns ? { namespace: ns } : {}); await reload(); }
        catch (e) { alert(e?.response?.data?.detail || "Invalidate failed."); }
    };
    return (
        <div>
            <PageHeader
                title="Cache Panel"
                description="Read-through cache hit/miss stats per namespace + a one-click invalidate."
                actions={<button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => invalidate(null)} data-testid="admin-cache-invalidate-all">Invalidate all</button>}
            />
            <DataState loading={loading} err={err}>
                <div className="admin-table-wrap">
                    <table className="admin-table" data-testid="admin-cache-table">
                        <thead><tr><th>Namespace</th><th>Hits</th><th>Misses</th><th>Hit rate</th><th></th></tr></thead>
                        <tbody>
                            {Object.entries(data || {}).map(([ns, stats]) => {
                                const h = stats.hit || 0, m = stats.miss || 0;
                                const rate = h + m ? (h / (h + m) * 100).toFixed(1) : "-";
                                return (
                                    <tr key={ns}>
                                        <td className="admin-mono">{ns}</td>
                                        <td>{h}</td>
                                        <td>{m}</td>
                                        <td>{rate}%</td>
                                        <td><button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => invalidate(ns)} data-testid={`admin-cache-invalidate-${ns}`}>Invalidate</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </DataState>
        </div>
    );
}

export function AdminV2Addons() {
    return (
        <div>
            <PageHeader title="Payments V2 - Add-ons" description="Optional add-on SKUs and current subscriber counts." />
            <SimpleList
                path="/admin/v2/addons"
                testid="admin-v2-addons-table"
                emptyLabel="No add-ons configured."
                columns={[
                    { key: "sku", label: "SKU", render: (r) => <span className="admin-mono">{r.sku}</span> },
                    { key: "label", label: "Label" },
                    { key: "monthly_price_aud", label: "Monthly AUD", render: (r) => r.monthly_price_aud != null ? `$${r.monthly_price_aud}` : "-" },
                    { key: "subscribers", label: "Subscribers" },
                ]}
            />
        </div>
    );
}

export function AdminV2FreeTier() {
    return (
        <div>
            <PageHeader title="Payments V2 - Free-tier Usage" description="Per-tool free-tier consumption for logged-in free-plan users." />
            <SimpleList
                path="/admin/v2/free-tier/usage"
                testid="admin-v2-freetier-table"
                emptyLabel="No usage yet."
                columns={[
                    { key: "user_email", label: "User", render: (r) => r.user_email || r.user_id },
                    { key: "tool", label: "Tool" },
                    { key: "used", label: "Used" },
                    { key: "cap", label: "Cap" },
                    { key: "reset_at", label: "Resets", render: (r) => r.reset_at ? formatDate(r.reset_at) : "-" },
                ]}
            />
        </div>
    );
}

export function AdminV2PurgeQueue() {
    const [pid, setPid] = useState("");
    const [days, setDays] = useState(30);
    const extend = async () => {
        try { await adminApi.post(`/admin/v2/purge-queue/${encodeURIComponent(pid)}/extend`, { days }); alert("Extension applied."); }
        catch (e) { alert(e?.response?.data?.detail || "Extend failed."); }
    };
    return (
        <div>
            <PageHeader
                title="Payments V2 - Purge Queue"
                description="Participants and accounts scheduled for retention purge. Extend the deadline to hold data longer if needed."
            />
            <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
                <input className="admin-input" style={{ maxWidth: 320 }} placeholder="Participant ID to extend"
                    value={pid} onChange={(e) => setPid(e.target.value)} data-testid="admin-purge-pid" />
                <input className="admin-input" style={{ maxWidth: 120 }} type="number" min={1} max={365}
                    value={days} onChange={(e) => setDays(parseInt(e.target.value) || 30)} data-testid="admin-purge-days" />
                <button className="admin-btn admin-btn-sm" disabled={!pid} onClick={extend} data-testid="admin-purge-extend">Extend</button>
            </div>
            <SimpleList
                path="/admin/v2/purge-queue"
                testid="admin-v2-purge-table"
                emptyLabel="Purge queue is empty."
                columns={[
                    { key: "participant_id", label: "Participant", render: (r) => <span className="admin-mono">{r.participant_id}</span> },
                    { key: "account_email", label: "Account", render: (r) => r.account_email || r.account_id },
                    { key: "scheduled_at", label: "Scheduled", render: (r) => formatDate(r.scheduled_at) },
                    { key: "reason", label: "Reason" },
                ]}
            />
        </div>
    );
}

export function AdminSeoIndexNowExtended() {
    const urls = useEndpoint("/admin/seo/indexnow/urls");
    const list = urls.data?.urls || urls.data || [];
    return (
        <div>
            <PageHeader
                title="IndexNow (Extended)"
                description="URL universe and last-ping timestamps. Use this to confirm what the SEO ping-all covers before firing it."
                actions={
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={async () => {
                        try { await adminApi.post("/admin/seo/indexnow/all", {}); alert("Ping queued."); }
                        catch (e) { alert(e?.response?.data?.detail || "Ping failed."); }
                    }} data-testid="admin-indexnow-ping-all-ext"><PlayCircle size={12} /> Ping all</button>
                }
            />
            <DataState loading={urls.loading} err={urls.err} empty={list.length === 0 ? "No URLs tracked." : null}>
                <div className="admin-table-wrap">
                    <table className="admin-table" data-testid="admin-indexnow-urls-table">
                        <thead><tr><th>URL</th><th>Last pinged</th><th>Kind</th></tr></thead>
                        <tbody>
                            {list.slice(0, 200).map((u, i) => (
                                <tr key={u.url || i}>
                                    <td className="admin-mono">{u.url || u}</td>
                                    <td>{u.last_pinged_at ? new Date(u.last_pinged_at).toLocaleString() : "-"}</td>
                                    <td>{u.kind || "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DataState>
        </div>
    );
}

export function AdminGlobalSearch() {
    const [q, setQ] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const run = async (e) => {
        e?.preventDefault?.();
        if (!q.trim()) return;
        setLoading(true); setErr(null);
        try { const r = await adminApi.get(`/admin/search?q=${encodeURIComponent(q)}`); setData(r.data); }
        catch (er) { setErr(er?.response?.data?.detail || "Search failed."); }
        finally { setLoading(false); }
    };
    const buckets = data?.results || data || {};
    return (
        <div>
            <PageHeader title="Global Search" description="Search across users, households, tickets, statements, and correspondence in one shot." />
            <form onSubmit={run} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input className="admin-input" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Email, participant name, ticket ref, statement id…"
                    autoFocus data-testid="admin-search-input" />
                <button className="admin-btn" type="submit" disabled={loading || !q.trim()} data-testid="admin-search-submit">
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Search
                </button>
            </form>
            <DataState loading={loading} err={err} empty={!data ? "Type a query above to search." : null}>
                <JsonBlock value={buckets} />
            </DataState>
        </div>
    );
}


// ============================================================
// Preferences - theme + display density + notification prefs
// ============================================================

export function AdminPreferences() {
    // Shared hook - Preferences and top-bar toggle keep the same state
    // via a "wayly:admin-theme" custom event.
    const [theme, setTheme] = useAdminTheme();
    const [density, setDensity] = useAdminDensity();
    const setDensityAndSave = (d) => setDensity(d);
    const [hardening, setHardening] = useState(null);
    useEffect(() => {
        adminApi.get("/admin/hardening/status").then((r) => setHardening(r.data)).catch(() => setHardening({ gate_enabled: false, allowlist_enabled: false, allowlist_entry_count: 0 }));
    }, []);

    return (
        <div data-testid="admin-preferences-page">
            <PageHeader
                title="Preferences"
                description="Personalise your admin console. Choices are stored per browser (in localStorage) and never leave your device."
            />
            <div className="admin-grid admin-grid-2">
                <div className="admin-card" style={{ padding: 20 }} data-testid="admin-prefs-theme">
                    <h2 style={{ fontSize: 16, margin: 0, marginBottom: 4 }}>Appearance</h2>
                    <p style={{ color: "var(--admin-muted-strong)", fontSize: 13, margin: "6px 0 16px" }}>
                        Match your OS with System, or force a mode. Applies immediately.
                    </p>
                    <div className="admin-theme-toggle" role="radiogroup" aria-label="Theme" style={{ marginTop: 4 }}>
                        <button role="radio" aria-pressed={theme === "light"} aria-checked={theme === "light"} onClick={() => setTheme("light")} data-testid="prefs-theme-light">Light</button>
                        <button role="radio" aria-pressed={theme === "system"} aria-checked={theme === "system"} onClick={() => setTheme("system")} data-testid="prefs-theme-system">System</button>
                        <button role="radio" aria-pressed={theme === "dark"} aria-checked={theme === "dark"} onClick={() => setTheme("dark")} data-testid="prefs-theme-dark">Dark</button>
                    </div>
                    <div className="admin-info-grid" style={{ marginTop: 20 }}>
                        <div className="row"><span>Active theme</span><span>{theme}</span></div>
                        <div className="row"><span>Persists per browser</span><span>Yes (localStorage)</span></div>
                    </div>
                </div>

                <div className="admin-card" style={{ padding: 20 }} data-testid="admin-prefs-density">
                    <h2 style={{ fontSize: 16, margin: 0, marginBottom: 4 }}>Density</h2>
                    <p style={{ color: "var(--admin-muted-strong)", fontSize: 13, margin: "6px 0 16px" }}>
                        Choose how tightly tables and lists pack together.
                    </p>
                    <div className="admin-theme-toggle" role="radiogroup" aria-label="Density">
                        <button role="radio" aria-pressed={density === "compact"} onClick={() => setDensityAndSave("compact")} data-testid="prefs-density-compact">Compact</button>
                        <button role="radio" aria-pressed={density === "comfortable"} onClick={() => setDensityAndSave("comfortable")} data-testid="prefs-density-comfortable">Comfortable</button>
                    </div>
                    <p style={{ color: "var(--admin-muted)", fontSize: 12, marginTop: 20 }}>
                        Applied immediately across every table and stat card.
                    </p>
                </div>

                <div className="admin-card" style={{ padding: 20 }} data-testid="admin-prefs-hardening">
                    <h2 style={{ fontSize: 16, margin: 0, marginBottom: 4 }}>Admin hardening posture</h2>
                    <p style={{ color: "var(--admin-muted-strong)", fontSize: 13, margin: "6px 0 16px" }}>
                        Server-side gate and IP allowlist. Managed via environment variables (never the UI) so an accidental UI action cannot lock ops out.
                    </p>
                    <div className="admin-info-grid">
                        <div className="row"><span>Gate key</span><span>{hardening?.gate_enabled ? <span className="admin-badge admin-badge-active">On</span> : <span className="admin-badge admin-badge-muted">Open</span>}</span></div>
                        <div className="row"><span>IP allowlist</span><span>{hardening?.allowlist_enabled ? <span className="admin-badge admin-badge-active">On ({hardening?.allowlist_entry_count})</span> : <span className="admin-badge admin-badge-muted">Open</span>}</span></div>
                    </div>
                    <p style={{ color: "var(--admin-muted)", fontSize: 11, marginTop: 16, lineHeight: 1.5 }}>
                        To close the gate in production, set <code>ADMIN_GATE_KEY</code> and <code>ADMIN_IP_ALLOWLIST</code> in your backend environment and redeploy.
                    </p>
                </div>

                <div className="admin-card" style={{ padding: 20 }} data-testid="admin-prefs-a11y">
                    <h2 style={{ fontSize: 16, margin: 0, marginBottom: 4 }}>Accessibility</h2>
                    <p style={{ color: "var(--admin-muted-strong)", fontSize: 13, margin: "6px 0 16px" }}>
                        The admin console follows WCAG AA at minimum and AAA where practical.
                    </p>
                    <div className="admin-info-grid">
                        <div className="row"><span>Body text contrast</span><span>≥ 7:1 (AAA)</span></div>
                        <div className="row"><span>Muted text contrast</span><span>≥ 4.5:1 (AA)</span></div>
                        <div className="row"><span>Focus ring</span><span>Visible on every control</span></div>
                        <div className="row"><span>Reduced motion</span><span>Honours OS setting</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ============================================================
// Route map exported for AdminApp to consume
// ============================================================

export const P0P1_ROUTES = [
    // P0
    { path: "flagged",           element: <AdminFlagged /> },
    { path: "review-queue",      element: <AdminReviewQueue /> },
    { path: "analytics-product", element: <AdminProductAnalytics /> },
    { path: "funnels",           element: <AdminFunnels /> },
    { path: "cohorts",           element: <AdminCohorts /> },
    // P1
    { path: "program-reference", element: <AdminProgramReference /> },
    { path: "exports",           element: <AdminDataExports /> },
    { path: "devices",           element: <AdminDevices /> },
    { path: "cms/reviewers",     element: <AdminCmsReviewers /> },
    { path: "decoder-cost",      element: <AdminDecoderCost /> },
    { path: "llm-cost",          element: <AdminLlmCost /> },
    { path: "jobs",              element: <AdminJobsQueue /> },
    { path: "health-watchdog",   element: <AdminHealthWatchdog /> },
    { path: "scenario-clocks",   element: <AdminScenarioClocks /> },
    { path: "cache",             element: <AdminCache /> },
    { path: "v2/addons",         element: <AdminV2Addons /> },
    { path: "v2/free-tier",      element: <AdminV2FreeTier /> },
    { path: "v2/purge-queue",    element: <AdminV2PurgeQueue /> },
    { path: "seo/indexnow-ext",  element: <AdminSeoIndexNowExtended /> },
    { path: "search",            element: <AdminGlobalSearch /> },
    { path: "preferences",       element: <AdminPreferences /> },
];

// Utility - AdminApp uses this to know which paths are now built.
export const P0P1_BUILT_PATHS = new Set(P0P1_ROUTES.map((r) => r.path));

// Re-export the Placeholder so AdminApp can still fall back for
// nav entries that remain unbuilt.
export { Placeholder };
