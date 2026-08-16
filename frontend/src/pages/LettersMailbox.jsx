/**
 * LettersMailbox page. Lists LF-2 chains and their drafts for the active
 * participant. Users can review, edit recipient email/subject/body, and
 * send drafts via the existing LF-2 endpoints.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { toast } from "sonner";
import { ChevronLeft, Send, CheckCircle2, Clock, Mail } from "lucide-react";
import PageIntro from "@/components/PageIntro";
import SmartAISummary from "@/components/SmartAISummary";

const STATUS_TONE = {
    draft: "bg-primary-k/10 text-primary-k",
    sent: "bg-emerald-100 text-emerald-800",
    send_failed: "bg-red-100 text-red-800",
};

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
                    <p className="text-[11px] text-muted-k mt-0.5">Recipient: {draft.recipient_type} · Follow up by {draft.follow_up_due_at?.slice(0, 10) || "-"}</p>
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
                            <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Sent {draft.sent_at?.slice(0,10)}</span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default function LettersMailbox() {
    const { active } = useParticipants();
    const pid = active?.id;
    const [chains, setChains] = useState([]);
    const [drafts, setDrafts] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        if (!pid) return;
        setLoading(true);
        try {
            const { data } = await api.get(`/lf2/participants/${pid}/chains`);
            setChains(data.chains || []);
            setDrafts(data.drafts || []);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [pid]);

    const onDraftUpdated = (updated) => {
        setDrafts(list => list.map(d => d.id === updated.id ? { ...d, ...updated } : d));
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="lf2-mailbox-root">
            <Link to="/app" className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4"/> Back
            </Link>
            <PageIntro
                eyebrow="Letters And Follow-Ups"
                title="Your Letter Mailbox"
                description="Every letter chain generated by Wayly, ready to review, edit, and send. Nothing is sent without your explicit click."
                whatItDoes="Groups drafts by the chain that generated them (hardship application, provider switch, CHSP dispute, complaint escalation) and gives you edit + send controls per draft."
                howToUse={[
                    "Pick a chain to see its drafts.",
                    "Edit the subject, body, and add the recipient email.",
                    "Send when you're ready. Follow-up dates are recorded automatically.",
                ]}
                whatYouGet={[
                    "One inbox for every important letter in the household.",
                    "Automatic follow-up reminders after each send.",
                    "A permanent paper trail if the matter escalates.",
                ]}
            />

            {chains.length > 0 && (
                <SmartAISummary
                    pageKey="letters-mailbox"
                    context={{
                        chain_count: chains.length,
                        draft_count: drafts.length,
                        drafts_awaiting_send: drafts.filter((d) => d.status === "draft").length,
                        drafts_sent: drafts.filter((d) => d.status === "sent").length,
                        drafts_failed: drafts.filter((d) => d.status === "send_failed").length,
                        drafts_missing_recipient: drafts.filter((d) => d.status === "draft" && !d.recipient_email).length,
                    }}
                />
            )}

            {loading && <p className="text-sm text-muted-k">Loading,</p>}
            {!loading && chains.length === 0 && (
                <div className="rounded-2xl border border-dashed border-primary-k/20 p-8 text-center" data-testid="lf2-mailbox-empty">
                    <Mail className="w-8 h-8 text-primary-k/30 mx-auto"/>
                    <p className="text-sm text-muted-k mt-3">No chains yet. Generate one from the hardship walkthrough, provider switch decision, or CHSP dispute flow.</p>
                </div>
            )}

            {chains.map(chain => {
                const chainDrafts = drafts.filter(d => d.chain_id === chain.id).sort((a,b) => (a.step_order||0) - (b.step_order||0));
                return (
                    <section key={chain.id} className="space-y-3" data-testid={`lf2-chain-${chain.id}`}>
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary-k/50"/>
                            <h2 className="text-base font-semibold text-primary-k">{chain.title}</h2>
                            <span className="text-xs text-muted-k">· {chainDrafts.length} letter{chainDrafts.length !== 1 ? "s" : ""}</span>
                        </div>
                        {chainDrafts.map(d => <DraftRow key={d.id} draft={d} onSaved={onDraftUpdated}/>)}
                    </section>
                );
            })}
        </div>
    );
}
