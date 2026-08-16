/**
 * LOOP-1 v1 · Case detail page.
 * Route: /app/participants/:id/cases/:cid
 *
 * Shows the case, its event timeline, and controls to move the status and
 * add notes.
 */
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { formatDate } from "@/lib/formatDate";
import { ChevronLeft, MessageSquare, CheckCircle2, X, ExternalLink, UserPlus } from "lucide-react";

const SEV_TINT = {
    high: "bg-red-50 text-red-700 border-red-100",
    medium: "bg-amber-50 text-amber-700 border-amber-100",
    low: "bg-primary-k/5 text-primary-k border-primary-k/10",
};

const STATUS_OPTIONS = [
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In progress" },
    { value: "waiting_on_provider", label: "Waiting on provider" },
    { value: "resolved", label: "Resolved" },
    { value: "dismissed", label: "Dismissed" },
];

const SOURCE_TOOL_URLS = {
    statement_decoder: "/tools/statement-decoder",
    invoice_checker: "/ai-tools/invoice-checker",
    care_plan_reviewer: "/tools/care-plan-reviewer",
    lf1: "/ai-tools/letters-and-follow-ups",
    ppc: "/ai-tools/provider-price-checker",
    lca1: "/ai-tools/classification-self-check",
    sd3: null,  // resolved dynamically to the pair review page
};

function _sourceUrlFor(caseData, participantId) {
    if (caseData.source_tool === "sd3" && caseData.source_artefact_type === "statement_pair" && caseData.source_artefact_id) {
        return `/app/participants/${participantId}/statement-pairs/${caseData.source_artefact_id}`;
    }
    return SOURCE_TOOL_URLS[caseData.source_tool] || null;
}

