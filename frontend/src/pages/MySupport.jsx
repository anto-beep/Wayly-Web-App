import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
    Loader2, ArrowLeft, MessageSquare, Inbox, Star, Plus, Search,
    Filter, ChevronDown, Pencil, X, Check, ArchiveRestore, Archive,
    Clock, FileText, ShieldCheck, RefreshCcw, LayoutList, ListFilter,
    Paperclip,
} from "lucide-react";
import { ReportIssuePanel } from "@/components/ReportIssueButton";
import { StandingBanner } from "@/uxf";

const STATUS_LABEL = {
    received: "Received",
    under_review: "Under Review",
    awaiting_user: "Awaiting Your Reply",
    resolved: "Resolved",
    closed: "Closed",
};

const STATUS_LINE = {
    received: "We have your ticket and it is in the queue.",
    under_review: "We are looking into what happened.",
    awaiting_user: "We have asked you a question. A reply helps us move forward.",
    resolved: "We have looked into this. See what we found below.",
    closed: "This ticket is finished. You can still read the full history.",
};

const STATUS_TONE = {
    received: "bg-[var(--kindred-surface-soft,#F4F1EA)] text-[var(--kindred-primary,#0E4D52)] border-[var(--kindred-border,#E5DCC9)]",
    under_review: "bg-[var(--kindred-primary,#0E4D52)]/10 text-[var(--kindred-primary,#0E4D52)] border-[var(--kindred-primary,#0E4D52)]/25",
    awaiting_user: "bg-[var(--kindred-warn,#C2683D)]/15 text-[var(--kindred-warn,#C2683D)] border-[var(--kindred-warn,#C2683D)]/40",
    resolved: "bg-[var(--kindred-sage,#6B8F71)]/15 text-[var(--kindred-primary,#0E4D52)] border-[var(--kindred-sage,#6B8F71)]/45",
    closed: "bg-gray-100 text-gray-700 border-gray-200",
};

const CATEGORY_LABEL = {
    figure_incorrect: "A figure looks wrong",
    rule_misapplied: "A rule was applied that does not fit",
    situation_not_captured: "My situation was not captured",
    tool_misunderstood_input: "The tool misread what I entered",
    other: "Something else",
};

const SOURCE_LABEL = {
    assessor: "My assessor",
    official_letter: "A letter or statement I received",
    my_aged_care: "My Aged Care",
    aged_care_rules: "Aged Care Rules",
    own_reading: "My own understanding",
    other: "Other",
};

const EVENT_LABEL = {
    created: "Ticket raised",
    status_changed: "Status changed",
    csat_received: "You rated this ticket",
    closed_by_user: "You closed this ticket",
    reopened_by_user: "You reopened this ticket",
    edited_by_user: "You edited the report",
};

const fmt = (iso) => {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return iso; }
};

const fmtFull = (iso) => {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
};

const relTime = (iso) => {
    if (!iso) return "";
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return fmt(iso);
};

const extractErr = (err, fallback = "Something went wrong.") => {
    const d = err?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ");
    if (d?.message) return d.message;
    return err?.message || fallback;
};

