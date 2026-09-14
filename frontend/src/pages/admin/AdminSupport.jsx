import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { adminApi } from "./AdminAuthContext";
import {
    Loader2, ArrowLeft, FileText, ShieldAlert, MessageSquare, Lock,
    Search, Filter, X, Check, ChevronDown, Users, Tag, AlertTriangle,
    Download, PlusCircle, Zap, Clock, UserCheck, RefreshCcw, ListChecks,
    Copy, MoreHorizontal, Flag, Archive, Paperclip,
} from "lucide-react";

const STATUS_LABEL = {
    received: "Received",
    under_review: "Under Review",
    awaiting_user: "Awaiting User",
    resolved: "Resolved",
    closed: "Closed",
};

const STATUS_ORDER = ["received", "under_review", "awaiting_user", "resolved", "closed"];

const PRIORITY_LABEL = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const PRIORITY_TONE = {
    low: { bg: "#F4F1EA", fg: "#0E4D52", border: "#E5DCC9" },
    normal: { bg: "#EAF2F1", fg: "#0E4D52", border: "#B9D3D0" },
    high: { bg: "#F5E9DA", fg: "#a5512b", border: "#E5C69C" },
    urgent: { bg: "#F9DDD1", fg: "#8f2f0f", border: "#E5A48F" },
};

const CATEGORY_LABEL = {
    figure_incorrect: "Figure incorrect",
    rule_misapplied: "Rule misapplied",
    situation_not_captured: "Situation not captured",
    tool_misunderstood_input: "Tool misread input",
    other: "Other",
};

const EVENT_LABEL = {
    created: "Ticket created",
    consent_recorded: "Consent recorded",
    triaged: "AI triage recorded",
    status_changed: "Status changed",
    priority_changed: "Priority changed",
    assignee_changed: "Assignee changed",
    tag_added: "Tag added",
    tag_removed: "Tag removed",
    edited_by_user: "User edited report",
    closed_by_user: "User closed ticket",
    reopened_by_user: "User reopened ticket",
    linked_to_defect: "Linked to defect",
    csat_received: "CSAT received",
    attachment_added: "Attachment added",
    attachment_purged: "Attachment purged",
};

const fmt = (iso) => {
    if (!iso) return ",";
    try { return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
};

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (d?.message) return d.message;
    return f;
};

const ageDays = (iso) => {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
};

const ageTone = (days) => {
    if (days < 3) return { fg: "#0E4D52", bg: "rgba(107, 143, 113, 0.15)" };
    if (days < 7) return { fg: "#a5512b", bg: "rgba(194, 104, 61, 0.15)" };
    return { fg: "#fff", bg: "#a5512b" };
};

const TOOLS = [
    "Statement Decoder", "Budget Calculator", "Provider Price Checker",
    "Classification Self-Check", "Letters & Follow-ups", "Contribution Estimator",
    "Support Plan Reviewer", "Family Coordinator", "General Support",
];

function PriorityPill({ priority }) {
    const t = PRIORITY_TONE[priority] || PRIORITY_TONE.normal;
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: t.bg, color: t.fg, borderColor: t.border }}
            data-testid={`priority-pill-${priority}`}
        >
            <Flag size={10} />
            {PRIORITY_LABEL[priority] || priority}
        </span>
    );
}