export default function CaseDetail() {
    const { id, cid } = useParams();
    const [caseData, setCaseData] = useState(null);
    const [error, setError] = useState(null);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [candidates, setCandidates] = useState([]);

    async function load() {
        setError(null);
        try {
            const r = await api.get(`/loop/cases/${cid}`);
            setCaseData(r.data);
            const c = await api.get(`/loop/cases/${cid}/assignee-candidates`);
            setCandidates(c.data?.candidates || []);
        } catch (e) {
            console.error("[loop1] case fetch failed", e);
            setError(e?.response?.status === 404 ? "not_found" : "error");
        }
    }

    useEffect(() => {
        setCaseData(null);
        load();
    }, [cid]);

    async function changeStatus(newStatus) {
        if (!caseData || caseData.status === newStatus) return;
        setSaving(true);
        try {
            const r = await api.patch(`/loop/cases/${cid}`, { status: newStatus });
            setCaseData({ ...caseData, ...r.data, events: caseData.events });
            await load();
        } finally {
            setSaving(false);
        }
    }

    async function addNote() {
        if (!note.trim()) return;
        setSaving(true);
        try {
            await api.post(`/loop/cases/${cid}/events`, { event_type: "note_added", note });
            setNote("");
            await load();
        } finally {
            setSaving(false);
        }
    }

    async function changeAssignee(newAssigneeUserId) {
        setSaving(true);
        try {
            const r = await api.patch(`/loop/cases/${cid}`, { assignee_user_id: newAssigneeUserId || null });
            setCaseData({ ...caseData, ...r.data, events: caseData.events });
            await load();
        } finally {
            setSaving(false);
        }
    }

    if (error === "not_found") {
        return (
            <div data-testid="loop1-case-not-found" className="max-w-3xl mx-auto p-8 text-center">
                <p className="text-sm text-primary-k/60">This case does not exist or you do not have access.</p>
                <Link to={`/app/participants/${id}`} className="mt-3 inline-block text-primary-k underline">Back to profile</Link>
            </div>
        );
    }

    if (error === "error") {
        return (
            <div data-testid="loop1-case-error" className="max-w-3xl mx-auto p-8 text-center">
                <p className="text-sm text-primary-k/60">Something went wrong loading this case.</p>
            </div>
        );
    }

    if (!caseData) {
        return <div className="max-w-3xl mx-auto p-6"><Skeleton className="h-40 w-full" /></div>;
    }

    const c = caseData;
    const sourceUrl = _sourceUrlFor(c, id);

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="loop1-case-detail-page">
            <Link
                to={`/app/participants/${id}/cases`}
                className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k"
                data-testid="loop1-back-to-cases"
            >
                <ChevronLeft className="w-4 h-4" /> Back to open follow-ups
            </Link>

            <header className="rounded-2xl border border-primary-k/10 bg-white p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                        <p className="text-xs uppercase tracking-wide text-primary-k/50">
                            {c.case_type_label || c.case_type}
                        </p>
                        <h1 className="text-xl font-heading text-primary-k mt-1" data-testid="loop1-case-title">{c.title}</h1>
                        {c.summary && <p className="text-sm text-primary-k/70 mt-2">{c.summary}</p>}
                    </div>
                    <span className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full border ${SEV_TINT[c.severity] || SEV_TINT.medium}`}>
                        {c.severity}
                    </span>
                </div>
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <div className="text-xs text-primary-k/50">Status:</div>
                    <select
                        data-testid="loop1-case-status-select"
                        value={c.status}
                        disabled={saving}
                        onChange={(e) => changeStatus(e.target.value)}
                        className="text-sm border border-primary-k/15 rounded-full px-3 py-1 bg-white text-primary-k focus:outline-none focus:ring-2 focus:ring-primary-k/20"
                    >
                        {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                    {sourceUrl && (
                        <Link
                            to={sourceUrl}
                            data-testid="loop1-open-source-tool"
                            className="ml-auto inline-flex items-center gap-1 text-sm text-primary-k hover:underline"
                        >
                            Open source tool <ExternalLink className="w-3 h-3" />
                        </Link>
                    )}
                </div>
                {candidates.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <UserPlus className="w-3.5 h-3.5 text-primary-k/50" aria-hidden />
                        <div className="text-xs text-primary-k/50">Assigned to:</div>
                        <select
                            data-testid="loop1-case-assignee-select"
                            value={c.assignee_user_id || ""}
                            disabled={saving}
                            onChange={(e) => changeAssignee(e.target.value)}
                            className="text-sm border border-primary-k/15 rounded-full px-3 py-1 bg-white text-primary-k focus:outline-none focus:ring-2 focus:ring-primary-k/20"
                        >
                            <option value="">Unassigned</option>
                            {candidates.map((m) => (
                                <option key={m.user_id} value={m.user_id}>{m.name || m.email} ({m.role})</option>
                            ))}
                        </select>
                    </div>
                )}
                <div className="text-xs text-primary-k/40 mt-3">Opened {formatDate(c.created_at)}</div>
            </header>

            <section className="rounded-2xl border border-primary-k/10 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="w-4 h-4 text-primary-k" aria-hidden />
                    <h2 className="text-base font-semibold text-primary-k">Activity</h2>
                </div>
                <ol className="space-y-2 mb-3" data-testid="loop1-case-events">
                    {(c.events || []).map((e) => (
                        <li key={e.id} className="text-sm border-l-2 border-primary-k/10 pl-3">
                            <div className="text-primary-k">
                                {e.event_type === "opened" && <span>Case opened</span>}
                                {e.event_type === "status_changed" && <span>Status changed: {e.old_status} → {e.new_status}</span>}
                                {e.event_type === "note_added" && <span>{e.note}</span>}
                                {e.event_type === "action_taken" && <span>Action: {e.note}</span>}
                            </div>
                            <div className="text-xs text-primary-k/40">{formatDate(e.created_at)}</div>
                        </li>
                    ))}
                </ol>
                <div className="flex items-start gap-2">
                    <textarea
                        data-testid="loop1-case-note-input"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a note about this case"
                        rows={2}
                        className="flex-1 text-sm border border-primary-k/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-k/20"
                    />
                    <button
                        data-testid="loop1-case-add-note"
                        onClick={addNote}
                        disabled={saving || !note.trim()}
                        className="shrink-0 px-3 py-2 rounded-full bg-primary-k text-white text-sm disabled:opacity-50"
                    >
                        Add note
                    </button>
                </div>
            </section>

            <div className="flex gap-2">
                <button
                    data-testid="loop1-case-resolve"
                    onClick={() => changeStatus("resolved")}
                    disabled={saving || c.status === "resolved"}
                    className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-full bg-green-600 text-white disabled:opacity-50"
                >
                    <CheckCircle2 className="w-4 h-4" /> Mark resolved
                </button>
                <button
                    data-testid="loop1-case-dismiss"
                    onClick={() => changeStatus("dismissed")}
                    disabled={saving || c.status === "dismissed"}
                    className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-full border border-primary-k/20 text-primary-k disabled:opacity-50"
                >
                    <X className="w-4 h-4" /> Dismiss
                </button>
            </div>
        </div>
    );
}
