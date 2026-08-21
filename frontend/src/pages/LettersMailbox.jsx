/**
 * LettersMailbox page (web). Mirrors the mobile Letters Mailbox: it is built
 * on the LF-1 correspondence system, offers a "Draft a new letter" button
 * that opens the Letters & Follow-ups tool, surfaces overdue/upcoming
 * follow-ups, and lists every LF-1 letter linking to its editor. The older
 * LF-2 auto-generated chains still render below when present so nothing is
 * lost for existing households.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { toast } from "sonner";
import { ChevronLeft, Send, CheckCircle2, Clock, Mail, PenLine, AlertTriangle, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import PageIntro from "@/components/PageIntro";
import SmartAISummary from "@/components/SmartAISummary";
import { formatDate } from "@/lib/formatDate";

const ARCHETYPE_LABEL = {
    dispute: "Fee dispute", reassessment: "Reassessment request", complaint: "Complaint",
    service_change: "Service change", hardship: "Hardship notification", care_plan_amendment: "Care plan amendment",
    general: "General letter", response: "Response to provider", safeguarding: "Safeguarding record",
    escalation: "Regulator escalation",
};
const RECIPIENT_LABEL = {
    provider_cm: "Provider (Care Manager)", provider: "Provider", mac: "My Aged Care",
    acqsc: "ACQSC", ombudsman: "Ombudsman", services_australia: "Services Australia",
};
const STATUS_TONE = {
    draft: "bg-primary-k/10 text-primary-k",
    sent: "bg-emerald-100 text-emerald-800",
    awaiting_response: "bg-gold-100 text-gold-800",
    responded: "bg-emerald-100 text-emerald-800",
    closed: "bg-surface-2 text-muted-k",
    send_failed: "bg-red-100 text-red-800",
};
function pretty(s, map) {
    if (!s) return "";
    return (map && map[s]) || String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DraftRow({ draft, onSaved }) {
    const [editing, setEditing] = useState(false);
    const [subject, setSubject] = useState(draft.subject || "");
    const [body, setBody] = useState(draft.body_text || "");
    const [recipient, setRecipient] = useState(draft.recipient_email || "");
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            const { data } = await api.patch(`/lf2/drafts/${draft.id}`, { subject, body_text: body, recipient_email: recipient || null });
            toast.success("Draft saved");
            onSaved?.(data.draft);
            setEditing(false);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not save draft");
        } finally { setBusy(false); }
    };

    const send = async () => {
        if (!recipient) { toast.error("Add recipient email first"); return; }
        setBusy(true);
        try {
            const { data } = await api.post(`/lf2/drafts/${draft.id}/send`);
            if (data.sent) toast.success("Letter sent"); else toast.error("Send failed. Retry or check recipient.");
            onSaved?.({ ...draft, status: data.sent ? "sent" : "send_failed", sent_at: data.sent ? new Date().toISOString() : null });
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Send failed");
        } finally { setBusy(false); }
    };

    return (
        <div className="rounded-lg border border-primary-k/10 bg-white p-4 space-y-2" data-testid={`lf2-draft-${draft.id}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-sm font-medium text-primary-k">{draft.subject}</p>
                    <p className="text-[11px] text-muted-k mt-0.5">Recipient: {draft.recipient_type} · Follow up by {formatDate(draft.follow_up_due_at) || "-"}</p>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_TONE[draft.status] || STATUS_TONE.draft}`} data-testid={`lf2-draft-status-${draft.id}`}>{draft.status}</span>
            </div>
            {editing ? (
                <div className="space-y-2">
                    <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" data-testid={`lf2-draft-subject-${draft.id}`}
                           className="w-full text-sm border border-primary-k/20 rounded-lg p-2"/>
                    <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Recipient email" type="email" data-testid={`lf2-draft-recipient-${draft.id}`}
                           className="w-full text-sm border border-primary-k/20 rounded-lg p-2"/>
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} data-testid={`lf2-draft-body-${draft.id}`}
                              className="w-full text-sm border border-primary-k/20 rounded-lg p-2"/>
                    <div className="flex gap-2">
                        <button onClick={save} disabled={busy} data-testid={`lf2-draft-save-${draft.id}`}
                                className="text-xs px-3 py-1.5 rounded-full bg-primary-k text-white">Save</button>
                        <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded-full border border-primary-k/20">Cancel</button>
                    </div>
                </div>
            ) : (
                <>
                    <pre className="text-xs text-primary-k/80 whitespace-pre-wrap font-sans bg-primary-k/[0.03] rounded p-2 max-h-40 overflow-y-auto">{draft.body_text}</pre>
                    <div className="flex gap-2 flex-wrap items-center">
                        {draft.status !== "sent" && (
                            <>
                                <button onClick={() => setEditing(true)} data-testid={`lf2-draft-edit-${draft.id}`}
                                        className="text-xs px-3 py-1.5 rounded-full border border-primary-k/20 hover:bg-surface-2">Edit</button>
                                <button onClick={send} disabled={busy || !draft.recipient_email} data-testid={`lf2-draft-send-${draft.id}`}
                                        className="text-xs px-3 py-1.5 rounded-full bg-primary-k text-white inline-flex items-center gap-1 disabled:opacity-40">
                                    <Send className="w-3 h-3"/> Send
                                </button>
                                {!draft.recipient_email && <span className="text-[11px] text-amber-700">Add recipient before sending</span>}
                            </>
                        )}
                        {draft.status === "sent" && (
                            <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Sent {formatDate(draft.sent_at)}</span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default function LettersMailbox() {
    const navigate = useNavigate();
    const { active } = useParticipants();
    const pid = active?.id;

    const [entries, setEntries] = useState([]);
    const [overdue, setOverdue] = useState([]);
    const [upcoming, setUpcoming] = useState([]);
    const [chains, setChains] = useState([]);
    const [drafts, setDrafts] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const q = pid ? `?participant_id=${pid}` : "";
        try {
            const [c, f, lf2] = await Promise.all([
                api.get(`/lf1/correspondence${q}`).then((r) => r.data).catch(() => ({ entries: [] })),
                api.get(`/lf1/follow-ups${q}`).then((r) => r.data).catch(() => ({ overdue: [], upcoming: [] })),
                pid ? api.get(`/lf2/participants/${pid}/chains`).then((r) => r.data).catch(() => ({ chains: [], drafts: [] })) : Promise.resolve({ chains: [], drafts: [] }),
            ]);
            setEntries(c?.entries || []);
            setOverdue(f?.overdue || []);
            setUpcoming(f?.upcoming || []);
            setChains(lf2?.chains || []);
            setDrafts(lf2?.drafts || []);
        } finally {
            setLoading(false);
        }
    }, [pid]);
    useEffect(() => { load(); }, [load]);

    const onDraftUpdated = (updated) => {
        setDrafts((list) => list.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
    };

    const draftNew = () => navigate("/ai-tools/letters-and-follow-ups");

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="lf1-mailbox-root">
            <Link to="/app" className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4"/> Back
            </Link>

            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <PageIntro
                    eyebrow="Letters And Follow-Ups"
                    title="Your Letter Mailbox"
                    description="Every letter Wayly has helped you draft, ready to review, edit, and send. Nothing is sent without your explicit click."
                    whatItDoes="Keeps your drafts and sent letters in one place with automatic follow-up reminders, and lets you start a brand new letter for any situation."
                    className="flex-1 min-w-0"
                />
                <button
                    type="button"
                    onClick={draftNew}
                    data-testid="letters-new-btn"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90 whitespace-nowrap"
                >
                    <PenLine className="h-4 w-4" /> Draft a new letter
                </button>
            </div>

            {(entries.length > 0 || overdue.length > 0 || upcoming.length > 0) && (
                <SmartAISummary
                    pageKey="letters-mailbox"
                    context={{
                        entry_count: entries.length,
                        overdue_followups: overdue.length,
                        upcoming_followups: upcoming.length,
                        by_status: entries.reduce((acc, e) => { const k = e.status || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
                    }}
                />
            )}

            {overdue.length > 0 && (
                <div className="rounded-xl border border-terracotta-200 bg-terracotta-50 p-4" data-testid="letters-overdue">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-terracotta" />
                        <span className="text-sm font-semibold text-terracotta-800">Overdue follow-ups ({overdue.length})</span>
                    </div>
                    {overdue.map((f, i) => (
                        <p key={f.entry_id || f.id || i} className="text-sm text-primary-k">• {pretty(f.archetype, ARCHETYPE_LABEL) || f.label || "Follow-up"}{f.due_at ? ` · due ${formatDate(f.due_at)}` : ""}</p>
                    ))}
                </div>
            )}

            {upcoming.length > 0 && (
                <div className="rounded-xl border border-kindred bg-surface p-4" data-testid="letters-upcoming">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-gold" />
                        <span className="text-sm font-semibold text-primary-k">Upcoming follow-ups ({upcoming.length})</span>
                    </div>
                    {upcoming.map((f, i) => (
                        <p key={f.entry_id || f.id || i} className="text-sm text-primary-k">• {pretty(f.archetype, ARCHETYPE_LABEL) || f.label || "Follow-up"}{f.due_at ? ` · due ${formatDate(f.due_at)}` : ""}</p>
                    ))}
                </div>
            )}

            <div className="text-[11px] uppercase tracking-wider text-muted-k font-medium pt-2">All letters</div>

            {loading ? (
                <p className="text-sm text-muted-k">Loading…</p>
            ) : entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-primary-k/20 p-8 text-center" data-testid="letters-empty">
                    <Mail className="w-8 h-8 text-primary-k/30 mx-auto"/>
                    <p className="text-sm text-muted-k mt-3">No letters yet. Draft your first one and it will live here with follow-up reminders.</p>
                    <button type="button" onClick={draftNew} data-testid="letters-empty-draft-btn" className="mt-4 inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-4 py-2 text-sm hover:bg-primary-k/90">
                        <PenLine className="h-4 w-4" /> Draft a letter
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {entries.map((e) => {
                        const inbound = e.direction === "inbound";
                        const DirIcon = inbound ? ArrowDownLeft : ArrowUpRight;
                        return (
                            <Link
                                key={e.id}
                                to={`/tools/letters-and-follow-ups/${e.id}`}
                                data-testid={`letter-${e.id}`}
                                className="block rounded-lg border border-primary-k/10 bg-white p-4 hover:bg-primary-k/[0.02] transition-colors"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="h-9 w-9 rounded-full bg-sage/15 flex items-center justify-center flex-none"><DirIcon className="h-4 w-4 text-primary-k" /></span>
                                        <span className="text-sm font-medium text-primary-k truncate">{pretty(e.archetype, ARCHETYPE_LABEL) || "Letter"}</span>
                                    </div>
                                    {e.status && <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_TONE[e.status] || STATUS_TONE.draft}`}>{pretty(e.status)}</span>}
                                </div>
                                <p className="text-[11px] text-muted-k mt-2">{inbound ? "From" : "To"} {pretty(e.recipient_type, RECIPIENT_LABEL) || "recipient"} · {formatDate(e.created_at)}</p>
                            </Link>
                        );
                    })}
                </div>
            )}

            {chains.length > 0 && (
                <div className="pt-4 space-y-4">
                    <div className="text-[11px] uppercase tracking-wider text-muted-k font-medium">Auto-generated letter chains</div>
                    {chains.map((chain) => {
                        const chainDrafts = drafts.filter((d) => d.chain_id === chain.id).sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
                        return (
                            <section key={chain.id} className="space-y-3" data-testid={`lf2-chain-${chain.id}`}>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-primary-k/50"/>
                                    <h2 className="text-base font-semibold text-primary-k">{chain.title}</h2>
                                    <span className="text-xs text-muted-k">· {chainDrafts.length} letter{chainDrafts.length !== 1 ? "s" : ""}</span>
                                </div>
                                {chainDrafts.map((d) => <DraftRow key={d.id} draft={d} onSaved={onDraftUpdated}/>)}
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
