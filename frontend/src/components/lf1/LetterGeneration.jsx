import React, { useEffect, useMemo, useState, useCallback } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import ADMDisclosure, { ADMDisclosureTrigger } from "@/components/adm/ADMDisclosure";
import { useParticipantPrefill } from "@/hooks/useParticipantPrefill";
import {
    Sparkles, Loader2, FileText, MessageSquare, Info, Paperclip, X,
    Link as LinkIcon, ThumbsUp, ThumbsDown, ShieldCheck, Users, PenLine,
    ArrowUpRight, ClipboardCheck, AlertTriangle, MailCheck, Calendar, Send,
} from "lucide-react";

/* =====================================================================
   LF-1 v1.2, Frontend generation surface for Iterations 2, 3, 4.
   =====================================================================

   Sub-components exported from this file:

     ArchetypeIntakeForm    , 6 archetype-specific intake screens.
     CrossToolImportPanel   , Iter-3 tap-through pre-fill from other tools.
     GenerateButton         , POST /:id/generate with 422 gate.
     CoverNotePanel         , recipient block + response window + OPAN cc.
     OutputFormatSwitcher   , email / MAC portal / PDF viewer.
     FeedbackChip           , thumbs up/down (Iter 3).
     ToneCheckPanel         , tone/claim review (feature-flag gated).
     ShareAndSignOffPanel   , Family Coordinator share + sign-off (Iter 4).
     LF1ADMDisclosure       , shared ADM disclosure trigger + modal.
     SafeguardingRecordButton, situation 11 guided-pathway generator.
     ResponseDraftForm      , situation 12 reply-builder.
   ===================================================================== */


// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

function humanise(field) {
    return field.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatBytes(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const CHANGE_TYPE_OPTIONS = [
    { key: "condition_change", label: "Condition has changed" },
    { key: "post_hospital", label: "Post-hospital reassessment" },
    { key: "care_plan_amendment", label: "Care plan amendment" },
    { key: "representative_update", label: "Update recorded representative" },
    { key: "other", label: "Other" },
];

const DISPUTE_TYPE_OPTIONS = [
    { key: "charge_disputed", label: "Charge on statement" },
    { key: "assessment_outcome", label: "Assessment outcome" },
    { key: "classification", label: "Classification decision" },
    { key: "other", label: "Other" },
];

const COMPLAINT_CATEGORY_OPTIONS = [
    { key: "care_quality", label: "Care quality" },
    { key: "service_delivery", label: "Service delivery" },
    { key: "communication", label: "Communication" },
    { key: "financial", label: "Financial / billing" },
    { key: "worker_conduct", label: "Worker conduct" },
    { key: "safety", label: "Safety" },
    { key: "other", label: "Other" },
];

const NOTIFICATION_TYPE_OPTIONS = [
    { key: "hardship", label: "Financial hardship" },
    { key: "provider_transfer", label: "Provider or care manager change" },
    { key: "representative_change", label: "Recorded representative update" },
    { key: "contact_details", label: "Contact details update" },
    { key: "other", label: "Other" },
];

const SAFEGUARDING_CATEGORY_OPTIONS = [
    { key: "financial_abuse", label: "Financial abuse" },
    { key: "physical_neglect", label: "Physical neglect" },
    { key: "medication_concern", label: "Medication concern" },
    { key: "isolation_or_coercion", label: "Isolation or coercion" },
    { key: "worker_conduct", label: "Worker conduct" },
    { key: "other", label: "Other" },
];

const RESPONSE_STANCE_OPTIONS = [
    { key: "accept", label: "Accept their position" },
    { key: "refute", label: "Refute their position" },
    { key: "ask_for_info", label: "Ask for more information" },
    { key: "escalate", label: "Escalate the matter" },
];


// =====================================================================
// ArchetypeIntakeForm, dispatches to the right form per archetype
// =====================================================================

export function ArchetypeIntakeForm({ archetype, intake, onChange }) {
    const set = useCallback((patch) => {
        onChange({ ...(intake || {}), ...patch });
    }, [intake, onChange]);

    // Auto-fill participant_name from the currently selected participant.
    // Skipped for response_draft (which asks who the reply is going TO).
    const usesParticipantName = archetype !== "response_draft";
    useParticipantPrefill({
        value: intake?.participant_name,
        onChange: (name) => set({ participant_name: name }),
        enabled: usesParticipantName,
    });

    switch (archetype) {
        case "request":       return <RequestForm intake={intake} set={set} />;
        case "dispute":       return <DisputeForm intake={intake} set={set} />;
        case "complaint":     return <ComplaintForm intake={intake} set={set} />;
        case "escalation":    return <EscalationForm intake={intake} set={set} />;
        case "notification":  return <NotificationForm intake={intake} set={set} />;
        case "response_draft": return <ResponseDraftForm intake={intake} set={set} />;
        case "guided_pathway": return <SafeguardingForm intake={intake} set={set} />;
        default: return null;
    }
}


// ---- Shared field primitives ----

function Field({ label, hint, children, testId }) {
    return (
        <div data-testid={testId}>
            <label className="block text-xs uppercase tracking-wider text-muted-k mb-1.5">{label}</label>
            {children}
            {hint && <div className="mt-1 text-xs text-muted-k">{hint}</div>}
        </div>
    );
}

function TextInput({ value, onChange, placeholder, testId, type = "text" }) {
    return (
        <input
            type={type}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            data-testid={testId}
            className="w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k focus:border-primary-k focus:outline-none"
        />
    );
}

function TextArea({ value, onChange, placeholder, rows = 4, testId }) {
    return (
        <textarea
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            data-testid={testId}
            className="w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k focus:border-primary-k focus:outline-none leading-relaxed"
        />
    );
}

function Dropdown({ value, onChange, options, testId, placeholder = "Choose…" }) {
    return (
        <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
            className="w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k focus:border-primary-k focus:outline-none"
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
            ))}
        </select>
    );
}