// ============================================================================
// LIST VIEW
// ============================================================================
export function AdminSupport() {
    const nav = useNavigate();
    const [data, setData] = useState(null);
    const [stats, setStats] = useState(null);
    const [admins, setAdmins] = useState([]);
    const [filters, setFilters] = useState({
        status: "open", tool: "", category: "", has_statement: "",
        priority: "", assignee: "", tag: "", has_defect: "",
        q: "", sort: "smart",
    });
    const [selected, setSelected] = useState(new Set());
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkAction, setBulkAction] = useState("");
    const [bulkValue, setBulkValue] = useState("");
    const [exporting, setExporting] = useState(false);

    const load = useCallback(() => {
        const params = {};
        Object.entries(filters).forEach(([k, v]) => {
            if (v === "" || v === null || v === undefined) return;
            if (k === "has_statement" || k === "has_defect") {
                if (v === "true") params[k] = true;
                else if (v === "false") params[k] = false;
                return;
            }
            params[k] = v;
        });
        adminApi.get("/admin/support/tickets", { params })
            .then((r) => { setData(r.data); setSelected(new Set()); })
            .catch((e) => toast.error(extractMsg(e, "Could not load tickets")));
    }, [filters]);

    const loadStats = useCallback(() => {
        adminApi.get("/admin/support/stats")
            .then((r) => setStats(r.data))
            .catch(() => {});
    }, []);

    const loadAdmins = useCallback(() => {
        adminApi.get("/admin/support/admins")
            .then((r) => setAdmins(r.data?.admins || []))
            .catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadStats(); loadAdmins(); }, [loadStats, loadAdmins]);

    const toggleSel = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAll = () => {
        if (!data?.tickets) return;
        if (selected.size === data.tickets.length) setSelected(new Set());
        else setSelected(new Set(data.tickets.map((t) => t.id)));
    };

    const runBulk = async () => {
        if (!selected.size || !bulkAction) return;
        try {
            const r = await adminApi.post("/admin/support/tickets/bulk", {
                ticket_ids: Array.from(selected),
                action: bulkAction,
                value: bulkValue,
            });
            toast.success(`Applied to ${r.data?.applied || 0} ticket(s).`);
            setBulkOpen(false);
            setBulkAction("");
            setBulkValue("");
            load();
            loadStats();
        } catch (e) {
            toast.error(extractMsg(e));
        }
    };

    const exportCsv = async () => {
        setExporting(true);
        try {
            const r = await adminApi.get("/admin/support/export", { responseType: "blob" });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement("a");
            a.href = url;
            a.download = `wayly-support-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(extractMsg(e, "Export failed"));
        } finally { setExporting(false); }
    };

    const activeFilters = useMemo(() => {
        const chips = [];
        if (filters.status && filters.status !== "any") chips.push({ k: "status", v: filters.status, label: `Status: ${filters.status === "open" ? "Open" : STATUS_LABEL[filters.status] || filters.status}` });
        if (filters.tool) chips.push({ k: "tool", v: filters.tool, label: `Tool: ${filters.tool}` });
        if (filters.category) chips.push({ k: "category", v: filters.category, label: `Category: ${CATEGORY_LABEL[filters.category]}` });
        if (filters.priority) chips.push({ k: "priority", v: filters.priority, label: `Priority: ${PRIORITY_LABEL[filters.priority]}` });
        if (filters.assignee) {
            const label = filters.assignee === "me" ? "Me" : filters.assignee === "unassigned" ? "Unassigned" : (admins.find((a) => a.id === filters.assignee)?.name || filters.assignee);
            chips.push({ k: "assignee", v: filters.assignee, label: `Assignee: ${label}` });
        }
        if (filters.tag) chips.push({ k: "tag", v: filters.tag, label: `Tag: ${filters.tag}` });
        if (filters.has_statement) chips.push({ k: "has_statement", v: filters.has_statement, label: filters.has_statement === "true" ? "Has statement" : "No statement" });
        if (filters.has_defect) chips.push({ k: "has_defect", v: filters.has_defect, label: filters.has_defect === "true" ? "Has defect" : "No defect" });
        return chips;
    }, [filters, admins]);

    const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
    const removeChip = (k) => setFilters((f) => ({ ...f, [k]: "" }));

    return (
        <div data-testid="admin-support">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Support Tickets</h1>
                    <p style={{ fontSize: 13, color: "var(--admin-muted)" }}>Zendesk-style triage · filters, priority, assignee, bulk actions.</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={exportCsv} disabled={exporting} className="admin-btn admin-btn-secondary" data-testid="admin-support-export">
                        {exporting ? <Loader2 className="admin-spin" size={13} /> : <Download size={13} />} CSV Export
                    </button>
                    <Link to="/admin/support/macros" className="admin-btn admin-btn-secondary" data-testid="admin-support-macros-link">
                        <Zap size={13} /> Macros
                    </Link>
                    <Link to="/admin/support/defects" className="admin-btn admin-btn-secondary" data-testid="admin-support-defects-link">
                        Defects
                    </Link>
                </div>
            </div>

            {/* Stats strip */}
            {stats && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }} data-testid="admin-support-stats">
                    <StatTile label="Open" value={stats.open_total} testid="admin-stat-open" onClick={() => setFilter("status", "open")} />
                    <StatTile label="Unassigned" value={stats.unassigned} tone="warn" testid="admin-stat-unassigned" onClick={() => setFilter("assignee", "unassigned")} />
                    <StatTile label="Assigned to me" value={stats.mine} tone="primary" testid="admin-stat-mine" onClick={() => setFilter("assignee", "me")} />
                    <StatTile label="SLA breached" value={stats.sla_breached} tone={stats.sla_breached > 0 ? "danger" : "muted"} testid="admin-stat-sla" />
                    <StatTile label="Urgent + High" value={(stats.by_priority?.urgent || 0) + (stats.by_priority?.high || 0)} tone="warn" testid="admin-stat-urgent" onClick={() => setFilter("priority", "urgent")} />
                    <StatTile label="Avg CSAT (90d)" value={stats.avg_csat ? `${stats.avg_csat.avg}/5` : ","} tone="sage" testid="admin-stat-csat" />
                </div>
            )}

            {/* Search + filter row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <div style={{ position: "relative", minWidth: 260, flex: 1 }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--admin-muted)" }} />
                    <input
                        className="admin-input"
                        placeholder="Search reference, user email, note, tool…"
                        value={filters.q}
                        onChange={(e) => setFilter("q", e.target.value)}
                        style={{ width: "100%", paddingLeft: 32 }}
                        data-testid="admin-support-search"
                    />
                </div>
                <select className="admin-input" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} data-testid="admin-support-filter-status">
                    <option value="any">Any status</option>
                    <option value="open">Open</option>
                    {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                </select>
                <select className="admin-input" value={filters.priority} onChange={(e) => setFilter("priority", e.target.value)} data-testid="admin-support-filter-priority">
                    <option value="">Any priority</option>
                    {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="admin-input" value={filters.assignee} onChange={(e) => setFilter("assignee", e.target.value)} data-testid="admin-support-filter-assignee">
                    <option value="">Any assignee</option>
                    <option value="me">Assigned to me</option>
                    <option value="unassigned">Unassigned</option>
                    {admins.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                </select>
                <select className="admin-input" value={filters.tool} onChange={(e) => setFilter("tool", e.target.value)} data-testid="admin-support-filter-tool">
                    <option value="">Any tool</option>
                    {TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="admin-input" value={filters.category} onChange={(e) => setFilter("category", e.target.value)} data-testid="admin-support-filter-category">
                    <option value="">Any category</option>
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="admin-input" value={filters.has_statement} onChange={(e) => setFilter("has_statement", e.target.value)} data-testid="admin-support-filter-stmt">
                    <option value="">Statement: any</option>
                    <option value="true">Has statement</option>
                    <option value="false">No statement</option>
                </select>
                <select className="admin-input" value={filters.has_defect} onChange={(e) => setFilter("has_defect", e.target.value)} data-testid="admin-support-filter-defect">
                    <option value="">Defect: any</option>
                    <option value="true">Linked</option>
                    <option value="false">Not linked</option>
                </select>
                <select className="admin-input" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)} data-testid="admin-support-sort">
                    <option value="smart">Smart (urgent + oldest open)</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="activity">Last activity</option>
                    <option value="priority">Priority</option>
                </select>
            </div>

            {activeFilters.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }} data-testid="admin-support-active-filters">
                    {activeFilters.map((chip) => (
                        <span key={chip.k} className="admin-badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {chip.label}
                            <button onClick={() => removeChip(chip.k)} style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0, color: "inherit" }}>
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                    <button
                        onClick={() => setFilters({ status: "any", tool: "", category: "", has_statement: "", priority: "", assignee: "", tag: "", has_defect: "", q: "", sort: "smart" })}
                        className="admin-btn admin-btn-secondary"
                        style={{ fontSize: 11, padding: "3px 8px" }}
                        data-testid="admin-support-clear-filters"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* Bulk actions bar */}
            {selected.size > 0 && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    padding: "10px 14px", marginBottom: 12,
                    background: "#F4F1EA", border: "1px solid #E5DCC9", borderRadius: 8,
                }} data-testid="admin-support-bulk-bar">
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#0E4D52" }}>
                        {selected.size} selected
                    </span>
                    <select value={bulkAction} onChange={(e) => { setBulkAction(e.target.value); setBulkValue(""); }} className="admin-input" style={{ fontSize: 12 }} data-testid="admin-support-bulk-action">
                        <option value="">Choose action…</option>
                        <option value="set_priority">Set priority</option>
                        <option value="set_assignee">Assign to</option>
                        <option value="set_status">Change status</option>
                        <option value="add_tag">Add tag</option>
                        <option value="remove_tag">Remove tag</option>
                    </select>
                    {bulkAction === "set_priority" && (
                        <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="admin-input" style={{ fontSize: 12 }} data-testid="admin-support-bulk-priority">
                            <option value="">Choose priority…</option>
                            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    )}
                    {bulkAction === "set_assignee" && (
                        <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="admin-input" style={{ fontSize: 12 }} data-testid="admin-support-bulk-assignee">
                            <option value="">Unassign</option>
                            {admins.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                        </select>
                    )}
                    {bulkAction === "set_status" && (
                        <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="admin-input" style={{ fontSize: 12 }} data-testid="admin-support-bulk-status">
                            <option value="">Choose status…</option>
                            {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                        </select>
                    )}
                    {(bulkAction === "add_tag" || bulkAction === "remove_tag") && (
                        <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="tag name" className="admin-input" style={{ fontSize: 12, width: 140 }} data-testid="admin-support-bulk-tag" />
                    )}
                    <button
                        onClick={runBulk}
                        disabled={!bulkAction || (bulkAction !== "set_assignee" && !bulkValue)}
                        className="admin-btn"
                        style={{ fontSize: 12 }}
                        data-testid="admin-support-bulk-apply"
                    >
                        Apply
                    </button>
                    <button onClick={() => setSelected(new Set())} className="admin-btn admin-btn-secondary" style={{ fontSize: 12 }} data-testid="admin-support-bulk-clear">
                        Clear
                    </button>
                </div>
            )}

            {/* Table */}
            {!data ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--admin-muted)" }}>
                    <Loader2 className="admin-spin" /> Loading…
                </div>
            ) : data.tickets.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--admin-muted)" }}>No tickets match your filters.</div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table className="admin-table" data-testid="admin-support-table">
                        <thead>
                            <tr>
                                <th style={{ width: 30 }}>
                                    <input type="checkbox"
                                        checked={selected.size > 0 && selected.size === data.tickets.length}
                                        onChange={toggleAll}
                                        data-testid="admin-support-select-all"
                                    />
                                </th>
                                <th>Reference</th>
                                <th>Priority</th>
                                <th>User</th>
                                <th>Tool / Category</th>
                                <th>Status</th>
                                <th>Assignee</th>
                                <th>Age</th>
                                <th>Msgs</th>
                                <th>Tags</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.tickets.map((t) => {
                                const age = ageDays(t.created_at);
                                const tone = ageTone(age);
                                return (
                                    <tr key={t.id} data-testid={`admin-support-row-${t.reference}`}>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(t.id)}
                                                onChange={() => toggleSel(t.id)}
                                                data-testid={`admin-support-select-${t.reference}`}
                                            />
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ fontFamily: "ui-monospace, monospace", cursor: "pointer" }}>
                                            {t.reference}
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ cursor: "pointer" }}>
                                            <PriorityPill priority={t.priority || "normal"} />
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ cursor: "pointer" }}>
                                            <div style={{ fontSize: 13 }}>{t.user_name || ","}</div>
                                            <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{t.user_email}</div>
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ cursor: "pointer" }}>
                                            <div style={{ fontSize: 13 }}>{t.tool_name}</div>
                                            <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{CATEGORY_LABEL[t.category] || t.category}</div>
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ cursor: "pointer" }}>
                                            <span className="admin-badge">{STATUS_LABEL[t.status]}</span>
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ cursor: "pointer", fontSize: 12 }}>
                                            {t.assignee_name || <em style={{ color: "var(--admin-muted)" }}>unassigned</em>}
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ cursor: "pointer" }}>
                                            <span style={{
                                                display: "inline-block", padding: "2px 8px", borderRadius: 999,
                                                fontSize: 11, fontWeight: 600, background: tone.bg, color: tone.fg,
                                            }}>{age}d</span>
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ cursor: "pointer", fontSize: 12 }}>
                                            {t.message_count || 0}
                                        </td>
                                        <td onClick={() => nav(`/admin/support/${t.id}`)} style={{ cursor: "pointer" }}>
                                            {(t.tags || []).length === 0 ? (
                                                <span style={{ color: "var(--admin-muted)", fontSize: 11 }}>,</span>
                                            ) : (
                                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                                    {t.tags.slice(0, 3).map((tg) => (
                                                        <span key={tg} className="admin-badge" style={{ fontSize: 10 }}>{tg}</span>
                                                    ))}
                                                    {t.tags.length > 3 && <span style={{ fontSize: 10, color: "var(--admin-muted)" }}>+{t.tags.length - 3}</span>}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function StatTile({ label, value, tone = "muted", onClick, testid }) {
    const tones = {
        muted: { bg: "#FBF8F3", fg: "#0E4D52", border: "#E5DCC9" },
        primary: { bg: "rgba(14,77,82,0.08)", fg: "#0E4D52", border: "rgba(14,77,82,0.25)" },
        sage: { bg: "rgba(107,143,113,0.10)", fg: "#0E4D52", border: "rgba(107,143,113,0.40)" },
        warn: { bg: "rgba(194,104,61,0.10)", fg: "#a5512b", border: "rgba(194,104,61,0.40)" },
        danger: { bg: "rgba(165,81,43,0.15)", fg: "#8f2f0f", border: "#a5512b" },
    };
    const t = tones[tone] || tones.muted;
    return (
        <div
            onClick={onClick}
            style={{
                padding: "10px 14px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8,
                cursor: onClick ? "pointer" : "default",
            }}
            data-testid={testid}
        >
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: t.fg, opacity: 0.75 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.fg, fontFamily: "Fraunces, serif" }}>{value}</div>
        </div>
    );
}

// ============================================================================
// DETAIL VIEW
// ============================================================================
export function AdminSupportDetail() {
    const { ticketId } = useParams();
    const nav = useNavigate();
    const [data, setData] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [macros, setMacros] = useState([]);
    const [reply, setReply] = useState("");
    const [internalNote, setInternalNote] = useState("");
    const [pendingFiles, setPendingFiles] = useState([]);
    const fileInputRef = useRef(null);
    const addFiles = (list) => {
        const MAX = 10 * 1024 * 1024;
        const ALLOWED = /\.(png|jpe?g|webp|pdf)$/i;
        const accepted = [];
        for (const f of Array.from(list || [])) {
            if (!ALLOWED.test(f.name) && !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(f.type)) continue;
            if (f.size > MAX) { toast.error(`${f.name} is over 10 MB`); continue; }
            accepted.push(f);
        }
        setPendingFiles((p) => [...p, ...accepted]);
    };
    const [resolution, setResolution] = useState("");
    const [newTag, setNewTag] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        adminApi.get(`/admin/support/tickets/${ticketId}`)
            .then((r) => setData(r.data))
            .catch((e) => toast.error(extractMsg(e, "Could not load ticket")));
        adminApi.get(`/admin/support/tickets/${ticketId}/timeline`)
            .then((r) => setTimeline(r.data?.timeline || []))
            .catch(() => {});
    }, [ticketId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        adminApi.get("/admin/support/admins").then((r) => setAdmins(r.data?.admins || [])).catch(() => {});
        adminApi.get("/admin/support/macros").then((r) => setMacros(r.data?.macros || [])).catch(() => {});
    }, []);

    const patch = async (body, successMsg) => {
        setBusy(true);
        try {
            await adminApi.patch(`/admin/support/tickets/${ticketId}`, body);
            if (successMsg) toast.success(successMsg);
            load();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };

    const sendReply = async () => {
        if (!reply.trim() && !pendingFiles.length) return;
        setBusy(true);
        try {
            if (reply.trim()) {
                await adminApi.post(`/admin/support/tickets/${ticketId}/reply`, { body: reply });
            }
            for (const f of pendingFiles) {
                const fd = new FormData();
                fd.append("file", f);
                await adminApi.post(`/admin/support/tickets/${ticketId}/attachments`, fd, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
            }
            setReply("");
            setPendingFiles([]);
            toast.success(reply.trim() ? "Reply sent and emailed." : "File uploaded.");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };

    const downloadAttachment = async (attId, filename) => {
        try {
            const r = await adminApi.get(
                `/admin/support/tickets/${ticketId}/attachments/${attId}/download`,
                { responseType: "blob" },
            );
            const url = URL.createObjectURL(r.data);
            window.open(url, "_blank", "noopener");
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (e) { toast.error(extractMsg(e, "Could not open attachment")); }
    };

    const addNote = async () => {
        if (!internalNote.trim()) return;
        setBusy(true);
        try {
            await adminApi.post(`/admin/support/tickets/${ticketId}/notes`, { body: internalNote });
            setInternalNote("");
            toast.success("Internal note saved.");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };

    const changeStatus = async (newStatus) => {
        setBusy(true);
        try {
            const payload = { status: newStatus };
            if (newStatus === "resolved" && resolution.trim()) payload.resolution_summary = resolution;
            await adminApi.post(`/admin/support/tickets/${ticketId}/status`, payload);
            setResolution("");
            toast.success(`Marked ${STATUS_LABEL[newStatus]}.`);
            load();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };

    const agreeTriage = async (agreed) => {
        try {
            await adminApi.post(`/admin/support/tickets/${ticketId}/triage/agree`, { human_agreed: agreed });
            toast.success("Triage feedback recorded.");
            load();
        } catch (e) { toast.error(extractMsg(e)); }
    };

    const addTag = async () => {
        const tg = newTag.trim().toLowerCase();
        if (!tg) return;
        await patch({ add_tags: [tg] }, `Tag "${tg}" added`);
        setNewTag("");
    };

    const removeTag = async (tg) => {
        await patch({ remove_tags: [tg] });
    };

    const applyMacro = (m) => {
        setReply(m.body);
        toast.success(`Macro "${m.title}" inserted. Review before sending.`);
    };

    if (!data) {
        return <div style={{ padding: 40, color: "var(--admin-muted)" }}><Loader2 className="admin-spin" /> Loading…</div>;
    }
    const { ticket, snapshot, attachments, triage, defect } = data;
    const age = ageDays(ticket.created_at);
    const ageT = ageTone(age);

    return (
        <div data-testid="admin-support-detail">
            <button onClick={() => nav("/admin/support")}
                className="admin-btn admin-btn-secondary"
                style={{ marginBottom: 16 }}
                data-testid="admin-support-back">
                <ArrowLeft size={14} /> Back to Tickets
            </button>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 24 }}>
                <div>
                    <header style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--admin-muted)" }}>{ticket.reference}</span>
                            <PriorityPill priority={ticket.priority || "normal"} />
                            <span className="admin-badge">{STATUS_LABEL[ticket.status]}</span>
                            <span style={{
                                display: "inline-block", padding: "2px 8px", borderRadius: 999,
                                fontSize: 11, fontWeight: 600, background: ageT.bg, color: ageT.fg,
                            }} data-testid="admin-support-age">
                                {age}d old
                            </span>
                        </div>
                        <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 8 }}>{ticket.tool_name || "Ticket"}</h1>
                        <div style={{ marginTop: 4, fontSize: 13, color: "var(--admin-muted)" }}>
                            From <strong>{ticket.user_name || ticket.user_email}</strong> · raised {fmt(ticket.created_at)}
                        </div>
                    </header>

                    {/* Snapshot */}
                    {snapshot && (
                        <section className="admin-card" style={{ marginBottom: 16 }} data-testid="admin-support-snapshot">
                            <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                                <FileText size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
                                Immutable Snapshot (what the user saw)
                            </h3>
                            <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>
                                Tool {snapshot.tool_name} · {snapshot.tool_version} · captured {fmt(snapshot.captured_at)}
                            </div>
                            <details style={{ marginTop: 10 }}>
                                <summary style={{ cursor: "pointer", fontSize: 13 }}>Tool Input</summary>
                                <pre style={{ background: "#0E1117", color: "#E6E8EC", padding: 12, borderRadius: 6, fontSize: 11, overflowX: "auto", marginTop: 8 }}>
                                    {JSON.stringify(snapshot.tool_input, null, 2)}
                                </pre>
                            </details>
                            <details style={{ marginTop: 8 }} open>
                                <summary style={{ cursor: "pointer", fontSize: 13 }}>Tool Output</summary>
                                <pre style={{ background: "#0E1117", color: "#E6E8EC", padding: 12, borderRadius: 6, fontSize: 11, overflowX: "auto", marginTop: 8 }}>
                                    {JSON.stringify(snapshot.tool_output, null, 2)}
                                </pre>
                            </details>
                        </section>
                    )}

                    {/* Structured intake */}
                    <section className="admin-card" style={{ marginBottom: 16 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                            User&apos;s Report
                        </h3>
                        <dl style={{ fontSize: 14, display: "grid", gridTemplateColumns: "180px 1fr", gap: 8 }}>
                            <dt style={{ color: "var(--admin-muted)" }}>Category</dt>
                            <dd>{CATEGORY_LABEL[ticket.category] || ticket.category}</dd>
                            <dt style={{ color: "var(--admin-muted)" }}>Claimed Answer</dt>
                            <dd>{ticket.user_claimed_answer || <em style={{ color: "var(--admin-muted)" }}>not provided</em>}</dd>
                            <dt style={{ color: "var(--admin-muted)" }}>Claimed Source</dt>
                            <dd>{ticket.user_claimed_source ? `${ticket.user_claimed_source.replace(/_/g, " ")}${ticket.user_claimed_source_detail ? `, ${ticket.user_claimed_source_detail}` : ""}` : <em style={{ color: "var(--admin-muted)" }}>not provided</em>}</dd>
                            <dt style={{ color: "var(--admin-muted)" }}>Note</dt>
                            <dd style={{ whiteSpace: "pre-wrap" }}>{ticket.user_note || <em style={{ color: "var(--admin-muted)" }}>not provided</em>}</dd>
                        </dl>
                        {attachments?.length > 0 && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--admin-border)" }}>
                                <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 6 }}>Attached ({attachments.length})</div>
                                {attachments.map((a) => (
                                    <div key={a.id} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }} data-testid={`admin-attachment-${a.id}`}>
                                        {a.type === "original_statement" ? <Lock size={12} /> : <FileText size={12} style={{ color: "#6B8F71" }} />}
                                        {a.purged_at ? (
                                            <span style={{ color: "var(--admin-muted)" }}>{a.filename || a.type} <span style={{ fontSize: 11 }}>(purged)</span></span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => downloadAttachment(a.id, a.filename)}
                                                style={{ background: "transparent", border: 0, cursor: "pointer", color: "#0E4D52", textDecoration: "underline", padding: 0 }}
                                                data-testid={`admin-attachment-open-${a.id}`}
                                            >
                                                {a.filename || a.type}
                                            </button>
                                        )}
                                        <span style={{ color: "var(--admin-muted)", fontSize: 11 }}>({a.type}{a.size_bytes ? `, ${Math.round(a.size_bytes / 1024)} KB` : ""}{a.uploaded_by_type ? `, by ${a.uploaded_by_type}` : ""})</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Triage */}
                    {triage && (
                        <section className="admin-card" style={{ marginBottom: 16, borderLeft: "3px solid #6B8F71" }} data-testid="admin-support-triage">
                            <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                                AI Triage Suggestion · {triage.prompt_version}
                            </h3>
                            <div style={{ fontSize: 13, marginBottom: 8 }}>
                                <strong>{triage.suggested_classification?.replace(/_/g, " ")}</strong>
                                {triage.suggested_severity && <span style={{ marginLeft: 8 }}>severity: {triage.suggested_severity}</span>}
                                <span style={{ marginLeft: 8, color: "var(--admin-muted)" }}>confidence {(triage.confidence * 100).toFixed(0)}%</span>
                            </div>
                            {triage.reasoning && <p style={{ fontSize: 13, marginBottom: 8 }}><strong>Reasoning:</strong> {triage.reasoning}</p>}
                            {triage.suggested_reply_draft && (
                                <div>
                                    <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 4 }}>Suggested reply draft (review before sending):</div>
                                    <button onClick={() => setReply(triage.suggested_reply_draft)} className="admin-btn admin-btn-secondary" style={{ fontSize: 12 }}>
                                        Use Draft as Reply
                                    </button>
                                    <pre style={{ marginTop: 8, padding: 10, background: "#F4F1EA", color: "#0E4D52", borderRadius: 6, whiteSpace: "pre-wrap", fontSize: 12 }}>{triage.suggested_reply_draft}</pre>
                                </div>
                            )}
                            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                                <button onClick={() => agreeTriage(true)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11 }} data-testid="admin-support-triage-agree">
                                    Agree
                                </button>
                                <button onClick={() => agreeTriage(false)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11 }} data-testid="admin-support-triage-disagree">
                                    Disagree
                                </button>
                                {triage.human_agreed !== null && triage.human_agreed !== undefined && (
                                    <span style={{ fontSize: 11, color: "var(--admin-muted)", alignSelf: "center" }}>
                                        recorded: {triage.human_agreed ? "agreed" : "disagreed"}
                                    </span>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Combined Timeline */}
                    <section style={{ marginBottom: 16 }} data-testid="admin-support-timeline">
                        <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                            Timeline
                        </h3>
                        {timeline.length === 0 ? (
                            <div className="admin-card" style={{ color: "var(--admin-muted)", fontSize: 13 }}>No activity yet.</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {timeline.map((row, idx) => row.kind === "message" ? (
                                    <div key={row.id || idx} className="admin-card" style={{
                                        borderLeft: row.visibility === "internal" ? "3px solid #C2683D" : "3px solid #0E4D52",
                                        background: row.visibility === "internal" ? "rgba(194,104,61,0.06)" : "white",
                                    }} data-testid={`admin-timeline-msg-${row.author_type}`}>
                                        <div style={{ fontSize: 11, color: "var(--admin-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                            <MessageSquare size={11} />
                                            <strong>{row.author_type}</strong>
                                            {row.visibility === "internal" && <span style={{ color: "#C2683D", textTransform: "uppercase", fontWeight: 700, fontSize: 10 }}>Internal Note</span>}
                                            <span>· {fmt(row.created_at)}</span>
                                        </div>
                                        <p style={{ whiteSpace: "pre-wrap", fontSize: 13, margin: 0 }}>{row.body}</p>
                                    </div>
                                ) : (
                                    <div key={idx} style={{
                                        display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                                        padding: "6px 12px", background: "#FBF8F3", borderRadius: 6,
                                        border: "1px dashed #E5DCC9", color: "#0E4D52",
                                    }} data-testid={`admin-timeline-event-${row.event_type}`}>
                                        <span style={{ fontWeight: 600 }}>{EVENT_LABEL[row.event_type] || row.event_type}</span>
                                        {row.metadata && Object.keys(row.metadata).length > 0 && (
                                            <span style={{ color: "var(--admin-muted)" }}>
                                                · {Object.entries(row.metadata).slice(0, 2).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")}
                                            </span>
                                        )}
                                        <span style={{ marginLeft: "auto", color: "var(--admin-muted)" }}>{fmt(row.created_at)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Reply */}
                    <section className="admin-card" style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Reply to user (public · emails them)</h3>
                            {macros.length > 0 && (
                                <select
                                    onChange={(e) => {
                                        const m = macros.find((x) => x.id === e.target.value);
                                        if (m) applyMacro(m);
                                        e.target.value = "";
                                    }}
                                    className="admin-input"
                                    style={{ fontSize: 11, padding: "4px 8px" }}
                                    data-testid="admin-support-macro-select"
                                    defaultValue=""
                                >
                                    <option value="">Insert macro…</option>
                                    {macros.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                                </select>
                            )}
                        </div>
                        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4}
                            className="admin-input" style={{ width: "100%", fontSize: 13 }}
                            placeholder="Your reply. Ends up in the user's My Support and inbox."
                            data-testid="admin-support-reply-input" />
                        {pendingFiles.length > 0 && (
                            <ul style={{ marginTop: 6, listStyle: "none", padding: 0 }} data-testid="admin-support-pending-files">
                                {pendingFiles.map((f, i) => (
                                    <li key={`${f.name}-${i}`} style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                        padding: "4px 8px", background: "#FBF8F3", border: "1px solid #E5DCC9",
                                        borderRadius: 6, marginTop: 4, fontSize: 12,
                                    }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <FileText size={12} /> {f.name}
                                            <span style={{ color: "var(--admin-muted)" }}>({Math.round(f.size / 1024)} KB)</span>
                                        </span>
                                        <button
                                            onClick={() => setPendingFiles((p) => p.filter((_, ix) => ix !== i))}
                                            style={{ border: 0, background: "transparent", color: "#a5512b", cursor: "pointer", fontSize: 11 }}
                                        >Remove</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,application/pdf.png.jpg.jpeg.webp.pdf"
                            multiple
                            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                            style={{ display: "none" }}
                            data-testid="admin-support-file-input"
                        />
                        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="admin-btn admin-btn-secondary"
                                style={{ fontSize: 11 }}
                                data-testid="admin-support-attach"
                            >
                                <Paperclip size={11} /> Attach file
                            </button>
                            <button onClick={sendReply} disabled={busy || (!reply.trim() && !pendingFiles.length)} className="admin-btn"
                                data-testid="admin-support-reply-send">
                                {busy && <Loader2 className="admin-spin" size={12} />} Send Reply{pendingFiles.length > 0 ? ` + ${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""}` : ""}
                            </button>
                        </div>
                        <p style={{ marginTop: 6, fontSize: 11, color: "var(--admin-muted)" }}>PNG, JPEG, WebP or PDF, up to 10 MB per file.</p>
                    </section>

                    <section className="admin-card" style={{ marginBottom: 16, borderLeft: "3px solid #C2683D" }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#C2683D" }}>
                            <ShieldAlert size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
                            Internal Note (never shown to user, never emailed)
                        </h3>
                        <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={3}
                            className="admin-input" style={{ width: "100%", fontSize: 13 }}
                            placeholder="Internal context for the team."
                            data-testid="admin-support-note-input" />
                        <div style={{ marginTop: 8, textAlign: "right" }}>
                            <button onClick={addNote} disabled={busy || !internalNote.trim()} className="admin-btn admin-btn-secondary"
                                data-testid="admin-support-note-save">
                                Save Note
                            </button>
                        </div>
                    </section>
                </div>

                {/* Sidebar */}
                <aside style={{ position: "sticky", top: 80, alignSelf: "start" }}>
                    {/* Priority */}
                    <section className="admin-card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                            Priority
                        </h3>
                        <select
                            value={ticket.priority || "normal"}
                            onChange={(e) => patch({ priority: e.target.value }, `Priority set to ${PRIORITY_LABEL[e.target.value]}.`)}
                            className="admin-input"
                            style={{ width: "100%", fontSize: 13 }}
                            data-testid="admin-support-priority-select"
                        >
                            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </section>

                    {/* Assignee */}
                    <section className="admin-card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                            Assignee
                        </h3>
                        <select
                            value={ticket.assignee_id || ""}
                            onChange={(e) => patch({ assignee_id: e.target.value }, e.target.value ? "Assigned." : "Unassigned.")}
                            className="admin-input"
                            style={{ width: "100%", fontSize: 13 }}
                            data-testid="admin-support-assignee-select"
                        >
                            <option value="">Unassigned</option>
                            {admins.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                        </select>
                    </section>

                    {/* Status */}
                    <section className="admin-card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                            Status
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {STATUS_ORDER.map((k) =>
                                k !== ticket.status && (
                                    <button key={k} onClick={() => changeStatus(k)} className="admin-btn admin-btn-secondary"
                                        style={{ fontSize: 12, justifyContent: "flex-start" }}
                                        data-testid={`admin-support-status-${k}`}>
                                        → {STATUS_LABEL[k]}
                                    </button>
                                ),
                            )}
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--admin-border)" }}>
                            <label style={{ fontSize: 11, color: "var(--admin-muted)", display: "block", marginBottom: 4 }}>
                                Resolution summary (used when marking Resolved)
                            </label>
                            <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2}
                                className="admin-input" style={{ width: "100%", fontSize: 12 }}
                                placeholder="Optional. Becomes the resolution email and a public message."
                                data-testid="admin-support-resolution" />
                        </div>
                    </section>

                    {/* Tags */}
                    <section className="admin-card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                            Tags
                        </h3>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }} data-testid="admin-support-tags">
                            {(ticket.tags || []).length === 0 && (
                                <span style={{ fontSize: 11, color: "var(--admin-muted)" }}>None yet.</span>
                            )}
                            {(ticket.tags || []).map((tg) => (
                                <span key={tg} className="admin-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                                    <Tag size={9} /> {tg}
                                    <button onClick={() => removeTag(tg)} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, color: "inherit" }}>
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                            <input
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                                placeholder="new-tag"
                                className="admin-input"
                                style={{ flex: 1, fontSize: 12 }}
                                data-testid="admin-support-tag-input"
                            />
                            <button onClick={addTag} disabled={!newTag.trim()} className="admin-btn admin-btn-secondary" style={{ fontSize: 11 }} data-testid="admin-support-tag-add">
                                Add
                            </button>
                        </div>
                    </section>

                    <section className="admin-card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                            Reporter
                        </h3>
                        <div style={{ fontSize: 13 }}>
                            <div>{ticket.user_name}</div>
                            <div style={{ color: "var(--admin-muted)", fontSize: 12 }}>{ticket.user_email}</div>
                        </div>
                    </section>

                    {defect && (
                        <section className="admin-card">
                            <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-muted)", marginBottom: 8 }}>
                                Linked defect
                            </h3>
                            <div style={{ fontSize: 12 }}>
                                <div style={{ fontFamily: "ui-monospace, monospace" }}>{defect.reference}</div>
                                <div style={{ marginTop: 4 }}>{defect.title}</div>
                                <div style={{ marginTop: 4, color: "var(--admin-muted)" }}>Status: {defect.status}</div>
                            </div>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}

// ============================================================================
// DEFECTS (kept minimal, unchanged behaviour)
// ============================================================================
export function AdminSupportDefects() {
    const [defects, setDefects] = useState(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ title: "", tool_name: "", severity: "medium" });

    const load = () => {
        adminApi.get("/admin/support/defects")
            .then((r) => setDefects(r.data?.defects || []))
            .catch((e) => toast.error(extractMsg(e)));
    };
    useEffect(load, []);

    const create = async () => {
        if (!form.title.trim() || !form.tool_name.trim()) return;
        try {
            await adminApi.post("/admin/support/defects", form);
            setCreating(false);
            setForm({ title: "", tool_name: "", severity: "medium" });
            load();
            toast.success("Defect created.");
        } catch (e) { toast.error(extractMsg(e)); }
    };

    return (
        <div data-testid="admin-support-defects">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Defects</h1>
                <button onClick={() => setCreating(!creating)} className="admin-btn" data-testid="admin-support-defect-new">
                    New Defect
                </button>
            </div>

            {creating && (
                <section className="admin-card" style={{ marginBottom: 16 }}>
                    <input className="admin-input" placeholder="Defect title" value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        style={{ width: "100%", marginBottom: 8 }} data-testid="admin-support-defect-title" />
                    <input className="admin-input" placeholder="Tool name (e.g. Statement Decoder)" value={form.tool_name}
                        onChange={(e) => setForm({ ...form, tool_name: e.target.value })}
                        style={{ width: "100%", marginBottom: 8 }} data-testid="admin-support-defect-tool" />
                    <select className="admin-input" value={form.severity}
                        onChange={(e) => setForm({ ...form, severity: e.target.value })}
                        style={{ marginRight: 8 }}>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                    <button onClick={create} className="admin-btn" data-testid="admin-support-defect-save">Save</button>
                </section>
            )}

            {!defects ? <Loader2 className="admin-spin" /> : defects.length === 0 ? (
                <div style={{ color: "var(--admin-muted)" }}>No defects yet.</div>
            ) : (
                <table className="admin-table">
                    <thead>
                        <tr><th>Ref</th><th>Title</th><th>Tool</th><th>Severity</th><th>Status</th><th>Linked</th></tr>
                    </thead>
                    <tbody>
                        {defects.map((d) => (
                            <tr key={d.id}>
                                <td style={{ fontFamily: "ui-monospace, monospace" }}>{d.reference}</td>
                                <td>{d.title}</td>
                                <td>{d.tool_name}</td>
                                <td>{d.severity}</td>
                                <td>{d.status}</td>
                                <td>{d._linked_count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ============================================================================
// MACROS (canned responses)
// ============================================================================
export function AdminSupportMacros() {
    const [macros, setMacros] = useState(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ title: "", body: "" });
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ title: "", body: "" });

    const load = () => {
        adminApi.get("/admin/support/macros")
            .then((r) => setMacros(r.data?.macros || []))
            .catch((e) => toast.error(extractMsg(e)));
    };
    useEffect(load, []);

    const create = async () => {
        if (!form.title.trim() || !form.body.trim()) return;
        try {
            await adminApi.post("/admin/support/macros", form);
            setForm({ title: "", body: "" });
            setCreating(false);
            load();
            toast.success("Macro created.");
        } catch (e) { toast.error(extractMsg(e)); }
    };

    const startEdit = (m) => {
        setEditingId(m.id);
        setEditForm({ title: m.title, body: m.body });
    };

    const saveEdit = async () => {
        try {
            await adminApi.patch(`/admin/support/macros/${editingId}`, editForm);
            setEditingId(null);
            load();
            toast.success("Macro updated.");
        } catch (e) { toast.error(extractMsg(e)); }
    };

    const remove = async (id) => {
        if (!window.confirm("Delete this macro?")) return;
        try {
            await adminApi.delete(`/admin/support/macros/${id}`);
            load();
            toast.success("Macro deleted.");
        } catch (e) { toast.error(extractMsg(e)); }
    };

    return (
        <div data-testid="admin-support-macros">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 600 }}>Macros</h1>
                    <p style={{ fontSize: 13, color: "var(--admin-muted)" }}>Canned reply templates. Insert one from any ticket detail page.</p>
                </div>
                <button onClick={() => setCreating(!creating)} className="admin-btn" data-testid="admin-support-macro-new">
                    <PlusCircle size={14} /> New Macro
                </button>
            </div>

            {creating && (
                <section className="admin-card" style={{ marginBottom: 16 }}>
                    <input className="admin-input" placeholder="Macro title (e.g. 'Legislative figure, clarify')" value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        style={{ width: "100%", marginBottom: 8 }} data-testid="admin-support-macro-title" />
                    <textarea className="admin-input" placeholder="Body of the macro. Written in Wayly voice, no em dashes."
                        value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                        rows={6}
                        style={{ width: "100%", marginBottom: 8, fontSize: 13 }} data-testid="admin-support-macro-body" />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => { setCreating(false); setForm({ title: "", body: "" }); }} className="admin-btn admin-btn-secondary">Cancel</button>
                        <button onClick={create} className="admin-btn" data-testid="admin-support-macro-save">Save</button>
                    </div>
                </section>
            )}

            {!macros ? <Loader2 className="admin-spin" /> : macros.length === 0 ? (
                <div style={{ color: "var(--admin-muted)", padding: 40, textAlign: "center" }}>
                    No macros yet. Create your first one for common replies like &quot;figure incorrect, sending to legislative review&quot;.
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {macros.map((m) => (
                        <div key={m.id} className="admin-card" data-testid={`admin-support-macro-${m.slug}`}>
                            {editingId === m.id ? (
                                <>
                                    <input className="admin-input" value={editForm.title}
                                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                        style={{ width: "100%", marginBottom: 8 }} />
                                    <textarea className="admin-input" value={editForm.body}
                                        onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                                        rows={5}
                                        style={{ width: "100%", marginBottom: 8 }} />
                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                        <button onClick={() => setEditingId(null)} className="admin-btn admin-btn-secondary">Cancel</button>
                                        <button onClick={saveEdit} className="admin-btn">Save</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{m.title}</h3>
                                        <div style={{ display: "flex", gap: 6 }}>
                                            <button onClick={() => startEdit(m)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11 }}>Edit</button>
                                            <button onClick={() => remove(m.id)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, color: "#a5512b" }}>Delete</button>
                                        </div>
                                    </div>
                                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#0E4D52", background: "#FBF8F3", padding: 10, borderRadius: 6, margin: 0 }}>{m.body}</pre>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
