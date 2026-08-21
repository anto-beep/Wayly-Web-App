/**
 * CSC-2 v1 · Stream-Mix multi-step + 6-step IAT prep wizard.
 * Route: /app/csc/stream-mix-and-iat
 */
import React, { useEffect, useState } from "react";
import useScrollToResult from "@/hooks/useScrollToResult";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { ChevronLeft, CheckCircle2, Circle, ArrowRight, ClipboardList, HelpCircle, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PageIntro from "@/components/PageIntro";

const STREAM_LABELS = {
    standard_sah: "Standard Support at Home",
    restorative_care_pathway: "Restorative Care Pathway",
    end_of_life_pathway: "End-of-Life Pathway",
    hcp_transition: "HCP Transition",
    assistive_technology: "Assistive Technology",
    home_modifications: "Home Modifications",
};
const FIT_TONE = {
    likely_fit: "bg-emerald-50 border-emerald-200 text-emerald-800",
    possible_fit_worth_discussing: "bg-sky-50 border-sky-200 text-sky-800",
    insufficient_information_to_assess: "bg-amber-50 border-amber-200 text-amber-800",
};
const FIT_LABEL = {
    likely_fit: "Likely fit",
    possible_fit_worth_discussing: "Possible, worth discussing",
    insufficient_information_to_assess: "Not enough info",
};

function useParticipantId() {
    // Follow the active-participant selection from context so switching the
    // participant in the header cascades into every tool page.
    const { active } = useParticipants();
    return active?.id || null;
}

function StreamMixForm({ participantId }) {
    const [form, setForm] = useState({
        is_current_hcp_holder: false,
        hcp_level: "",
        recent_hospital_stay_or_acute_event: false,
        restorative_potential_indicated: false,
        palliative_status_indicated: false,
        at_needs_indicated: false,
        hm_needs_indicated: false,
    });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const resultRef = useScrollToResult(Boolean(result));

    const toggle = (key) => setForm(f => ({ ...f, [key]: !f[key] }));

    const submit = async () => {
        if (!participantId) { toast.error("Select a participant first"); return; }
        setBusy(true);
        try {
            const payload = {
                ...form,
                participant_or_pre_participant_id: participantId,
                hcp_level: form.hcp_level ? Number(form.hcp_level) : null,
            };
            const { data } = await api.post("/csc2/stream-mix-checks", payload);
            setResult(data.stream_mix_check);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not compute stream mix");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-6 space-y-5" data-testid="csc2-stream-mix">
            <div>
                <p className="text-xs uppercase tracking-wider text-primary-k/50">Stream Mix Self-Check</p>
                <h2 className="font-heading text-xl text-primary-k mt-1">Which SAH Streams Might Fit?</h2>
                <p className="text-sm text-muted-k mt-1">Tick anything that applies. We&apos;ll suggest streams to discuss with your assessor, this is not a determination.</p>
            </div>

            <div className="grid gap-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-kindred hover:bg-surface-2 cursor-pointer" data-testid="sm-toggle-hcp">
                    <input type="checkbox" checked={form.is_current_hcp_holder} onChange={() => toggle("is_current_hcp_holder")} className="mt-1"/>
                    <div>
                        <p className="text-sm text-primary-k">Currently on Home Care Package (HCP)</p>
                        <p className="text-xs text-muted-k">HCP transition provisions may apply.</p>
                    </div>
                </label>
                {form.is_current_hcp_holder && (
                    <div className="ml-9">
                        <label className="text-xs text-muted-k">HCP level (1-4)</label>
                        <input type="number" min={1} max={4} value={form.hcp_level} data-testid="sm-hcp-level"
                               onChange={e => setForm(f => ({ ...f, hcp_level: e.target.value }))}
                               className="ml-2 w-16 px-2 py-1 text-sm border rounded"/>
                    </div>
                )}
                <label className="flex items-start gap-3 p-3 rounded-lg border border-kindred hover:bg-surface-2 cursor-pointer" data-testid="sm-toggle-hospital">
                    <input type="checkbox" checked={form.recent_hospital_stay_or_acute_event} onChange={() => toggle("recent_hospital_stay_or_acute_event")} className="mt-1"/>
                    <div>
                        <p className="text-sm text-primary-k">Recent hospital stay or acute event</p>
                        <p className="text-xs text-muted-k">Combined with restorative goals, this may point to RCP.</p>
                    </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-kindred hover:bg-surface-2 cursor-pointer" data-testid="sm-toggle-restorative">
                    <input type="checkbox" checked={form.restorative_potential_indicated} onChange={() => toggle("restorative_potential_indicated")} className="mt-1"/>
                    <div>
                        <p className="text-sm text-primary-k">Restorative potential (rehab, reablement goals)</p>
                    </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-kindred hover:bg-surface-2 cursor-pointer" data-testid="sm-toggle-palliative">
                    <input type="checkbox" checked={form.palliative_status_indicated} onChange={() => toggle("palliative_status_indicated")} className="mt-1"/>
                    <div>
                        <p className="text-sm text-primary-k">Palliative planning is under way</p>
                        <p className="text-xs text-muted-k">This is sensitive, you don&apos;t need to tick it.</p>
                    </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-kindred hover:bg-surface-2 cursor-pointer" data-testid="sm-toggle-at">
                    <input type="checkbox" checked={form.at_needs_indicated} onChange={() => toggle("at_needs_indicated")} className="mt-1"/>
                    <div><p className="text-sm text-primary-k">Assistive Technology needs indicated</p></div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-kindred hover:bg-surface-2 cursor-pointer" data-testid="sm-toggle-hm">
                    <input type="checkbox" checked={form.hm_needs_indicated} onChange={() => toggle("hm_needs_indicated")} className="mt-1"/>
                    <div><p className="text-sm text-primary-k">Home modification needs indicated</p></div>
                </label>
            </div>

            <button onClick={submit} disabled={busy || !participantId} data-testid="sm-submit"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2 text-sm disabled:opacity-50">
                {busy ? "Working…" : "See stream suggestions"} <ArrowRight className="w-4 h-4"/>
            </button>

            {result && (
                <div ref={resultRef} className="mt-4 space-y-3 scroll-mt-20" data-testid="sm-result">
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Suggested streams to discuss</p>
                    {(result.stream_recommendations || []).map((r, i) => (
                        <div key={i} className={`rounded-lg border p-4 ${FIT_TONE[r.fit_signal] || "bg-surface-2 border-kindred"}`} data-testid={`sm-rec-${r.stream}`}>
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">{STREAM_LABELS[r.stream] || r.stream}</p>
                                <span className="text-[10px] uppercase tracking-wider">{FIT_LABEL[r.fit_signal] || r.fit_signal}</span>
                            </div>
                            <p className="text-xs mt-1">{r.rationale_plain_language?.caregiver}</p>
                            {(r.considerations || []).length > 0 && (
                                <ul className="text-xs mt-2 list-disc pl-5 space-y-0.5">
                                    {r.considerations.map((c, j) => <li key={j}>{c}</li>)}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const STEP_TITLES = [
    "Documents to Bring",
    "Questions to Ask",
    "Evidence & Notes",
    "Advocacy & Communication",
    "Book / Confirm the Appointment",
    "Record the Result",
];

function IatPrepWizard({ participantId }) {
    const [prep, setPrep] = useState(null);
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState(false);
    const [advocacy, setAdvocacy] = useState("");
    const [notes, setNotes] = useState("");
    const [evidenceInput, setEvidenceInput] = useState("");
    const [scheduledDate, setScheduledDate] = useState("");
    const [appointmentType, setAppointmentType] = useState("in_person");
    const [classification, setClassification] = useState("");
    const [matches, setMatches] = useState(true);

    const start = async () => {
        if (!participantId) return;
        setBusy(true);
        try {
            const { data } = await api.post("/csc2/iat-preps", {
                participant_or_pre_participant_id: participantId,
                iat_scheduled_date: scheduledDate || null,
                iat_appointment_type: appointmentType,
            });
            setPrep(data.iat_prep);
            setAdvocacy(data.iat_prep.advocacy_notes || "");
            setNotes(data.iat_prep.iat_notes || "");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not start IAT prep");
        } finally { setBusy(false); }
    };

    const patch = async (body) => {
        if (!prep) return;
        setBusy(true);
        try {
            const { data } = await api.patch(`/csc2/iat-preps/${prep.id}`, body);
            setPrep(data.iat_prep);
            toast.success("Saved");
        } catch (e) {
            toast.error("Could not save");
        } finally { setBusy(false); }
    };

    const toggleDoc = (idx) => {
        const list = [...(prep.documents_to_bring_checklist || [])];
        list[idx] = { ...list[idx], user_confirmed_ready: !list[idx].user_confirmed_ready };
        patch({ documents_to_bring_checklist: list });
    };
    const toggleQuestion = (idx) => {
        const list = [...(prep.questions_to_ask_at_assessment || [])];
        list[idx] = { ...list[idx], user_confirmed_ready_to_ask: !list[idx].user_confirmed_ready_to_ask };
        patch({ questions_to_ask_at_assessment: list });
    };
    const addEvidence = () => {
        if (!evidenceInput.trim()) return;
        const list = [...(prep.evidence_prepared || []), { note: evidenceInput.trim(), added_at: new Date().toISOString() }];
        setEvidenceInput("");
        patch({ evidence_prepared: list });
    };
    const removeEvidence = (idx) => {
        const list = [...(prep.evidence_prepared || [])];
        list.splice(idx, 1);
        patch({ evidence_prepared: list });
    };
    const recordResult = async () => {
        if (!prep) return;
        if (!classification) { toast.error("Enter the classification received"); return; }
        setBusy(true);
        try {
            const { data } = await api.post(`/csc2/iat-preps/${prep.id}/record-classification-result`, {
                classification_received: Number(classification),
                matches_expected: matches,
            });
            setPrep(data.iat_prep);
            toast.success(matches ? "Recorded, classification matches expectation." : "Recorded, flagged for potential reconsideration.");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not record result");
        } finally { setBusy(false); }
    };

    if (!prep) {
        return (
            <div className="rounded-2xl border border-primary-k/10 bg-white p-6 space-y-4" data-testid="csc2-iat-start">
                <div>
                    <p className="text-xs uppercase tracking-wider text-primary-k/50">IAT Prep Wizard</p>
                    <h2 className="font-heading text-xl text-primary-k mt-1">Prepare Confidently for the Initial Assessment Tool</h2>
                    <p className="text-sm text-muted-k mt-1">6 steps: documents, questions, evidence, advocacy, appointment, result.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm">
                        <span className="text-xs text-muted-k">Scheduled date (optional)</span>
                        <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                               data-testid="iat-scheduled-date"
                               className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                    </label>
                    <label className="text-sm">
                        <span className="text-xs text-muted-k">Appointment type</span>
                        <select value={appointmentType} onChange={e => setAppointmentType(e.target.value)}
                                data-testid="iat-appointment-type"
                                className="mt-1 w-full px-3 py-2 text-sm border rounded">
                            <option value="not_yet_scheduled">Not yet scheduled</option>
                            <option value="in_person">In person (home visit)</option>
                            <option value="telehealth">Telehealth</option>
                            <option value="clinic_or_office">Clinic / office</option>
                        </select>
                    </label>
                </div>
                <button onClick={start} disabled={busy || !participantId} data-testid="iat-start-btn"
                        className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2 text-sm disabled:opacity-50">
                    <ClipboardList className="w-4 h-4"/> Start prep
                </button>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-6 space-y-5" data-testid="csc2-iat-wizard">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="text-xs uppercase tracking-wider text-primary-k/50">IAT Prep Wizard</p>
                    <h2 className="font-heading text-xl text-primary-k mt-1">Step {step + 1} of 6 · {STEP_TITLES[step]}</h2>
                </div>
                <div className="text-xs text-muted-k">Status: {prep.current_status?.replace(/_/g, " ")}</div>
            </div>

            <div className="flex gap-2 flex-wrap">
                {STEP_TITLES.map((t, i) => (
                    <button key={i} onClick={() => setStep(i)}
                            data-testid={`iat-step-${i}`}
                            className={`text-[11px] px-3 py-1 rounded-full border ${step === i ? "bg-primary-k text-white border-primary-k" : "border-kindred text-muted-k hover:text-primary-k"}`}>
                        {i + 1}. {t}
                    </button>
                ))}
            </div>

            {step === 0 && (
                <div className="space-y-2" data-testid="iat-step-content-0">
                    {(prep.documents_to_bring_checklist || []).map((d, i) => (
                        <button key={i} onClick={() => toggleDoc(i)}
                                data-testid={`iat-doc-${i}`}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-kindred hover:bg-surface-2">
                            {d.user_confirmed_ready ? <CheckCircle2 className="w-4 h-4 text-emerald-600"/> : <Circle className="w-4 h-4 text-primary-k/40"/>}
                            <span className={`text-sm ${d.user_confirmed_ready ? "line-through text-muted-k" : "text-primary-k"}`}>{d.document_name}</span>
                        </button>
                    ))}
                </div>
            )}

            {step === 1 && (
                <div className="space-y-2" data-testid="iat-step-content-1">
                    <p className="text-xs text-muted-k">Tick each question you want to ask.</p>
                    {(prep.questions_to_ask_at_assessment || []).map((q, i) => (
                        <button key={i} onClick={() => toggleQuestion(i)}
                                data-testid={`iat-q-${i}`}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-kindred hover:bg-surface-2">
                            {q.user_confirmed_ready_to_ask ? <CheckCircle2 className="w-4 h-4 text-emerald-600"/> : <HelpCircle className="w-4 h-4 text-primary-k/40"/>}
                            <span className="text-sm text-primary-k">{q.question}</span>
                        </button>
                    ))}
                </div>
            )}

            {step === 2 && (
                <div className="space-y-3" data-testid="iat-step-content-2">
                    <p className="text-xs text-muted-k">Notes about evidence you&apos;ve prepared (e.g. hospital summary, OT reports).</p>
                    <div className="flex gap-2">
                        <input value={evidenceInput} onChange={e => setEvidenceInput(e.target.value)}
                               data-testid="iat-evidence-input"
                               placeholder="Evidence note"
                               className="flex-1 px-3 py-2 text-sm border rounded"/>
                        <button onClick={addEvidence} data-testid="iat-evidence-add"
                                className="inline-flex items-center gap-1 bg-primary-k text-white rounded-full px-3 text-sm">
                            <Plus className="w-4 h-4"/> Add
                        </button>
                    </div>
                    <ul className="space-y-1">
                        {(prep.evidence_prepared || []).map((e, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm">
                                <FileText className="w-4 h-4 text-primary-k/50"/>
                                <span className="flex-1">{e.note}</span>
                                <button onClick={() => removeEvidence(i)} data-testid={`iat-evidence-remove-${i}`}>
                                    <Trash2 className="w-4 h-4 text-red-500"/>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-3" data-testid="iat-step-content-3">
                    <label className="text-xs text-muted-k">Who will support the participant on the day? Any communication needs?</label>
                    <textarea value={advocacy} onChange={e => setAdvocacy(e.target.value)}
                              rows={4}
                              data-testid="iat-advocacy"
                              className="w-full px-3 py-2 text-sm border rounded"/>
                    <label className="text-xs text-muted-k">Additional notes to keep handy</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                              rows={3}
                              data-testid="iat-notes"
                              className="w-full px-3 py-2 text-sm border rounded"/>
                    <button onClick={() => patch({ advocacy_notes: advocacy, iat_notes: notes })}
                            disabled={busy} data-testid="iat-save-advocacy"
                            className="inline-flex items-center gap-1 bg-primary-k text-white rounded-full px-4 py-1.5 text-sm">
                        Save notes
                    </button>
                </div>
            )}

            {step === 4 && (
                <div className="space-y-2 text-sm text-primary-k" data-testid="iat-step-content-4">
                    <p>Confirm the appointment details with your assessor and log them here.</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-kindred p-3">
                            <p className="text-xs text-muted-k">Scheduled for</p>
                            <p>{prep.iat_scheduled_date || "Not yet booked"}</p>
                        </div>
                        <div className="rounded-lg border border-kindred p-3">
                            <p className="text-xs text-muted-k">Type</p>
                            <p>{prep.iat_appointment_type?.replace(/_/g, " ")}</p>
                        </div>
                    </div>
                </div>
            )}

            {step === 5 && (
                <div className="space-y-3" data-testid="iat-step-content-5">
                    <label className="text-sm">
                        <span className="text-xs text-muted-k">Classification received (1-8)</span>
                        <input type="number" min={1} max={8} value={classification}
                               data-testid="iat-classification"
                               onChange={e => setClassification(e.target.value)}
                               className="mt-1 w-24 px-2 py-1 text-sm border rounded"/>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={matches} onChange={e => setMatches(e.target.checked)}
                               data-testid="iat-matches-expected"/>
                        <span>Matches what we expected</span>
                    </label>
                    <button onClick={recordResult} disabled={busy} data-testid="iat-record-result"
                            className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2 text-sm">
                        Record result
                    </button>
                    {prep.classification_received && (
                        <div className={`text-sm rounded-lg p-3 ${prep.classification_matches_expected_from_csc ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                            Recorded classification {prep.classification_received}
                            {!prep.classification_matches_expected_from_csc && ", consider a reconsideration."}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function CscStreamMixIat() {
    const pid = useParticipantId();
    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6" data-testid="csc2-root">
            <Link to="/app" className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4"/> Back
            </Link>
            <PageIntro
                eyebrow="Classification Self-Check"
                title="Prepare for Your SAH Assessment"
                description="Walk into your Initial Assessment Tool (IAT) knowing which Support at Home streams may fit, what documents to bring, and what to ask. No paperwork gets submitted here, this is your private prep space."
                whatItDoes="Suggests which SAH streams to discuss with your assessor based on a short self-check, and gives you a 6-step wizard to prepare your questions, evidence, and advocacy notes before the appointment."
                howToUse={[
                    "Tick the fit signals that apply to see which streams may suit.",
                    "Start the 6-step IAT prep wizard below.",
                    "Work through documents, questions, evidence, and advocacy at your pace.",
                    "After the assessment, record the classification received.",
                ]}
                whatYouGet={[
                    "A ranked list of streams likely to be a fit (with rationale).",
                    "A confidence-building checklist you can bring to the appointment.",
                    "An early warning if the classification you receive is unexpected.",
                ]}
            />
            <StreamMixForm key={`sm-${pid || "none"}`} participantId={pid}/>
            <IatPrepWizard key={`iat-${pid || "none"}`} participantId={pid}/>
        </div>
    );
}
