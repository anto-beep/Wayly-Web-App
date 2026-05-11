import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { adminApi, useAdminAuth } from "./AdminAuthContext";

const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const extractMsg = (e, f = "Error") => { const d = e?.response?.data?.detail; if (typeof d === "string") return d; if (d?.message) return d.message; return f; };
const Badge = ({ children, tone = "info" }) => <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;
const priorityTone = (p) => p === "P1" ? "suspended" : p === "P2" ? "trial" : "muted";
const statusTone = (s) => ({ open: "info", in_progress: "trial", waiting_on_user: "muted", resolved: "active", closed: "muted" }[s] || "muted");

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

// ---------- Tickets list ----------

export function AdminTickets() {
    const { admin } = useAdminAuth();
    const nav = useNavigate();
    const [data, setData] = useState(null);
    const [report, setReport] = useState(null);
    const [status, setStatus] = useState("");
    const [priority, setPriority] = useState("");
    const [scope, setScope] = useState("all");
    const [page, setPage] = useState(1);
    const SIZE = 25;
    useEffect(() => {
        const params = { page, page_size: SIZE };
        if (status) params.status = status;
        if (priority) params.priority = priority;
        if (scope === "mine") params.mine = true;
        if (scope === "unassigned") params.unassigned = true;
        Promise.all([
            adminApi.get("/admin/tickets", { params }),
            adminApi.get("/admin/ticket-reports"),
        ]).then(([t, r]) => { setData(t.data); setReport(r.data); })
            .catch((e) => toast.error(extractMsg(e)));
    }, [status, priority, scope, page]);
    return (
        <div data-testid="admin-tickets">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 16 }}>Support Tickets {data && <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data.total})</span>}</h1>
            {report && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
                    <div className="admin-stat"><div className="admin-stat-label">Open P1</div><div className="admin-stat-value" style={{ color: report.open_p1 > 0 ? "var(--admin-critical)" : "inherit" }}>{report.open_p1}</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Open</div><div className="admin-stat-value">{(report.counts_by_status?.open || 0) + (report.counts_by_status?.in_progress || 0)}</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Opened (7d)</div><div className="admin-stat-value">{report.opened_7d}</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Resolved (7d)</div><div className="admin-stat-value admin-stat-up">{report.resolved_7d}</div></div>
                </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="admin-input" style={{ width: 160 }}>
                    <option value="">All statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="waiting_on_user">Waiting on user</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                </select>
                <select value={priority} onChange={(e) => { setPage(1); setPriority(e.target.value); }} className="admin-input" style={{ width: 140 }}>
                    <option value="">All priorities</option>
                    <option value="P1">P1 Critical</option>
                    <option value="P2">P2 High</option>
                    <option value="P3">P3 Normal</option>
                </select>
                <select value={scope} onChange={(e) => { setPage(1); setScope(e.target.value); }} className="admin-input" style={{ width: 160 }}>
                    <option value="all">All</option>
                    <option value="mine">Assigned to me</option>
                    <option value="unassigned">Unassigned</option>
                </select>
                <Link to="/admin/macros" className="admin-btn admin-btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Manage macros</Link>
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Subject</th><th>User</th><th>Priority</th><th>Status</th><th>Category</th><th>Last activity</th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No tickets match.</td></tr>
                            : data.rows.map((t) => (
                                <tr key={t.id} onClick={() => nav(`/admin/tickets/${t.id}`)} style={{ cursor: "pointer" }} data-testid={`ticket-row-${t.id}`}>
                                    <td style={{ maxWidth: 360 }}>{t.subject}</td>
                                    <td>{t.user_email}</td>
                                    <td><Badge tone={priorityTone(t.priority)}>{t.priority}</Badge></td>
                                    <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                                    <td style={{ fontSize: 12, color: "var(--admin-muted)" }}>{t.category}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(t.last_message_at)}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} pageSize={SIZE} total={data?.total} onPage={setPage} />
        </div>
    );
}

// ---------- Single ticket ----------

