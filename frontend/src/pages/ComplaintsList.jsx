/**
 * CMP-1 v1 · Complaints list + inline wizard.
 *
 * Route: /app/participants/:id/complaints
 */
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import Skeleton from "@/components/Skeleton";
import { ChevronLeft, Plus, AlertOctagon, Phone, ShieldAlert, Send, Loader2 } from "lucide-react";
import { RequiredBadge } from "@/components/RequiredHint";
import { toast } from "sonner";
import PageIntro from "@/components/PageIntro";
import SmartAISummary from "@/components/SmartAISummary";

const COMPLAINT_TYPES = [
    { key: "billing_dispute", label: "Billing dispute" },
    { key: "care_quality", label: "Care quality" },
    { key: "worker_behaviour", label: "Worker behaviour" },
    { key: "service_delivery_failure", label: "Service delivery failure" },
    { key: "care_plan_dispute", label: "Care plan dispute" },
    { key: "communication_breakdown", label: "Communication breakdown" },
    { key: "elder_abuse", label: "Elder abuse (safeguard resources shown)" },
    { key: "other", label: "Other" },
];
const SEVERITIES = [
    { key: "informational", label: "Informational" },
    { key: "minor", label: "Minor" },
    { key: "serious", label: "Serious" },
    { key: "critical_urgent", label: "Critical / urgent" },
];
const DESIRED_OUTCOMES = [
    { key: "correction_of_billing", label: "Correction of billing" },
    { key: "correction_of_care_quality", label: "Correction of care quality" },
    { key: "change_of_worker", label: "Change of worker" },
    { key: "change_of_care_plan", label: "Change of care plan" },
    { key: "formal_apology", label: "Formal apology" },
    { key: "financial_compensation", label: "Financial compensation" },
    { key: "referral_to_regulator", label: "Referral to regulator" },
    { key: "other", label: "Other" },
];
const STAGE_LABEL = {
    drafting: "Drafting",
    stage_1_internal_provider: "Stage 1 · Provider",
    stage_2_provider_senior: "Stage 2 · Provider senior",
    stage_3_acqsc_referral: "Stage 3 · ACQSC",
    stage_4_ombudsman_referral: "Stage 4 · Ombudsman",
    stage_5_appeals: "Stage 5 · Appeals",
    closed_resolved: "Closed · resolved",
    closed_abandoned: "Closed · abandoned",
};
const STAGE_TINT = {
    drafting: "bg-primary-k/[0.05] text-primary-k/70 border-primary-k/10",
    stage_1_internal_provider: "bg-amber-50 text-amber-800 border-amber-100",
    stage_2_provider_senior: "bg-orange-50 text-orange-800 border-orange-100",
    stage_3_acqsc_referral: "bg-red-50 text-red-800 border-red-100",
    stage_4_ombudsman_referral: "bg-red-50 text-red-800 border-red-100",
    stage_5_appeals: "bg-red-50 text-red-800 border-red-100",
    closed_resolved: "bg-emerald-50 text-emerald-800 border-emerald-100",
    closed_abandoned: "bg-primary-k/[0.05] text-primary-k/50 border-primary-k/10",
};

