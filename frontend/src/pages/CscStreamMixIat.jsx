/**
 * CSC-2 v1 · Stream-Mix self-check + a guided 6-step IAT prep workflow.
 * Route: /app/csc/stream-mix-and-iat
 *
 * Light-but-colourful: each section has its own soft tint, and the IAT prep
 * runs as a real stepper (numbered progress + Back/Next) rather than tabs.
 */
import React, { useEffect, useState } from "react";
import useScrollToResult from "@/hooks/useScrollToResult";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import {
    ChevronLeft, ChevronRight, CheckCircle2, Circle, ArrowRight, ClipboardList,
    HelpCircle, FileText, Plus, Trash2, FileCheck2, MessageSquareQuote, ShieldCheck,
    CalendarDays, Award, Layers, Check,
} from "lucide-react";
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
    likely_fit: "Likely Fit",
    possible_fit_worth_discussing: "Possible, Worth Discussing",
    insufficient_information_to_assess: "Not Enough Info",
};

// Per-step icon + soft accent colour, so the workflow reads visually.
const STEP_META = [
    { title: "Documents to Bring", Icon: FileCheck2, tone: { bg: "#EAF3F3", chip: "#0E4D52" } },
    { title: "Questions to Ask", Icon: MessageSquareQuote, tone: { bg: "#EEF3EE", chip: "#425F47" } },
    { title: "Evidence & Notes", Icon: FileText, tone: { bg: "#FBF3EE", chip: "#A5512B" } },
    { title: "Advocacy & Communication", Icon: ShieldCheck, tone: { bg: "#EAF3F3", chip: "#0E4D52" } },
    { title: "Book / Confirm the Appointment", Icon: CalendarDays, tone: { bg: "#EEF3EE", chip: "#425F47" } },
    { title: "Record the Result", Icon: Award, tone: { bg: "#FBF3EE", chip: "#A5512B" } },
];

function useParticipantId() {
    const { active } = useParticipants();
    return active?.id || null;
}