// Evidence chips list, files are held client-side, only the metadata
// (filename + optional user description) is written into intake so the
// LLM can reference them.
function EvidenceUpload({ intake, set }) {
    const items = intake?.evidence_items || [];
    const inputRef = React.useRef(null);

    const onFiles = (fileList) => {
        const next = [...items];
        for (const f of Array.from(fileList || [])) {
            next.push({
                id: `${f.name}-${f.size}-${Date.now()}`,
                filename: f.name,
                size_bytes: f.size,
                content_type: f.type,
                note: "",
            });
        }
        set({ evidence_items: next });
    };

    const remove = (id) => set({ evidence_items: items.filter((it) => it.id !== id) });
    const noteFor = (id, note) => set({
        evidence_items: items.map((it) => it.id === id ? { ...it, note } : it),
    });

    return (
        <div data-testid="lf1-evidence-upload">
            <label className="block text-xs uppercase tracking-wider text-muted-k mb-1.5">Evidence (optional)</label>
            <div className="mt-1 rounded-xl border border-dashed border-kindred bg-surface-2 px-4 py-3 text-sm text-muted-k flex items-center justify-between gap-3 flex-wrap">
                <div className="inline-flex items-center gap-2">
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                    <span>Attach photos, letters, or notes. Wayly references them by name in the draft.</span>
                </div>
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-xs hover:bg-primary-k hover:text-white"
                    data-testid="lf1-evidence-attach"
                >
                    Attach files
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => onFiles(e.target.files)}
                    data-testid="lf1-evidence-file-input"
                />
            </div>
            {items.length > 0 && (
                <ul className="mt-3 space-y-2" data-testid="lf1-evidence-list">
                    {items.map((it) => (
                        <li key={it.id} className="rounded-md border border-kindred bg-surface px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm text-primary-k">{it.filename}</div>
                                    <div className="text-xs text-muted-k">{formatBytes(it.size_bytes)}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => remove(it.id)}
                                    className="text-muted-k hover:text-terracotta"
                                    aria-label="Remove"
                                    data-testid={`lf1-evidence-remove-${it.id}`}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <input
                                type="text"
                                value={it.note || ""}
                                onChange={(e) => noteFor(it.id, e.target.value)}
                                placeholder="Short note about this file (e.g. 'CM email 12 Feb refusing referral')"
                                data-testid={`lf1-evidence-note-${it.id}`}
                                className="mt-1.5 w-full rounded border border-kindred px-2 py-1 text-xs text-primary-k focus:border-primary-k focus:outline-none"
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function NotesField({ intake, set }) {
    return (
        <Field label="Notes for Wayly (optional)" hint="Anything else Wayly should know about tone, deadlines, or context. Not included verbatim.">
            <TextArea
                value={intake?.notes}
                onChange={(v) => set({ notes: v })}
                placeholder="e.g. Prefer a firm-but-polite tone. Response needed before Louisa's next assessment on 12 Mar."
                testId="lf1-intake-notes"
                rows={3}
            />
        </Field>
    );
}


// ---- Per-archetype forms ----

function RequestForm({ intake, set }) {
    return (
        <div className="space-y-4">
            <Field label="Participant name" testId="lf1-intake-participant">
                <TextInput
                    value={intake?.participant_name}
                    onChange={(v) => set({ participant_name: v })}
                    placeholder="e.g. Louisa Davids"
                    testId="lf1-intake-participant-input"
                />
            </Field>
            <Field label="Type of request" testId="lf1-intake-change-type">
                <Dropdown
                    value={intake?.change_type}
                    onChange={(v) => set({ change_type: v })}
                    options={CHANGE_TYPE_OPTIONS}
                    testId="lf1-intake-change-type-select"
                />
            </Field>
            <Field label="What has changed and what are you asking for?" testId="lf1-intake-change-summary">
                <TextArea
                    value={intake?.change_summary}
                    onChange={(v) => set({ change_summary: v })}
                    placeholder="e.g. Since her hospital stay in January Mum needs help with showering and now uses a walker. We would like a new assessment as soon as possible."
                    testId="lf1-intake-change-summary-input"
                    rows={5}
                />
            </Field>
            <EvidenceUpload intake={intake} set={set} />
            <NotesField intake={intake} set={set} />
        </div>
    );
}

function DisputeForm({ intake, set }) {
    return (
        <div className="space-y-4">
            <Field label="Participant name" testId="lf1-intake-participant">
                <TextInput value={intake?.participant_name} onChange={(v) => set({ participant_name: v })} testId="lf1-intake-participant-input" />
            </Field>
            <Field label="What are you disputing?" testId="lf1-intake-dispute-type">
                <Dropdown
                    value={intake?.dispute_type}
                    onChange={(v) => set({ dispute_type: v })}
                    options={DISPUTE_TYPE_OPTIONS}
                    testId="lf1-intake-dispute-type-select"
                />
            </Field>
            <Field label="Reference or statement number (if any)" testId="lf1-intake-ref">
                <TextInput
                    value={intake?.reference_number}
                    onChange={(v) => set({ reference_number: v })}
                    placeholder="e.g. Statement STM-04-0201-D0"
                    testId="lf1-intake-ref-input"
                />
            </Field>
            <Field label="Summary of the disputed item" testId="lf1-intake-dispute-summary">
                <TextArea
                    value={intake?.disputed_charge_summary}
                    onChange={(v) => set({ disputed_charge_summary: v })}
                    placeholder="e.g. The 4 Feb personal care visit was billed at $187.20 as a weekend rate but Mum received the visit on Thursday 4 Feb."
                    testId="lf1-intake-dispute-summary-input"
                    rows={5}
                />
            </Field>
            <EvidenceUpload intake={intake} set={set} />
            <NotesField intake={intake} set={set} />
        </div>
    );
}

function ComplaintForm({ intake, set }) {
    return (
        <div className="space-y-4">
            <Field label="Participant name" testId="lf1-intake-participant">
                <TextInput value={intake?.participant_name} onChange={(v) => set({ participant_name: v })} testId="lf1-intake-participant-input" />
            </Field>
            <Field label="Complaint category" testId="lf1-intake-complaint-category">
                <Dropdown
                    value={intake?.category}
                    onChange={(v) => set({ category: v })}
                    options={COMPLAINT_CATEGORY_OPTIONS}
                    testId="lf1-intake-complaint-category-select"
                />
            </Field>
            <Field label="What happened, when, and how it affected you or your family member?" testId="lf1-intake-complaint-summary">
                <TextArea
                    value={intake?.complaint_summary}
                    onChange={(v) => set({ complaint_summary: v })}
                    placeholder="e.g. On 22 January the domestic worker did not attend the scheduled 10am visit. Mum did not get her hot lunch that day. We rang the care manager the same day; no follow-up call happened."
                    testId="lf1-intake-complaint-summary-input"
                    rows={6}
                />
            </Field>
            <Field label="Have you already raised this? What was the response?" testId="lf1-intake-prior-response">
                <TextArea
                    value={intake?.prior_response}
                    onChange={(v) => set({ prior_response: v })}
                    placeholder="e.g. Yes, verbal call on 23 Jan with care manager Sam. No written response."
                    testId="lf1-intake-prior-response-input"
                    rows={3}
                />
            </Field>
            <EvidenceUpload intake={intake} set={set} />
            <NotesField intake={intake} set={set} />
        </div>
    );
}

function EscalationForm({ intake, set }) {
    const priors = intake?.prior_attempts || [];
    const addPrior = () => set({
        prior_attempts: [...priors, { date: "", recipient: "", summary: "" }],
    });
    const editPrior = (i, patch) => set({
        prior_attempts: priors.map((p, idx) => idx === i ? { ...p, ...patch } : p),
    });
    const removePrior = (i) => set({ prior_attempts: priors.filter((_, idx) => idx !== i) });

    return (
        <div className="space-y-4">
            <Field label="Participant name" testId="lf1-intake-participant">
                <TextInput value={intake?.participant_name} onChange={(v) => set({ participant_name: v })} testId="lf1-intake-participant-input" />
            </Field>
            <Field label="Why are you escalating now? Summary." testId="lf1-intake-escalation-summary">
                <TextArea
                    value={intake?.escalation_summary}
                    onChange={(v) => set({ escalation_summary: v })}
                    placeholder="e.g. Two written complaints to the care manager have gone unanswered for six weeks. The service issues are ongoing."
                    testId="lf1-intake-escalation-summary-input"
                    rows={5}
                />
            </Field>
            <div data-testid="lf1-intake-prior-attempts">
                <label className="block text-xs uppercase tracking-wider text-muted-k mb-1.5">Prior attempts to resolve</label>
                <div className="text-xs text-muted-k mb-2">List each previous contact, Wayly weaves them into the chronology.</div>
                <ul className="space-y-2">
                    {priors.map((p, i) => (
                        <li key={i} className="rounded-lg border border-kindred bg-surface p-3">
                            <div className="grid sm:grid-cols-2 gap-2 mb-2">
                                <TextInput
                                    value={p.date}
                                    onChange={(v) => editPrior(i, { date: v })}
                                    placeholder="Date (e.g. 12 Jan 2026)"
                                    testId={`lf1-prior-date-${i}`}
                                />
                                <TextInput
                                    value={p.recipient}
                                    onChange={(v) => editPrior(i, { recipient: v })}
                                    placeholder="Recipient (e.g. Sam, care manager)"
                                    testId={`lf1-prior-recipient-${i}`}
                                />
                            </div>
                            <TextArea
                                value={p.summary}
                                onChange={(v) => editPrior(i, { summary: v })}
                                placeholder="What was said or asked"
                                rows={2}
                                testId={`lf1-prior-summary-${i}`}
                            />
                            <div className="mt-1 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => removePrior(i)}
                                    className="text-xs text-muted-k hover:text-terracotta inline-flex items-center gap-1"
                                    data-testid={`lf1-prior-remove-${i}`}
                                >
                                    <X className="h-3 w-3" /> Remove
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    onClick={addPrior}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-xs hover:bg-primary-k hover:text-white"
                    data-testid="lf1-prior-add"
                >
                    + Add a prior contact
                </button>
            </div>
            <EvidenceUpload intake={intake} set={set} />
            <NotesField intake={intake} set={set} />
        </div>
    );
}

function NotificationForm({ intake, set }) {
    return (
        <div className="space-y-4">
            <Field label="Participant name" testId="lf1-intake-participant">
                <TextInput value={intake?.participant_name} onChange={(v) => set({ participant_name: v })} testId="lf1-intake-participant-input" />
            </Field>
            <Field label="Notification type" testId="lf1-intake-notification-type">
                <Dropdown
                    value={intake?.notification_type}
                    onChange={(v) => set({ notification_type: v })}
                    options={NOTIFICATION_TYPE_OPTIONS}
                    testId="lf1-intake-notification-type-select"
                />
            </Field>
            <Field label="Effective date (optional)" testId="lf1-intake-effective-date">
                <TextInput
                    value={intake?.effective_date}
                    onChange={(v) => set({ effective_date: v })}
                    placeholder="e.g. 1 March 2026"
                    testId="lf1-intake-effective-date-input"
                />
            </Field>
            <Field label="What are you notifying them of?" testId="lf1-intake-notification-summary">
                <TextArea
                    value={intake?.notification_summary}
                    onChange={(v) => set({ notification_summary: v })}
                    placeholder="e.g. Mum can no longer afford the current $85/wk contribution because her partner passed away in December. We are asking Services Australia to reassess her contribution rate under the hardship provisions."
                    testId="lf1-intake-notification-summary-input"
                    rows={5}
                />
            </Field>
            <EvidenceUpload intake={intake} set={set} />
            <NotesField intake={intake} set={set} />
        </div>
    );
}

function ResponseDraftForm({ intake, set }) {
    return (
        <div className="space-y-4">
            <Field label="Who is this reply going to?" testId="lf1-intake-inbound-from">
                <TextInput
                    value={intake?.inbound_from}
                    onChange={(v) => set({ inbound_from: v })}
                    placeholder="e.g. Sam, care manager at BlueBerry Care"
                    testId="lf1-intake-inbound-from-input"
                />
            </Field>
            <Field label="Your stance on their message" testId="lf1-intake-stance">
                <Dropdown
                    value={intake?.stance}
                    onChange={(v) => set({ stance: v })}
                    options={RESPONSE_STANCE_OPTIONS}
                    testId="lf1-intake-stance-select"
                />
            </Field>
            <Field label="Paste or summarise what they sent you" testId="lf1-intake-inbound-summary">
                <TextArea
                    value={intake?.inbound_summary}
                    onChange={(v) => set({ inbound_summary: v })}
                    placeholder="Paste the email, letter, or SMS here, or summarise in a few lines. Wayly quotes the key points in your reply."
                    testId="lf1-intake-inbound-summary-input"
                    rows={6}
                />
            </Field>
            <Field label="Points you want to make in your reply" testId="lf1-intake-response-points">
                <TextArea
                    value={intake?.response_points}
                    onChange={(v) => set({ response_points: v })}
                    placeholder="Bullet points work. e.g. Confirm the missed visit. Ask for the replacement visit date in writing. Reject the proposed care mgmt fee increase."
                    testId="lf1-intake-response-points-input"
                    rows={4}
                />
            </Field>
            <EvidenceUpload intake={intake} set={set} />
            <NotesField intake={intake} set={set} />
        </div>
    );
}

function SafeguardingForm({ intake, set }) {
    return (
        <div className="space-y-4">
            <div className="rounded-xl bg-clay/10 border border-clay/25 p-3 text-sm text-primary-k flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-clay" aria-hidden="true" />
                <div>
                    {"This is a structured safeguarding record, a factual account you can keep for your file or attach to a formal complaint later. It is not a persuasion letter."}
                </div>
            </div>
            <Field label="Participant name" testId="lf1-intake-participant">
                <TextInput value={intake?.participant_name} onChange={(v) => set({ participant_name: v })} testId="lf1-intake-participant-input" />
            </Field>
            <Field label="Category of concern" testId="lf1-intake-safeguarding-category">
                <Dropdown
                    value={intake?.category}
                    onChange={(v) => set({ category: v })}
                    options={SAFEGUARDING_CATEGORY_OPTIONS}
                    testId="lf1-intake-safeguarding-category-select"
                />
            </Field>
            <Field label="What did you observe? When?" testId="lf1-intake-safeguarding-observation">
                <TextArea
                    value={intake?.observation}
                    onChange={(v) => set({ observation: v })}
                    placeholder="Set out what you saw, when, who was involved. Stick to facts."
                    testId="lf1-intake-safeguarding-observation-input"
                    rows={6}
                />
            </Field>
            <Field label="Which phone lines have you already called?" testId="lf1-intake-safeguarding-calls">
                <TextArea
                    value={intake?.phone_calls_made}
                    onChange={(v) => set({ phone_calls_made: v })}
                    placeholder="e.g. Called 1800ELDERHelp on 12 Feb. Advised to record events and contact OPAN."
                    testId="lf1-intake-safeguarding-calls-input"
                    rows={3}
                />
            </Field>
            <EvidenceUpload intake={intake} set={set} />
            <NotesField intake={intake} set={set} />
        </div>
    );
}


// =====================================================================
// CrossToolImportPanel, Iter 3 tap-through pre-fill
// =====================================================================

export function CrossToolImportPanel({ entryId, onImport }) {
    const [signals, setSignals] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get("/lf1/cross-tool-signals")
            .then((r) => { if (!cancelled) setSignals(r.data?.signals || {}); })
            .catch(() => { if (!cancelled) setSignals({}); });
        return () => { cancelled = true; };
    }, []);

    const attach = async (tool, record_id, fields, note) => {
        setBusy(tool);
        setError(null);
        try {
            const { data } = await api.post(`/lf1/correspondence/${entryId}/attach-source`, {
                tool, record_id, fields, note,
            });
            onImport?.(data);
        } catch (err) {
            setError(extractErrorMessage(err, "Could not import from that tool."));
        } finally {
            setBusy(null);
        }
    };

    if (signals === null) {
        return (
            <div className="text-xs text-muted-k inline-flex items-center gap-2" data-testid="lf1-cross-tool-loading">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking your other tools…
            </div>
        );
    }

    const anySignals = Object.keys(signals || {}).length > 0;
    if (!anySignals) {
        return (
            <div className="text-xs text-muted-k italic" data-testid="lf1-cross-tool-empty">
                {"No pre-fill data from your other tools yet. As you use Statement Decoder, Support Plan Reviewer, or Price Checker, you'll see quick-import chips here."}
            </div>
        );
    }

    const chips = [];
    if (signals.statement_decoder) {
        const s = signals.statement_decoder;
        chips.push({
            key: "statement_decoder",
            label: `Statement · ${s.period_label || "recent"}`,
            detail: `${s.line_item_count} line items, ${s.top_anomalies?.length || 0} anomalies`,
            onClick: () => attach("statement_decoder", s.statement_id || "recent", {
                statement_period: s.period_label,
                statement_line_item_count: s.line_item_count,
                statement_anomaly_count: (s.top_anomalies || []).length,
            }, "Imported from Statement Decoder"),
        });
    }
    if (signals.care_plan_reviewer) {
        const s = signals.care_plan_reviewer;
        chips.push({
            key: "care_plan_reviewer",
            label: `Care plan · ${s.provider_name || "recent"}`,
            detail: `${s.findings_count || 0} findings`,
            onClick: () => attach("care_plan_reviewer", s.care_plan_id || "recent", {
                care_plan_provider: s.provider_name,
                care_plan_findings_count: s.findings_count,
            }, "Imported from Support Plan Reviewer"),
        });
    }
    if (signals.provider_price_checker) {
        const recent = signals.provider_price_checker.recent_checks?.[0];
        if (recent) {
            chips.push({
                key: "provider_price_checker",
                label: `Price check · ${recent.service}`,
                detail: `${recent.provider} at $${recent.rate}`,
                onClick: () => attach("provider_price_checker", recent.id || "recent", {
                    ppc_service: recent.service,
                    ppc_provider: recent.provider,
                    ppc_rate: recent.rate,
                    ppc_position: recent.position,
                }, "Imported from Provider Price Checker"),
            });
        }
    }
    if (signals.classification_self_check) {
        const s = signals.classification_self_check;
        chips.push({
            key: "classification_self_check",
            label: "Classification check",
            detail: `Current ${s.current_class || "?"} · suggested ${s.suggested_class || "?"}`,
            onClick: () => attach("classification_self_check", "recent", {
                current_classification: s.current_class,
                suggested_classification: s.suggested_class,
            }, "Imported from Classification Self-Check"),
        });
    }
    if (signals.contribution_estimator) {
        const s = signals.contribution_estimator;
        chips.push({
            key: "contribution_estimator",
            label: "Contribution estimate",
            detail: `${s.pension_status || "?"} · Class ${s.classification || "?"}`,
            onClick: () => attach("contribution_estimator", "recent", {
                pension_status: s.pension_status,
                is_grandfathered: s.is_grandfathered,
                ce_classification: s.classification,
            }, "Imported from Contribution Estimator"),
        });
    }

    return (
        <div data-testid="lf1-cross-tool-panel">
            <div className="text-xs uppercase tracking-wider text-muted-k mb-2">
                Pre-fill from your other tools
            </div>
            {error && <div className="text-xs text-terracotta mb-2" data-testid="lf1-cross-tool-error">{error}</div>}
            <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                    <button
                        key={c.key}
                        type="button"
                        onClick={c.onClick}
                        disabled={busy === c.key}
                        data-testid={`lf1-import-${c.key}`}
                        className="rounded-full border border-primary-k/40 bg-primary-k/5 px-3 py-1.5 text-xs text-primary-k hover:bg-primary-k hover:text-white transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                        {busy === c.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
                        <span className="font-medium">{c.label}</span>
                        <span className="text-muted-k">· {c.detail}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


// =====================================================================
// GenerateButton, with source_data_missing guard
// =====================================================================

export function GenerateButton({ entryId, intakeOverrides, endpoint = "generate", onGenerated, disabled }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [missing, setMissing] = useState(null);

    const go = async () => {
        setBusy(true);
        setError(null);
        setMissing(null);
        try {
            const { data } = await api.post(
                `/lf1/correspondence/${entryId}/${endpoint}`,
                { intake: intakeOverrides || null, persist: true },
            );
            onGenerated(data);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail?.error === "source_data_missing") {
                setMissing(detail.missing_fields || []);
            } else {
                setError(extractErrorMessage(err, "Could not generate letter."));
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <button
                type="button"
                onClick={go}
                disabled={busy || disabled}
                data-testid="lf1-generate-button"
                className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-[#091D33] transition-colors disabled:opacity-60"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "Drafting…" : "Generate letter"}
            </button>
            {missing && missing.length > 0 && (
                <div
                    className="mt-3 bg-clay/10 border border-clay/25 rounded-xl p-3 text-sm text-primary-k"
                    data-testid="lf1-missing-fields"
                >
                    <div className="font-medium">Need a little more info first:</div>
                    <ul className="mt-1 ml-4 list-disc text-xs">
                        {missing.map((f) => (
                            <li key={f}>{humanise(f)}</li>
                        ))}
                    </ul>
                </div>
            )}
            {error && <div className="mt-2 text-sm text-terracotta" data-testid="lf1-generate-error">{error}</div>}
        </div>
    );
}


// =====================================================================
// CoverNotePanel, recipient / response window / cc / OPAN footer
// =====================================================================

export function CoverNotePanel({ coverNote }) {
    if (!coverNote) return null;
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="lf1-cover-note">
            <div className="text-xs uppercase tracking-wider text-muted-k">Cover note</div>
            <div className="mt-2 space-y-1.5 text-sm text-primary-k">
                <div>
                    <span className="text-muted-k">To: </span>
                    <span className="font-medium">{coverNote.entity_name || "Recipient"}</span>
                </div>
                {coverNote.postal_address && (
                    <div><span className="text-muted-k">Post: </span>{coverNote.postal_address}</div>
                )}
                {coverNote.email && (
                    <div><span className="text-muted-k">Email: </span>{coverNote.email}</div>
                )}
                {coverNote.portal_url && (
                    <div>
                        <span className="text-muted-k">Portal: </span>
                        <a href={coverNote.portal_url} target="_blank" rel="noopener noreferrer" className="text-primary-k underline">
                            {coverNote.portal_url}
                        </a>
                    </div>
                )}
                {coverNote.phone && (
                    <div><span className="text-muted-k">Phone: </span>{coverNote.phone}</div>
                )}
                {coverNote.response_window_label && (
                    <div className="mt-2 text-xs text-muted-k italic">Expected: {coverNote.response_window_label}</div>
                )}
                {!coverNote.response_window_label && coverNote.response_window_days && (
                    <div className="mt-2 text-xs text-muted-k italic">
                        Expected response window: {coverNote.response_window_days} days
                    </div>
                )}
            </div>
            {coverNote.cc_recipients?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-kindred text-xs text-primary-k">
                    <div className="text-muted-k uppercase tracking-wider mb-1">cc:</div>
                    <ul className="space-y-1">
                        {coverNote.cc_recipients.map((c, i) => (
                            <li key={i}>
                                <span className="font-medium">{c.label}</span>
                                <span className="text-muted-k"> · {c.phone}</span>
                                {c.reason && <span className="text-muted-k block ml-1">{c.reason}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {coverNote.include_opan_footer && (
                <div className="mt-3 pt-3 border-t border-kindred bg-clay/5 rounded-md px-2 py-1.5 text-xs text-primary-k italic">
                    OPAN advocacy referral will be appended to the letter.
                </div>
            )}
        </div>
    );
}


// =====================================================================
// OutputFormatSwitcher, email body / MAC portal / PDF
// =====================================================================

export function OutputFormatSwitcher({ generated, onDownloadPdf, busyPdf }) {
    const [mode, setMode] = useState("email");
    if (!generated) return null;
    const displayText = mode === "email" ? generated.body : generated.mac_portal_short_form;
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="lf1-output-formats">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs uppercase tracking-wider text-muted-k mr-2">Format:</span>
                <FormatBtn active={mode === "email"} onClick={() => setMode("email")} icon={FileText} label="Email body" testId="lf1-format-email" />
                <FormatBtn active={mode === "mac_portal"} onClick={() => setMode("mac_portal")} icon={MessageSquare} label="MAC portal" testId="lf1-format-mac-portal" />
                <button
                    type="button"
                    onClick={onDownloadPdf}
                    disabled={busyPdf}
                    data-testid="lf1-format-pdf"
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-xs hover:bg-primary-k hover:text-white disabled:opacity-60"
                >
                    {busyPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    Download PDF
                </button>
            </div>
            {mode === "email" && (
                <>
                    <div className="text-xs uppercase tracking-wider text-muted-k">Subject</div>
                    <div className="mt-1 mb-3 text-primary-k font-medium" data-testid="lf1-generated-subject">
                        {generated.subject}
                    </div>
                </>
            )}
            <div className="text-xs uppercase tracking-wider text-muted-k">
                {mode === "email" ? "Body" : "MAC Portal short form"}
            </div>
            <pre
                className="mt-1 whitespace-pre-wrap font-body text-sm text-primary-k leading-relaxed"
                data-testid={mode === "email" ? "lf1-generated-body" : "lf1-generated-portal"}
            >
                {displayText}
            </pre>
            {mode === "mac_portal" && (
                <div className="mt-3 text-xs text-muted-k italic inline-flex items-center gap-1">
                    <Info className="h-3 w-3" /> MAC portal caps free-text at ~1200 characters. This condenses the full letter to fit.
                </div>
            )}
        </div>
    );
}

function FormatBtn({ active, onClick, icon: Icon, label, testId }) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            className={[
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
                active
                    ? "bg-primary-k text-white border border-primary-k"
                    : "border border-kindred text-primary-k hover:border-primary-k",
            ].join(" ")}
        >
            <Icon className="h-3.5 w-3.5" />
            {label}
        </button>
    );
}


// =====================================================================
// FeedbackChip, thumbs up / down on generated draft
// =====================================================================

export function FeedbackChip({ entryId, existingFeedback }) {
    const [rating, setRating] = useState(existingFeedback?.rating || null);
    const [reason, setReason] = useState(existingFeedback?.reason || "");
    const [showReason, setShowReason] = useState(false);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(Boolean(existingFeedback));

    const submit = async (newRating, newReason) => {
        setBusy(true);
        try {
            await api.post(`/lf1/correspondence/${entryId}/feedback`, {
                rating: newRating,
                reason: newReason || null,
            });
            setRating(newRating);
            setSaved(true);
        } catch (_) { /* silent */ }
        finally { setBusy(false); }
    };

    return (
        <div className="inline-flex items-center gap-2" data-testid="lf1-feedback">
            <span className="text-xs text-muted-k">How was this draft?</span>
            <button
                type="button"
                onClick={() => { submit("up", ""); setShowReason(false); }}
                disabled={busy}
                aria-label="Thumbs up"
                data-testid="lf1-feedback-up"
                className={[
                    "inline-flex items-center rounded-full border w-8 h-8 justify-center",
                    rating === "up" ? "bg-sage text-white border-sage" : "border-kindred text-primary-k hover:border-primary-k",
                ].join(" ")}
            >
                <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                onClick={() => { setRating("down"); setShowReason(true); }}
                disabled={busy}
                aria-label="Thumbs down"
                data-testid="lf1-feedback-down"
                className={[
                    "inline-flex items-center rounded-full border w-8 h-8 justify-center",
                    rating === "down" ? "bg-terracotta text-white border-terracotta" : "border-kindred text-primary-k hover:border-primary-k",
                ].join(" ")}
            >
                <ThumbsDown className="h-3.5 w-3.5" />
            </button>
            {saved && rating === "up" && (
                <span className="text-xs text-muted-k inline-flex items-center gap-1" data-testid="lf1-feedback-saved">
                    <MailCheck className="h-3 w-3" /> Thanks
                </span>
            )}
            {showReason && rating === "down" && (
                <div className="ml-2 inline-flex items-center gap-2">
                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="What was off? (optional)"
                        className="rounded border border-kindred px-2 py-1 text-xs w-64"
                        data-testid="lf1-feedback-reason"
                    />
                    <button
                        type="button"
                        onClick={() => { submit("down", reason); setShowReason(false); }}
                        disabled={busy}
                        className="rounded-full bg-primary-k text-white px-3 py-1 text-xs"
                        data-testid="lf1-feedback-reason-submit"
                    >
                        Send
                    </button>
                </div>
            )}
        </div>
    );
}


// =====================================================================
// ToneCheckPanel, feature-flag gated, LLM tone/claim review
// =====================================================================

export function ToneCheckPanel({ entryId, body, archetype }) {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    // Only makes sense for complaint / escalation / guided_pathway.
    const applicable = ["complaint", "escalation", "guided_pathway"].includes(archetype);
    if (!applicable) return null;
    if (!body) return null;

    const runCheck = async () => {
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            const { data } = await api.post(`/lf1/correspondence/${entryId}/tone-check`, { body });
            if (data?.enabled === false) {
                setResult({ disabled: true });
            } else {
                setResult(data);
            }
        } catch (err) {
            setError(extractErrorMessage(err, "Could not run the tone check."));
        } finally {
            setBusy(false);
        }
    };

    const toneColour = (t) => ({
        polite: "bg-sage/10 text-sage border-sage/25",
        firm: "bg-primary-k/10 text-primary-k border-primary-k/25",
        combative: "bg-terracotta/10 text-terracotta border-terracotta/25",
    })[t] || "bg-surface-2 text-muted-k border-kindred";

    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="lf1-tone-check">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs uppercase tracking-wider text-muted-k">Tone check</div>
                <button
                    type="button"
                    onClick={runCheck}
                    disabled={busy}
                    data-testid="lf1-tone-check-run"
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-xs hover:bg-primary-k hover:text-white disabled:opacity-60"
                >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                    Review this draft
                </button>
            </div>
            {error && <div className="mt-3 text-xs text-terracotta" data-testid="lf1-tone-check-error">{error}</div>}
            {result?.disabled && (
                <div className="mt-3 text-xs text-muted-k italic" data-testid="lf1-tone-check-disabled">Tone check is temporarily disabled.</div>
            )}
            {result && !result.disabled && !result.skipped && (
                <div className="mt-3 space-y-2 text-sm" data-testid="lf1-tone-check-result">
                    {result.tone && result.tone !== "unknown" && (
                        <div>
                            <span className="text-xs text-muted-k uppercase tracking-wider mr-2">Tone:</span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${toneColour(result.tone)}`}>
                                {result.tone}
                            </span>
                        </div>
                    )}
                    {result.concerns?.length > 0 && (
                        <div>
                            <div className="text-xs text-muted-k uppercase tracking-wider">Concerns</div>
                            <ul className="ml-4 mt-1 list-disc text-primary-k text-xs">
                                {result.concerns.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                        </div>
                    )}
                    {result.suggested_edits?.length > 0 && (
                        <div>
                            <div className="text-xs text-muted-k uppercase tracking-wider">Suggested edits</div>
                            <ul className="ml-4 mt-1 list-disc text-primary-k text-xs">
                                {result.suggested_edits.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                        </div>
                    )}
                    {(!result.concerns?.length && !result.suggested_edits?.length) && (
                        <div className="text-xs text-muted-k italic">No specific concerns flagged.</div>
                    )}
                </div>
            )}
        </div>
    );
}


// =====================================================================
// ShareAndSignOffPanel, Iter 4 Family Coordinator sharing
// =====================================================================

export function ShareAndSignOffPanel({ entry, onShared, onSignedOff }) {
    const entryId = entry?.id;
    const shared = entry?.shared_with || [];
    const signOffRequired = Boolean(entry?.sign_off_required);
    const signOffBy = entry?.sign_off_by;
    const signOffAt = entry?.sign_off_at;

    const [members, setMembers] = useState([]);
    const [selected, setSelected] = useState(shared);
    const [requireSignOff, setRequireSignOff] = useState(signOffRequired);
    const [signMessage, setSignMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [busySignOff, setBusySignOff] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.get("/household/members")
            .then((r) => setMembers(r.data?.members || []))
            .catch(() => setMembers([]));
    }, []);

    useEffect(() => {
        setSelected(shared);
        setRequireSignOff(signOffRequired);
    }, [entry?.id]);

    const toggle = (uid) => setSelected((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);

    const share = async () => {
        setBusy(true);
        setError(null);
        try {
            const { data } = await api.post(`/lf1/correspondence/${entryId}/share`, {
                share_with_user_ids: selected,
                require_sign_off: requireSignOff,
                sign_off_message: signMessage || null,
            });
            onShared?.(data);
        } catch (err) {
            setError(extractErrorMessage(err, "Could not share this draft."));
        } finally {
            setBusy(false);
        }
    };

    const signOff = async () => {
        setBusySignOff(true);
        setError(null);
        try {
            const { data } = await api.post(`/lf1/correspondence/${entryId}/sign-off`, {
                note: null,
            });
            onSignedOff?.(data);
        } catch (err) {
            setError(extractErrorMessage(err, "Could not record sign-off."));
        } finally {
            setBusySignOff(false);
        }
    };

    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="lf1-share-panel">
            <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary-k" aria-hidden="true" />
                <div className="text-xs uppercase tracking-wider text-muted-k">Share with family</div>
            </div>
            {members.length === 0 ? (
                <p className="mt-2 text-sm text-muted-k">
                    {"Once you add household members in the Family Coordinator, you'll be able to share drafts here for a second pair of eyes."}
                </p>
            ) : (
                <>
                    <ul className="mt-3 space-y-1.5">
                        {members.map((m) => (
                            <li key={m.user_id || m.email}>
                                <label className="inline-flex items-center gap-2 text-sm text-primary-k cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(m.user_id)}
                                        onChange={() => toggle(m.user_id)}
                                        data-testid={`lf1-share-member-${m.user_id}`}
                                    />
                                    <span>{m.name || m.email}</span>
                                    {m.role && <span className="text-xs text-muted-k">· {m.role}</span>}
                                </label>
                            </li>
                        ))}
                    </ul>
                    <label className="mt-3 inline-flex items-start gap-2 text-sm text-primary-k cursor-pointer">
                        <input
                            type="checkbox"
                            checked={requireSignOff}
                            onChange={(e) => setRequireSignOff(e.target.checked)}
                            className="mt-0.5"
                            data-testid="lf1-share-require-signoff"
                        />
                        <span>Require someone from the household to sign off before sending.</span>
                    </label>
                    {requireSignOff && (
                        <input
                            type="text"
                            value={signMessage}
                            onChange={(e) => setSignMessage(e.target.value)}
                            placeholder="Optional message for reviewers"
                            className="mt-2 w-full rounded border border-kindred px-2 py-1 text-xs text-primary-k"
                            data-testid="lf1-share-signoff-message"
                        />
                    )}
                    <div className="mt-3 flex gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={share}
                            disabled={busy || selected.length === 0}
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white px-3 py-1.5 text-xs disabled:opacity-60"
                            data-testid="lf1-share-submit"
                        >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            {shared.length ? "Update share list" : "Share draft"}
                        </button>
                        {signOffRequired && !signOffBy && (
                            <button
                                type="button"
                                onClick={signOff}
                                disabled={busySignOff}
                                className="inline-flex items-center gap-1.5 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-xs disabled:opacity-60"
                                data-testid="lf1-signoff-submit"
                            >
                                {busySignOff ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
                                Sign off
                            </button>
                        )}
                    </div>
                    {signOffBy && (
                        <div
                            className="mt-3 text-xs text-sage inline-flex items-center gap-1"
                            data-testid="lf1-signoff-status"
                        >
                            <PenLine className="h-3 w-3" /> Signed off {signOffAt ? `on ${new Date(signOffAt).toLocaleDateString("en-AU")}` : ""}
                        </div>
                    )}
                </>
            )}
            {error && <div className="mt-2 text-xs text-terracotta" data-testid="lf1-share-error">{error}</div>}
        </div>
    );
}


// =====================================================================
// LF1ADMDisclosure, shared ADM disclosure for LF-1
// =====================================================================

export function LF1ADMDisclosure({ archetype, situationLabel }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <ADMDisclosureTrigger onClick={() => setOpen(true)} testId="lf1-adm-link" />
            <ADMDisclosure
                open={open}
                onOpenChange={setOpen}
                toolName="Letters & Follow-ups"
                inputSummary={`Your intake for "${situationLabel || archetype}" and the recipient directory`}
                referenceLabel={"Wayly's Statement of Rights + Aged Care Act 2024 citation library"}
                computationRule={"Wayly picks the archetype prompt and inserts only citations flagged as available for that archetype. Legislation is never fabricated, if a citation is missing, the letter proceeds without it rather than inventing one."}
                testIdPrefix="lf1-adm"
            />
        </>
    );
}


// =====================================================================
// SafeguardingRecordButton, situation 11 generator
// =====================================================================

export function SafeguardingRecordButton({ entryId, intakeOverrides, onGenerated }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [missing, setMissing] = useState(null);

    const run = async () => {
        setBusy(true);
        setError(null);
        setMissing(null);
        try {
            const { data } = await api.post(`/lf1/correspondence/${entryId}/safeguarding-record`, {
                intake: intakeOverrides || null,
                persist: true,
            });
            onGenerated(data);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail?.error === "source_data_missing") {
                setMissing(detail.missing_fields || []);
            } else {
                setError(extractErrorMessage(err, "Could not build the safeguarding record."));
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <button
                type="button"
                onClick={run}
                disabled={busy}
                data-testid="lf1-safeguarding-generate"
                className="inline-flex items-center gap-2 rounded-full bg-clay text-white px-4 py-2 text-sm hover:bg-clay/90 disabled:opacity-60"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {busy ? "Building record…" : "Build safeguarding record"}
            </button>
            {missing && missing.length > 0 && (
                <div
                    className="mt-3 bg-clay/10 border border-clay/25 rounded-xl p-3 text-sm text-primary-k"
                    data-testid="lf1-safeguarding-missing"
                >
                    <div className="font-medium">Need a little more info first:</div>
                    <ul className="mt-1 ml-4 list-disc text-xs">
                        {missing.map((f) => <li key={f}>{humanise(f)}</li>)}
                    </ul>
                </div>
            )}
            {error && <div className="mt-2 text-sm text-terracotta" data-testid="lf1-safeguarding-error">{error}</div>}
        </div>
    );
}


// =====================================================================
// ResponseDraftGenerateButton, situation 12
// =====================================================================

export function ResponseDraftGenerateButton({ entryId, intake, onGenerated }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [missing, setMissing] = useState(null);

    const run = async () => {
        setBusy(true);
        setError(null);
        setMissing(null);
        try {
            const { data } = await api.post(`/lf1/correspondence/${entryId}/response-draft`, {
                inbound_content: intake?.inbound_summary || "",
                inbound_from_label: intake?.inbound_from || null,
                stance: intake?.stance || null,
            });
            onGenerated(data);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail?.error === "source_data_missing") {
                setMissing(detail.missing_fields || []);
            } else {
                setError(extractErrorMessage(err, "Could not draft a response."));
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <button
                type="button"
                onClick={run}
                disabled={busy}
                data-testid="lf1-response-draft-generate"
                className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "Drafting reply…" : "Draft my reply"}
            </button>
            {missing && missing.length > 0 && (
                <div
                    className="mt-3 bg-clay/10 border border-clay/25 rounded-xl p-3 text-sm text-primary-k"
                    data-testid="lf1-response-draft-missing"
                >
                    <div className="font-medium">Need the inbound message first:</div>
                    <ul className="mt-1 ml-4 list-disc text-xs">
                        {missing.map((f) => <li key={f}>{humanise(f)}</li>)}
                    </ul>
                </div>
            )}
            {error && <div className="mt-2 text-sm text-terracotta" data-testid="lf1-response-draft-error">{error}</div>}
        </div>
    );
}