function NewComplaintModal({ pid, onClose, onCreated, prefill = {} }) {
    const [step, setStep] = useState(0);
    const [form, setForm] = useState({
        complaint_type: "billing_dispute",
        severity: "minor",
        provider_name: prefill.provider_name || "",
        provider_email: prefill.provider_email || "",
        subject_matter_summary: "",
        incident_start_date: "",
        incident_end_date: "",
        is_ongoing: false,
        desired_outcome: "correction_of_billing",
        desired_outcome_notes: "",
        is_anonymous_acqsc_submission: false,
        contains_immediate_safety_concerns: false,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const steps = [
        { key: "what", label: "What Happened" },
        { key: "who", label: "Who and When" },
        { key: "outcome", label: "Desired Outcome" },
        { key: "review", label: "Review and Send" },
    ];

    const goNext = () => setStep((s) => Math.min(s + 1, steps.length - 1));
    const goBack = () => setStep((s) => Math.max(s - 1, 0));

    const stepValid = (() => {
        if (step === 0) return !!form.subject_matter_summary.trim();
        if (step === 1) return !!form.provider_name.trim();
        if (step === 2) return !!form.desired_outcome;
        return true;
    })();

    async function submit() {
        setSubmitting(true); setError(null);
        try {
            const r = await api.post(`/cmp1/participants/${pid}/complaints`, {
                complaint_type: form.complaint_type,
                severity: form.severity,
                provider_name: form.provider_name,
                provider_contact_details: form.provider_email ? { email: form.provider_email } : {},
                subject_matter_summary: form.subject_matter_summary,
                incident_start_date: form.incident_start_date || null,
                incident_end_date: form.incident_end_date || null,
                is_ongoing: form.is_ongoing,
                desired_outcome: form.desired_outcome,
                desired_outcome_notes: form.desired_outcome_notes || null,
                is_anonymous_acqsc_submission: form.is_anonymous_acqsc_submission,
                contains_immediate_safety_concerns: form.contains_immediate_safety_concerns,
            });
            onCreated?.(r.data);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to save complaint");
        } finally { setSubmitting(false); }
    }

    return (
        <div className="fixed inset-0 z-50 bg-primary-k/40 flex items-center justify-center p-4" data-testid="cmp1-new-modal">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
                <div className="p-5 border-b border-primary-k/10">
                    <h2 className="text-lg font-heading text-primary-k">New Complaint · Step {step + 1} of {steps.length}</h2>
                    <p className="text-xs text-primary-k/60 mt-1">{steps[step].label}. A LOOP-1 case is opened automatically when you finish.</p>
                    <div className="flex gap-1 mt-3" data-testid="cmp1-wizard-steps">
                        {steps.map((s, i) => (
                            <div key={s.key}
                                 data-testid={`cmp1-wizard-step-${i}`}
                                 className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary-k" : "bg-primary-k/15"}`} />
                        ))}
                    </div>
                </div>

                <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
                    {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" data-testid="cmp1-new-error">{String(error)}</p>}

                    {step === 0 && (
                        <div className="space-y-3" data-testid="cmp1-wizard-content-0">
                            <div>
                                <label className="text-xs uppercase tracking-wide text-primary-k/50 flex items-center gap-2">Complaint Type <RequiredBadge /></label>
                                <select value={form.complaint_type} onChange={(e) => setForm({...form, complaint_type: e.target.value})}
                                        className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                        data-testid="cmp1-new-type">
                                    {COMPLAINT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                                </select>
                            </div>
                            {form.complaint_type === "elder_abuse" && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="cmp1-new-elder-safeguard">
                                    <p className="font-medium mb-1"><ShieldAlert className="inline w-3 h-3 mr-1" /> Elder Abuse Safeguard</p>
                                    <p>If there is immediate safety concern, phone 000. For confidential guidance the Elder Abuse Helpline is 1800 353 374. Speaking to them doesn&apos;t commit you to anything.</p>
                                </div>
                            )}
                            <div>
                                <label className="text-xs uppercase tracking-wide text-primary-k/50 flex items-center gap-2">What Happened (In Your Own Words) <RequiredBadge /></label>
                                <textarea value={form.subject_matter_summary}
                                          onChange={(e) => setForm({...form, subject_matter_summary: e.target.value})}
                                          placeholder="A few sentences on what went wrong and roughly when. You can add more detail later."
                                          rows={5}
                                          className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                          data-testid="cmp1-new-subject" />
                            </div>
                            <div>
                                <label className="text-xs uppercase tracking-wide text-primary-k/50 flex items-center gap-2">Severity <RequiredBadge /></label>
                                <select value={form.severity} onChange={(e) => setForm({...form, severity: e.target.value})}
                                        className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                        data-testid="cmp1-new-severity">
                                    {SEVERITIES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-primary-k/80">
                                <input type="checkbox" checked={form.contains_immediate_safety_concerns}
                                       onChange={(e) => setForm({...form, contains_immediate_safety_concerns: e.target.checked})}
                                       data-testid="cmp1-new-safety" />
                                This includes an immediate safety concern
                            </label>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-3" data-testid="cmp1-wizard-content-1">
                            <div>
                                <label className="text-xs uppercase tracking-wide text-primary-k/50 flex items-center gap-2">
                                    Provider Name
                                    <RequiredBadge />
                                    {prefill?.provider_name ? (
                                        <span className="text-[10px] normal-case tracking-normal text-muted-k">Prefilled from participant, editable</span>
                                    ) : null}
                                </label>
                                <input value={form.provider_name}
                                       onChange={(e) => setForm({...form, provider_name: e.target.value})}
                                       placeholder="e.g. BlueBerry Care"
                                       className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                       data-testid="cmp1-new-provider-name" />
                            </div>
                            <div>
                                <label className="text-xs uppercase tracking-wide text-primary-k/50">Provider Email (Optional)</label>
                                <input type="email" value={form.provider_email}
                                       onChange={(e) => setForm({...form, provider_email: e.target.value})}
                                       placeholder="complaints@provider.com.au"
                                       className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                       data-testid="cmp1-new-provider-email" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs uppercase tracking-wide text-primary-k/50">Incident Start Date</label>
                                    <input type="date" value={form.incident_start_date}
                                           onChange={(e) => setForm({...form, incident_start_date: e.target.value})}
                                           className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                           data-testid="cmp1-new-start-date" />
                                </div>
                                <div>
                                    <label className="text-xs uppercase tracking-wide text-primary-k/50">Incident End Date</label>
                                    <input type="date" value={form.incident_end_date}
                                           onChange={(e) => setForm({...form, incident_end_date: e.target.value})}
                                           disabled={form.is_ongoing}
                                           className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm disabled:opacity-50"
                                           data-testid="cmp1-new-end-date" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-primary-k/80">
                                <input type="checkbox" checked={form.is_ongoing}
                                       onChange={(e) => setForm({...form, is_ongoing: e.target.checked})}
                                       data-testid="cmp1-new-ongoing" />
                                This is still happening
                            </label>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-3" data-testid="cmp1-wizard-content-2">
                            <div>
                                <label className="text-xs uppercase tracking-wide text-primary-k/50 flex items-center gap-2">Desired Outcome <RequiredBadge /></label>
                                <select value={form.desired_outcome} onChange={(e) => setForm({...form, desired_outcome: e.target.value})}
                                        className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                        data-testid="cmp1-new-outcome">
                                    {DESIRED_OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs uppercase tracking-wide text-primary-k/50">Additional Outcome Notes (Optional)</label>
                                <textarea value={form.desired_outcome_notes}
                                          onChange={(e) => setForm({...form, desired_outcome_notes: e.target.value})}
                                          rows={3}
                                          placeholder="Anything specific you want as a result?"
                                          className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                          data-testid="cmp1-new-outcome-notes" />
                            </div>
                            <label className="flex items-center gap-2 text-xs text-primary-k/80">
                                <input type="checkbox" checked={form.is_anonymous_acqsc_submission}
                                       onChange={(e) => setForm({...form, is_anonymous_acqsc_submission: e.target.checked})}
                                       data-testid="cmp1-new-anonymous" />
                                If this escalates to ACQSC, submit anonymously
                            </label>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3" data-testid="cmp1-wizard-content-3">
                            <p className="text-xs text-primary-k/60">Review, then open the complaint. You&apos;ll be able to keep editing after it opens.</p>
                            <dl className="text-sm text-primary-k grid grid-cols-3 gap-y-2">
                                <dt className="text-primary-k/50">Type</dt><dd className="col-span-2">{COMPLAINT_TYPES.find(t=>t.key===form.complaint_type)?.label}</dd>
                                <dt className="text-primary-k/50">Severity</dt><dd className="col-span-2">{SEVERITIES.find(s=>s.key===form.severity)?.label}</dd>
                                <dt className="text-primary-k/50">Provider</dt><dd className="col-span-2">{form.provider_name}</dd>
                                <dt className="text-primary-k/50">Timing</dt><dd className="col-span-2">
                                    {form.is_ongoing ? "Still happening" : `${form.incident_start_date || "?"} → ${form.incident_end_date || "?"}`}
                                </dd>
                                <dt className="text-primary-k/50">Outcome</dt><dd className="col-span-2">{DESIRED_OUTCOMES.find(o=>o.key===form.desired_outcome)?.label}</dd>
                                <dt className="text-primary-k/50">Description</dt><dd className="col-span-2 whitespace-pre-line">{form.subject_matter_summary}</dd>
                            </dl>
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-primary-k/10 flex gap-2">
                    <button onClick={onClose} className="py-2 px-4 rounded-full border border-primary-k/20 text-primary-k text-sm" data-testid="cmp1-new-cancel">Cancel</button>
                    <div className="flex-1"/>
                    {step > 0 && (
                        <button onClick={goBack}
                                className="py-2 px-4 rounded-full border border-primary-k/20 text-primary-k text-sm"
                                data-testid="cmp1-wizard-back">
                            Back
                        </button>
                    )}
                    {step < steps.length - 1 ? (
                        <button onClick={goNext} disabled={!stepValid}
                                className="py-2 px-6 rounded-full bg-primary-k text-white text-sm disabled:opacity-40"
                                data-testid="cmp1-wizard-next">
                            Next
                        </button>
                    ) : (
                        <button onClick={submit} disabled={submitting}
                                className="py-2 px-6 rounded-full bg-primary-k text-white text-sm disabled:opacity-40"
                                data-testid="cmp1-new-submit">
                            {submitting ? "Saving," : "Open Complaint"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ComplaintsList() {
    const { id: pid } = useParams();
    const { active: activeParticipant, items: participants } = useParticipants();
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);

    // Prefill from the currently-viewed participant when opening the wizard.
    // Falls back to the first participant record if the URL param doesn't match.
    const participantForPrefill = useMemo(() => {
        if (activeParticipant && activeParticipant.id === pid) return activeParticipant;
        return (participants || []).find((p) => p.id === pid) || activeParticipant || null;
    }, [activeParticipant, participants, pid]);
    const complaintPrefill = useMemo(() => ({
        provider_name: participantForPrefill?.provider_name || "",
        provider_email: participantForPrefill?.provider_email || "",
    }), [participantForPrefill]);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/cmp1/participants/${pid}/complaints`);
            setRows(r.data?.complaints || []);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to load complaints");
        }
    }, [pid]);

    useEffect(() => { load(); }, [load]);

    if (error) return (
        <div className="max-w-3xl mx-auto p-8 text-center text-sm text-red-600" data-testid="cmp1-error">{String(error)}</div>
    );
    if (rows === null) return (
        <div className="max-w-3xl mx-auto p-6 space-y-3">
            <Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="cmp1-list-page">
            <Link to={`/app/participants/${pid}`}
                  className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back to profile
            </Link>

            <header>
                <PageIntro
                    eyebrow="Complaints"
                    title="Open Complaints and Resolutions"
                    description="Something went wrong? Track every complaint from the first phone call to your provider through to ACQSC referral and final resolution, with dates, evidence, and follow-up dates in one place."
                    whatItDoes="Manages each complaint as a case with staged status: raised → with provider → escalated → ACQSC → resolved. Prompts you before deadlines slip."
                    howToUse={[
                        "Start a new complaint and describe what happened.",
                        "Log every response and phone call as the case progresses.",
                        "Escalate to ACQSC directly from the case when appropriate.",
                        "Close the case once resolved, with a written summary.",
                    ]}
                    whatYouGet={[
                        "A clear evidence trail if you need to escalate.",
                        "Deadline reminders so nothing gets forgotten.",
                        "Peace of mind that you're following the right process.",
                    ]}
                >
                    <div className="flex justify-end">
                        <button onClick={() => setModalOpen(true)}
                                className="text-xs inline-flex items-center gap-1 px-4 py-2 rounded-full bg-primary-k text-white"
                                data-testid="cmp1-new-btn">
                            <Plus className="w-3 h-3" /> New Complaint
                        </button>
                    </div>
                </PageIntro>
            </header>

            {rows.length > 0 && (
                <SmartAISummary
                    pageKey="complaints-list"
                    context={{
                        total: rows.length,
                        by_stage: rows.reduce((acc, c) => {
                            acc[c.current_stage] = (acc[c.current_stage] || 0) + 1;
                            return acc;
                        }, {}),
                        critical_or_serious: rows.filter((c) => c.severity === "critical_urgent" || c.severity === "serious").length,
                        safeguard_flagged: rows.filter((c) => c.contains_elder_abuse_indicators).length,
                        open_not_closed: rows.filter((c) => !String(c.current_stage).startsWith("closed_")).length,
                    }}
                />
            )}

            {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-primary-k/20 p-8 text-center" data-testid="cmp1-empty">
                    <AlertOctagon className="w-8 h-8 text-primary-k/30 mx-auto" />
                    <p className="text-sm text-primary-k/60 mt-2">No complaints yet. Opening one creates a LOOP-1 case and evidence bundle.</p>
                </div>
            ) : (
                <ul className="space-y-3" data-testid="cmp1-list">
                    {rows.map((c) => (
                        <li key={c.id} data-testid={`cmp1-row-${c.id}`}
                            className={`rounded-2xl border p-4 ${c.contains_elder_abuse_indicators ? "border-red-200 bg-red-50/30" : "border-primary-k/10 bg-white"}`}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-primary-k truncate">{c.provider_name}</p>
                                    <p className="text-xs text-primary-k/60 mt-0.5 line-clamp-2">{c.subject_matter_summary}</p>
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${STAGE_TINT[c.current_stage]}`}>
                                            {STAGE_LABEL[c.current_stage] || c.current_stage}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-wide text-primary-k/50">{c.complaint_type.replace(/_/g, " ")}</span>
                                        <span className="text-[10px] uppercase tracking-wide text-primary-k/50">{c.severity}</span>
                                        {c.contains_elder_abuse_indicators && (
                                            <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-800 inline-flex items-center gap-1">
                                                <ShieldAlert className="w-3 h-3" /> Safeguard
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {c.evidence_bundle_id && (
                                    <a
                                        href={`${process.env.REACT_APP_BACKEND_URL}/api/cmp1/evidence-bundles/${c.evidence_bundle_id}/export.pdf`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary-k underline mr-3"
                                        data-testid={`cmp1-bundle-pdf-${c.id}`}
                                    >Download bundle PDF ↓</a>
                                )}
                                {c.primary_case_id && (
                                    <Link to={`/app/participants/${pid}/cases/${c.primary_case_id}`}
                                          className="text-xs text-primary-k underline"
                                          data-testid={`cmp1-case-link-${c.id}`}>
                                        View case →
                                    </Link>
                                )}
                            </div>
                            {!String(c.current_stage).startsWith("closed_") && c.current_stage !== "stage_4_ombudsman_referral" && c.current_stage !== "stage_5_appeals" && (
                                <ACQSCSubmitControl complaint={c} onSubmitted={(updated) => {
                                    setRows((prev) => (prev || []).map((r) => r.id === updated.id ? { ...r, current_stage: updated.current_stage, acqsc_last_submission_id: updated.submission_id, acqsc_last_submitted_at: updated.sent_at } : r));
                                }} />
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {modalOpen && (
                <NewComplaintModal
                    pid={pid}
                    prefill={complaintPrefill}
                    onClose={() => setModalOpen(false)}
                    onCreated={(c) => {
                        setModalOpen(false);
                        setRows((prev) => [c, ...(prev || [])]);
                    }}
                />
            )}

            <p className="text-[11px] text-primary-k/40 pt-4">
                <Phone className="inline w-3 h-3 mr-1" />
                If you or the participant is in immediate danger, phone 000. For confidential guidance the Elder Abuse Helpline is 1800 353 374.
            </p>
        </div>
    );
}


// -----------------------------------------------------------------------------
// ACQSC live submission control. One button per row that opens a compact
// dialog for optional notes + confirms, then POSTs the referral email and
// exposes the audit-trail row. Keeps the caregiver in ComplaintsList without
// forcing them into a separate CaseDetail flow.
// -----------------------------------------------------------------------------
function ACQSCSubmitControl({ complaint, onSubmitted }) {
    const [open, setOpen] = useState(false);
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [trail, setTrail] = useState(null);
    const [showTrail, setShowTrail] = useState(false);

    const loadTrail = useCallback(async () => {
        try {
            const { data } = await api.get(`/cmp1/complaints/${complaint.id}/acqsc-submissions`);
            setTrail(data?.submissions || []);
        } catch (e) {
            toast.error("Could not load submission history.");
        }
    }, [complaint.id]);

    const submit = async () => {
        setSubmitting(true);
        try {
            const { data } = await api.post(`/cmp1/complaints/${complaint.id}/submit-to-acqsc`, {
                additional_notes: notes || undefined,
                include_evidence_bundle_link: true,
            });
            toast.success(
                data.mocked
                    ? "Recorded to the audit trail (email delivery is running in mocked mode)."
                    : "Referral emailed to ACQSC and saved to the audit trail."
            );
            setOpen(false);
            setNotes("");
            onSubmitted?.({ id: complaint.id, ...data });
            if (showTrail) await loadTrail();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not submit to ACQSC. Please try again."));
        } finally {
            setSubmitting(false);
        }
    };

    const alreadySubmitted = !!complaint.acqsc_last_submitted_at;

    return (
        <div className="mt-3 pt-3 border-t border-primary-k/10">
            <div className="flex items-center gap-3 flex-wrap">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    data-testid={`cmp1-acqsc-open-${complaint.id}`}
                    className="text-xs inline-flex items-center gap-1.5 rounded-full border border-primary-k/25 bg-white px-3 py-1.5 font-medium text-primary-k hover:bg-primary-k hover:text-white"
                >
                    <Send className="w-3 h-3" /> {alreadySubmitted ? "Send another ACQSC referral" : "Send to ACQSC"}
                </button>
                <button
                    type="button"
                    onClick={async () => { setShowTrail((v) => !v); if (!trail) await loadTrail(); }}
                    data-testid={`cmp1-acqsc-trail-${complaint.id}`}
                    className="text-xs text-primary-k underline"
                >
                    {showTrail ? "Hide" : "View"} submission history
                </button>
                {alreadySubmitted && (
                    <span className="text-[11px] text-muted-k">
                        Last sent {new Date(complaint.acqsc_last_submitted_at).toLocaleString("en-AU")}
                    </span>
                )}
            </div>
            {open && (
                <div className="mt-3 rounded-lg border border-primary-k/20 bg-cream/40 p-3 space-y-2" data-testid={`cmp1-acqsc-form-${complaint.id}`}>
                    <label className="block text-xs uppercase tracking-wide text-primary-k/60">Notes to include with the referral (optional)</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="e.g. The provider senior team has not responded in the last 21 days."
                        className="w-full border border-primary-k/20 rounded-lg p-2 text-sm bg-white"
                        data-testid={`cmp1-acqsc-notes-${complaint.id}`}
                    />
                    <p className="text-[11px] text-muted-k">
                        A formal referral email will be sent to info@agedcarequality.gov.au, including the complaint summary, stage history, and a link to the evidence bundle. A full audit trail row is written whether or not delivery succeeds.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setOpen(false)} className="text-xs text-primary-k/60 hover:text-primary-k">Cancel</button>
                        <button
                            onClick={submit}
                            disabled={submitting}
                            data-testid={`cmp1-acqsc-submit-${complaint.id}`}
                            className="text-xs inline-flex items-center gap-1.5 rounded-full bg-primary-k px-3 py-1.5 font-medium text-white hover:bg-primary-k/90 disabled:opacity-60"
                        >
                            {submitting ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending</> : <><Send className="w-3 h-3" /> Submit referral</>}
                        </button>
                    </div>
                </div>
            )}
            {showTrail && trail && (
                <div className="mt-3 space-y-2" data-testid={`cmp1-acqsc-trail-list-${complaint.id}`}>
                    {trail.length === 0 ? (
                        <p className="text-[12px] text-muted-k">No submissions on record yet.</p>
                    ) : trail.map((s) => (
                        <div key={s.id} className="rounded-lg border border-primary-k/10 bg-white p-2 text-[12px]">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-medium text-primary-k">{s.subject}</span>
                                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${s.sent_ok ? "border-sage-200 bg-sage-50 text-sage-800" : "border-gold-200 bg-gold-50 text-gold-800"}`}>
                                    {s.sent_mocked ? "MOCKED" : s.sent_ok ? "DELIVERED" : "PENDING"}
                                </span>
                            </div>
                            <div className="text-[11px] text-muted-k mt-1">
                                To {s.recipient_email} · {new Date(s.sent_at).toLocaleString("en-AU")} · sha256 {String(s.body_hash_sha256 || "").slice(0, 12)}…
                            </div>
                            {s.additional_notes && <div className="text-[11px] text-primary-k/80 mt-1 whitespace-pre-wrap">{s.additional_notes}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