function StreamMixForm({ participantId }) {
    const [form, setForm] = useState({
        is_current_hcp_holder: false, hcp_level: "", recent_hospital_stay_or_acute_event: false,
        restorative_potential_indicated: false, palliative_status_indicated: false,
        at_needs_indicated: false, hm_needs_indicated: false,
    });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const resultRef = useScrollToResult(Boolean(result));
    const toggle = (key) => setForm(f => ({ ...f, [key]: !f[key] }));

    const submit = async () => {
        if (!participantId) { toast.error("Select a participant first"); return; }
        setBusy(true);
        try {
            const payload = { ...form, participant_or_pre_participant_id: participantId, hcp_level: form.hcp_level ? Number(form.hcp_level) : null };
            const { data } = await api.post("/csc2/stream-mix-checks", payload);
            setResult(data.stream_mix_check);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not compute stream mix");
        } finally { setBusy(false); }
    };

    const OPTIONS = [
        { key: "is_current_hcp_holder", testid: "sm-toggle-hcp", title: "Currently on a Home Care Package (HCP)", hint: "HCP transition provisions may apply." },
        { key: "recent_hospital_stay_or_acute_event", testid: "sm-toggle-hospital", title: "Recent hospital stay or acute event", hint: "Combined with restorative goals, this may point to RCP." },
        { key: "restorative_potential_indicated", testid: "sm-toggle-restorative", title: "Restorative potential (rehab, reablement goals)" },
        { key: "palliative_status_indicated", testid: "sm-toggle-palliative", title: "Palliative planning is under way", hint: "This is sensitive, you don't need to tick it." },
        { key: "at_needs_indicated", testid: "sm-toggle-at", title: "Assistive Technology needs indicated" },
        { key: "hm_needs_indicated", testid: "sm-toggle-hm", title: "Home modification needs indicated" },
    ];

    return (
        <div className="rounded-2xl p-6 space-y-5 border border-[#0E4D52]/15" style={{ backgroundColor: "#EAF3F3" }} data-testid="csc2-stream-mix">
            <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0E4D52]"><Layers className="h-5 w-5 text-white" /></span>
                <div>
                    <p className="text-xs uppercase tracking-wider text-[#0E4D52] font-semibold">Step 1 · Stream Mix Self-Check</p>
                    <h2 className="font-heading text-xl text-primary-k">Which SAH Streams Might Fit?</h2>
                </div>
            </div>
            <p className="text-sm text-muted-k">Tick anything that applies. We&apos;ll suggest streams to discuss with your assessor, this is not a determination.</p>

            <div className="grid gap-2 sm:grid-cols-2">
                {OPTIONS.map((o) => {
                    const on = form[o.key];
                    return (
                        <button key={o.key} type="button" onClick={() => toggle(o.key)} data-testid={o.testid} aria-pressed={on}
                            className="text-left flex items-start gap-3 p-3 rounded-xl border transition bg-white"
                            style={{ borderColor: on ? "#0E4D52" : "var(--kindred-border)", boxShadow: on ? "0 1px 4px rgba(14,77,82,0.08)" : "none" }}>
                            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md flex-shrink-0" style={{ backgroundColor: on ? "#0E4D52" : "#EEF1F5" }}>
                                {on ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                            </span>
                            <span>
                                <span className="block text-sm text-primary-k">{o.title}</span>
                                {o.hint && <span className="block text-xs text-muted-k mt-0.5">{o.hint}</span>}
                            </span>
                        </button>
                    );
                })}
            </div>
            {form.is_current_hcp_holder && (
                <div className="bg-white rounded-lg p-3 border border-kindred inline-flex items-center gap-2">
                    <label className="text-xs text-muted-k font-medium">HCP Level (1 to 4)</label>
                    <input type="number" min={1} max={4} value={form.hcp_level} data-testid="sm-hcp-level" onChange={e => setForm(f => ({ ...f, hcp_level: e.target.value }))} className="w-16 px-2 py-1 text-sm border rounded" />
                </div>
            )}

            <button onClick={submit} disabled={busy || !participantId} data-testid="sm-submit" className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm disabled:opacity-50 hover:bg-[#0A3E42]">
                {busy ? "Working…" : "See Stream Suggestions"} <ArrowRight className="w-4 h-4" />
            </button>

            {result && (
                <div ref={resultRef} className="mt-2 space-y-3 scroll-mt-20" data-testid="sm-result">
                    <p className="text-xs uppercase tracking-wide text-[#0E4D52] font-semibold">Suggested Streams to Discuss</p>
                    {(result.stream_recommendations || []).map((r, i) => (
                        <div key={i} className={`rounded-lg border p-4 ${FIT_TONE[r.fit_signal] || "bg-white border-kindred"}`} data-testid={`sm-rec-${r.stream}`}>
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

// Numbered stepper with a progress line + completed ticks.
function Stepper({ step, setStep, completed }) {
    return (
        <div className="flex items-center" data-testid="iat-stepper">
            {STEP_META.map((m, i) => {
                const active = i === step;
                const done = completed.includes(i);
                const chip = m.tone.chip;
                return (
                    <React.Fragment key={i}>
                        <button type="button" onClick={() => setStep(i)} data-testid={`iat-step-${i}`} className="flex flex-col items-center gap-1 group" style={{ minWidth: 46 }}>
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 transition" style={{ backgroundColor: active ? chip : done ? "#fff" : "#fff", borderColor: active || done ? chip : "var(--kindred-border)", color: active ? "#fff" : chip }}>
                                {done && !active ? <Check className="h-4 w-4" /> : <span className="text-sm font-semibold">{i + 1}</span>}
                            </span>
                            <span className="text-[9px] leading-tight text-center max-w-[64px] hidden sm:block" style={{ color: active ? chip : "var(--muted-k, #666)" }}>{m.title.split(" ")[0]}</span>
                        </button>
                        {i < STEP_META.length - 1 && <div className="flex-1 h-0.5 mx-1" style={{ backgroundColor: (done || completed.includes(i)) ? chip : "var(--kindred-border)" }} />}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

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
            const { data } = await api.post("/csc2/iat-preps", { participant_or_pre_participant_id: participantId, iat_scheduled_date: scheduledDate || null, iat_appointment_type: appointmentType });
            setPrep(data.iat_prep);
            setAdvocacy(data.iat_prep.advocacy_notes || "");
            setNotes(data.iat_prep.iat_notes || "");
            requestAnimationFrame(() => document.getElementById("iat-wizard")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
        } catch (e) { toast.error("Could not save"); } finally { setBusy(false); }
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
            const { data } = await api.post(`/csc2/iat-preps/${prep.id}/record-classification-result`, { classification_received: Number(classification), matches_expected: matches });
            setPrep(data.iat_prep);
            toast.success(matches ? "Recorded, classification matches expectation." : "Recorded, flagged for potential reconsideration.");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not record result");
        } finally { setBusy(false); }
    };

    // Completed-step heuristics for the stepper ticks.
    const completed = (() => {
        if (!prep) return [];
        const c = [];
        if ((prep.documents_to_bring_checklist || []).some(d => d.user_confirmed_ready)) c.push(0);
        if ((prep.questions_to_ask_at_assessment || []).some(q => q.user_confirmed_ready_to_ask)) c.push(1);
        if ((prep.evidence_prepared || []).length > 0) c.push(2);
        if ((prep.advocacy_notes || "").trim() || (prep.iat_notes || "").trim()) c.push(3);
        if (prep.iat_scheduled_date) c.push(4);
        if (prep.classification_received) c.push(5);
        return c;
    })();

    if (!prep) {
        return (
            <div id="iat-wizard" className="rounded-2xl p-6 sm:p-7 space-y-5 border border-[#A5512B]/20 scroll-mt-20" style={{ backgroundColor: "#FBF0EA" }} data-testid="csc2-iat-start">
                <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#A5512B]"><ClipboardList className="h-6 w-6 text-white" /></span>
                    <div>
                        <p className="text-xs uppercase tracking-wider text-[#A5512B] font-semibold">Step 2 · Guided Workflow</p>
                        <h2 className="font-heading text-2xl text-primary-k mt-0.5">Prepare Confidently for the Initial Assessment</h2>
                        <p className="text-sm text-muted-k mt-1 max-w-2xl">Six gentle steps get you ready for the day: documents, questions, evidence, advocacy, the appointment, and recording the result.</p>
                    </div>
                </div>
                {/* Preview of the journey */}
                <div className="grid gap-2 sm:grid-cols-3">
                    {STEP_META.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-xl bg-white/70 border border-[#A5512B]/10 p-3">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: m.tone.chip }}><m.Icon className="h-4 w-4 text-white" /></span>
                            <span className="text-xs font-medium text-primary-k">{i + 1}. {m.title}</span>
                        </div>
                    ))}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm">
                        <span className="text-xs text-muted-k font-medium">Scheduled Date (Optional)</span>
                        <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} data-testid="iat-scheduled-date" className="mt-1 w-full px-3 py-2 text-sm border rounded bg-white" />
                    </label>
                    <label className="text-sm">
                        <span className="text-xs text-muted-k font-medium">Appointment Type</span>
                        <select value={appointmentType} onChange={e => setAppointmentType(e.target.value)} data-testid="iat-appointment-type" className="mt-1 w-full px-3 py-2 text-sm border rounded bg-white">
                            <option value="not_yet_scheduled">Not Yet Scheduled</option>
                            <option value="in_person">In Person (Home Visit)</option>
                            <option value="telehealth">Telehealth</option>
                            <option value="clinic_or_office">Clinic / Office</option>
                        </select>
                    </label>
                </div>
                <button onClick={start} disabled={busy || !participantId} data-testid="iat-start-btn" className="inline-flex items-center gap-2 bg-[#A5512B] text-white rounded-full px-6 py-3 text-sm disabled:opacity-50 hover:opacity-90 font-medium">
                    <ClipboardList className="w-4 h-4" /> Start the Prep Workflow <ArrowRight className="w-4 h-4" />
                </button>
                {!participantId && <p className="text-xs text-[#A5512B]">Select a participant in the header to begin.</p>}
            </div>
        );
    }

    const meta = STEP_META[step];
    return (
        <div id="iat-wizard" className="rounded-2xl border border-primary-k/10 bg-white overflow-hidden scroll-mt-20" data-testid="csc2-iat-wizard">
            {/* Coloured wizard header */}
            <div className="p-5 sm:p-6 border-b border-kindred" style={{ backgroundColor: meta.tone.bg }}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: meta.tone.chip }}><meta.Icon className="h-4 w-4 text-white" /></span>
                        <div>
                            <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: meta.tone.chip }}>IAT Prep · Step {step + 1} of 6</p>
                            <h2 className="font-heading text-xl text-primary-k">{meta.title}</h2>
                        </div>
                    </div>
                    <span className="text-xs text-muted-k">Status: {prep.current_status?.replace(/_/g, " ")}</span>
                </div>
                <Stepper step={step} setStep={setStep} completed={completed} />
            </div>

            <div className="p-5 sm:p-6 space-y-4">
            {step === 0 && (
                <div className="space-y-2" data-testid="iat-step-content-0">
                    <p className="text-xs text-muted-k">Tick each document once you have it ready.</p>
                    {(prep.documents_to_bring_checklist || []).map((d, i) => (
                        <button key={i} onClick={() => toggleDoc(i)} data-testid={`iat-doc-${i}`} className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg border border-kindred hover:bg-surface-2">
                            {d.user_confirmed_ready ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-primary-k/40" />}
                            <span className={`text-sm ${d.user_confirmed_ready ? "line-through text-muted-k" : "text-primary-k"}`}>{d.document_name}</span>
                        </button>
                    ))}
                </div>
            )}
            {step === 1 && (
                <div className="space-y-2" data-testid="iat-step-content-1">
                    <p className="text-xs text-muted-k">Tick each question you want to ask.</p>
                    {(prep.questions_to_ask_at_assessment || []).map((q, i) => (
                        <button key={i} onClick={() => toggleQuestion(i)} data-testid={`iat-q-${i}`} className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg border border-kindred hover:bg-surface-2">
                            {q.user_confirmed_ready_to_ask ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <HelpCircle className="w-4 h-4 text-primary-k/40" />}
                            <span className="text-sm text-primary-k">{q.question}</span>
                        </button>
                    ))}
                </div>
            )}
            {step === 2 && (
                <div className="space-y-3" data-testid="iat-step-content-2">
                    <p className="text-xs text-muted-k">Notes about evidence you&apos;ve prepared (e.g. hospital summary, OT reports).</p>
                    <div className="flex gap-2">
                        <input value={evidenceInput} onChange={e => setEvidenceInput(e.target.value)} data-testid="iat-evidence-input" placeholder="Evidence note" className="flex-1 px-3 py-2 text-sm border rounded" />
                        <button onClick={addEvidence} data-testid="iat-evidence-add" className="inline-flex items-center gap-1 bg-primary-k text-white rounded-full px-4 text-sm"><Plus className="w-4 h-4" /> Add</button>
                    </div>
                    <ul className="space-y-1">
                        {(prep.evidence_prepared || []).map((e, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm bg-surface-2 rounded-lg px-3 py-2">
                                <FileText className="w-4 h-4 text-primary-k/50" />
                                <span className="flex-1">{e.note}</span>
                                <button onClick={() => removeEvidence(i)} data-testid={`iat-evidence-remove-${i}`}><Trash2 className="w-4 h-4 text-red-500" /></button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {step === 3 && (
                <div className="space-y-3" data-testid="iat-step-content-3">
                    <label className="block text-xs text-muted-k font-medium">Who will support the participant on the day? Any communication needs?</label>
                    <textarea value={advocacy} onChange={e => setAdvocacy(e.target.value)} rows={4} data-testid="iat-advocacy" className="w-full px-3 py-2 text-sm border rounded" />
                    <label className="block text-xs text-muted-k font-medium">Additional notes to keep handy</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} data-testid="iat-notes" className="w-full px-3 py-2 text-sm border rounded" />
                    <button onClick={() => patch({ advocacy_notes: advocacy, iat_notes: notes })} disabled={busy} data-testid="iat-save-advocacy" className="inline-flex items-center gap-1 bg-primary-k text-white rounded-full px-4 py-2 text-sm">Save Notes</button>
                </div>
            )}
            {step === 4 && (
                <div className="space-y-2 text-sm text-primary-k" data-testid="iat-step-content-4">
                    <p>Confirm the appointment details with your assessor and log them here.</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-kindred p-3 bg-surface-2"><p className="text-xs text-muted-k">Scheduled For</p><p>{prep.iat_scheduled_date || "Not yet booked"}</p></div>
                        <div className="rounded-lg border border-kindred p-3 bg-surface-2"><p className="text-xs text-muted-k">Type</p><p>{prep.iat_appointment_type?.replace(/_/g, " ")}</p></div>
                    </div>
                </div>
            )}
            {step === 5 && (
                <div className="space-y-3" data-testid="iat-step-content-5">
                    <label className="text-sm block">
                        <span className="text-xs text-muted-k font-medium">Classification Received (1 to 8)</span>
                        <input type="number" min={1} max={8} value={classification} data-testid="iat-classification" onChange={e => setClassification(e.target.value)} className="mt-1 block w-24 px-2 py-1 text-sm border rounded" />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={matches} onChange={e => setMatches(e.target.checked)} data-testid="iat-matches-expected" />
                        <span>Matches what we expected</span>
                    </label>
                    <button onClick={recordResult} disabled={busy} data-testid="iat-record-result" className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm">Record Result</button>
                    {prep.classification_received && (
                        <div className={`text-sm rounded-lg p-3 ${prep.classification_matches_expected_from_csc ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                            Recorded classification {prep.classification_received}{!prep.classification_matches_expected_from_csc && ", consider a reconsideration."}
                        </div>
                    )}
                </div>
            )}

            {/* Back / Next workflow nav */}
            <div className="flex items-center justify-between pt-4 border-t border-kindred">
                <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} data-testid="iat-prev-btn" className="text-sm inline-flex items-center gap-1 text-muted-k disabled:opacity-30 hover:text-primary-k">
                    <ChevronLeft className="w-4 h-4" /> Back
                </button>
                {step < STEP_META.length - 1 ? (
                    <button onClick={() => setStep(s => Math.min(STEP_META.length - 1, s + 1))} data-testid="iat-next-btn" className="text-sm inline-flex items-center gap-1 px-5 py-2.5 rounded-full bg-primary-k text-white hover:bg-[#0A3E42]">
                        Next <ChevronRight className="w-4 h-4" />
                    </button>
                ) : (
                    <span className="text-xs text-muted-k">Last step</span>
                )}
            </div>
            </div>
        </div>
    );
}

export default function CscStreamMixIat() {
    const pid = useParticipantId();
    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6" data-testid="csc2-root">
            <Link to="/app" className="inline-flex items-center gap-1 text-sm text-muted-k hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back
            </Link>
            <PageIntro
                eyebrow="Classification Self-Check"
                title="Prepare for Your SAH Assessment"
                description="Walk into your Initial Assessment Tool (IAT) knowing which Support at Home streams may fit, what documents to bring, and what to ask. No paperwork gets submitted here, this is your private prep space."
                whatItDoes="Suggests which SAH streams to discuss with your assessor, then walks you through a guided six-step workflow to prepare your questions, evidence and advocacy notes before the appointment."
                howToUse={[
                    "Tick the fit signals that apply to see which streams may suit.",
                    "Start the guided IAT prep workflow below.",
                    "Move through each step with Back and Next at your own pace.",
                    "After the assessment, record the classification received.",
                ]}
                whatYouGet={[
                    "A ranked list of streams likely to be a fit (with rationale).",
                    "A confidence-building checklist you can bring to the appointment.",
                    "An early warning if the classification you receive is unexpected.",
                ]}
            />
            <StreamMixForm key={`sm-${pid || "none"}`} participantId={pid} />
            <IatPrepWizard key={`iat-${pid || "none"}`} participantId={pid} />
        </div>
    );
}
