import React, { useEffect, useState, useCallback } from "react";
import { ShieldAlert, AlertTriangle, CheckCircle2, Clock, Loader2, X } from "lucide-react";
import { adminApi } from "./AdminAuthContext";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// AdminSecurityAlerts — Phase 4 monitoring dashboard
// ---------------------------------------------------------------------------

const SEVERITY_STYLES = {
    CRITICAL: { bg: "rgba(220,38,38,0.10)", fg: "#991B1B", border: "rgba(220,38,38,0.35)" },
    HIGH:     { bg: "rgba(217,119,6,0.10)", fg: "#92400E", border: "rgba(217,119,6,0.35)" },
    MEDIUM:   { bg: "rgba(234,179,8,0.10)", fg: "#854D0E", border: "rgba(234,179,8,0.35)" },
    LOW:      { bg: "rgba(75,85,99,0.10)",  fg: "#374151", border: "rgba(75,85,99,0.35)" },
};

function fmtTime(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        return d.toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
    } catch { return iso; }
}

function SeverityBadge({ severity }) {
    const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.LOW;
    return (
        <span
            data-testid={`alert-severity-${severity?.toLowerCase()}`}
            style={{
                background: s.bg, color: s.fg, border: `1px solid ${s.border}`,
                padding: "2px 8px", borderRadius: 999, fontSize: 11,
                fontWeight: 600, letterSpacing: 0.3,
            }}
        >
            {severity}
        </span>
    );
}

function StatTile({ icon: Icon, label, value, tone = "default", testid }) {
    const colors = {
        default: { fg: "var(--admin-text)", iconBg: "rgba(99,102,241,0.10)" },
        critical: { fg: "#991B1B", iconBg: "rgba(220,38,38,0.10)" },
        ok: { fg: "#065F46", iconBg: "rgba(16,185,129,0.10)" },
    }[tone];
    return (
        <div
            data-testid={testid}
            style={{
                display: "flex", alignItems: "center", gap: 12,
                background: "var(--admin-surface)", border: "1px solid var(--admin-border)",
                borderRadius: 12, padding: 16, minHeight: 76,
            }}
        >
            <div style={{
                width: 40, height: 40, borderRadius: 10, display: "flex",
                alignItems: "center", justifyContent: "center", background: colors.iconBg,
            }}>
                <Icon size={20} color={colors.fg} />
            </div>
            <div>
                <div style={{ fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: colors.fg }}>{value}</div>
            </div>
        </div>
    );
}

