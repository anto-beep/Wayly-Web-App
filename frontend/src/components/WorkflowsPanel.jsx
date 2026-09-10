import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
    LifeBuoy, CheckCircle2, ArrowRight, Loader2, Phone, ChevronRight, ShieldAlert,
    Shuffle, X, AlertTriangle,
} from "lucide-react";

/**
 * Guided caregiver workflows, Phase 6.
 *
 * Renders three calm wizards (reassessment / hospitalisation / death) that
 * walk a caregiver through the steps to capture on the participant timeline.
 * Each step posts to /api/scenario/participants/{id}/events behind the scenes
 * so every wizard step produces a real, audited event.
 */
const WORKFLOW_TONE = {
    reassessment: "bg-wayly-teal-50 border-wayly-teal-200 text-wayly-teal-700",
    hospitalisation: "bg-wayly-clay-50 border-wayly-clay-200 text-wayly-clay-700",
    death: "bg-wayly-neutral-100 border-wayly-neutral-200 text-primary-k",
};

export default function WorkflowsPanel({ participant }) {
    const [catalogue, setCatalogue] = useState([]);
    const [active, setActive] = useState(null);  // workflow key
    const [details, setDetails] = useState(null);
    const [stepIdx, setStepIdx] = useState(0);
    const [payload, setPayload] = useState({});
    const [saving, setSaving] = useState(false);
    const [completedSteps, setCompletedSteps] = useState({});
    const [drafts, setDrafts] = useState({});

    // Local-only draft persistence keyed by (participant, workflow).
    // UI-1 §7, "Your progress will be saved as a draft on this device."
    const draftStorageKey = participant?.id ? `wayly:workflow-drafts:${participant.id}` : null;

    useEffect(() => {
        if (!draftStorageKey) return;
        try {
            const raw = localStorage.getItem(draftStorageKey);
            setDrafts(raw ? JSON.parse(raw) : {});
        } catch (_e) {
            setDrafts({});
        }
    }, [draftStorageKey]);

    const writeDrafts = (next) => {
        setDrafts(next);
        if (!draftStorageKey) return;
        try { localStorage.setItem(draftStorageKey, JSON.stringify(next)); } catch (_e) { /* noop */ }
    };

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get("/scenario/workflows");
                setCatalogue(r.data?.workflows || []);
            } catch (_e) {
                setCatalogue([]);
            }
        })();
    }, []);

    const start = async (key) => {
        setActive(key);
        const saved = drafts?.[key] || null;
        setStepIdx(saved?.stepIdx || 0);
        setPayload(saved?.payload || {});
        setCompletedSteps(saved?.completedSteps || {});
        setDetails(null);
        try {
            const r = await api.get(`/scenario/workflows/${key}`);
            setDetails(r.data);
        } catch (e) {
            toast.error("Could not load workflow");
            setActive(null);
        }
    };

    const saveCurrentDraft = () => {
        if (!active) return;
        const hasProgress = Object.keys(payload || {}).length > 0
            || Object.keys(completedSteps || {}).length > 0
            || stepIdx > 0;
        if (!hasProgress) return;
        const next = { ...drafts, [active]: { stepIdx, payload, completedSteps, savedAt: Date.now() } };
        writeDrafts(next);
    };

    const discardCurrentDraft = () => {
        if (!active) return;
        const next = { ...drafts };
        delete next[active];
        writeDrafts(next);
    };

    const [cancelConfirm, setCancelConfirm] = useState(false);
    const [switcherOpen, setSwitcherOpen] = useState(false);

    const close = () => {
        // UI-1 §7, confirm before throwing away an in-progress workflow.
        const hasProgress = Object.keys(payload || {}).length > 0
            || Object.keys(completedSteps || {}).length > 0
            || stepIdx > 0;
        if (hasProgress) { setCancelConfirm(true); return; }
        doClose();
    };
    const doClose = () => {
        setActive(null);
        setDetails(null);
        setStepIdx(0);
        setPayload({});
        setCompletedSteps({});
        setCancelConfirm(false);
    };

    const submitStep = async (step) => {
        if (!participant?.id) {
            toast.error("Choose a participant first.");
            return;
        }
        if (!step.event_type) {
            // Acknowledgement-only step, just advance.
            setCompletedSteps((s) => ({ ...s, [step.key]: { acknowledged: true } }));
            if (stepIdx < details.steps.length - 1) setStepIdx(stepIdx + 1);
            return;
        }
        setSaving(true);
        try {
            const today = new Date().toISOString().slice(0, 10);
            const r = await api.post(`/scenario/participants/${participant.id}/events`, {
                event_type: step.event_type,
                effective_date: today,
                trigger_source: "caregiver",
                note: `Workflow: ${details.label} · ${step.title}`,
                payload: payload[step.key] || null,
                source: { kind: "workflow", workflow_key: details.key, step_key: step.key },
            });
            const ev = r.data?.event;
            setCompletedSteps((s) => {
                const updated = { ...s, [step.key]: ev };
                // Auto-persist draft so progress survives a close.
                if (active && draftStorageKey) {
                    const nextDrafts = { ...drafts, [active]: { stepIdx: Math.min(stepIdx + 1, (details?.steps?.length || 1) - 1), payload, completedSteps: updated, savedAt: Date.now() } };
                    try { localStorage.setItem(draftStorageKey, JSON.stringify(nextDrafts)); setDrafts(nextDrafts); } catch (_e) { /* noop */ }
                }
                return updated;
            });
            if (ev?.proposed?.transition_status === "applied") {
                toast.success(`Status moved to ${ev.proposed.lifecycle_transition}`);
            } else if (ev?.proposed?.transition_status === "blocked") {
                toast.warning("Status change was blocked, see the timeline");
            } else {
                toast.success("Captured");
            }
            if (stepIdx < details.steps.length - 1) setStepIdx(stepIdx + 1);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not capture step");
        } finally {
            setSaving(false);
        }
    };

    if (!active) {
        return (
            <div className="space-y-3" data-testid="workflows-panel">
                <header className="flex items-center gap-2">
                    <LifeBuoy className="h-4 w-4 text-primary-k" />
                    <h2 className="font-heading text-lg text-primary-k">Guided Workflows</h2>
                </header>
                <p className="text-[15px] text-muted-k">
                    Step-by-step prompts for the moments that matter. Each step captures the right event on the timeline.
                </p>
                {catalogue.length === 0 ? (
                    <div className="text-xs text-muted-k">No workflows available.</div>
                ) : (
                    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="workflows-list">
                        {catalogue.map((w) => {
                            const draft = drafts?.[w.key];
                            return (
                            <li key={w.key}>
                                <button
                                    type="button"
                                    onClick={() => start(w.key)}
                                    data-testid={`workflow-start-${w.key}`}
                                    className="group h-full w-full text-left rounded-2xl border border-kindred bg-surface p-6 hover:border-primary-k hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-k"
                                >
                                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-k/10 text-primary-k mb-3">
                                        <LifeBuoy className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <div className="font-heading text-[20px] text-primary-k leading-snug">{w.label}</div>
                                    <p className="mt-2 text-[15px] text-muted-k leading-relaxed line-clamp-3">{w.intro}</p>
                                    {draft && (
                                        <div
                                            className="mt-3 inline-flex items-center gap-1 rounded-full bg-wayly-clay-50 border border-wayly-clay-200 text-wayly-clay-700 text-[12px] font-medium px-2.5 py-1"
                                            data-testid={`workflow-resume-${w.key}`}
                                        >
                                            Resume Draft (Step {(draft.stepIdx ?? 0) + 1})
                                        </div>
                                    )}
                                    <div className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary-k">
                                        {draft ? "Resume" : "Start"} <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                                    </div>
                                </button>
                            </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        );
    }

    if (!details) {
        return (
            <div className="bg-surface border border-kindred rounded-2xl p-5 text-sm text-muted-k flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workflow…
            </div>
        );
    }

    const step = details.steps[stepIdx];
    const isLast = stepIdx === details.steps.length - 1;
    const allDone = isLast && completedSteps[step.key];

    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5 space-y-4" data-testid={`workflow-active-${details.key}`}>
            <header className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-xs uppercase tracking-wider text-muted-k">Workflow</div>
                    <h2 className="font-heading text-lg text-primary-k">{details.label}</h2>
                </div>
                <div className="flex items-center gap-2">
                    {catalogue.length > 1 && (
                        <button
                            type="button"
                            onClick={() => setSwitcherOpen(true)}
                            className="text-xs inline-flex items-center gap-1 text-muted-k hover:text-primary-k border border-kindred rounded-full px-3 py-1"
                            data-testid="workflow-switcher-open"
                        >
                            <Shuffle className="h-3 w-3" /> Switch Workflow
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={close}
                        className="text-xs text-muted-k hover:text-primary-k underline"
                        data-testid="workflow-close"
                    >
                        Close
                    </button>
                </div>
            </header>

            <ol className="flex items-center gap-1 text-xs" data-testid="workflow-progress">
                {details.steps.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-1">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${i < stepIdx || completedSteps[s.key] ? "bg-sage text-white" : i === stepIdx ? "bg-primary-k text-white" : "bg-surface-2 text-muted-k"}`}>
                            {i < stepIdx || completedSteps[s.key] ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                        </span>
                        {i < details.steps.length - 1 && <span className="h-px w-4 bg-kindred" />}
                    </li>
                ))}
            </ol>

            <div className="rounded-xl border border-kindred bg-surface-2 p-4 space-y-3" data-testid={`workflow-step-${step.key}`}>
                <h3 className="font-medium text-primary-k">{step.title}</h3>
                <p className="text-sm text-muted-k">{step.body}</p>

                {(step.payload_fields || []).length > 0 && (
                    <div className="space-y-2">
                        {step.payload_fields.map((f) => (
                            <div key={f.key}>
                                <label className="text-xs text-muted-k">
                                    {f.label}{f.optional && <span className="text-muted-k italic"> (optional)</span>}
                                </label>
                                {f.type === "select" ? (
                                    <select
                                        data-testid={`workflow-field-${f.key}`}
                                        className="w-full mt-1 rounded-md border border-kindred bg-white px-3 py-2 text-sm"
                                        value={(payload[step.key]?.[f.key]) || ""}
                                        onChange={(e) => setPayload((p) => ({ ...p, [step.key]: { ...(p[step.key] || {}), [f.key]: e.target.value } }))}
                                    >
                                        <option value="">Choose…</option>
                                        {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                                        min={f.min} max={f.max}
                                        data-testid={`workflow-field-${f.key}`}
                                        className="w-full mt-1 rounded-md border border-kindred bg-white px-3 py-2 text-sm"
                                        value={(payload[step.key]?.[f.key]) || ""}
                                        onChange={(e) => setPayload((p) => ({ ...p, [step.key]: { ...(p[step.key] || {}), [f.key]: e.target.value } }))}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="text-xs text-muted-k">
                        Step {stepIdx + 1} of {details.steps.length}
                    </div>
                    <div className="flex gap-2">
                        {stepIdx > 0 && (
                            <button
                                type="button"
                                onClick={() => setStepIdx(stepIdx - 1)}
                                className="text-xs px-3 py-1.5 rounded-full border border-kindred text-primary-k hover:bg-surface"
                                data-testid="workflow-back"
                            >
                                Back
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => submitStep(step)}
                            data-testid={`workflow-submit-${step.key}`}
                            className="text-sm bg-primary-k text-white rounded-full px-4 py-1.5 hover:bg-primary-k/90 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            {step.cta || "Log this"} <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {(details.route_out_contacts_resolved || []).length > 0 && (
                <div className={`rounded-xl border p-3 ${details.advice_boundary === "ESCALATE"
                    ? "border-wayly-clay-300 bg-wayly-clay-50"
                    : "border-wayly-teal-200 bg-wayly-teal-50"}`} data-testid="workflow-route-out">
                    <div className={`flex items-center gap-2 text-xs uppercase tracking-wider font-semibold mb-1.5 ${details.advice_boundary === "ESCALATE" ? "text-wayly-clay-700" : "text-wayly-teal-700"}`}>
                        {details.advice_boundary === "ESCALATE" ? (
                            <>
                                <ShieldAlert className="h-3.5 w-3.5" /> Escalate · please contact straight away
                            </>
                        ) : (
                            <>Where to call for help</>
                        )}
                    </div>
                    <ul className="space-y-1">
                        {details.route_out_contacts_resolved.map((c, i) => (
                            <li key={i} className="text-sm">
                                {c.tel_link ? (
                                    <a href={c.tel_link} className="inline-flex items-center gap-1.5 font-medium text-primary-k">
                                        <Phone className="h-3.5 w-3.5" /> {c.label}{c.phone ? ` · ${c.phone}` : ""}
                                    </a>
                                ) : (
                                    <span className="font-medium text-primary-k">{c.label}</span>
                                )}
                                {c.blurb && <div className="text-xs text-muted-k">{c.blurb}</div>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {allDone && details.follow_up && (
                <div className="rounded-xl border border-sage/40 bg-sage/10 p-3 text-sm text-primary-k" data-testid="workflow-follow-up">
                    <div className="flex items-center gap-2 font-medium mb-1">
                        <CheckCircle2 className="h-4 w-4 text-sage" /> All steps captured
                    </div>
                    <div className="text-muted-k">{details.follow_up}</div>
                </div>
            )}

            {/* UI-1 §7, Cancel-confirm modal */}
            {cancelConfirm && (
                <div
                    className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    data-testid="workflow-cancel-modal"
                >
                    <div className="bg-surface border border-kindred rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-wayly-clay-50 text-wayly-clay-700">
                                <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-heading text-lg text-primary-k">Cancel This Workflow?</h3>
                                <p className="text-sm text-muted-k mt-1">
                                    Your progress on &lsquo;{details.label}&rsquo; will be saved as a draft on this device. You can resume any time, or start a different workflow.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setCancelConfirm(false)}
                                className="text-sm bg-primary-k text-white rounded-full px-4 py-2 hover:bg-primary-k/90"
                                data-testid="workflow-cancel-keep"
                            >
                                Keep Working
                            </button>
                            <button
                                type="button"
                                onClick={() => { saveCurrentDraft(); doClose(); }}
                                className="text-sm border border-kindred text-primary-k rounded-full px-4 py-2 hover:bg-surface-2"
                                data-testid="workflow-cancel-save-exit"
                            >
                                Save and Exit
                            </button>
                            <button
                                type="button"
                                onClick={() => { discardCurrentDraft(); doClose(); }}
                                className="text-sm text-wayly-clay-700 underline px-4 py-2"
                                data-testid="workflow-cancel-discard"
                            >
                                Discard and Start Over
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* UI-1 §7, Switch Workflow drawer */}
            {switcherOpen && (
                <div
                    className="fixed inset-0 z-[1000] flex justify-end bg-black/50"
                    role="dialog"
                    aria-modal="true"
                    data-testid="workflow-switcher-drawer"
                    onClick={() => setSwitcherOpen(false)}
                >
                    <aside
                        className="bg-surface w-full max-w-md h-full overflow-y-auto border-l border-kindred p-5 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-heading text-lg text-primary-k">Switch Workflow</h3>
                            <button
                                type="button"
                                onClick={() => setSwitcherOpen(false)}
                                className="text-muted-k hover:text-primary-k"
                                data-testid="workflow-switcher-close"
                                aria-label="Close switcher"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="text-sm text-muted-k">
                            Your current progress on &lsquo;{details.label}&rsquo; will be saved as a draft on this device.
                        </p>
                        <ul className="space-y-2">
                            {catalogue.filter((w) => w.key !== details.key).map((w) => (
                                <li key={w.key}>
                                    <button
                                        type="button"
                                        onClick={() => { saveCurrentDraft(); setSwitcherOpen(false); start(w.key); }}
                                        data-testid={`workflow-switch-to-${w.key}`}
                                        className="w-full text-left rounded-xl border border-kindred bg-surface-2 p-4 hover:border-primary-k transition-all"
                                    >
                                        <div className="font-heading text-[16px] text-primary-k">{w.label}</div>
                                        <p className="mt-1 text-sm text-muted-k line-clamp-2">{w.intro}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </aside>
                </div>
            )}
        </div>
    );
}
