import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, Check, RotateCcw, Inbox } from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (d?.message) return d.message;
    return f;
};

function fmtDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("en-AU", {
            day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
        });
    } catch {
        return String(iso);
    }
}

const ROLE_LABELS = {
    family: "Family Caregiver", participant: "Participant", advisor: "Financial Advisor",
    provider: "Aged-Care Provider", gp: "GP / Clinician", press: "Press / Media", other: "Other",
};
const TIME_LABELS = {
    morning: "Morning (9-12 AEST)", lunch: "Lunchtime (12-2 AEST)",
    afternoon: "Afternoon (2-5 AEST)", evening: "Evening (5-8 AEST)",
};
const DETAIL_FIELDS = [
    ["context", "Message"],
    ["biggest_pain", "Biggest pain"],
    ["success_in_six_months", "Success in 6 months"],
    ["size", "Size / scale"],
    ["preferred_time", "Preferred call time"],
];

const TABS = [
    { key: "new", label: "New" },
    { key: "actioned", label: "Actioned" },
    { key: "all", label: "All" },
];

function StatusBadge({ status }) {
    const actioned = status === "actioned";
    return (
        <span
            data-testid="enquiry-status-badge"
            style={{
                display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                background: actioned ? "rgba(66,95,71,0.14)" : "rgba(165,81,43,0.14)",
                color: actioned ? "#2f4a35" : "#8A4423",
            }}
        >
            {actioned ? "Actioned" : "New"}
        </span>
    );
}

export default function AdminEnquiries() {
    const [tab, setTab] = useState("new");
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [busyId, setBusyId] = useState(null);
    const SIZE = 30;

    const load = useCallback(async () => {
        try {
            const r = await adminApi.get("/admin/enquiries", { params: { status: tab, page, page_size: SIZE } });
            setData(r.data);
        } catch (e) {
            toast.error(extractMsg(e, "Could not load enquiries."));
        }
    }, [tab, page]);

    useEffect(() => { load(); }, [load]);

    const setStatus = async (id, status) => {
        setBusyId(id);
        try {
            await adminApi.patch(`/admin/enquiries/${id}`, { status });
            toast.success(status === "actioned" ? "Marked as actioned" : "Reopened");
            await load();
        } catch (e) {
            toast.error(extractMsg(e, "Could not update this enquiry."));
        } finally {
            setBusyId(null);
        }
    };

    const rows = data?.rows || [];
    const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.total || 0) / SIZE)), [data]);

    return (
        <div data-testid="admin-enquiries">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <Inbox size={22} />
                <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>
                    Enquiries
                    {data?.new_count != null && (
                        <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400, marginLeft: 8 }}>
                            ({data.new_count} new)
                        </span>
                    )}
                </h1>
            </div>

            {/* Status tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }} data-testid="admin-enquiries-tabs">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        data-testid={`admin-enquiries-tab-${t.key}`}
                        onClick={() => { setTab(t.key); setPage(1); }}
                        className="admin-btn"
                        style={{
                            fontSize: 13, padding: "6px 14px", borderRadius: 999,
                            background: tab === t.key ? "var(--admin-fg, #0E4D52)" : "transparent",
                            color: tab === t.key ? "#fff" : "var(--admin-muted)",
                            border: tab === t.key ? "none" : "1px solid var(--admin-border)",
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>When</th>
                            <th>Name</th>
                            <th>Contact</th>
                            <th>Type</th>
                            <th>Details</th>
                            <th>Status</th>
                            <th style={{ textAlign: "right" }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!data ? (
                            <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }} data-testid="admin-enquiries-empty">No enquiries here yet.</td></tr>
                        ) : rows.map((r) => (
                            <tr key={r.id || `${r.email}-${r.created_at}`} data-testid={`admin-enquiry-row-${r.id || ""}`}>
                                <td className="admin-mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                                <td style={{ fontWeight: 600 }}>{r.name || "—"}</td>
                                <td style={{ fontSize: 13 }}>
                                    {r.email && (
                                        <div>
                                            <a href={`mailto:${r.email}`} style={{ color: "var(--admin-link, #A5512B)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                                <Mail size={12} /> {r.email}
                                            </a>
                                        </div>
                                    )}
                                    {r.phone && (
                                        <div style={{ color: "var(--admin-muted)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                            <Phone size={12} /> {r.phone}
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "capitalize" }}>{r.intent || "general"}</div>
                                    <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{ROLE_LABELS[r.role] || r.role || "—"}</div>
                                </td>
                                <td style={{ maxWidth: 360, fontSize: 13 }}>
                                    {DETAIL_FIELDS.filter(([k]) => r[k]).map(([k, label]) => (
                                        <div key={k} style={{ marginBottom: 4 }}>
                                            <span style={{ color: "var(--admin-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}: </span>
                                            <span>{k === "preferred_time" ? (TIME_LABELS[r[k]] || r[k]) : r[k]}</span>
                                        </div>
                                    ))}
                                </td>
                                <td><StatusBadge status={r.status} /></td>
                                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                    {r.status === "actioned" ? (
                                        <button
                                            className="admin-btn"
                                            data-testid={`admin-enquiry-reopen-${r.id || ""}`}
                                            disabled={busyId === r.id || !r.id}
                                            onClick={() => setStatus(r.id, "new")}
                                            style={{ fontSize: 12, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
                                        >
                                            <RotateCcw size={12} /> Reopen
                                        </button>
                                    ) : (
                                        <button
                                            className="admin-btn admin-btn-primary"
                                            data-testid={`admin-enquiry-action-${r.id || ""}`}
                                            disabled={busyId === r.id || !r.id}
                                            onClick={() => setStatus(r.id, "actioned")}
                                            style={{ fontSize: 12, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
                                        >
                                            <Check size={12} /> Mark actioned
                                        </button>
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
