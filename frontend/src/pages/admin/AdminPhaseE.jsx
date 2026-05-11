import React, { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { adminApi, useAdminAuth } from "./AdminAuthContext";
import { AdminInvitesPanel } from "./AdminPhaseE2";

const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const extractMsg = (e, f = "Error") => { const d = e?.response?.data?.detail; if (typeof d === "string") return d; if (d?.message) return d.message; return f; };
const Badge = ({ children, tone = "info" }) => <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;

function Pagination({ page, pageSize, total, onPage }) {
    if (!total || total <= pageSize) return null;
    return (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13 }}>
            <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="admin-btn admin-btn-secondary">← Prev</button>
            <span style={{ color: "var(--admin-muted)" }}>Page {page} / {Math.ceil(total / pageSize)}</span>
            <button disabled={page * pageSize >= total} onClick={() => onPage(page + 1)} className="admin-btn admin-btn-secondary">Next →</button>
        </div>
    );
}

// ============================================================================
// AUDIT LOG VIEWER
// ============================================================================

export function AdminAuditLog() {
    const [data, setData] = useState(null);
    const [filters, setFilters] = useState({ action: "", actor_id: "", target_id: "" });
    const [draft, setDraft] = useState({ action: "", actor_id: "", target_id: "" });
    const [page, setPage] = useState(1);
    const SIZE = 50;

    useEffect(() => {
        const params = { page, page_size: SIZE };
        Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
        adminApi.get("/admin/audit-log", { params })
            .then((r) => setData(r.data))
            .catch((e) => toast.error(extractMsg(e)));
    }, [filters, page]);

    const apply = () => { setFilters(draft); setPage(1); };

    const exportUrl = () => {
        const u = new URL(`${process.env.REACT_APP_BACKEND_URL}/api/admin/audit-log/export`);
        u.searchParams.set("days", "30");
        Object.entries(filters).forEach(([k, v]) => { if (v) u.searchParams.set(k, v); });
        return u.toString();
    };

    return (
        <div data-testid="admin-audit-log">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Audit Log {data && <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data.total})</span>}</h1>
                <a href={exportUrl()} download className="admin-btn admin-btn-secondary" data-testid="audit-export-csv" style={{ textDecoration: "none" }}>Export CSV (30d)</a>
            </div>
            <div className="admin-card" style={{ padding: 12, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="action contains…" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} className="admin-input" style={{ width: 200 }} data-testid="audit-filter-action" />
                <input placeholder="actor user id" value={draft.actor_id} onChange={(e) => setDraft({ ...draft, actor_id: e.target.value })} className="admin-input" style={{ width: 200 }} data-testid="audit-filter-actor" />
                <input placeholder="target id" value={draft.target_id} onChange={(e) => setDraft({ ...draft, target_id: e.target.value })} className="admin-input" style={{ width: 200 }} data-testid="audit-filter-target" />
                <button onClick={apply} className="admin-btn" data-testid="audit-filter-apply">Apply</button>
                {(filters.action || filters.actor_id || filters.target_id) && (
                    <button onClick={() => { setDraft({ action: "", actor_id: "", target_id: "" }); setFilters({ action: "", actor_id: "", target_id: "" }); setPage(1); }} className="admin-btn admin-btn-secondary">Clear</button>
                )}
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th><th>Result</th><th>Detail</th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.events.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No events match.</td></tr>
                            : data.events.map((e, i) => (
                                <tr key={i} data-testid="audit-row">
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(e.ts)}</td>
                                    <td style={{ fontSize: 12 }}>{e.actor_email || <span style={{ color: "var(--admin-muted)" }}>{e.actor_id?.slice(0, 8) || "—"}</span>}</td>
                                    <td><code style={{ fontSize: 11 }}>{e.action}</code></td>
                                    <td style={{ fontSize: 11, color: "var(--admin-muted)" }}>{e.target_id?.slice(0, 16) || "—"}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{e.ip || "—"}</td>
                                    <td><Badge tone={e.result === "success" ? "active" : e.result === "bad_password" || e.result === "bad_code" || e.result === "locked" ? "suspended" : "muted"}>{e.result || "success"}</Badge></td>
                                    <td style={{ fontSize: 11, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.detail ? JSON.stringify(e.detail) : "—"}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} pageSize={SIZE} total={data?.total} onPage={setPage} />
        </div>
    );
}