function AttachmentRow({ ticketId, attachment: a }) {
    const [busy, setBusy] = React.useState(false);
    const download = async () => {
        if (a.purged_at || busy) return;
        setBusy(true);
        try {
            const res = await api.get(
                `/support/tickets/${ticketId}/attachments/${a.id}/download`,
                { responseType: "blob" },
            );
            const url = URL.createObjectURL(res.data);
            window.open(url, "_blank", "noopener");
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (err) {
            toast.error(extractErr(err, "Could not open the file."));
        } finally { setBusy(false); }
    };
    const isImage = (a.mime_type || "").startsWith("image/");
    const label = a.uploaded_by_type === "staff"
        ? "Wayly Team"
        : a.uploaded_by_type === "user"
            ? "You"
            : null;
    return (
        <div className="flex items-center gap-2 py-1" data-testid={`attachment-${a.id}`}>
            <FileText className="h-3.5 w-3.5 shrink-0 text-[#6B8F71]" aria-hidden="true" />
            {a.purged_at ? (
                <span className="text-[#0E4D52]/60 truncate">
                    {a.filename || a.type} <span className="text-xs">(purged)</span>
                </span>
            ) : (
                <button
                    type="button"
                    onClick={download}
                    disabled={busy}
                    className="text-[#0E4D52] hover:underline truncate disabled:opacity-60"
                    data-testid={`attachment-open-${a.id}`}
                >
                    {a.filename || (isImage ? "Screenshot" : "Attachment")}
                </button>
            )}
            {a.size_bytes && (
                <span className="text-[11px] text-[#0E4D52]/50 shrink-0">
                    ({Math.round(a.size_bytes / 1024)} KB)
                </span>
            )}
            {label && (
                <span className="text-[11px] text-[#0E4D52]/50 shrink-0">· {label}</span>
            )}
        </div>
    );
}

export default function MySupport() {
    const { ticketId } = useParams();
    if (ticketId) return <TicketDetail ticketId={ticketId} />;
    return <TicketList />;
}

function StatusBadge({ status, withLine = false }) {
    return (
        <div>
            <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status] || ""}`}
                data-testid={`ticket-status-${status}`}
            >
                {STATUS_LABEL[status] || status}
            </span>
            {withLine && <p className="mt-2 text-sm text-[#0E4D52]/80">{STATUS_LINE[status]}</p>}
        </div>
    );
}

function StatCard({ label, value, tone = "sage", testid }) {
    const toneMap = {
        sage: "border-[#6B8F71]/40 bg-[#6B8F71]/5 text-[#0E4D52]",
        warn: "border-[#C2683D]/40 bg-[#C2683D]/5 text-[#C2683D]",
        primary: "border-[#0E4D52]/25 bg-[#0E4D52]/5 text-[#0E4D52]",
        muted: "border-[#E5DCC9] bg-[#FBF8F3] text-[#0E4D52]/85",
    };
    return (
        <div
            className={`flex flex-col rounded-xl border px-4 py-3 ${toneMap[tone] || toneMap.muted}`}
            data-testid={testid}
        >
            <span className="text-[11px] font-medium uppercase tracking-wider opacity-75">{label}</span>
            <span className="mt-1 text-2xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{value}</span>
        </div>
    );
}

function TicketList() {
    const nav = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [showRaise, setShowRaise] = useState(false);
    const [filters, setFilters] = useState({ status: "all", tool: "", q: "", sort: "newest" });

    const load = useCallback(() => {
        const params = new URLSearchParams();
        if (filters.status && filters.status !== "all") params.set("status", filters.status);
        if (filters.tool) params.set("tool", filters.tool);
        if (filters.q.trim()) params.set("q", filters.q.trim());
        if (filters.sort) params.set("sort", filters.sort);
        api.get(`/support/tickets?${params.toString()}`)
            .then((r) => { setData(r.data); setError(null); })
            .catch((e) => setError(extractErr(e, "Could not load your tickets.")));
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    const tools = useMemo(() => {
        const seen = new Set();
        (data?.tickets || []).forEach((t) => { if (t.tool_name) seen.add(t.tool_name); });
        return Array.from(seen).sort();
    }, [data]);

    if (data === null && !error) {
        return (
            <div className="flex items-center justify-center py-16 text-[#0E4D52]" data-testid="my-support-loading">
                <Loader2 className="h-5 w-5 animate-spin" /> <span className="ml-2">Loading…</span>
            </div>
        );
    }

    const stats = data?.stats || { open: 0, awaiting_user: 0, resolved: 0, total: 0 };
    const tickets = data?.tickets || [];
    const hasActiveFilter = filters.status !== "all" || filters.tool || filters.q.trim();

    return (
        <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8" data-testid="my-support-list">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-[#0E4D52] sm:text-3xl" style={{ fontFamily: "Fraunces, serif" }}>
                        My Support
                    </h1>
                    <p className="mt-1 text-sm text-[#0E4D52]/80">Track tickets you have raised and read what the Wayly team has come back with.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowRaise(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0E4D52] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3d41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E4D52] focus-visible:ring-offset-2"
                    data-testid="my-support-raise-ticket"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Raise a New Ticket
                </button>
            </header>

            {error && (
                <StandingBanner variant="error" title="Could not load tickets" onDismiss={() => setError(null)} testId="my-support-error">
                    {error}
                </StandingBanner>
            )}

            {/* Stats row */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="my-support-stats">
                <StatCard label="Open" value={stats.open} tone="primary" testid="my-support-stat-open" />
                <StatCard label="Awaiting You" value={stats.awaiting_user} tone={stats.awaiting_user > 0 ? "warn" : "muted"} testid="my-support-stat-awaiting" />
                <StatCard label="Resolved" value={stats.resolved} tone="sage" testid="my-support-stat-resolved" />
                <StatCard label="Total" value={stats.total} tone="muted" testid="my-support-stat-total" />
            </section>

            {/* Filters */}
            <section className="rounded-xl border border-[#E5DCC9] bg-white p-3 sm:p-4" data-testid="my-support-filters">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="relative min-w-[220px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0E4D52]/60" aria-hidden="true" />
                        <input
                            type="search"
                            placeholder="Search reference, tool, keyword…"
                            value={filters.q}
                            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                            className="w-full rounded-lg border border-[#E5DCC9] bg-white py-2 pl-9 pr-3 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                            data-testid="my-support-search"
                        />
                    </div>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                        className="rounded-lg border border-[#E5DCC9] bg-white px-3 py-2 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                        data-testid="my-support-filter-status"
                    >
                        <option value="all">All statuses</option>
                        <option value="open">Open tickets</option>
                        <option value="received">Received</option>
                        <option value="under_review">Under Review</option>
                        <option value="awaiting_user">Awaiting your reply</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                    {tools.length > 0 && (
                        <select
                            value={filters.tool}
                            onChange={(e) => setFilters((f) => ({ ...f, tool: e.target.value }))}
                            className="rounded-lg border border-[#E5DCC9] bg-white px-3 py-2 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                            data-testid="my-support-filter-tool"
                        >
                            <option value="">All tools</option>
                            {tools.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    )}
                    <select
                        value={filters.sort}
                        onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
                        className="rounded-lg border border-[#E5DCC9] bg-white px-3 py-2 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                        data-testid="my-support-sort"
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="activity">Last activity</option>
                        <option value="status">Status</option>
                    </select>
                    {hasActiveFilter && (
                        <button
                            type="button"
                            onClick={() => setFilters({ status: "all", tool: "", q: "", sort: "newest" })}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E5DCC9] px-3 py-2 text-xs text-[#0E4D52] hover:border-[#6B8F71] hover:text-[#0E4D52]"
                            data-testid="my-support-clear-filters"
                        >
                            <X className="h-3.5 w-3.5" /> Clear
                        </button>
                    )}
                </div>
            </section>

            {/* Results */}
            {tickets.length === 0 ? (
                <div className="rounded-xl border border-[#E5DCC9] bg-[#FBF8F3] p-10 text-center" data-testid="my-support-empty">
                    <Inbox className="mx-auto mb-3 h-7 w-7 text-[#6B8F71]" aria-hidden="true" />
                    <h2 className="text-base font-semibold text-[#0E4D52]">
                        {hasActiveFilter ? "No tickets match" : "No tickets yet"}
                    </h2>
                    <p className="mt-1 text-sm text-[#0E4D52]/80">
                        {hasActiveFilter
                            ? "Try clearing your filters or search."
                            : "If a tool returns something that does not look right, use the \"Report an Issue With This Result\" button on the tool screen, or raise a ticket from here."}
                    </p>
                </div>
            ) : (
                <ul className="space-y-3" data-testid="my-support-results">
                    {tickets.map((t) => (
                        <li key={t.id}>
                            <Link
                                to={`/support/${t.id}`}
                                className="block rounded-xl border border-[#E5DCC9] bg-white p-4 transition hover:border-[#6B8F71] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E4D52]"
                                data-testid={`ticket-row-${t.reference}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className="font-mono text-[#0E4D52]/70">{t.reference}</span>
                                            {t.tool_name && (
                                                <span className="rounded-full bg-[#F4F1EA] px-2 py-0.5 text-[#0E4D52]/80">{t.tool_name}</span>
                                            )}
                                            {t.message_count > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[#0E4D52]/60">
                                                    <MessageSquare className="h-3 w-3" aria-hidden="true" /> {t.message_count}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 text-sm font-semibold text-[#0E4D52]">
                                            {CATEGORY_LABEL[t.category] || "Ticket"}
                                        </div>
                                        {t.user_note && (
                                            <div className="mt-1 line-clamp-1 text-xs text-[#0E4D52]/75">{t.user_note}</div>
                                        )}
                                        <div className="mt-1.5 flex items-center gap-2 text-xs text-[#0E4D52]/65">
                                            <Clock className="h-3 w-3" aria-hidden="true" />
                                            Raised {fmt(t.created_at)} · Updated {relTime(t.last_activity_at || t.updated_at)}
                                        </div>
                                    </div>
                                    <StatusBadge status={t.status} />
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {showRaise && (
                <ReportIssuePanel
                    mode="general"
                    onClose={() => setShowRaise(false)}
                    onSubmitted={(t) => {
                        load();
                        if (t?.id) {
                            setTimeout(() => nav(`/support/${t.id}`), 1200);
                        }
                    }}
                />
            )}
        </main>
    );
}

function EventChip({ event }) {
    const type = event.event_type;
    const label = EVENT_LABEL[type] || type.replace(/_/g, " ");
    let detail = null;
    if (type === "status_changed" && event.metadata) {
        detail = `${STATUS_LABEL[event.metadata.from] || event.metadata.from} → ${STATUS_LABEL[event.metadata.to] || event.metadata.to}`;
    } else if (type === "csat_received" && event.metadata?.score) {
        detail = `${event.metadata.score} of 5`;
    }
    return (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-[#E5DCC9] bg-[#FBF8F3] px-3 py-2 text-xs text-[#0E4D52]/75" data-testid={`ticket-event-${type}`}>
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6B8F71]" aria-hidden="true" />
            <div className="flex-1">
                <span className="font-semibold text-[#0E4D52]">{label}</span>
                {detail && <span className="ml-1 text-[#0E4D52]/70">· {detail}</span>}
            </div>
            <span className="whitespace-nowrap text-[#0E4D52]/55">{fmtFull(event.created_at)}</span>
        </div>
    );
}

function TicketDetail({ ticketId }) {
    const nav = useNavigate();
    const [data, setData] = useState(null);
    const [reply, setReply] = useState("");
    const [sending, setSending] = useState(false);
    const [replyError, setReplyError] = useState(null);
    const [csatScore, setCsatScore] = useState(0);
    const [csatComment, setCsatComment] = useState("");
    const [csatSubmitting, setCsatSubmitting] = useState(false);
    const [csatError, setCsatError] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [editError, setEditError] = useState(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const [snapshotOpen, setSnapshotOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        api.get(`/support/tickets/${ticketId}`)
            .then((r) => setData(r.data))
            .catch(() => toast.error("Could not load this ticket."));
    }, [ticketId]);

    useEffect(() => { load(); }, [load]);

    const [pendingFiles, setPendingFiles] = useState([]);
    const [uploadingFiles, setUploadingFiles] = useState(false);
    const [fileError, setFileError] = useState(null);
    const fileInputRef = React.useRef(null);

    const addFiles = (fileList) => {
        setFileError(null);
        const MAX = 10 * 1024 * 1024;
        const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
        const accepted = [];
        const rejected = [];
        Array.from(fileList || []).forEach((f) => {
            const ok = ALLOWED.includes(f.type) || /\.(png|jpe?g|webp|pdf)$/i.test(f.name);
            if (!ok) { rejected.push(`${f.name} (not a supported type)`); return; }
            if (f.size > MAX) { rejected.push(`${f.name} (over 10 MB)`); return; }
            accepted.push(f);
        });
        if (rejected.length) setFileError(`Skipped: ${rejected.join(", ")}. Only PNG, JPEG, WebP or PDF up to 10 MB.`);
        setPendingFiles((prev) => [...prev, ...accepted]);
    };

    const removePendingFile = (idx) => {
        setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    const uploadPendingFiles = async () => {
        if (!pendingFiles.length) return true;
        setUploadingFiles(true);
        try {
            for (const f of pendingFiles) {
                const fd = new FormData();
                fd.append("file", f);
                await api.post(`/support/tickets/${ticketId}/attachments`, fd, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
            }
            setPendingFiles([]);
            return true;
        } catch (err) {
            setFileError(extractErr(err, "Could not upload one or more files."));
            return false;
        } finally {
            setUploadingFiles(false);
        }
    };

    const sendReply = async (e) => {
        e.preventDefault();
        if (!reply.trim() && !pendingFiles.length) return;
        setSending(true);
        setReplyError(null);
        try {
            if (reply.trim()) {
                await api.post(`/support/tickets/${ticketId}/messages`, { body: reply });
            }
            const uploadOk = await uploadPendingFiles();
            if (uploadOk) {
                setReply("");
                load();
            }
        } catch (err) {
            setReplyError(extractErr(err, "Could not send your reply."));
        } finally {
            setSending(false);
        }
    };

    const submitCsat = async () => {
        if (csatScore < 1 || csatScore > 5) return;
        setCsatSubmitting(true);
        setCsatError(null);
        try {
            await api.post(`/support/tickets/${ticketId}/csat`, {
                csat_score: csatScore,
                csat_comment: csatComment || null,
            });
            toast.success("Thanks, your feedback helps shape what we improve next.");
            load();
        } catch (err) {
            setCsatError(extractErr(err, "Could not save your feedback."));
        } finally {
            setCsatSubmitting(false);
        }
    };

    const startEdit = () => {
        setEditForm({
            user_note: data.ticket.user_note || "",
            user_claimed_answer: data.ticket.user_claimed_answer || "",
            user_claimed_source: data.ticket.user_claimed_source || "",
            user_claimed_source_detail: data.ticket.user_claimed_source_detail || "",
        });
        setEditing(true);
        setEditError(null);
    };

    const saveEdit = async () => {
        setSavingEdit(true);
        setEditError(null);
        // Strip empty strings so backend Literal-typed fields don't 422.
        const payload = Object.fromEntries(
            Object.entries(editForm).filter(([, v]) => v !== "" && v !== null && v !== undefined),
        );
        try {
            await api.patch(`/support/tickets/${ticketId}`, payload);
            setEditing(false);
            toast.success("Your ticket has been updated.");
            load();
        } catch (err) {
            setEditError(extractErr(err, "Could not save your changes."));
        } finally {
            setSavingEdit(false);
        }
    };

    const doClose = async () => {
        setBusy(true);
        try {
            await api.post(`/support/tickets/${ticketId}/close`);
            setConfirmClose(false);
            toast.success("Ticket closed. You can reopen it within 30 days.");
            load();
        } catch (err) {
            toast.error(extractErr(err, "Could not close ticket."));
        } finally { setBusy(false); }
    };

    const doReopen = async () => {
        setBusy(true);
        try {
            await api.post(`/support/tickets/${ticketId}/reopen`);
            toast.success("Ticket reopened.");
            load();
        } catch (err) {
            toast.error(extractErr(err, "Could not reopen ticket."));
        } finally { setBusy(false); }
    };

    if (!data) {
        return (
            <div className="flex items-center justify-center py-16 text-[#0E4D52]">
                <Loader2 className="h-5 w-5 animate-spin" /> <span className="ml-2">Loading…</span>
            </div>
        );
    }

    const { ticket, thread, snapshot, events = [], attachments = [] } = data;
    const canReply = ["received", "under_review", "awaiting_user"].includes(ticket.status);
    const canEdit = ticket.status === "received";
    const canClose = ["received", "under_review", "awaiting_user"].includes(ticket.status);
    const canReopen = (() => {
        if (!["resolved", "closed"].includes(ticket.status)) return false;
        const anchor = ticket.resolved_at || ticket.updated_at;
        if (!anchor) return true;
        return (Date.now() - new Date(anchor).getTime()) < 30 * 24 * 3600 * 1000;
    })();

    // Merge messages + events into a chronological, mixed timeline.
    const timeline = [
        ...thread.map((m) => ({ kind: "message", ...m })),
        ...events.filter((e) => e.event_type !== "message_added").map((e) => ({ kind: "event", ...e })),
    ].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

    return (
        <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8" data-testid="my-support-detail">
            <button
                type="button"
                onClick={() => nav("/support")}
                className="inline-flex items-center gap-2 text-sm text-[#0E4D52] hover:underline"
                data-testid="my-support-back"
            >
                <ArrowLeft className="h-4 w-4" /> Back to My Support
            </button>

            <header className="rounded-xl border border-[#E5DCC9] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-mono text-[#0E4D52]/70">{ticket.reference}</div>
                        <h1 className="mt-1 text-xl font-semibold text-[#0E4D52]" style={{ fontFamily: "Fraunces, serif" }}>
                            {CATEGORY_LABEL[ticket.category] || "Wayly Ticket"}
                        </h1>
                        <p className="mt-1 text-xs text-[#0E4D52]/70">
                            {ticket.tool_name ? `${ticket.tool_name} · ` : ""}Raised {fmtFull(ticket.created_at)}
                            {ticket.last_activity_at && ` · Updated ${relTime(ticket.last_activity_at)}`}
                        </p>
                    </div>
                    <StatusBadge status={ticket.status} withLine />
                </div>

                {/* Action row */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E5DCC9] pt-3">
                    {canEdit && !editing && (
                        <button
                            type="button"
                            onClick={startEdit}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#0E4D52]/25 bg-white px-3 py-1.5 text-xs font-medium text-[#0E4D52] hover:border-[#0E4D52] hover:bg-[#0E4D52] hover:text-white"
                            data-testid="my-support-edit"
                        >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit my report
                        </button>
                    )}
                    {canClose && !confirmClose && (
                        <button
                            type="button"
                            onClick={() => setConfirmClose(true)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DCC9] bg-white px-3 py-1.5 text-xs font-medium text-[#0E4D52]/85 hover:border-[#0E4D52] hover:text-[#0E4D52]"
                            data-testid="my-support-close"
                        >
                            <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Close ticket
                        </button>
                    )}
                    {canReopen && (
                        <button
                            type="button"
                            onClick={doReopen}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#6B8F71]/50 bg-white px-3 py-1.5 text-xs font-medium text-[#0E4D52] hover:bg-[#6B8F71]/10 disabled:opacity-50"
                            data-testid="my-support-reopen"
                        >
                            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> Reopen ticket
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={load}
                        className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-[#0E4D52]/70 hover:bg-[#F4F1EA]"
                        data-testid="my-support-refresh"
                        title="Refresh"
                    >
                        <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
                    </button>
                </div>

                {confirmClose && (
                    <div className="mt-3 rounded-lg border border-[#C2683D]/40 bg-[#C2683D]/5 p-3 text-sm text-[#0E4D52]" data-testid="my-support-close-confirm">
                        <p className="mb-2">Close this ticket now? You can reopen it within 30 days if you need to add more.</p>
                        <div className="flex gap-2">
                            <button type="button" onClick={doClose} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-[#C2683D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a5512b] disabled:opacity-50" data-testid="my-support-close-confirm-yes">
                                <Check className="h-3.5 w-3.5" /> Yes, close it
                            </button>
                            <button type="button" onClick={() => setConfirmClose(false)} className="rounded-full border border-[#E5DCC9] px-3 py-1.5 text-xs text-[#0E4D52] hover:bg-[#F4F1EA]" data-testid="my-support-close-confirm-no">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </header>

            {/* Original report card OR edit form */}
            <section className="rounded-xl border border-[#E5DCC9] bg-white p-5" data-testid="my-support-report">
                <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[#0E4D52]/70">Your original report</h2>
                    {editing && (
                        <button type="button" onClick={() => setEditing(false)} className="text-xs text-[#0E4D52]/70 hover:underline" data-testid="my-support-edit-cancel">
                            Cancel
                        </button>
                    )}
                </div>
                {editing ? (
                    <div className="space-y-3">
                        {editError && (
                            <StandingBanner variant="error" title="Could not save" onDismiss={() => setEditError(null)} testId="my-support-edit-error">
                                {editError}
                            </StandingBanner>
                        )}
                        <label className="block text-sm">
                            <span className="mb-1 block font-semibold text-[#0E4D52]">What went wrong (note)</span>
                            <textarea
                                rows={3}
                                maxLength={4000}
                                value={editForm.user_note || ""}
                                onChange={(e) => setEditForm((f) => ({ ...f, user_note: e.target.value }))}
                                className="w-full rounded-lg border border-[#E5DCC9] bg-white p-2.5 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                                data-testid="my-support-edit-note"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block font-semibold text-[#0E4D52]">What you think the correct answer is</span>
                            <textarea
                                rows={2}
                                maxLength={2000}
                                value={editForm.user_claimed_answer || ""}
                                onChange={(e) => setEditForm((f) => ({ ...f, user_claimed_answer: e.target.value }))}
                                className="w-full rounded-lg border border-[#E5DCC9] bg-white p-2.5 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                                data-testid="my-support-edit-answer"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block font-semibold text-[#0E4D52]">Where you are getting that from</span>
                            <select
                                value={editForm.user_claimed_source || ""}
                                onChange={(e) => setEditForm((f) => ({ ...f, user_claimed_source: e.target.value }))}
                                className="w-full rounded-lg border border-[#E5DCC9] bg-white p-2 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                                data-testid="my-support-edit-source"
                            >
                                <option value="">Optional</option>
                                {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </label>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditing(false)} className="rounded-full px-4 py-2 text-sm text-[#0E4D52] hover:bg-[#F4F1EA]">Cancel</button>
                            <button type="button" onClick={saveEdit} disabled={savingEdit} className="inline-flex items-center gap-2 rounded-full bg-[#0E4D52] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0a3d41] disabled:opacity-50" data-testid="my-support-edit-save">
                                {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
                            </button>
                        </div>
                    </div>
                ) : (
                    <dl className="space-y-2 text-sm">
                        <div className="flex gap-3">
                            <dt className="w-32 shrink-0 text-[#0E4D52]/70">Category</dt>
                            <dd className="text-[#0E4D52]">{CATEGORY_LABEL[ticket.category] || ticket.category}</dd>
                        </div>
                        {ticket.user_note && (
                            <div className="flex gap-3">
                                <dt className="w-32 shrink-0 text-[#0E4D52]/70">Your note</dt>
                                <dd className="whitespace-pre-wrap text-[#0E4D52]">{ticket.user_note}</dd>
                            </div>
                        )}
                        {ticket.user_claimed_answer && (
                            <div className="flex gap-3">
                                <dt className="w-32 shrink-0 text-[#0E4D52]/70">Your answer</dt>
                                <dd className="whitespace-pre-wrap text-[#0E4D52]">{ticket.user_claimed_answer}</dd>
                            </div>
                        )}
                        {ticket.user_claimed_source && (
                            <div className="flex gap-3">
                                <dt className="w-32 shrink-0 text-[#0E4D52]/70">Source</dt>
                                <dd className="text-[#0E4D52]">
                                    {SOURCE_LABEL[ticket.user_claimed_source] || ticket.user_claimed_source}
                                    {ticket.user_claimed_source_detail && ` · ${ticket.user_claimed_source_detail}`}
                                </dd>
                            </div>
                        )}
                        {attachments.length > 0 && (
                            <div className="flex gap-3">
                                <dt className="w-32 shrink-0 text-[#0E4D52]/70">Attached</dt>
                                <dd className="text-[#0E4D52]/85 flex-1">
                                    {attachments.map((a) => (
                                        <AttachmentRow key={a.id} ticketId={ticketId} attachment={a} />
                                    ))}
                                </dd>
                            </div>
                        )}
                    </dl>
                )}
            </section>

            {snapshot && (
                <section className="rounded-xl border border-[#E5DCC9] bg-white">
                    <button
                        type="button"
                        onClick={() => setSnapshotOpen((v) => !v)}
                        className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-[#0E4D52] hover:bg-[#F4F1EA]"
                        data-testid="my-support-snapshot-toggle"
                    >
                        <span className="inline-flex items-center gap-2">
                            <LayoutList className="h-4 w-4 text-[#6B8F71]" aria-hidden="true" />
                            What the tool showed you at the time
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${snapshotOpen ? "rotate-180" : ""}`} />
                    </button>
                    {snapshotOpen && (
                        <div className="border-t border-[#E5DCC9] px-5 py-4 text-xs text-[#0E4D52]/85" data-testid="my-support-snapshot">
                            <div className="mb-2 text-[#0E4D52]/70">
                                {snapshot.tool_name} · {snapshot.tool_version} · captured {fmtFull(snapshot.captured_at)}
                            </div>
                            <pre className="max-h-64 overflow-auto rounded-lg bg-[#F4F1EA] p-3 font-mono text-[11px] text-[#0E4D52]">
                                {JSON.stringify(snapshot.tool_output, null, 2)}
                            </pre>
                        </div>
                    )}
                </section>
            )}

            {/* Timeline (messages + status events combined) */}
            <section className="space-y-3" data-testid="my-support-thread">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#0E4D52]/70">Conversation</h2>
                {timeline.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#E5DCC9] bg-[#FBF8F3] p-5 text-center text-sm text-[#0E4D52]/80">
                        No replies yet. We will be in touch under your reference.
                    </p>
                ) : (
                    timeline.map((item) => item.kind === "message" ? (
                        <article
                            key={item.id}
                            className={`rounded-xl border p-4 ${
                                item.author_type === "user"
                                    ? "ml-6 border-[#0E4D52]/25 bg-[#0E4D52]/5"
                                    : "mr-6 border-[#E5DCC9] bg-white"
                            }`}
                            data-testid={`ticket-msg-${item.author_type}`}
                        >
                            <div className="mb-1 flex items-center gap-2 text-xs text-[#0E4D52]/70">
                                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="font-medium">{item.author_type === "user" ? "You" : "Wayly Team"}</span>
                                <span>·</span>
                                <span>{fmtFull(item.created_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm text-[#0E4D52]">{item.body}</p>
                        </article>
                    ) : (
                        <EventChip key={`${item.event_type}-${item.created_at}`} event={item} />
                    ))
                )}
            </section>

            {canReply && (
                <form onSubmit={sendReply} className="rounded-xl border border-[#E5DCC9] bg-white p-4" data-testid="my-support-reply-form">
                    <label className="mb-2 block text-sm font-semibold text-[#0E4D52]">
                        {ticket.status === "awaiting_user" ? "Reply" : "Add a note"}
                    </label>
                    {replyError && (
                        <div className="mb-3">
                            <StandingBanner variant="error" title="Could not send" onDismiss={() => setReplyError(null)} testId="my-support-reply-error">
                                {replyError}
                            </StandingBanner>
                        </div>
                    )}
                    {fileError && (
                        <div className="mb-3">
                            <StandingBanner variant="warning" title="File issue" onDismiss={() => setFileError(null)} testId="my-support-file-error">
                                {fileError}
                            </StandingBanner>
                        </div>
                    )}
                    <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        rows={4}
                        maxLength={10000}
                        className="w-full rounded-lg border border-[#E5DCC9] bg-white p-3 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                        placeholder="Share any more detail that might help us look into this."
                        data-testid="my-support-reply-input"
                    />
                    {pendingFiles.length > 0 && (
                        <ul className="mt-2 space-y-1" data-testid="my-support-pending-files">
                            {pendingFiles.map((f, i) => (
                                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-[#E5DCC9] bg-[#FBF8F3] px-3 py-1.5 text-xs text-[#0E4D52]">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <FileText className="h-3.5 w-3.5 shrink-0 text-[#6B8F71]" aria-hidden="true" />
                                        <span className="truncate">{f.name}</span>
                                        <span className="text-[#0E4D52]/60 shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removePendingFile(i)}
                                        className="text-[#C2683D] hover:underline text-[11px]"
                                        aria-label={`Remove ${f.name}`}
                                        data-testid={`my-support-remove-file-${i}`}
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf"
                        multiple
                        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                        className="hidden"
                        data-testid="my-support-file-input"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#0E4D52]/25 bg-white px-3 py-1.5 text-xs font-medium text-[#0E4D52] hover:border-[#0E4D52] hover:bg-[#0E4D52] hover:text-white transition"
                            data-testid="my-support-attach-btn"
                        >
                            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                            Attach screenshot or PDF
                        </button>
                        <button
                            type="submit"
                            disabled={(!reply.trim() && !pendingFiles.length) || sending || uploadingFiles}
                            className="inline-flex items-center gap-2 rounded-full bg-[#0E4D52] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3d41] disabled:opacity-50"
                            data-testid="my-support-reply-submit"
                        >
                            {(sending || uploadingFiles) && <Loader2 className="h-4 w-4 animate-spin" />}
                            {uploadingFiles ? "Uploading…" : sending ? "Sending…" : "Send"}
                        </button>
                    </div>
                    <p className="mt-2 text-[11px] text-[#0E4D52]/60">
                        PNG, JPEG, WebP or PDF, up to 10 MB per file.
                    </p>
                </form>
            )}

            {(ticket.status === "resolved" || ticket.status === "closed") && !ticket.csat_score && (
                <div className="rounded-xl border border-[#6B8F71]/40 bg-[#6B8F71]/5 p-5" data-testid="my-support-csat">
                    <h3 className="text-base font-semibold text-[#0E4D52]">Did this help?</h3>
                    <p className="mt-1 text-sm text-[#0E4D52]/85">Let us know whether what we found was useful. Your answer guides what we improve next.</p>
                    {csatError && (
                        <div className="mt-3">
                            <StandingBanner variant="error" title="Could not save feedback" onDismiss={() => setCsatError(null)} testId="my-support-csat-error">
                                {csatError}
                            </StandingBanner>
                        </div>
                    )}
                    <div className="mt-3 flex items-center gap-2" role="radiogroup" aria-label="Rate your experience 1 to 5">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button
                                key={n}
                                type="button"
                                role="radio"
                                aria-checked={csatScore === n}
                                onClick={() => setCsatScore(n)}
                                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
                                    csatScore >= n
                                        ? "border-[#6B8F71] bg-[#6B8F71]/15 text-[#0E4D52]"
                                        : "border-[#E5DCC9] bg-white text-[#0E4D52]/60 hover:border-[#6B8F71]"
                                }`}
                                data-testid={`my-support-csat-${n}`}
                            >
                                <Star className={`h-4 w-4 ${csatScore >= n ? "fill-current" : ""}`} aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={csatComment}
                        onChange={(e) => setCsatComment(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="Anything else you want to add?"
                        className="mt-3 w-full rounded-lg border border-[#E5DCC9] bg-white p-3 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                        data-testid="my-support-csat-comment"
                    />
                    <div className="mt-3 flex justify-end">
                        <button
                            type="button"
                            disabled={!csatScore || csatSubmitting}
                            onClick={submitCsat}
                            className="inline-flex items-center gap-2 rounded-full bg-[#0E4D52] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3d41] disabled:opacity-50"
                            data-testid="my-support-csat-submit"
                        >
                            {csatSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit
                        </button>
                    </div>
                </div>
            )}

            {ticket.csat_score && (
                <div className="rounded-xl border border-[#6B8F71]/40 bg-[#6B8F71]/5 p-4 text-sm text-[#0E4D52]" data-testid="my-support-csat-thanks">
                    Thanks, we have recorded your rating of {ticket.csat_score} of 5.
                </div>
            )}
        </main>
    );
}
