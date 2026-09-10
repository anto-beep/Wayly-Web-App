import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import {
    Loader2, ArrowLeft, Mail, MessageSquare, FileText, AlertTriangle,
    ShieldAlert, ChevronRight, Clock, CheckCircle2, ArrowUpRight, TrendingUp,
    Search, Trash2, Inbox, PenLine, X, Send, Circle,
} from "lucide-react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

/**
 * LF-1 mailbox — every letter drafted, sent, or received, with follow-up
 * tracking, search, status filters, and inline delete.
 */

const ARCHETYPE_ICON = {
    request: FileText,
    dispute: FileText,
    complaint: MessageSquare,
    escalation: AlertTriangle,
    notification: FileText,
    response_draft: Mail,
    guided_pathway: ShieldAlert,
};

const ARCHETYPE_LABEL = {
    request: "Request",
    dispute: "Dispute",
    complaint: "Complaint",
    escalation: "Escalation",
    notification: "Notification",
    response_draft: "Reply",
    guided_pathway: "Safeguarding",
};

const STATUS_TONE = {
    draft:              { chip: "bg-surface-2 text-muted-k border-kindred", label: "Draft" },
    sent:               { chip: "bg-primary-k/10 text-primary-k border-primary-k/25", label: "Sent" },
    awaiting_response:  { chip: "bg-clay/10 text-clay border-clay/30", label: "Awaiting response" },
    responded:          { chip: "bg-sage/15 text-sage border-sage/30", label: "Responded" },
    escalated:          { chip: "bg-terracotta/10 text-terracotta border-terracotta/30", label: "Escalated" },
    closed:             { chip: "bg-surface-2 text-muted-k border-kindred", label: "Closed" },
};

const STATUS_FILTERS = [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts" },
    { key: "sent", label: "Sent" },
    { key: "awaiting_response", label: "Awaiting reply" },
    { key: "responded", label: "Responded" },
    { key: "escalated", label: "Escalated" },
    { key: "closed", label: "Closed" },
];

