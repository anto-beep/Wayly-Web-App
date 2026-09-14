/**
 * CE-3 v2 · Hardship pathway walkthrough (Section J).
 *
 * Route: /app/tools/contribution-estimator/hardship-walkthrough
 *
 * Not an application, an informational walkthrough that hands off to LF-1
 * letter drafts (provider + My Aged Care) at the end.
 */
import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { ChevronLeft, CheckCircle2, ExternalLink, Phone, Save } from "lucide-react";
import PageIntro from "@/components/PageIntro";
import LF2ChainGenerator from "@/components/LF2ChainGenerator";

export default function HardshipWalkthrough() {
    const [params] = useSearchParams();
    const triggerId = params.get("trigger");
    const [content, setContent] = useState(null);
    const [step, setStep] = useState(0);
    const [error, setError] = useState(null);
    const [checkedItems, setCheckedItems] = useState({});
    const [trigger, setTrigger] = useState(null);
    const [notes, setNotes] = useState("");
    const [notesSaving, setNotesSaving] = useState(false);
    const [notesSaved, setNotesSaved] = useState(false);

    useEffect(() => {
        api.get("/ce3/hardship/walkthrough")
            .then(r => setContent(r.data))
            .catch(e => setError(e?.response?.data?.detail || "Failed to load"));
    }, []);

    // Companion notes editor is shown when a specific trigger is passed
    // via ?trigger={id}. Load the trigger + prefill existing notes.
    useEffect(() => {
        if (!triggerId) return;
        (async () => {
            try {
                const r = await api.get(`/ce3/hardship/triggers/${triggerId}`);
                setTrigger(r.data);
                setNotes(r.data?.notes || "");
            } catch (_e) { /* silent, trigger param optional */ }
        })();
    }, [triggerId]);

    async function saveNotes() {
        if (!triggerId || !notes.trim()) return;
        setNotesSaving(true); setNotesSaved(false);
        try {
            const r = await api.patch(`/ce3/hardship/triggers/${triggerId}/notes`, { notes });
            setTrigger(r.data);
            setNotesSaved(true);
            setTimeout(() => setNotesSaved(false), 2500);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to save notes");
        } finally { setNotesSaving(false); }
    }

    useEffect(() => {
        api.get("/ce3/hardship/walkthrough")
            .then(r => setContent(r.data))
            .catch(e => setError(e?.response?.data?.detail || "Failed to load"));
    }, []);

    if (error) return (
        <div className="max-w-3xl mx-auto p-8 text-center text-sm text-red-600" data-testid="hardship-error">{String(error)}</div>
    );
    if (!content) return (
        <div className="max-w-3xl mx-auto p-6 space-y-4">
            <Skeleton className="h-24" /><Skeleton className="h-48" />
        </div>
    );

    const currentStep = content.steps[step];
    const isLast = step === content.steps.length - 1;

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="hardship-walkthrough-page">
            <Link
                to="/ai-tools/contribution-estimator"
                className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k"
                data-testid="hardship-back"
            ><ChevronLeft className="w-4 h-4" /> Back to Contribution Estimator</Link>

            <PageIntro
                eyebrow="Financial Hardship Pathway"
                title="Understanding Your Options"
                description="If Support at Home contributions are causing genuine hardship, the Aged Care Act 2024 has a supplement pathway. This walkthrough explains how it works, you do the applying yourself."
                whatItDoes="Explains eligibility, what evidence to gather, how to apply, and what happens if the answer is no. Ends with pre-filled letter drafts for the provider and My Aged Care."
                howToUse={[
                    "Read each step in order, it takes about 5 minutes.",
                    "Note the evidence and forms you need to gather.",
                    "At the end, generate letter drafts for the provider and My Aged Care.",
                    "Follow up using the Letters & Follow-ups tool.",
                ]}
                whatYouGet={[
                    "A clear understanding of whether hardship supplement is relevant.",
                    "A checklist of evidence to prepare.",
                    "Ready-to-send letter drafts for the two parties involved.",
                ]}
            />

            {/* Stepper */}
            <div className="flex items-center gap-1 flex-wrap" data-testid="hardship-stepper">
                {content.steps.map((s, i) => (
                    <button
                        key={s.id}
                        onClick={() => setStep(i)}
                        data-testid={`hardship-step-${s.id}`}
                        className={`text-[11px] px-3 py-1 rounded-full border ${i === step ? "bg-primary-k text-white border-primary-k" : "border-primary-k/20 text-primary-k/70 hover:bg-primary-k/[0.03]"}`}
                    >
                        {i + 1}. {s.title}
                    </button>
                ))}
            </div>

            {/* Step content */}
            <section className="rounded-2xl border border-primary-k/10 bg-white p-6 space-y-4" data-testid={`hardship-content-${currentStep.id}`}>
                <h2 className="text-lg font-heading text-primary-k">{currentStep.title}</h2>
                {currentStep.body_tokens?.caregiver && (
                    <p className="text-sm text-primary-k/80 leading-relaxed">{currentStep.body_tokens.caregiver}</p>
                )}
                {currentStep.self_check_items && (
                    <ul className="space-y-2 text-sm text-primary-k/70">
                        {currentStep.self_check_items.map((it, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="text-primary-k mt-0.5">·</span>
                                <span>{it}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {currentStep.checklist && (
                    <ul className="space-y-2" data-testid="hardship-checklist">
                        {currentStep.checklist.map((it, i) => (
                            <li key={i}>
                                <label className="flex items-start gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!checkedItems[i]}
                                        onChange={(e) => setCheckedItems({...checkedItems, [i]: e.target.checked})}
                                        className="mt-1"
                                        data-testid={`hardship-checklist-${i}`}
                                    />
                                    <span className={checkedItems[i] ? "text-primary-k/40 line-through" : "text-primary-k/80"}>{it}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                )}
                {currentStep.channels && (
                    <div className="space-y-3">
                        {currentStep.channels.map((c) => (
                            <div key={c.key} className="rounded-lg border border-primary-k/10 bg-primary-k/[0.02] p-3">
                                <p className="text-sm font-medium text-primary-k">{c.label}</p>
                                {c.note && <p className="text-xs text-primary-k/60 mt-1">{c.note}</p>}
                                <div className="flex items-center gap-3 mt-2 text-xs">
                                    {c.phone && (
                                        <span className="inline-flex items-center gap-1 text-primary-k/80"><Phone className="w-3 h-3" /> {c.phone}</span>
                                    )}
                                    {c.url && (
                                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-k underline">
                                            <ExternalLink className="w-3 h-3" /> {c.url.replace(/^https?:\/\//, "")}
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {currentStep.authoritative === false && (
                    <p className="text-[11px] italic text-primary-k/50">This overview is not authoritative, refer to My Aged Care for your specific eligibility.</p>
                )}
            </section>

            {/* Nav */}
            <div className="flex items-center justify-between gap-2">
                <button
                    onClick={() => setStep(Math.max(0, step - 1))}
                    disabled={step === 0}
                    className="text-xs px-4 py-2 rounded-full border border-primary-k/20 text-primary-k disabled:opacity-30"
                    data-testid="hardship-prev-btn"
                >Previous</button>
                {!isLast ? (
                    <button
                        onClick={() => setStep(step + 1)}
                        className="text-xs px-4 py-2 rounded-full bg-primary-k text-white"
                        data-testid="hardship-next-btn"
                    >Next</button>
                ) : (
                    <span className="text-xs text-primary-k/50 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Reached the end
                    </span>
                )}
            </div>

            {/* Hand-offs */}
            {isLast && (
                <section className="rounded-2xl border border-primary-k/10 bg-white p-6 space-y-3" data-testid="hardship-handoffs">
                    <h2 className="text-lg font-heading text-primary-k">Next Steps</h2>
                    <p className="text-sm text-primary-k/70">Draft the letters that get this conversation started.</p>

                    {triggerId && (
                        <div className="rounded-lg border border-primary-k/10 bg-primary-k/[0.02] p-3 space-y-2" data-testid="hardship-companion-notes-editor">
                            <label className="text-xs uppercase tracking-wide text-primary-k/50">Companion Notes (Used To Prefill The Letter)</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="A couple of lines of context that should appear in the letter, e.g. 'Rent went up 12% in July; partner's medical costs doubled after the fall in August.'"
                                data-testid="hardship-companion-notes-input"
                                className="w-full border border-primary-k/20 rounded-lg p-2 text-sm"
                                rows={3}
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={saveNotes}
                                    disabled={notesSaving || !notes.trim()}
                                    data-testid="hardship-companion-notes-save"
                                    className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-k text-white disabled:opacity-40"
                                ><Save className="w-3 h-3" /> {notesSaving ? "Saving," : "Save Notes"}</button>
                                {notesSaved && (
                                    <span className="text-xs text-emerald-700 inline-flex items-center gap-1" data-testid="hardship-companion-notes-saved">
                                        <CheckCircle2 className="w-3 h-3" /> Saved
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    <LF2ChainGenerator
                        chainKey="hardship_full"
                        participantIdParam={params.get("participant_id")}
                        contextExtras={{ hardship_notes: notes.trim() }}
                        sourceTool="hardship"
                        successLabel="Both letters have been drafted. Head to Letters & Follow-ups to review and send."
                    />

                    <div className="space-y-2 pt-2">
                        <p className="text-xs uppercase tracking-wide text-primary-k/50">Or Use The Legacy Single-Letter Draft</p>
                        {content.hand_offs.map((h) => {
                            const q = new URLSearchParams({
                                prefill: "hardship",
                                archetype: h.lf1_archetype,
                                situation: h.situation_label,
                            });
                            if (h.lf1_situation_id) q.set("situation_id", String(h.lf1_situation_id));
                            if (triggerId) q.set("hardship_trigger_id", triggerId);
                            if (notes.trim()) q.set("companion_notes", notes.trim().slice(0, 500));
                            return (
                                <Link
                                    key={h.key}
                                    to={`/ai-tools/letters-and-follow-ups?${q.toString()}`}
                                    data-testid={`hardship-handoff-${h.key}`}
                                    className="block rounded-lg border border-primary-k/15 hover:bg-primary-k/[0.02] p-3 text-sm text-primary-k"
                                >{h.label} →</Link>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Disclosures */}
            <div className="text-[11px] text-primary-k/40 space-y-1 pt-2">
                {content.disclosures.map((d, i) => <p key={i}>· {d}</p>)}
            </div>
        </div>
    );
}