// ============================================================================
// ADMIN SESSIONS
// ============================================================================

export function AdminSessions() {
    const { admin } = useAdminAuth();
    const [data, setData] = useState(null);
    const [active, setActive] = useState(true);

    const load = useCallback(() => {
        adminApi.get("/admin/sessions", { params: { active_only: false } })
            .then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, []);
    useEffect(() => { load(); }, [load]);

    const revoke = async (sid) => {
        if (!window.confirm("Revoke this session? The admin will be signed out.")) return;
        try {
            await adminApi.delete(`/admin/sessions/${sid}`);
            toast.success("Session revoked");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
    };

    const rows = (data?.sessions || []).filter((s) => !active || s.active);

    return (
        <div data-testid="admin-sessions">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 16 }}>
                Admin Sessions
                {data && <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}> ({data.active_count} active / {data.total} total)</span>}
            </h1>
            <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
                <button onClick={() => setActive(true)} className={`admin-btn ${active ? "" : "admin-btn-secondary"}`} data-testid="sessions-filter-active">Active only</button>
                <button onClick={() => setActive(false)} className={`admin-btn ${active ? "admin-btn-secondary" : ""}`} data-testid="sessions-filter-all">All (30d)</button>
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Admin</th><th>Role</th><th>IP</th><th>User-Agent</th><th>Created</th><th>Last activity</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : rows.length === 0 ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No sessions.</td></tr>
                            : rows.map((s) => (
                                <tr key={s.id} data-testid={`session-row-${s.id}`}>
                                    <td>{s.admin_email}</td>
                                    <td><Badge tone="info">{s.admin_role?.replace("_", " ")}</Badge></td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{s.ip || "—"}</td>
                                    <td style={{ fontSize: 11, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--admin-muted)" }} title={s.ua}>{s.ua || "—"}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(s.created_at)}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(s.last_activity)}</td>
                                    <td><Badge tone={s.active ? "active" : "muted"}>{s.active ? "active" : s.revoked ? "revoked" : "expired"}</Badge></td>
                                    <td style={{ textAlign: "right" }}>
                                        {s.active && admin?.admin_role === "super_admin" && (
                                            <button onClick={() => revoke(s.id)} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }} data-testid={`revoke-session-${s.id}`}>Revoke</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ============================================================================
// DATA REQUESTS (Privacy Act)
// ============================================================================

export function AdminDataRequests() {
    const [data, setData] = useState(null);
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const SIZE = 30;
    const [updating, setUpdating] = useState(null);

    const load = useCallback(() => {
        const params = { page, page_size: SIZE };
        if (status) params.status = status;
        adminApi.get("/admin/data-requests", { params })
            .then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, [status, page]);
    useEffect(() => { load(); }, [load]);

    const setRequestStatus = async (id, newStatus) => {
        const note = window.prompt(`Note for status change to "${newStatus}" (optional):`, "") || null;
        setUpdating(id);
        try {
            await adminApi.put(`/admin/data-requests/${id}`, { status: newStatus, note });
            toast.success("Status updated");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setUpdating(null); }
    };

    return (
        <div data-testid="admin-data-requests">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 16 }}>
                Privacy Data Requests
                {data && <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}> ({data.total})</span>}
            </h1>
            <div className="admin-card" style={{ padding: 12, marginBottom: 16, fontSize: 12, background: "rgba(99,179,237,0.1)", border: "1px solid var(--admin-info)", borderRadius: 6 }}>
                Under the Australian Privacy Act, you must action export and rectify requests within <strong>30 days</strong> and delete requests promptly. Document every decision in the note field.
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {[
                    { key: "", label: "All" }, { key: "received", label: "Received" },
                    { key: "in_progress", label: "In progress" }, { key: "completed", label: "Completed" }, { key: "rejected", label: "Rejected" },
                ].map((f) => (
                    <button key={f.key} onClick={() => { setStatus(f.key); setPage(1); }}
                        className={`admin-btn ${status === f.key ? "" : "admin-btn-secondary"}`}
                        data-testid={`dr-filter-${f.key || "all"}`}>{f.label}</button>
                ))}
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Created</th><th>Email</th><th>Type</th><th>Status</th><th>Note</th><th></th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No data requests yet.</td></tr>
                            : data.rows.map((r) => (
                                <tr key={r.id} data-testid={`dr-row-${r.id}`}>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(r.created_at)}</td>
                                    <td>{r.user_email}</td>
                                    <td><Badge tone={r.request_type === "delete" ? "suspended" : r.request_type === "export" ? "info" : "muted"}>{r.request_type}</Badge></td>
                                    <td><Badge tone={r.status === "completed" ? "active" : r.status === "in_progress" ? "trial" : r.status === "rejected" ? "suspended" : "info"}>{r.status}</Badge></td>
                                    <td style={{ fontSize: 11, maxWidth: 280, color: "var(--admin-muted)", whiteSpace: "pre-wrap" }}>{r.note || "—"}</td>
                                    <td style={{ textAlign: "right" }}>
                                        {r.status !== "completed" && r.status !== "rejected" && (
                                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                                {r.status === "received" && <button onClick={() => setRequestStatus(r.id, "in_progress")} disabled={updating === r.id} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} data-testid={`dr-start-${r.id}`}>Start</button>}
                                                <button onClick={() => setRequestStatus(r.id, "completed")} disabled={updating === r.id} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }} data-testid={`dr-complete-${r.id}`}>Complete</button>
                                                <button onClick={() => setRequestStatus(r.id, "rejected")} disabled={updating === r.id} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }}>Reject</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} pageSize={SIZE} total={data?.total} onPage={setPage} />
        </div>
    );
}

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export function AdminFeatureFlags() {
    const { admin } = useAdminAuth();
    const [flags, setFlags] = useState([]);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(null);

    const load = useCallback(() => {
        adminApi.get("/admin/feature-flags")
            .then((r) => setFlags(r.data.flags))
            .catch((e) => toast.error(extractMsg(e)));
    }, []);
    useEffect(() => { load(); }, [load]);

    const isSuper = admin?.admin_role === "super_admin";

    return (
        <div data-testid="admin-feature-flags">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Feature Flags <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({flags.length})</span></h1>
                {isSuper && <button onClick={() => setCreating(true)} className="admin-btn" data-testid="ff-new-btn">+ New flag</button>}
            </div>
            {(creating || editing) && <FlagEditor key={editing?.name || "new"} flag={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); load(); }} />}
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Name</th><th>Description</th><th>Enabled</th><th>Rollout %</th><th>Plans</th><th>Updated</th><th></th></tr></thead>
                    <tbody>
                        {flags.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No flags yet. {isSuper && "Create one to start gating features."}</td></tr>
                            : flags.map((f) => (
                                <tr key={f.name} data-testid={`ff-row-${f.name}`}>
                                    <td><code style={{ fontSize: 12 }}>{f.name}</code></td>
                                    <td style={{ fontSize: 12, color: "var(--admin-muted)", maxWidth: 320 }}>{f.description || "—"}</td>
                                    <td><Badge tone={f.enabled ? "active" : "muted"}>{f.enabled ? "on" : "off"}</Badge></td>
                                    <td className="admin-mono">{f.rollout_percent ?? 0}%</td>
                                    <td style={{ fontSize: 11, color: "var(--admin-muted)" }}>{(f.allowed_plans || []).join(", ") || "all"}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(f.updated_at)}</td>
                                    <td style={{ textAlign: "right" }}>
                                        <button onClick={() => setEditing(f)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} data-testid={`ff-edit-${f.name}`}>Edit</button>
                                        {isSuper && (
                                            <button onClick={async () => {
                                                if (!window.confirm(`Delete flag "${f.name}"?`)) return;
                                                try { await adminApi.delete(`/admin/feature-flags/${f.name}`); toast.success("Deleted"); load(); }
                                                catch (e) { toast.error(extractMsg(e)); }
                                            }} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }}>Delete</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function FlagEditor({ flag, onClose, onSaved }) {
    const isEdit = !!flag;
    const [form, setForm] = useState({
        name: flag?.name || "",
        description: flag?.description || "",
        enabled: !!flag?.enabled,
        rollout_percent: flag?.rollout_percent ?? 0,
        allowed_plans: flag?.allowed_plans || [],
        allowed_emails: flag?.allowed_emails || [],
    });
    const [busy, setBusy] = useState(false);
    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            if (isEdit) await adminApi.put(`/admin/feature-flags/${flag.name}`, form);
            else await adminApi.post("/admin/feature-flags", form);
            toast.success(isEdit ? "Flag updated" : "Flag created");
            onSaved();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };
    return (
        <form onSubmit={save} className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="ff-editor">
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{isEdit ? `Edit ${flag.name}` : "New feature flag"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Name (immutable)</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={isEdit} required className="admin-input" data-testid="ff-name" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Rollout %</label>
                    <input type="number" min={0} max={100} value={form.rollout_percent} onChange={(e) => setForm({ ...form, rollout_percent: parseInt(e.target.value || 0, 10) })} className="admin-input" data-testid="ff-rollout" />
                </div>
            </div>
            <label style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 12, display: "block" }}>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="admin-input" data-testid="ff-description" />
            <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} data-testid="ff-enabled" /> Enabled
                </label>
                <div style={{ fontSize: 12, color: "var(--admin-muted)", display: "flex", gap: 10, alignItems: "center" }}>
                    Plans:
                    {["free", "solo", "family"].map((p) => (
                        <label key={p} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input type="checkbox" checked={form.allowed_plans.includes(p)} onChange={(e) => setForm({ ...form, allowed_plans: e.target.checked ? [...form.allowed_plans, p] : form.allowed_plans.filter((x) => x !== p) })} />
                            {p}
                        </label>
                    ))}
                </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} className="admin-btn" data-testid="ff-save">{busy ? "Saving…" : isEdit ? "Update" : "Create"}</button>
                <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
        </form>
    );
}