export function AdminTicketDetail() {
    const { ticketId } = useParams();
    const { admin } = useAdminAuth();
    const [data, setData] = useState(null);
    const [macros, setMacros] = useState([]);
    const [replyBody, setReplyBody] = useState("");
    const [isInternal, setIsInternal] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [t, m] = await Promise.all([
                adminApi.get(`/admin/tickets/${ticketId}`),
                adminApi.get("/admin/macros"),
            ]);
            setData(t.data); setMacros(m.data.macros);
        } catch (e) { toast.error(extractMsg(e)); }
    }, [ticketId]);
    useEffect(() => { load(); }, [load]);

    const send = async (e) => {
        e.preventDefault();
        if (!replyBody.trim() || busy) return;
        setBusy(true);
        try {
            await adminApi.post(`/admin/tickets/${ticketId}/messages`, { body: replyBody, is_internal_note: isInternal });
            toast.success(isInternal ? "Internal note added" : "Reply sent");
            setReplyBody(""); setIsInternal(false);
            await load();
        } catch (err) { toast.error(extractMsg(err)); }
        finally { setBusy(false); }
    };

    const updateField = async (field, value) => {
        try { await adminApi.put(`/admin/tickets/${ticketId}`, { [field]: value }); toast.success("Updated"); await load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };

    if (!data) return <p style={{ color: "var(--admin-muted)" }}>Loading…</p>;
    const t = data.ticket;
    return (
        <div data-testid="admin-ticket-detail">
            <Link to="/admin/tickets" style={{ color: "var(--admin-info)", fontSize: 12 }}>← Back to tickets</Link>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginTop: 8, marginBottom: 16 }}>{t.subject}</h1>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 16 }}>
                {/* LEFT — thread + composer */}
                <div>
                    <div className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="ticket-thread">
                        {data.messages.map((m) => (
                            <div key={m.id} style={{
                                padding: 12, marginBottom: 12, borderRadius: 6,
                                background: m.is_internal_note ? "rgba(246,173,85,0.1)" : m.author_type === "admin" ? "var(--admin-card-alt)" : "var(--admin-bg)",
                                borderLeft: `3px solid ${m.is_internal_note ? "var(--admin-warning)" : m.author_type === "admin" ? "var(--admin-info)" : "var(--admin-muted)"}`,
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6, color: "var(--admin-muted)" }}>
                                    <span><strong style={{ color: "var(--admin-text)" }}>{m.author_email}</strong> {m.is_internal_note && <span style={{ color: "var(--admin-warning)" }}>(internal note)</span>}</span>
                                    <span className="admin-mono">{fmtDate(m.ts)}</span>
                                </div>
                                <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{m.body}</div>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={send} className="admin-card" style={{ padding: 16 }} data-testid="ticket-reply-form">
                        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                            <select onChange={(e) => { if (e.target.value) setReplyBody(macros.find((m) => m.id === e.target.value)?.body || ""); }}
                                className="admin-input" style={{ width: 200, fontSize: 12 }} data-testid="ticket-macro-select">
                                <option value="">Insert macro…</option>
                                {macros.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            <label style={{ fontSize: 12, color: "var(--admin-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} data-testid="ticket-internal-checkbox" />
                                Internal note (not sent to user)
                            </label>
                        </div>
                        <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)}
                            placeholder="Type your reply…" rows={6} className="admin-input" data-testid="ticket-reply-body" />
                        <button type="submit" disabled={busy || !replyBody.trim()} className="admin-btn" style={{ marginTop: 8 }} data-testid="ticket-reply-submit">
                            {busy ? "Sending…" : isInternal ? "Add note" : "Send reply"}
                        </button>
                    </form>
                </div>

                {/* RIGHT — metadata */}
                <div>
                    <div className="admin-card" style={{ padding: 14 }} data-testid="ticket-meta">
                        <div style={{ fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase", marginBottom: 6 }}>User</div>
                        <Link to={`/admin/users/${t.user_id}`} style={{ color: "var(--admin-info)", fontSize: 13, display: "block" }}>{t.user_email}</Link>
                        <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{t.user_name}</div>
                        <div style={{ marginTop: 14, fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase" }}>Priority</div>
                        <select value={t.priority} onChange={(e) => updateField("priority", e.target.value)} className="admin-input" style={{ marginTop: 4, fontSize: 12 }} data-testid="ticket-priority-select">
                            <option value="P1">P1 Critical</option><option value="P2">P2 High</option><option value="P3">P3 Normal</option>
                        </select>
                        <div style={{ marginTop: 14, fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase" }}>Status</div>
                        <select value={t.status} onChange={(e) => updateField("status", e.target.value)} className="admin-input" style={{ marginTop: 4, fontSize: 12 }} data-testid="ticket-status-select">
                            <option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_on_user">Waiting on user</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                        </select>
                        <div style={{ marginTop: 14, fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase" }}>Assignment</div>
                        <button onClick={() => updateField("assigned_admin_id", admin.id)} className="admin-btn admin-btn-secondary" style={{ marginTop: 4, fontSize: 12, width: "100%" }} data-testid="ticket-assign-me">
                            {t.assigned_admin_id === admin.id ? "Assigned to you" : "Assign to me"}
                        </button>
                        <div style={{ marginTop: 14, fontSize: 11 }}>
                            <Row k="Created" v={fmtDate(t.created_at)} />
                            <Row k="Resolved" v={fmtDate(t.resolved_at)} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Row({ k, v }) { return <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><dt style={{ color: "var(--admin-muted)" }}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>; }

// ---------- Macros management ----------

export function AdminMacros() {
    const [macros, setMacros] = useState([]);
    const [name, setName] = useState("");
    const [body, setBody] = useState("");
    const [editing, setEditing] = useState(null);
    const load = useCallback(async () => {
        const r = await adminApi.get("/admin/macros");
        setMacros(r.data.macros);
    }, []);
    useEffect(() => { load(); }, [load]);
    const save = async (e) => {
        e.preventDefault();
        try {
            if (editing) await adminApi.put(`/admin/macros/${editing}`, { name, body });
            else await adminApi.post("/admin/macros", { name, body });
            toast.success(editing ? "Updated" : "Created");
            setName(""); setBody(""); setEditing(null); await load();
        } catch (e) { toast.error(extractMsg(e)); }
    };
    return (
        <div data-testid="admin-macros">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 16 }}>Reply Macros</h1>
            <form onSubmit={save} className="admin-card" style={{ padding: 16, marginBottom: 16 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Macro name (e.g. 'Refund processed')" required className="admin-input" style={{ marginBottom: 8 }} />
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Macro body (will be inserted into ticket reply)" rows={5} required className="admin-input" />
                <button type="submit" className="admin-btn" style={{ marginTop: 8 }}>{editing ? "Update macro" : "Add macro"}</button>
                {editing && <button type="button" onClick={() => { setEditing(null); setName(""); setBody(""); }} className="admin-btn admin-btn-secondary" style={{ marginTop: 8, marginLeft: 8 }}>Cancel</button>}
            </form>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Name</th><th>Body</th><th></th></tr></thead>
                    <tbody>{macros.length === 0 ? <tr><td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No macros yet.</td></tr> : macros.map((m) => (
                        <tr key={m.id}>
                            <td>{m.name}</td>
                            <td style={{ maxWidth: 480, fontSize: 12, color: "var(--admin-muted)", whiteSpace: "pre-wrap" }}>{m.body.slice(0, 200)}{m.body.length > 200 ? "…" : ""}</td>
                            <td style={{ textAlign: "right" }}>
                                <button onClick={() => { setEditing(m.id); setName(m.name); setBody(m.body); }} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }}>Edit</button>
                                <button onClick={async () => { if (!window.confirm("Delete macro?")) return; await adminApi.delete(`/admin/macros/${m.id}`); toast.success("Deleted"); await load(); }} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }}>Delete</button>
                            </td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
        </div>
    );
}

// ---------- Campaigns ----------

const AUDIENCE_TYPES = [
    { key: "all", label: "All users" },
    { key: "plan", label: "By plan" },
    { key: "trial_expiring", label: "Trial expiring soon" },
    { key: "churned", label: "Churned in last 90d" },
    { key: "never_decoded", label: "Never decoded a statement" },
];

export function AdminCampaigns() {
    const [campaigns, setCampaigns] = useState([]);
    const [creating, setCreating] = useState(false);
    const load = useCallback(async () => {
        const r = await adminApi.get("/admin/campaigns");
        setCampaigns(r.data.campaigns);
    }, []);
    useEffect(() => { load(); }, [load]);

    return (
        <div data-testid="admin-campaigns">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Email Campaigns</h1>
                <button onClick={() => setCreating(true)} className="admin-btn" data-testid="new-campaign-btn">+ New campaign</button>
            </div>
            {creating && <CampaignBuilder onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Name</th><th>Audience</th><th>Status</th><th style={{ textAlign: "right" }}>Recipients</th><th style={{ textAlign: "right" }}>Sent</th><th>Created</th><th></th></tr></thead>
                    <tbody>
                        {campaigns.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No campaigns yet.</td></tr>
                            : campaigns.map((c) => (
                                <tr key={c.id}>
                                    <td><strong>{c.name}</strong><div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{c.subject}</div></td>
                                    <td style={{ fontSize: 12, color: "var(--admin-muted)" }}>{c.audience?.type || "all"}</td>
                                    <td><Badge tone={c.status === "sent" ? "active" : c.status === "sending" ? "trial" : "muted"}>{c.status}</Badge></td>
                                    <td style={{ textAlign: "right" }}>{c.recipients}</td>
                                    <td style={{ textAlign: "right" }}>{c.sent_count}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(c.created_at)}</td>
                                    <td style={{ textAlign: "right" }}>
                                        {c.status === "draft" && (
                                            <button onClick={async () => {
                                                if (!window.confirm(`Send "${c.name}" to your audience?`)) return;
                                                try { await adminApi.post(`/admin/campaigns/${c.id}/send`); toast.success("Campaign sent"); load(); }
                                                catch (e) { toast.error(extractMsg(e)); }
                                            }} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }} data-testid={`send-campaign-${c.id}`}>Send</button>
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

function CampaignBuilder({ onClose, onCreated }) {
    const [step, setStep] = useState(1);
    const [name, setName] = useState("");
    const [audienceType, setAudienceType] = useState("all");
    const [audiencePlans, setAudiencePlans] = useState(["solo", "family"]);
    const [audienceTrialDays, setAudienceTrialDays] = useState(3);
    const [subject, setSubject] = useState("");
    const [html, setHtml] = useState("<p>Hi {{first_name}},</p>\n<p>…your message…</p>\n<p>— The Wayly team</p>");
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);

    const audience = (() => {
        if (audienceType === "plan") return { type: "plan", plans: audiencePlans };
        if (audienceType === "trial_expiring") return { type: "trial_expiring", days_remaining: audienceTrialDays };
        if (audienceType === "churned") return { type: "churned", days_since: 90 };
        return { type: audienceType };
    })();

    const runPreview = async () => {
        try { const r = await adminApi.post("/admin/campaigns/preview-audience", { audience }); setPreview(r.data); }
        catch (e) { toast.error(extractMsg(e)); }
    };

    const submit = async () => {
        setBusy(true);
        try {
            await adminApi.post("/admin/campaigns", { name, audience, subject, html_body: html });
            toast.success("Campaign saved as draft");
            onCreated();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };

    return (
        <div className="admin-card" style={{ padding: 20, marginBottom: 16 }} data-testid="campaign-builder">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>New campaign — Step {step} of 3</h2>
                <button onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
            {step === 1 && (
                <>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Campaign name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="admin-input" style={{ marginBottom: 16 }} data-testid="campaign-name" />
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Audience</label>
                    <select value={audienceType} onChange={(e) => setAudienceType(e.target.value)} className="admin-input" data-testid="campaign-audience">
                        {AUDIENCE_TYPES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                    </select>
                    {audienceType === "plan" && (
                        <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {["free", "solo", "family"].map((p) => (
                                <label key={p} style={{ fontSize: 12, color: "var(--admin-muted)", display: "flex", gap: 4 }}>
                                    <input type="checkbox" checked={audiencePlans.includes(p)} onChange={(e) => setAudiencePlans(e.target.checked ? [...audiencePlans, p] : audiencePlans.filter((x) => x !== p))} />
                                    {p}
                                </label>
                            ))}
                        </div>
                    )}
                    {audienceType === "trial_expiring" && (
                        <div style={{ marginTop: 12, fontSize: 12 }}>
                            Days remaining ≤ <input type="number" min={1} max={30} value={audienceTrialDays} onChange={(e) => setAudienceTrialDays(parseInt(e.target.value, 10))} className="admin-input" style={{ width: 80, display: "inline-block" }} />
                        </div>
                    )}
                    <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                        <button onClick={runPreview} className="admin-btn admin-btn-secondary" data-testid="campaign-preview-btn">Preview audience</button>
                        {preview && <span style={{ color: "var(--admin-success)", fontSize: 13, padding: "8px 0" }}>{preview.count} recipients</span>}
                    </div>
                    <button onClick={() => setStep(2)} disabled={!name} className="admin-btn" style={{ marginTop: 16 }} data-testid="campaign-next-1">Next →</button>
                </>
            )}
            {step === 2 && (
                <>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Subject</label>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} className="admin-input" style={{ marginBottom: 16 }} data-testid="campaign-subject" />
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>HTML body (use <code>{"{{first_name}}"}</code> for personalisation)</label>
                    <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={12} className="admin-input admin-mono" style={{ fontSize: 12 }} data-testid="campaign-html" />
                    <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                        <button onClick={() => setStep(1)} className="admin-btn admin-btn-secondary">← Back</button>
                        <button onClick={() => setStep(3)} disabled={!subject || !html} className="admin-btn" data-testid="campaign-next-2">Next →</button>
                    </div>
                </>
            )}
            {step === 3 && (
                <>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Preview</h3>
                    <div className="admin-card" style={{ padding: 16, background: "white", color: "#1A1A1A" }}>
                        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Subject: <strong>{subject}</strong></div>
                        <div dangerouslySetInnerHTML={{ __html: html.replace("{{first_name}}", "Sarah") }} />
                    </div>
                    <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                        <button onClick={() => setStep(2)} className="admin-btn admin-btn-secondary">← Back</button>
                        <button onClick={submit} disabled={busy} className="admin-btn" data-testid="campaign-save-draft">{busy ? "Saving…" : "Save as draft"}</button>
                    </div>
                </>
            )}
        </div>
    );
}

// ---------- Email templates ----------

export function AdminEmailTemplates() {
    const [data, setData] = useState(null);
    useEffect(() => { adminApi.get("/admin/email-templates").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e))); }, []);
    if (!data) return <p style={{ color: "var(--admin-muted)" }}>Loading…</p>;
    return (
        <div data-testid="admin-email-templates">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 16 }}>Email Templates</h1>
            <div className="admin-card" style={{ padding: 12, marginBottom: 16, fontSize: 12, background: "rgba(99,179,237,0.1)", border: "1px solid var(--admin-info)", borderRadius: 6 }}>
                System templates are wired in app code and currently read-only. Edit-in-place + version history lands in a future iteration.
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Template</th><th>Type</th><th>Source</th></tr></thead>
                    <tbody>
                        {data.system.map((t) => (
                            <tr key={t.id}><td>{t.name}</td><td><Badge tone="muted">{t.type}</Badge></td><td><Badge tone="info">system</Badge></td></tr>
                        ))}
                        {data.custom.map((t) => (
                            <tr key={t.id}><td>{t.name}</td><td><Badge tone="muted">{t.type}</Badge></td><td><Badge tone="active">custom</Badge></td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------- Notification log ----------

export function AdminNotificationLog() {
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const SIZE = 30;
    useEffect(() => { adminApi.get("/admin/notification-log", { params: { page, page_size: SIZE } }).then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e))); }, [page]);
    return (
        <div data-testid="admin-notification-log">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 16 }}>Notification Log {data && <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data.total})</span>}</h1>
            {data?.last_hour && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
                    <div className="admin-stat"><div className="admin-stat-label">Sent (1h)</div><div className="admin-stat-value admin-stat-up">{data.last_hour.sent}</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Failed (1h)</div><div className="admin-stat-value" style={{ color: data.last_hour.failed > 0 ? "var(--admin-critical)" : "inherit" }}>{data.last_hour.failed}</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Failure rate</div><div className="admin-stat-value" style={{ color: (data.last_hour.failure_rate_pct || 0) > 5 ? "var(--admin-critical)" : "var(--admin-success)" }}>{data.last_hour.failure_rate_pct != null ? `${data.last_hour.failure_rate_pct}%` : "—"}</div></div>
                </div>
            )}
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>When</th><th>Type</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No notifications logged yet.</td></tr>
                            : data.rows.map((r) => (
                                <tr key={r.id}>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(r.ts)}</td>
                                    <td><Badge tone="muted">{r.type}</Badge></td>
                                    <td>{r.to_email}</td>
                                    <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subject}</td>
                                    <td><Badge tone={r.status === "sent" ? "active" : "suspended"}>{r.status}</Badge></td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} pageSize={SIZE} total={data?.total} onPage={setPage} />
        </div>
    );
}

// ---------- Newsletter subscribers ----------

export function AdminSubscribers() {
    const [data, setData] = useState(null);
    useEffect(() => { adminApi.get("/admin/newsletter-subscribers").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e))); }, []);
    return (
        <div data-testid="admin-subscribers">
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 16 }}>Newsletter Subscribers {data && <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data.total})</span>}</h1>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Email</th><th>Subscribed</th><th>Source</th><th>Status</th></tr></thead>
                    <tbody>
                        {!data || data.rows.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No subscribers yet.</td></tr>
                            : data.rows.map((r) => (
                                <tr key={r.email}>
                                    <td>{r.email}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(r.subscribed_at)}</td>
                                    <td style={{ fontSize: 12, color: "var(--admin-muted)" }}>{r.source || "—"}</td>
                                    <td><Badge tone={r.status === "active" ? "active" : "muted"}>{r.status || "active"}</Badge></td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
