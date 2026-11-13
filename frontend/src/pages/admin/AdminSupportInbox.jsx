import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Inbox, Ticket, Mail, Archive, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { adminApi } from "./AdminAuthContext";

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    return f;
};

function fmtDate(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("en-AU", {
            day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
        });
    } catch { return String(iso); }
}

const SOURCE_META = {
    ticket: { label: "Support ticket", icon: Ticket, color: "#0E4D52" },
    enquiry: { label: "Website enquiry", icon: Mail, color: "#A5512B" },
    legacy: { label: "Legacy", icon: Archive, color: "#6b6b6b" },
};
const BUCKET_LABEL = {
    open: "Open", resolved: "Resolved", closed: "Closed", new: "New", actioned: "Actioned",
};
const PRIORITY_COLOR = {
    urgent: "#B42318", high: "#A5512B", normal: "#0E4D52", low: "#6b6b6b", none: "#9aa0a6",
};

function SourceBadge({ source }) {
    const m = SOURCE_META[source] || SOURCE_META.legacy;
    const Icon = m.icon;
    return (
        <span data-testid={`inbox-source-${source}`} style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700,
            padding: "3px 9px", borderRadius: 999, background: `${m.color}1a`, color: m.color,
        }}>
            <Icon size={12} /> {m.label}
        </span>
    );
}

const SOURCE_TABS = [
    { key: "", label: "All sources" },
    { key: "ticket", label: "Tickets" },
    { key: "enquiry", label: "Enquiries" },
    { key: "legacy", label: "Legacy" },
];
const STATUS_TABS = [
    { key: "", label: "Any status" },
    { key: "open", label: "Open" },
    { key: "new", label: "New" },
    { key: "resolved", label: "Resolved" },
    { key: "closed", label: "Closed" },
    { key: "actioned", label: "Actioned" },
];

export default function AdminSupportInbox() {
    const [data, setData] = useState(null);
    const [source, setSource] = useState("");
    const [status, setStatus] = useState("");
    const [priority, setPriority] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const SIZE = 50;

    const load = useCallback(async () => {
        try {
            const r = await adminApi.get("/admin/support/inbox", {
                params: { source: source || undefined, status: status || undefined, priority: priority || undefined, q: q || undefined, page, page_size: SIZE },
            });
            setData(r.data);
        } catch (e) {
            toast.error(extractMsg(e, "Could not load the inbox."));
        }
    }, [source, status, priority, q, page]);

    useEffect(() => { load(); }, [load]);

    const rows = data?.rows || [];
    const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.total || 0) / SIZE)), [data]);
    const srcCounts = data?.counts_by_source || {};

    return (
        <div data-testid="admin-support-inbox">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Inbox size={22} />
                <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Unified Support Inbox</h1>
            </div>
            <p style={{ color: "var(--admin-muted)", marginTop: 0, fontSize: 13 }}>
                One read-only view across support tickets, website enquiries and legacy tickets. Message bodies and internal notes are never shown here.
            </p>

            {/* Source summary chips */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                {(data?.meta?.sources || []).map((s) => (
                    <div key={s.name} className="admin-card" data-testid={`inbox-chip-${s.name}`}
                        style={{ padding: "10px 14px", minWidth: 150 }}>
                        <div style={{ fontSize: 12, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{s.count}</div>
                        <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>Updated {fmtDate(s.last_updated)}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-testid="inbox-source-tabs">
                    {SOURCE_TABS.map((t) => (
                        <button key={t.key} data-testid={`inbox-source-tab-${t.key || "all"}`}
                            onClick={() => { setSource(t.key); setPage(1); }}
                            className="admin-btn" style={{
                                fontSize: 12, padding: "5px 12px", borderRadius: 999,
                                background: source === t.key ? "var(--admin-fg,#0E4D52)" : "transparent",
                                color: source === t.key ? "#fff" : "var(--admin-muted)",
                                border: source === t.key ? "none" : "1px solid var(--admin-border)",
                            }}>{t.label}{t.key && srcCounts[t.key] != null ? ` (${srcCounts[t.key]})` : ""}</button>
                    ))}
                </div>
                <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                    className="admin-input" data-testid="inbox-status-filter" style={{ fontSize: 13, padding: "6px 10px" }}>
                    {STATUS_TABS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}
                    className="admin-input" data-testid="inbox-priority-filter" style={{ fontSize: 13, padding: "6px 10px" }}>
                    <option value="">Any priority</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                    <option value="none">None</option>
                </select>
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
                    placeholder="Search ref, name, email…" className="admin-input"
                    data-testid="inbox-search" style={{ fontSize: 13, padding: "6px 10px", flex: 1, minWidth: 180 }} />
            </div>

            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Source</th><th>Reference</th><th>Subject</th><th>Requester</th>
                            <th>Status</th><th>Priority</th><th>Created</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {!data ? (
                            <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }} data-testid="inbox-empty">Nothing matches these filters.</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={`${r.source}-${r.id || r.created_at || i}`} data-testid={`inbox-row-${r.id}`}>
                                <td><SourceBadge source={r.source} /></td>
                                <td className="admin-mono" style={{ fontSize: 12 }}>{r.reference || "—"}</td>
                                <td style={{ maxWidth: 260 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                                    {r.detail && <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{r.detail}</div>}
                                </td>
                                <td style={{ fontSize: 13 }}>
                                    <div>{r.requester_name || "—"}</div>
                                    <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{r.requester_email || ""}</div>
                                </td>
                                <td><span style={{ fontSize: 12, fontWeight: 600 }}>{BUCKET_LABEL[r.status_bucket] || r.status}</span></td>
                                <td><span style={{ fontSize: 12, fontWeight: 700, color: PRIORITY_COLOR[r.priority] || "#0E4D52", textTransform: "capitalize" }}>{r.priority}</span></td>
                                <td className="admin-mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                                <td style={{ textAlign: "right" }}>
                                    {r.open_path && (
                                        <Link to={r.open_path} data-testid={`inbox-open-${r.id}`} className="admin-btn"
                                            style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                            Open <ExternalLink size={12} />
                                        </Link>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data && data.total > SIZE && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 13, color: "var(--admin-muted)" }}>
                    <span>{data.total} total · page {page} of {totalPages}</span>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button className="admin-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ fontSize: 12, padding: "5px 12px" }}>Prev</button>
                        <button className="admin-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ fontSize: 12, padding: "5px 12px" }}>Next</button>
                    </div>
                </div>
            )}
        </div>
    );
}