// ============================================================================
// SYSTEM HEALTH
// ============================================================================

export function AdminSystemHealth() {
    const [data, setData] = useState(null);
    const [maintenance, setMaintenance] = useState({ enabled: false, message: "" });
    const { admin } = useAdminAuth();
    const isSuper = admin?.admin_role === "super_admin";

    const load = useCallback(() => {
        Promise.all([
            adminApi.get("/admin/system-health"),
            adminApi.get("/admin/maintenance").catch(() => ({ data: { enabled: false, message: "" } })),
        ])
            .then(([h, m]) => { setData(h.data); setMaintenance(m.data); })
            .catch((e) => toast.error(extractMsg(e)));
    }, []);
    useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

    const toggleMaintenance = async () => {
        const msg = window.prompt(maintenance.enabled ? "Confirm turn OFF maintenance mode (enter 'off')" : "Enter user-facing message:", maintenance.message || "Wayly is undergoing scheduled maintenance and will be back shortly.");
        if (msg == null) return;
        const newEnabled = !maintenance.enabled;
        try {
            await adminApi.post("/admin/maintenance", { enabled: newEnabled, message: msg });
            toast.success(newEnabled ? "Maintenance mode ON" : "Maintenance mode OFF");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
    };

    const statusTone = (s) => (["healthy", "live", "configured", "ok"].includes(s) ? "active" : s === "mock" || s === "mocked" ? "trial" : ["down", "missing_key", "missing", "error"].includes(s) ? "suspended" : "muted");

    return (
        <div data-testid="admin-system-health">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 16 }}>System Health</h1>
            {!data ? <p style={{ color: "var(--admin-muted)" }}>Loading…</p> : (
                <>
                    {/* Maintenance banner */}
                    <div className="admin-card" style={{ padding: 16, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, borderLeft: `4px solid ${data.maintenance_mode ? "var(--admin-critical)" : "var(--admin-success)"}` }}>
                        <div>
                            <div style={{ fontSize: 12, color: "var(--admin-muted)", textTransform: "uppercase" }}>Maintenance mode</div>
                            <div style={{ fontSize: 18, fontWeight: 600 }}>{data.maintenance_mode ? "ON — site is locked to users" : "OFF — site is live"}</div>
                            {maintenance.message && <div style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 4 }}>{maintenance.message}</div>}
                        </div>
                        {isSuper && (
                            <button onClick={toggleMaintenance} className={`admin-btn ${data.maintenance_mode ? "" : "admin-btn-secondary"}`} data-testid="maintenance-toggle">
                                {data.maintenance_mode ? "Turn OFF" : "Turn ON"}
                            </button>
                        )}
                    </div>

                    {/* Services */}
                    <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Services</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 24 }}>
                        {data.services.map((s) => (
                            <div key={s.name} className="admin-card" style={{ padding: 14 }} data-testid={`health-${s.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                                <div style={{ fontSize: 12, color: "var(--admin-muted)", textTransform: "uppercase" }}>{s.name}</div>
                                <div style={{ marginTop: 8 }}><Badge tone={statusTone(s.status)}>{s.status}</Badge></div>
                            </div>
                        ))}
                    </div>

                    {/* Collection counts */}
                    <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Database</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
                        {Object.entries(data.counts).map(([k, v]) => (
                            <div key={k} className="admin-stat">
                                <div className="admin-stat-label">{k.replace(/_/g, " ")}</div>
                                <div className="admin-stat-value">{v.toLocaleString("en-AU")}</div>
                            </div>
                        ))}
                    </div>

                    {/* LLM errors */}
                    <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Last 24 hours</h2>
                    <div className="admin-card" style={{ padding: 14, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13 }}>LLM call errors</span>
                        <strong style={{ color: data.llm_errors_24h > 10 ? "var(--admin-critical)" : "var(--admin-success)" }}>{data.llm_errors_24h}</strong>
                    </div>
                </>
            )}
        </div>
    );
}

// ============================================================================
// ADMIN ACCOUNTS CRUD
// ============================================================================

export function AdminAccounts() {
    const { admin: me } = useAdminAuth();
    const [admins, setAdmins] = useState([]);
    const [creating, setCreating] = useState(false);
    const [historyFor, setHistoryFor] = useState(null);

    const load = useCallback(() => {
        adminApi.get("/admin/admins")
            .then((r) => setAdmins(r.data.admins))
            .catch((e) => toast.error(extractMsg(e)));
    }, []);
    useEffect(() => { load(); }, [load]);

    const changeRole = async (u) => {
        const role = window.prompt(`New role for ${u.email}\n(super_admin | operations_admin | support_admin | content_admin)`, u.admin_role);
        if (!role || role === u.admin_role) return;
        try {
            await adminApi.put(`/admin/admins/${u.id}/role`, { admin_role: role });
            toast.success("Role updated");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
    };

    const reset2fa = async (u) => {
        if (!window.confirm(`Reset 2FA for ${u.email}? They will re-enrol on next login and any active sessions will be revoked.`)) return;
        try {
            await adminApi.post(`/admin/admins/${u.id}/reset-2fa`);
            toast.success("2FA reset — admin will re-enrol");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
    };

    const deactivate = async (u) => {
        if (!window.confirm(`Deactivate admin role for ${u.email}? They will retain their user account but lose admin access.`)) return;
        try {
            await adminApi.delete(`/admin/admins/${u.id}`);
            toast.success("Admin deactivated");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
    };

    return (
        <div data-testid="admin-accounts">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Admin Accounts <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({admins.length})</span></h1>
                <button onClick={() => setCreating(true)} className="admin-btn" data-testid="admins-new-btn">+ Add admin</button>
            </div>
            {creating && <AdminCreateForm onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
            {historyFor && <LoginHistoryDrawer userId={historyFor.id} email={historyFor.email} onClose={() => setHistoryFor(null)} />}
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>2FA</th><th>Last login</th><th>Created</th><th></th></tr></thead>
                    <tbody>
                        {admins.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No admins.</td></tr>
                            : admins.map((u) => (
                                <tr key={u.id} data-testid={`admin-row-${u.id}`}>
                                    <td>{u.email} {u.id === me?.id && <span style={{ fontSize: 11, color: "var(--admin-muted)" }}>(you)</span>}</td>
                                    <td>{u.name || "—"}</td>
                                    <td><Badge tone="info">{u.admin_role?.replace("_", " ")}</Badge></td>
                                    <td>{u.totp_enabled ? <Badge tone="active">on</Badge> : <Badge tone="suspended">off</Badge>}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(u.last_login_ts)}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(u.created_at)}</td>
                                    <td style={{ textAlign: "right" }}>
                                        <button onClick={() => setHistoryFor(u)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} data-testid={`admin-history-${u.id}`}>History</button>
                                        <button onClick={() => changeRole(u)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} data-testid={`admin-role-${u.id}`}>Role</button>
                                        {u.id !== me?.id && (
                                            <>
                                                <button onClick={() => reset2fa(u)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} data-testid={`admin-reset2fa-${u.id}`}>Reset 2FA</button>
                                                <button onClick={() => deactivate(u)} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }} data-testid={`admin-deactivate-${u.id}`}>Remove</button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <AdminInvitesPanel />
        </div>
    );
}

function AdminCreateForm({ onClose, onCreated }) {
    const [form, setForm] = useState({ email: "", name: "", admin_role: "support_admin", temp_password: "" });
    const [busy, setBusy] = useState(false);
    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await adminApi.post("/admin/admins", form);
            toast.success(r.data.existing ? "Existing user promoted to admin" : "Admin created");
            onCreated();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };
    return (
        <form onSubmit={save} className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="admin-create-form">
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Add admin</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Email</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="admin-input" data-testid="admin-create-email" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Name</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} className="admin-input" data-testid="admin-create-name" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Role</label>
                    <select value={form.admin_role} onChange={(e) => setForm({ ...form, admin_role: e.target.value })} className="admin-input" data-testid="admin-create-role">
                        <option value="super_admin">Super admin</option>
                        <option value="operations_admin">Operations admin</option>
                        <option value="support_admin">Support admin</option>
                        <option value="content_admin">Content admin</option>
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Temporary password (8+ chars)</label>
                    <input type="password" value={form.temp_password} onChange={(e) => setForm({ ...form, temp_password: e.target.value })} required minLength={8} className="admin-input" data-testid="admin-create-pw" />
                </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} className="admin-btn" data-testid="admin-create-submit">{busy ? "Creating…" : "Create admin"}</button>
                <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
        </form>
    );
}

function LoginHistoryDrawer({ userId, email, onClose }) {
    const [events, setEvents] = useState(null);
    useEffect(() => {
        adminApi.get(`/admin/admins/${userId}/login-history`)
            .then((r) => setEvents(r.data.events))
            .catch((e) => toast.error(extractMsg(e)));
    }, [userId]);
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", justifyContent: "flex-end" }} data-testid="login-history-drawer">
            <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "100%", background: "var(--admin-card)", padding: 24, overflowY: "auto", borderLeft: "1px solid var(--admin-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600 }}>Login history</h2>
                    <button onClick={onClose} className="admin-btn admin-btn-secondary">Close</button>
                </div>
                <p style={{ fontSize: 13, color: "var(--admin-muted)", marginBottom: 16 }}>{email} — last 30 days</p>
                {!events ? <p style={{ color: "var(--admin-muted)" }}>Loading…</p>
                    : events.length === 0 ? <p style={{ color: "var(--admin-muted)" }}>No login events.</p>
                    : (
                        <table className="admin-table">
                            <thead><tr><th>When</th><th>Action</th><th>IP</th><th>Result</th></tr></thead>
                            <tbody>{events.map((e, i) => (
                                <tr key={i}>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(e.ts)}</td>
                                    <td><code style={{ fontSize: 11 }}>{e.action}</code></td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{e.ip || "—"}</td>
                                    <td><Badge tone={e.result === "success" ? "active" : "suspended"}>{e.result || "success"}</Badge></td>
                                </tr>
                            ))}</tbody>
                        </table>
                    )}
            </div>
        </div>
    );
}
