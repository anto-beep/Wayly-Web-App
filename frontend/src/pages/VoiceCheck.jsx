/**
 * CPR-2 v1 · Participant Voice Check UI (Section H).
 *
 * Route: /app/participants/:id/voice-check
 *
 * Purpose: capture whether each goal in the support plan genuinely came
 * from the participant, or whether it was provider-authored. Loads active
 * goals from the goal ledger; if none exist, users can enter freeform.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { ChevronLeft, Info, Plus, Trash2, CheckCircle2, Phone } from "lucide-react";

const ANSWERS = [
    { key: "yes_i_wanted_this", label_caregiver: "Yes, they wanted this", label_participant_self: "Yes, I wanted this" },
    { key: "yes_but_not_exactly", label_caregiver: "Yes, but not exactly like this", label_participant_self: "Yes, but not exactly like this" },
    { key: "no_this_was_the_providers_idea", label_caregiver: "No, this was the provider's idea", label_participant_self: "No, this was the provider's idea" },
    { key: "i_dont_remember_discussing_this", label_caregiver: "I don't remember discussing this", label_participant_self: "I don't remember discussing this" },
    { key: "skipped", label_caregiver: "Skip this goal", label_participant_self: "Skip this goal" },
];

const FINDING_LABEL = {
    participant_led: "Participant-led",
    provider_led: "Provider-led",
    mixed_collaborative: "Mixed / collaborative",
    participant_absent: "Participant absent",
};

const FINDING_TINT = {
    participant_led: "bg-emerald-50 text-emerald-800 border-emerald-100",
    provider_led: "bg-red-50 text-red-800 border-red-100",
    mixed_collaborative: "bg-amber-50 text-amber-800 border-amber-100",
    participant_absent: "bg-primary-k/[0.05] text-primary-k/70 border-primary-k/10",
};

export default function VoiceCheck() {
    const { id: participantId } = useParams();
    const navigate = useNavigate();
    const [goals, setGoals] = useState([]);
    const [rows, setRows] = useState([]);
    const [authoredOnBehalf, setAuthoredOnBehalf] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await api.get(`/cpr2/participants/${participantId}/goals?status=active_ongoing&limit=100`);
            const activeGoals = r.data?.goals || [];
            setGoals(activeGoals);
            setRows(activeGoals.length > 0
                ? activeGoals.map(g => ({
                    goal_id: g.id, goal_text_shown: g.goal_text,
                    participant_answer: "", participant_notes: "",
                }))
                : [{ goal_id: crypto.randomUUID(), goal_text_shown: "", participant_answer: "", participant_notes: "" }]
            );
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to load goals");
        } finally { setLoading(false); }
    }, [participantId]);

    useEffect(() => { load(); }, [load]);

    function updateRow(idx, patch) {
        setRows((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
    }

    function addFreeformGoal() {
        setRows((prev) => [...prev, {
            goal_id: crypto.randomUUID(), goal_text_shown: "",
            participant_answer: "", participant_notes: "",
        }]);
    }

    function removeRow(idx) {
        setRows((prev) => prev.filter((_, i) => i !== idx));
    }

    const answered = rows.filter(r => r.participant_answer && r.goal_text_shown.trim()).length;
    const totalReady = rows.filter(r => r.goal_text_shown.trim()).length;
    const canSubmit = totalReady > 0 && answered === totalReady && !submitting;

    async function submit() {
        setSubmitting(true); setError(null);
        try {
            const goal_reviews = rows
                .filter(r => r.goal_text_shown.trim() && r.participant_answer)
                .map(r => ({
                    goal_id: r.goal_id,
                    goal_text_shown: r.goal_text_shown,
                    participant_answer: r.participant_answer,
                    participant_notes: r.participant_notes || null,
                }));
            const r = await api.post(`/cpr2/participants/${participantId}/voice-checks`, {
                authored_on_behalf: authoredOnBehalf,
                goal_reviews,
            });
            setResult(r.data);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to save voice check");
        } finally { setSubmitting(false); }
    }

    async function markFollowUp(action) {
        try {
            const r = await api.post(`/cpr2/voice-checks/${result.id}/mark-follow-up`, { action });
            setResult((prev) => ({ ...prev, ...r.data }));
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to mark action");
        }
    }

    if (loading) return (
        <div className="max-w-3xl mx-auto p-6 space-y-4">
            <Skeleton className="h-24" /><Skeleton className="h-40" />
        </div>
    );

    // ── RESULT STATE ──
    if (result) {
        return (
            <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="voice-check-result">
                <Link
                    to={`/app/participants/${participantId}`}
                    className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k"
                    data-testid="voice-check-back-to-profile"
                ><ChevronLeft className="w-4 h-4" /> Back to profile</Link>

                <header>
                    <p className="text-xs uppercase tracking-wide text-primary-k/50">Voice check complete</p>
                    <h1 className="text-2xl font-heading text-primary-k mt-1">Here&apos;s what we heard</h1>
                </header>

                <section className={`rounded-2xl border p-6 ${FINDING_TINT[result.overall_finding]}`}>
                    <p className="text-xs uppercase tracking-wide opacity-70">Overall finding</p>
                    <p className="text-2xl font-heading mt-1" data-testid="voice-check-overall-finding">{FINDING_LABEL[result.overall_finding]}</p>
                    <p className="text-sm mt-3">{result.follow_up_suggestions?.headline_tokens?.caregiver}</p>
                </section>

                {result.contains_sensitive_content_flag && (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" data-testid="voice-check-sensitive-banner">
                        <p className="text-xs uppercase tracking-wide text-amber-800/70">Something in these notes needs care</p>
                        <p className="text-sm text-amber-900 mt-1">
                            We noticed language that suggests a difficult or worrying situation. If the participant is feeling unsafe, please consider these confidential supports:
                        </p>
                        <ul className="text-xs text-amber-900 mt-2 space-y-1">
                            <li className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> Elder Abuse Helpline: 1800 353 374</li>
                            <li className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> Lifeline: 13 11 14</li>
                        </ul>
                    </section>
                )}

                {result.follow_up_suggestions?.suggested_actions?.length > 0 && (
                    <section className="rounded-2xl border border-primary-k/10 bg-white p-6" data-testid="voice-check-actions">
                        <p className="text-xs uppercase tracking-wide text-primary-k/50">Suggested next steps</p>
                        <ul className="mt-3 space-y-2">
                            {result.follow_up_suggestions.suggested_actions.map((a) => (
                                <li key={a.key}>
                                    {a.lf1_archetype ? (
                                        <Link
                                            to={(() => {
                                                const q = new URLSearchParams({
                                                    prefill: "voice_check",
                                                    archetype: a.lf1_archetype,
                                                    situation: a.label,
                                                    voice_check_id: result.id,
                                                });
                                                if (a.lf1_situation_id) q.set("situation_id", String(a.lf1_situation_id));
                                                return `/ai-tools/letters-and-follow-ups?${q.toString()}`;
                                            })()}
                                            data-testid={`voice-check-action-${a.key}`}
                                            className="block rounded-lg border border-primary-k/15 hover:bg-primary-k/[0.03] p-3 text-sm text-primary-k"
                                        >{a.label} →</Link>
                                    ) : (
                                        <button
                                            onClick={() => markFollowUp(a.key === "create_voice_note" ? "voice_note_created" : "plan_re_review_requested")}
                                            data-testid={`voice-check-action-${a.key}`}
                                            className="block w-full text-left rounded-lg border border-primary-k/15 hover:bg-primary-k/[0.03] p-3 text-sm text-primary-k"
                                        >{a.label}</button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={() => { setResult(null); load(); }}
                        className="flex-1 py-2 rounded-full border border-primary-k/20 text-primary-k text-sm"
                        data-testid="voice-check-do-another"
                    >Run another voice check</button>
                    <button
                        onClick={() => navigate(`/app/participants/${participantId}`)}
                        className="flex-1 py-2 rounded-full bg-primary-k text-white text-sm"
                        data-testid="voice-check-done"
                    >Done</button>
                </div>
            </div>
        );
    }

    // ── FORM STATE ──
    return (
        <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="voice-check-form">
            <Link
                to={`/app/participants/${participantId}`}
                className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k"
            ><ChevronLeft className="w-4 h-4" /> Back to profile</Link>

            <header>
                <p className="text-xs uppercase tracking-wide text-primary-k/50">Support plan · Voice check</p>
                <h1 className="text-2xl font-heading text-primary-k mt-1">Did these goals come from the participant?</h1>
                <p className="text-sm text-primary-k/60 mt-1">
                    For each goal, choose the answer that best describes where it came from. Skip any that don&apos;t apply. It takes about a minute per goal.
                </p>
            </header>

            {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" data-testid="voice-check-error">{String(error)}</p>
            )}

            <label className="flex items-start gap-2 text-sm rounded-2xl border border-primary-k/10 bg-white p-4">
                <input
                    type="checkbox"
                    checked={authoredOnBehalf}
                    onChange={(e) => setAuthoredOnBehalf(e.target.checked)}
                    className="mt-1"
                    data-testid="voice-check-authored-on-behalf"
                />
                <span className="text-primary-k/80">
                    I&apos;m answering these on behalf of the participant (e.g. because they can&apos;t answer themselves right now). This is honest and legitimate, we&apos;ll just record it so the review isn&apos;t misread as being from them directly.
                </span>
            </label>

            {goals.length === 0 && (
                <div className="rounded-2xl border border-dashed border-primary-k/20 p-6 text-center" data-testid="voice-check-no-goals-hint">
                    <Info className="w-6 h-6 text-primary-k/40 mx-auto" />
                    <p className="text-sm text-primary-k/70 mt-2">
                        No goals saved yet in the goal ledger. You can enter each goal freeform below, or add them via the Support Plan Reviewer first.
                    </p>
                </div>
            )}

            <ul className="space-y-4">
                {rows.map((row, idx) => (
                    <li key={row.goal_id} className="rounded-2xl border border-primary-k/10 bg-white p-5" data-testid={`voice-check-row-${idx}`}>
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-xs uppercase tracking-wide text-primary-k/50">Goal {idx + 1}</p>
                            {rows.length > 1 && (
                                <button
                                    onClick={() => removeRow(idx)}
                                    className="text-primary-k/40 hover:text-red-600"
                                    aria-label="Remove"
                                    data-testid={`voice-check-remove-${idx}`}
                                ><Trash2 className="w-4 h-4" /></button>
                            )}
                        </div>
                        {goals.find(g => g.id === row.goal_id) ? (
                            <p className="text-sm text-primary-k mt-1" data-testid={`voice-check-goal-text-${idx}`}>{row.goal_text_shown}</p>
                        ) : (
                            <textarea
                                value={row.goal_text_shown}
                                onChange={(e) => updateRow(idx, { goal_text_shown: e.target.value })}
                                placeholder="Enter the goal as it appears in the support plan…"
                                className="w-full mt-1 border border-primary-k/20 rounded-lg p-2 text-sm"
                                rows={2}
                                data-testid={`voice-check-goal-input-${idx}`}
                            />
                        )}
                        <div className="mt-3 space-y-1.5">
                            {ANSWERS.map((a) => (
                                <label
                                    key={a.key}
                                    className={`flex items-center gap-2 text-sm p-2 rounded-lg cursor-pointer ${row.participant_answer === a.key ? "bg-primary-k/[0.05] border border-primary-k/20" : "hover:bg-primary-k/[0.02]"}`}
                                >
                                    <input
                                        type="radio"
                                        name={`ans-${idx}`}
                                        value={a.key}
                                        checked={row.participant_answer === a.key}
                                        onChange={() => updateRow(idx, { participant_answer: a.key })}
                                        data-testid={`voice-check-answer-${idx}-${a.key}`}
                                    />
                                    <span className="text-primary-k">{a.label_caregiver}</span>
                                </label>
                            ))}
                        </div>
                        <input
                            type="text"
                            value={row.participant_notes}
                            onChange={(e) => updateRow(idx, { participant_notes: e.target.value })}
                            placeholder="Optional note (context, quote from participant, or concern)"
                            className="w-full mt-3 border border-primary-k/20 rounded-lg p-2 text-xs"
                            data-testid={`voice-check-note-${idx}`}
                        />
                    </li>
                ))}
            </ul>

            <button
                onClick={addFreeformGoal}
                className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary-k/20 text-primary-k"
                data-testid="voice-check-add-goal"
            ><Plus className="w-3 h-3" /> Add another goal</button>

            <div className="rounded-2xl border border-primary-k/10 bg-primary-k/[0.02] p-4 flex items-center justify-between gap-3">
                <p className="text-xs text-primary-k/60">
                    {answered} of {totalReady} answered
                </p>
                <button
                    onClick={submit}
                    disabled={!canSubmit}
                    data-testid="voice-check-submit"
                    className="text-sm inline-flex items-center gap-1 px-5 py-2 rounded-full bg-primary-k text-white disabled:opacity-40"
                >{submitting ? "Saving…" : (
                    <><CheckCircle2 className="w-4 h-4" /> Save voice check</>
                )}</button>
            </div>
        </div>
    );
}
