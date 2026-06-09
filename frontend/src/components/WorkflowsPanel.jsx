import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
    LifeBuoy, CheckCircle2, ArrowRight, Loader2, Phone, ChevronRight, ShieldAlert,
} from "lucide-react";

/**
 * Guided caregiver workflows — Phase 6.
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
        setStepIdx(0);
        setPayload({});
        setCompletedSteps({});
        setDetails(null);
        try {
            const r = await api.get(`/scenario/workflows/${key}`);
            setDetails(r.data);
        } catch (e) {
            toast.error("Could not load workflow");
            setActive(null);
        }
    };

    const close = () => {
        setActive(null);
        setDetails(null);
        setStepIdx(0);
        setPayload({});
        setCompletedSteps({});
    };

    const submitStep = async (step) => {
        if (!participant?.id) {
            toast.error("Choose a participant first.");
            return;
        }
        if (!step.event_type) {
            // Acknowledgement-only step — just advance.
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
            setCompletedSteps((s) => ({ ...s, [step.key]: ev }));
            if (ev?.proposed?.transition_status === "applied") {
                toast.success(`Status moved to ${ev.proposed.lifecycle_transition}`);
            } else if (ev?.proposed?.transition_status === "blocked") {
                toast.warning("Status change was blocked — see the timeline");
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
            <div className="bg-surface border border-kindred rounded-2xl p-5 space-y-3" data-testid="workflows-panel">
                <header className="flex items-center gap-2">
                    <LifeBuoy className="h-4 w-4 text-primary-k" />
                    <h2 className="font-heading text-lg text-primary-k">Guided workflows</h2>
                </header>
                <p className="text-sm text-muted-k">
                    Step-by-step prompts for the moments that matter. Each step captures the right event on the timeline.
                </p>
                {catalogue.length === 0 ? (
                    <div className="text-xs text-muted-k">No workflows available.</div>
                ) : (
                    <ul className="space-y-2" data-testid="workflows-list">
                        {catalogue.map((w) => (
                            <li key={w.key}>
                                <button
                                    type="button"
                                    onClick={() => start(w.key)}
                                    data-testid={`workflow-start-${w.key}`}
                                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${WORKFLOW_TONE[w.key] || "bg-surface-2 border-kindred text-primary-k"}`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-medium">{w.label}</div>
                                            <div className="text-xs text-muted-k mt-0.5 line-clamp-2">{w.intro}</div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 flex-shrink-0" />
                                    </div>
                                </button>
                            </li>
                        ))}
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
                <button
                    type="button"
                    onClick={close}
                    className="text-xs text-muted-k hover:text-primary-k underline"
                    data-testid="workflow-close"
                >
                    Close
                </button>
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
        </div>
    );
}