function ResolveModal({ alert, onClose, onResolved }) {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        try {
            await adminApi.post(`/admin/security-alerts/${alert.id}/resolve`, { note: note.slice(0, 500) });
            toast.success("Alert resolved");
            onResolved();
            onClose();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not resolve alert");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            data-testid="resolve-alert-modal"
            style={{
                position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "var(--admin-surface)", borderRadius: 12,
                    border: "1px solid var(--admin-border)", padding: 24,
                    width: "min(520px, 92vw)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 18 }}>Resolve alert</h3>
                    <button data-testid="resolve-modal-close" onClick={onClose} aria-label="Close" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--admin-muted)" }}>
                        <X size={20} />
                    </button>
                </div>
                <p style={{ color: "var(--admin-muted)", fontSize: 13, marginTop: 0 }}>
                    <strong>{alert.rule}</strong> — {alert.description}<br />
                    Subject: <code>{alert.subject}</code> · {alert.count} events in {Math.round(alert.window_seconds / 60)}m
                </p>
                <label style={{ fontSize: 13, color: "var(--admin-text)" }}>
                    Resolution note <span style={{ color: "var(--admin-muted)" }}>(audit-logged, optional)</span>
                </label>
                <textarea
                    data-testid="resolve-note-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    placeholder="e.g. Investigated — known load-test traffic from CI"
                    style={{
                        width: "100%", marginTop: 6, padding: 10, borderRadius: 8,
                        border: "1px solid var(--admin-border)", background: "var(--admin-bg)",
                        color: "var(--admin-text)", fontFamily: "inherit", resize: "vertical",
                    }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                    <button onClick={onClose} disabled={busy} className="admin-btn-secondary">Cancel</button>
                    <button
                        data-testid="resolve-confirm-btn"
                        onClick={submit} disabled={busy}
                        className="admin-btn-primary"
                        style={{ background: "var(--admin-accent)", color: "white", padding: "8px 16px", borderRadius: 8, border: 0, cursor: busy ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                        {busy ? <Loader2 size={14} className="kindred-spin" /> : <CheckCircle2 size={14} />}
                        Mark resolved
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function AdminSecurityAlerts() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all"); // all | open
    const [resolveTarget, setResolveTarget] = useState(null);

    useEffect(() => {
        let alive = true;
        const run = async () => {
            try {
                const r = await adminApi.get("/admin/security-alerts", {
                    params: { only_open: filter === "open", limit: 100 },
                });
                if (!alive) return;
                setData(r.data);
            } catch (e) {
                if (!alive) return;
                toast.error(e?.response?.data?.detail || "Could not load alerts");
            } finally {
                if (alive) setLoading(false);
            }
        };
        run();
        const id = setInterval(run, 30000);
        return () => { alive = false; clearInterval(id); };
    }, [filter]);

    // Imperative reload after a resolve action.
    const reload = useCallback(async () => {
        try {
            const r = await adminApi.get("/admin/security-alerts", {
                params: { only_open: filter === "open", limit: 100 },
            });
            setData(r.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not reload alerts");
        }
    }, [filter]);

    return (
        <div data-testid="admin-security-alerts-page" style={{ padding: "0 24px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Security Alerts</h1>
                    <p style={{ margin: "4px 0 0", color: "var(--admin-muted)", fontSize: 13 }}>
                        Live feed of brute-force, credential-stuffing, scraping, admin-spike and malware events.
                        Updates every 30s.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        data-testid="filter-all-btn"
                        onClick={() => setFilter("all")}
                        style={{
                            padding: "6px 12px", borderRadius: 8, border: "1px solid var(--admin-border)",
                            background: filter === "all" ? "var(--admin-accent)" : "transparent",
                            color: filter === "all" ? "white" : "var(--admin-text)",
                            cursor: "pointer", fontSize: 13,
                        }}
                    >All</button>
                    <button
                        data-testid="filter-open-btn"
                        onClick={() => setFilter("open")}
                        style={{
                            padding: "6px 12px", borderRadius: 8, border: "1px solid var(--admin-border)",
                            background: filter === "open" ? "var(--admin-accent)" : "transparent",
                            color: filter === "open" ? "white" : "var(--admin-text)",
                            cursor: "pointer", fontSize: 13,
                        }}
                    >Open only</button>
                </div>
            </div>

            {/* Stats tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
                <StatTile testid="stat-open" icon={AlertTriangle} label="Open alerts" value={data?.stats?.open ?? "—"} tone="default" />
                <StatTile testid="stat-critical" icon={ShieldAlert} label="Critical open" value={data?.stats?.critical_open ?? "—"} tone={data?.stats?.critical_open > 0 ? "critical" : "ok"} />
                <StatTile testid="stat-24h" icon={Clock} label="Fired in last 24h" value={data?.stats?.last_24h ?? "—"} tone="default" />
            </div>

            {/* Alerts list */}
            {loading ? (
                <div style={{ textAlign: "center", padding: 60, color: "var(--admin-muted)" }}>
                    <Loader2 size={28} className="kindred-spin" />
                    <div style={{ marginTop: 12 }}>Loading alerts…</div>
                </div>
            ) : !data?.alerts?.length ? (
                <div
                    data-testid="empty-state"
                    style={{
                        textAlign: "center", padding: 60,
                        background: "var(--admin-surface)", border: "1px dashed var(--admin-border)",
                        borderRadius: 12, color: "var(--admin-muted)",
                    }}
                >
                    <CheckCircle2 size={36} style={{ marginBottom: 8, color: "#065F46" }} />
                    <div style={{ fontWeight: 600, color: "var(--admin-text)" }}>All clear</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>No {filter === "open" ? "open" : ""} alerts.</div>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {data.alerts.map((a) => (
                        <div
                            key={a.id}
                            data-testid={`alert-row-${a.rule.toLowerCase()}`}
                            style={{
                                background: "var(--admin-surface)", border: "1px solid var(--admin-border)",
                                borderRadius: 12, padding: 16,
                                opacity: a.resolved ? 0.55 : 1,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <SeverityBadge severity={a.severity} />
                                    <strong style={{ fontSize: 14 }}>{a.rule}</strong>
                                    {a.resolved && (
                                        <span data-testid={`alert-resolved-${a.id}`} style={{
                                            background: "rgba(16,185,129,0.10)", color: "#065F46",
                                            padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                                            border: "1px solid rgba(16,185,129,0.30)",
                                        }}>
                                            RESOLVED
                                        </span>
                                    )}
                                </div>
                                {!a.resolved && (
                                    <button
                                        data-testid={`resolve-btn-${a.id}`}
                                        onClick={() => setResolveTarget(a)}
                                        style={{
                                            background: "transparent",
                                            border: "1px solid var(--admin-border)",
                                            color: "var(--admin-text)",
                                            padding: "6px 12px", borderRadius: 8,
                                            cursor: "pointer", fontSize: 13,
                                            display: "inline-flex", alignItems: "center", gap: 6,
                                        }}
                                    >
                                        <CheckCircle2 size={14} /> Resolve
                                    </button>
                                )}
                            </div>
                            <div style={{ color: "var(--admin-muted)", fontSize: 13, marginBottom: 6 }}>
                                {a.description}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, fontSize: 12 }}>
                                <div><span style={{ color: "var(--admin-muted)" }}>Subject:</span> <code style={{ background: "var(--admin-bg)", padding: "1px 6px", borderRadius: 4 }}>{a.subject}</code></div>
                                <div><span style={{ color: "var(--admin-muted)" }}>Count:</span> {a.count} in {Math.round(a.window_seconds / 60)}m</div>
                                <div><span style={{ color: "var(--admin-muted)" }}>First seen:</span> {fmtTime(a.first_seen)}</div>
                                <div><span style={{ color: "var(--admin-muted)" }}>Last seen:</span> {fmtTime(a.last_seen)}</div>
                            </div>
                            {a.filename && (
                                <div style={{ marginTop: 6, fontSize: 12 }}>
                                    <span style={{ color: "var(--admin-muted)" }}>File:</span> {a.filename} <span style={{ color: "var(--admin-muted)" }}>·</span> Scan result: <code>{a.scan_result}</code>
                                </div>
                            )}
                            {a.resolved && (
                                <div style={{ marginTop: 8, padding: 8, background: "var(--admin-bg)", borderRadius: 6, fontSize: 12 }}>
                                    <div><strong>Resolved by:</strong> {a.resolved_by || "—"} at {fmtTime(a.resolved_at)}</div>
                                    {a.resolution_note && <div style={{ marginTop: 4 }}><strong>Note:</strong> {a.resolution_note}</div>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {resolveTarget && (
                <ResolveModal
                    alert={resolveTarget}
                    onClose={() => setResolveTarget(null)}
                    onResolved={reload}
                />
            )}
        </div>
    );
}