export default function CorrespondenceLog() {
    const [entries, setEntries] = useState(null);
    const [error, setError] = useState(null);
    const [followUps, setFollowUps] = useState({ overdue: [], upcoming: [] });
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [busyDelete, setBusyDelete] = useState(false);

    const loadAll = () => {
        api.get("/lf1/correspondence")
            .then((r) => setEntries(r.data?.entries || []))
            .catch((err) => setError(extractErrorMessage(err, "Could not load your mailbox.")));
        api.get("/lf1/follow-ups")
            .then((r) => setFollowUps({
                overdue: r.data?.overdue || [],
                upcoming: r.data?.upcoming || [],
            }))
            .catch(() => setFollowUps({ overdue: [], upcoming: [] }));
    };

    useEffect(() => { loadAll(); }, []);

    const filtered = useMemo(() => {
        if (!entries) return [];
        const q = query.trim().toLowerCase();
        return entries.filter((e) => {
            if (statusFilter !== "all" && e.status !== statusFilter) return false;
            if (typeFilter !== "all" && e.archetype !== typeFilter) return false;
            if (q) {
                const hay = [
                    e.situation_label, e.archetype, e.recipient_type,
                    e.recipient_specific?.entity_name, e.inbound_from_label, e.inbound_source,
                    e.intake?.subject,
                ].filter(Boolean).join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [entries, query, statusFilter, typeFilter]);

    const doDelete = async () => {
        if (!deleteTarget) return;
        setBusyDelete(true);
        try {
            await api.delete(`/lf1/correspondence/${deleteTarget.id}`);
            setEntries((list) => (list || []).filter((e) => e.id !== deleteTarget.id));
            toast.success("Entry deleted");
            setDeleteTarget(null);
            loadAll();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not delete this entry."));
        } finally {
            setBusyDelete(false);
        }
    };

    const statusCounts = useMemo(() => {
        const c = {};
        (entries || []).forEach((e) => { c[e.status] = (c[e.status] || 0) + 1; });
        return c;
    }, [entries]);

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-5xl px-6 pt-10 pb-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Link
                        to="/ai-tools/letters-and-follow-ups"
                        className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"
                        data-testid="lf1-log-back"
                    >
                        <ArrowLeft className="h-4 w-4" /> Back to Letters &amp; Follow-ups
                    </Link>
                    <Link
                        to="/ai-tools/letters-and-follow-ups"
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-[#091D33] transition-colors"
                        data-testid="lf1-log-new"
                    >
                        <PenLine className="h-4 w-4" /> Draft a new letter
                    </Link>
                </div>
                <h1
                    className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight"
                    data-testid="lf1-log-title"
                >
                    Your mailbox
                </h1>
                <p className="mt-3 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Every letter you have drafted, sent, or received — in one place. Track follow-ups, escalate on time, and keep a case file for each situation.
                </p>
            </section>

            <section className="mx-auto max-w-5xl px-6 pb-16 space-y-6">
                {entries === null && !error && (
                    <div className="text-muted-k inline-flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                )}
                {error && <div className="text-sm text-terracotta" data-testid="lf1-log-error">{error}</div>}

                {/* Follow-up + escalation panel */}
                {(followUps.overdue.length > 0 || followUps.upcoming.length > 0) && (
                    <FollowUpPanel followUps={followUps} onEscalated={loadAll} />
                )}

                {entries && entries.length === 0 && (
                    <div
                        className="bg-surface border border-kindred rounded-2xl p-10 text-center"
                        data-testid="lf1-log-empty"
                    >
                        <span className="mx-auto h-12 w-12 rounded-full bg-primary-k/10 flex items-center justify-center">
                            <Inbox className="h-6 w-6 text-primary-k" />
                        </span>
                        <div className="font-heading text-2xl text-primary-k mt-4">No letters yet</div>
                        <p className="mt-2 text-muted-k">
                            Start with the situation that fits and we will build the draft and track the response.
                        </p>
                        <Link
                            to="/ai-tools/letters-and-follow-ups"
                            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-k text-white text-sm hover:bg-[#091D33]"
                        >
                            <PenLine className="h-4 w-4" /> Draft your first letter
                        </Link>
                    </div>
                )}

                {entries && entries.length > 0 && (
                    <>
                        {/* Controls: search + status filters + type filter */}
                        <div className="space-y-3" data-testid="lf1-log-controls">
                            <div className="relative">
                                <Search className="h-4 w-4 text-muted-k absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search by subject, recipient, or type…"
                                    data-testid="lf1-log-search"
                                    className="w-full rounded-full border border-kindred bg-surface pl-9 pr-9 py-2.5 text-sm text-primary-k focus:border-primary-k focus:outline-none"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-k hover:text-primary-k"
                                        aria-label="Clear search"
                                        data-testid="lf1-log-search-clear"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap" data-testid="lf1-log-status-filters">
                                    {STATUS_FILTERS.map((f) => {
                                        const count = f.key === "all" ? entries.length : (statusCounts[f.key] || 0);
                                        if (f.key !== "all" && count === 0) return null;
                                        const active = statusFilter === f.key;
                                        return (
                                            <button
                                                key={f.key}
                                                type="button"
                                                onClick={() => setStatusFilter(f.key)}
                                                data-testid={`lf1-log-filter-${f.key}`}
                                                className={[
                                                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                                                    active
                                                        ? "bg-primary-k text-white border-primary-k"
                                                        : "bg-surface border-kindred text-primary-k hover:border-primary-k",
                                                ].join(" ")}
                                            >
                                                {f.label}
                                                <span className={active ? "text-white/70" : "text-muted-k"}>{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <select
                                    value={typeFilter}
                                    onChange={(e) => setTypeFilter(e.target.value)}
                                    data-testid="lf1-log-type-filter"
                                    className="rounded-full border border-kindred bg-surface px-3 py-1.5 text-xs text-primary-k focus:border-primary-k focus:outline-none"
                                >
                                    <option value="all">All types</option>
                                    {Object.entries(ARCHETYPE_LABEL).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="bg-surface border border-kindred rounded-2xl p-8 text-center text-sm text-muted-k" data-testid="lf1-log-no-matches">
                                No letters match your filters.
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-kindred bg-surface overflow-hidden divide-y divide-kindred" data-testid="lf1-log-list">
                                {filtered.map((e) => (
                                    <MailboxRow key={e.id} entry={e} onDelete={() => setDeleteTarget(e)} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </section>

            <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <DialogContent data-testid="lf1-log-delete-modal">
                    <DialogHeader>
                        <DialogTitle>Delete this entry?</DialogTitle>
                        <DialogDescription>
                            This removes the entry from your mailbox. A deletion record is kept for audit purposes.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <button
                            type="button"
                            onClick={() => setDeleteTarget(null)}
                            className="px-3.5 py-2 rounded-full border border-kindred text-primary-k text-sm"
                        >
                            Keep it
                        </button>
                        <button
                            type="button"
                            onClick={doDelete}
                            disabled={busyDelete}
                            className="px-3.5 py-2 rounded-full bg-terracotta text-white text-sm disabled:opacity-60 inline-flex items-center gap-1.5"
                            data-testid="lf1-log-delete-confirm"
                        >
                            {busyDelete ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            {busyDelete ? "Deleting…" : "Delete"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Footer />
        </div>
    );
}


// ---------------------------------------------------------------------
// Follow-up + escalation panel
// ---------------------------------------------------------------------

function FollowUpPanel({ followUps, onEscalated }) {
    const allIds = useMemo(
        () => [...(followUps.overdue || []), ...(followUps.upcoming || [])].map((e) => e.id).filter(Boolean),
        [followUps],
    );
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [busyBulk, setBusyBulk] = useState(false);
    const [bulkResult, setBulkResult] = useState("");

    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
    const selectAllOverdue = () => setSelected(new Set((followUps.overdue || []).map((e) => e.id).filter(Boolean)));

    const sendChaseUps = async () => {
        const ids = [...selected];
        if (!ids.length) return;
        setBusyBulk(true);
        setBulkResult("");
        try {
            const r = await api.post("/lf1/follow-ups/bulk-send", { entry_ids: ids });
            const count = r.data?.count ?? ids.length;
            setBulkResult(`Chased ${count} letter${count === 1 ? "" : "s"}. The reply clock has been reset.`);
            toast.success(`Sent ${count} chase-up${count === 1 ? "" : "s"}.`);
            exitSelect();
            onEscalated?.();
        } catch (err) {
            const msg = extractErrorMessage(err, "We couldn't send those chase-ups.");
            setBulkResult(msg);
            toast.error(msg);
        } finally {
            setBusyBulk(false);
        }
    };

    return (
        <div className="bg-surface border border-clay/30 rounded-2xl p-5" data-testid="lf1-follow-up-panel">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-clay" aria-hidden="true" />
                    <div className="font-heading text-xl text-primary-k">Follow-ups</div>
                </div>
                {allIds.length > 0 && (
                    <button
                        type="button"
                        onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                        data-testid="lf1-followups-select-toggle"
                        className="text-sm font-medium text-primary-k hover:underline"
                    >
                        {selectMode ? "Cancel" : "Chase up"}
                    </button>
                )}
            </div>
            {selectMode && (
                <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-k" data-testid="lf1-followups-selected-count">{selected.size} selected</span>
                    {(followUps.overdue || []).length > 0 && (
                        <button type="button" onClick={selectAllOverdue} data-testid="lf1-followups-select-all-overdue" className="text-xs font-medium text-primary-k hover:underline">
                            Select all overdue
                        </button>
                    )}
                </div>
            )}
            {followUps.overdue.length > 0 && (
                <div className="mt-3">
                    <div className="text-xs uppercase tracking-wider text-terracotta mb-2">
                        Overdue ({followUps.overdue.length})
                    </div>
                    <ul className="space-y-2" data-testid="lf1-followups-overdue">
                        {followUps.overdue.map((e) => (
                            <FollowUpRow key={e.id} entry={e} isOverdue onEscalated={onEscalated}
                                selectMode={selectMode} selected={selected.has(e.id)} onToggle={toggle} />
                        ))}
                    </ul>
                </div>
            )}
            {followUps.upcoming.length > 0 && (
                <div className="mt-4">
                    <div className="text-xs uppercase tracking-wider text-muted-k mb-2">
                        Due soon ({followUps.upcoming.length})
                    </div>
                    <ul className="space-y-2" data-testid="lf1-followups-upcoming">
                        {followUps.upcoming.map((e) => (
                            <FollowUpRow key={e.id} entry={e} onEscalated={onEscalated}
                                selectMode={selectMode} selected={selected.has(e.id)} onToggle={toggle} />
                        ))}
                    </ul>
                </div>
            )}
            {selectMode && (
                <button
                    type="button"
                    onClick={sendChaseUps}
                    disabled={busyBulk || selected.size === 0}
                    data-testid="lf1-followups-bulk-send"
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary-k text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-k/90 disabled:opacity-60"
                >
                    {busyBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {busyBulk ? "Sending chase-ups…" : `Send ${selected.size || ""} chase-up${selected.size === 1 ? "" : "s"}`.replace("  ", " ")}
                </button>
            )}
            {bulkResult && <div className="mt-2 text-sm text-sage" data-testid="lf1-followups-bulk-result">{bulkResult}</div>}
        </div>
    );
}

function FollowUpRow({ entry, isOverdue = false, onEscalated, selectMode = false, selected = false, onToggle }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const canEscalate = entry.recipient_type && ["provider_cm", "provider_senior", "mac", "acqsc"].includes(entry.recipient_type);

    const escalate = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/lf1/correspondence/${entry.id}/escalate`);
            onEscalated?.();
        } catch (err) {
            setError(extractErrorMessage(err, "Could not escalate."));
        } finally {
            setBusy(false);
        }
    };

    const daysCopy = () => {
        const d = entry.days_until_due;
        if (d === undefined) return "";
        if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
        if (d === 0) return "Due today";
        return `Due in ${d} day${d === 1 ? "" : "s"}`;
    };

    return (
        <li className={`rounded-xl border bg-surface-2 p-3.5 ${selectMode && selected ? "border-primary-k" : "border-kindred"}`}>
            <div className="flex items-start gap-3">
                {selectMode ? (
                    <button
                        type="button"
                        onClick={() => onToggle?.(entry.id)}
                        data-testid={`lf1-followup-select-${entry.id}`}
                        className="mt-0.5 shrink-0"
                        aria-label={selected ? "Deselect" : "Select"}
                    >
                        {selected
                            ? <CheckCircle2 className="h-5 w-5 text-primary-k" aria-hidden="true" />
                            : <Circle className="h-5 w-5 text-muted-k" aria-hidden="true" />}
                    </button>
                ) : (
                    <Clock className={isOverdue ? "h-4 w-4 mt-0.5 text-terracotta" : "h-4 w-4 mt-0.5 text-muted-k"} aria-hidden="true" />
                )}
                <div className="flex-1 min-w-0">
                    {selectMode ? (
                        <button type="button" onClick={() => onToggle?.(entry.id)} className="text-left text-sm text-primary-k hover:underline" data-testid={`lf1-followup-open-${entry.id}`}>
                            {entry.situation_label || ARCHETYPE_LABEL[entry.archetype] || entry.archetype}
                        </button>
                    ) : (
                        <Link
                            to={`/tools/letters-and-follow-ups/${entry.id}`}
                            className="text-sm text-primary-k hover:underline"
                            data-testid={`lf1-followup-open-${entry.id}`}
                        >
                            {entry.situation_label || ARCHETYPE_LABEL[entry.archetype] || entry.archetype}
                        </Link>
                    )}
                    <div className="text-xs text-muted-k mt-0.5">
                        {daysCopy()} · Suggested: {entry.suggested_next_action}
                    </div>
                </div>
                {!selectMode && canEscalate && (
                    <button
                        type="button"
                        onClick={escalate}
                        disabled={busy}
                        data-testid={`lf1-followup-escalate-${entry.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-primary-k text-primary-k px-3 py-1 text-xs hover:bg-primary-k hover:text-white disabled:opacity-60"
                    >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpRight className="h-3 w-3" />}
                        Escalate
                    </button>
                )}
            </div>
            {error && <div className="mt-1 text-xs text-terracotta" data-testid={`lf1-followup-error-${entry.id}`}>{error}</div>}
        </li>
    );
}


// ---------------------------------------------------------------------
// Mailbox row
// ---------------------------------------------------------------------

function MailboxRow({ entry, onDelete }) {
    const Icon = ARCHETYPE_ICON[entry.archetype] || FileText;
    const tone = STATUS_TONE[entry.status] || STATUS_TONE.draft;
    const isInbound = entry.direction === "inbound";
    const typeLabel = ARCHETYPE_LABEL[entry.archetype] || "Letter";
    const recipient = isInbound
        ? `From ${entry.inbound_from_label || entry.inbound_source || "sender"}`
        : `To ${entry.recipient_specific?.entity_name || recipientTypeLabel(entry.recipient_type)}`;

    return (
        <div className="group relative flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors" data-testid={`lf1-log-entry-${entry.id}`}>
            <Link
                to={`/tools/letters-and-follow-ups/${entry.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
            >
                <span className="h-10 w-10 rounded-xl bg-primary-k/[0.06] flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4.5 w-4.5 text-primary-k" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-primary-k font-medium truncate">
                            {entry.intake?.subject || entry.situation_label || typeLabel}
                        </span>
                        <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${tone.chip}`}
                            data-testid={`lf1-log-entry-status-${entry.id}`}
                        >
                            {tone.label}
                        </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-k">
                        <span className="uppercase tracking-wider">{typeLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{recipient}</span>
                        {entry.follow_up_date && entry.status !== "responded" && entry.status !== "closed" && (
                            <span className="inline-flex items-center gap-1">
                                <span aria-hidden="true">·</span>
                                <Clock className="h-3 w-3" /> Follow up by {formatDate(entry.follow_up_date)}
                            </span>
                        )}
                        {entry.sent_at && (
                            <span className="inline-flex items-center gap-1">
                                <span aria-hidden="true">·</span>
                                <CheckCircle2 className="h-3 w-3" /> Sent {formatDate(entry.sent_at)}
                            </span>
                        )}
                    </div>
                </div>
            </Link>
            {entry.status !== "sent" && (
                <button
                    type="button"
                    onClick={onDelete}
                    aria-label="Delete entry"
                    data-testid={`lf1-log-delete-${entry.id}`}
                    className="text-muted-k hover:text-terracotta p-1.5 rounded-lg hover:bg-terracotta/10 transition-colors flex-shrink-0"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            )}
            <ChevronRight className="h-4 w-4 text-muted-k flex-shrink-0" aria-hidden="true" />
        </div>
    );
}

function recipientTypeLabel(rt) {
    return ({
        mac: "My Aged Care",
        acqsc: "Aged Care Quality and Safety Commission",
        complaints_commissioner: "Aged Care Complaints Commissioner",
        ombudsman: "Commonwealth Ombudsman",
        provider_cm: "Provider care manager",
        provider_senior: "Provider (senior)",
        services_australia_aged_care: "Services Australia, Aged Care",
        opan: "OPAN",
        other: "Other recipient",
    })[rt] || rt || "Recipient not set";
}

function formatDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    } catch { return iso; }
}
