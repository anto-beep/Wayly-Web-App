import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import WorkflowsPanel from "@/components/WorkflowsPanel";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";
import ReadOnlyLock from "@/components/ReadOnlyLock";

/**
 * Scenario capture, caregivers log what actually happened to the participant.
 *
 * Calm, plain-language form. Pick an event type from a grouped list, set the
 * effective date, optionally add a note and a tiny structured payload, then
 * submit. The backend applies any proposed lifecycle transition through the
 * Phase 2 guard. If the transition is blocked, the event is still saved and
 * the UI shows a confirm-and-pick-another-state prompt rather than failing.
 */
export default function ScenarioCapture() {
    const [tax, setTax] = useState(null);
    const [participant, setParticipant] = useState(null);
    const [state, setState] = useState(null);
    const [pickedGroup, setPickedGroup] = useState(null);
    const [pickedEvent, setPickedEvent] = useState(null);
    const [effectiveDate, setEffectiveDate] = useState(() =>
        new Date().toISOString().slice(0, 10));
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [recent, setRecent] = useState([]);
    const [lastResult, setLastResult] = useState(null);
    const isExpired = useExpiredTrial();

    useEffect(() => {
        (async () => {
            const tx = await api.get("/scenario/event-types");
            setTax(tx.data);
            setPickedGroup(tx.data.groups[0].key);
            const acct = await api.get("/account");
            const p = acct.data?.participants?.find((x) => x.status === "ACTIVE") || acct.data?.participants?.[0];
            setParticipant(p || null);
            if (p) {
                const s = await api.get(`/scenario/participants/${p.id}/state`);
                setState(s.data);
                const ev = await api.get(`/scenario/participants/${p.id}/events?limit=20`);
                setRecent(ev.data.items || []);
            }
        })().catch((e) => toast.error(e?.response?.data?.detail || e.message));
    }, []);

    const groups = tax?.groups || [];
    const events = useMemo(() => {
        const g = groups.find((x) => x.key === pickedGroup);
        return g ? g.events : [];
    }, [groups, pickedGroup]);
    const selected = useMemo(
        () => events.find((e) => e.event_type === pickedEvent),
        [events, pickedEvent],
    );

    async function submit(e) {
        e.preventDefault();
        if (!participant || !pickedEvent) return;
        setBusy(true);
        try {
            const r = await api.post(`/scenario/participants/${participant.id}/events`, {
                event_type: pickedEvent,
                trigger_source: "caregiver",
                effective_date: effectiveDate,
                note: note || null,
            });
            setLastResult(r.data.event);
            toast.success("Event logged");
            // refresh state + list
            const s = await api.get(`/scenario/participants/${participant.id}/state`);
            setState(s.data);
            const ev = await api.get(`/scenario/participants/${participant.id}/events?limit=20`);
            setRecent(ev.data.items || []);
            setPickedEvent(null);
            setNote("");
        } catch (err) {
            toast.error(err?.response?.data?.detail || err.message);
        } finally {
            setBusy(false);
        }
    }

    if (!tax || !participant) {
        return (
            <div className="p-6 text-sm text-muted-k flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading scenario capture…
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl p-6 space-y-6" data-testid="scenario-capture-page">
            <header>
                <h1 className="font-heading text-3xl text-primary-k">Log a Scenario</h1>
                <p className="mt-2 text-sm text-muted-k max-w-2xl">
                    Walk through a real situation step by step, with Wayly explaining what to do and why.
                </p>
            </header>

            {/* UI-1 §14.3, screen intro */}
            <div className="bg-surface border border-kindred rounded-2xl p-6 text-sm leading-relaxed text-primary-k max-w-3xl" data-testid="scenario-intro">
                <p>
                    Life happens, and sometimes the next step in Support at Home is not obvious. The guided workflows below take you through the most common situations a caregiver runs into. Each one explains what is happening, what you need to prepare, and what to expect next. You can pause and come back any time, switch to a different workflow, or cancel without losing your notes.
                </p>
            </div>

            {state && (
                <div className="rounded-2xl border border-wayly-neutral-200 bg-white p-5 wayly-card-shadow">
                    <div className="text-xs uppercase tracking-wide text-muted-k font-medium">Current status</div>
                    <div className="mt-1 text-lg font-semibold text-primary-k" data-testid="current-lifecycle-state">
                        {state.lifecycle_state || ", "}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {Object.entries(state.flags || {})
                            .filter(([, v]) => v && v !== false)
                            .map(([k]) => (
                                <span key={k} className="px-2 py-0.5 rounded-full bg-wayly-sage-100 text-xs text-wayly-sage-700">
                                    {k}
                                </span>
                            ))}
                    </div>
                </div>
            )}

            <WorkflowsPanel participant={participant} />

            <ReadOnlyLock testId="scenario-form-lock" label="Subscribe to log a new scenario" sub="Previously logged events stay visible below so you can keep the history.">
            <form onSubmit={submit} className="rounded-2xl border border-wayly-neutral-200 bg-white p-6 wayly-card-shadow space-y-5">
                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-k font-medium">Category</label>
                    <select
                        value={pickedGroup || ""}
                        onChange={(e) => { setPickedGroup(e.target.value); setPickedEvent(null); }}
                        className="mt-1 w-full rounded-md border border-wayly-neutral-200 px-3 py-2 text-sm bg-white"
                        data-testid="scenario-group-select"
                    >
                        {groups.map((g) => (
                            <option key={g.key} value={g.key}>{g.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-k font-medium">What happened</label>
                    <select
                        value={pickedEvent || ""}
                        onChange={(e) => setPickedEvent(e.target.value)}
                        className="mt-1 w-full rounded-md border border-wayly-neutral-200 px-3 py-2 text-sm bg-white"
                        required
                        data-testid="scenario-event-select"
                    >
                        <option value="">Pick an event…</option>
                        {events.map((ev) => (
                            <option key={ev.event_type} value={ev.event_type}>{ev.label_au || ev.label}</option>
                        ))}
                    </select>
                    {selected && (
                        <div className="mt-2 text-xs text-muted-k space-y-1">
                            {selected.transition && (
                                <div>Will move status to <strong className="text-primary-k">{selected.transition}</strong>.</div>
                            )}
                            {selected.flag_changes?.length > 0 && (
                                <div>Updates flags: {selected.flag_changes.map((f) => f.flag).join(", ")}.</div>
                            )}
                            {selected.axes?.length > 0 && (
                                <div>Affects: {selected.axes.map((a) => a.replace("affects_", "")).join(", ")}.</div>
                            )}
                        </div>
                    )}
                </div>

                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-k font-medium">When did this happen?</label>
                    <input
                        type="date" value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                        className="mt-1 w-full rounded-md border border-wayly-neutral-200 px-3 py-2 text-sm bg-white"
                        required
                        data-testid="scenario-effective-date"
                    />
                </div>

                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-k font-medium">Note (optional)</label>
                    <textarea
                        value={note} onChange={(e) => setNote(e.target.value)}
                        rows={3} className="mt-1 w-full rounded-md border border-wayly-neutral-200 px-3 py-2 text-sm bg-white"
                        placeholder="e.g. admitted to RPA Saturday morning, expected discharge midweek"
                        data-testid="scenario-note"
                    />
                </div>

                <button
                    type="submit"
                    disabled={busy || !pickedEvent}
                    className="inline-flex items-center gap-2 rounded-full bg-wayly-clay-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-wayly-clay-600 disabled:opacity-50"
                    data-testid="scenario-submit"
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Log this event
                </button>
            </form>
            </ReadOnlyLock>

            {lastResult && (
                <div className={`rounded-2xl border p-5 ${lastResult.proposed?.transition_status === "blocked"
                    ? "border-wayly-clay-300 bg-wayly-clay-50"
                    : "border-wayly-sage-200 bg-wayly-sage-50"}`} data-testid="scenario-last-result">
                    <div className="flex items-center gap-2 font-semibold">
                        {lastResult.proposed?.transition_status === "blocked" ? (
                            <><AlertTriangle className="h-4 w-4 text-wayly-clay-600" /> Proposed status change is blocked</>
                        ) : (
                            <><CheckCircle2 className="h-4 w-4 text-wayly-sage-600" /> Logged</>
                        )}
                    </div>
                    {lastResult.proposed?.transition_status === "blocked" && (
                        <p className="mt-2 text-sm text-muted-k">
                            We saved the event but didn't move the status. {lastResult.proposed.transition_block_reason}
                            Pick a different next status from the participant's timeline if needed.
                        </p>
                    )}
                </div>
            )}

            <section>
                <h2 className="font-heading text-lg text-primary-k mb-3">Recent events</h2>
                <ul className="space-y-2" data-testid="scenario-recent-list">
                    {recent.length === 0 && <li className="text-sm text-muted-k">Nothing logged yet.</li>}
                    {recent.map((ev) => (
                        <li key={ev.id} className="rounded-xl border border-wayly-neutral-200 bg-white p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-medium text-primary-k">
                                    {tax.groups.flatMap((g) => g.events).find((x) => x.event_type === ev.event_type)?.label_au || ev.event_type}
                                </span>
                                <span className="text-xs text-muted-k">{ev.effective_date}</span>
                            </div>
                            {ev.note && <div className="mt-1 text-muted-k">{ev.note}</div>}
                            {ev.proposed?.transition_status === "applied" && (
                                <div className="mt-1 text-xs text-wayly-sage-700">
                                    Status moved to {ev.proposed.lifecycle_transition}
                                </div>
                            )}
                            {ev.proposed?.transition_status === "blocked" && (
                                <div className="mt-1 text-xs text-wayly-clay-600">
                                    Status change was blocked, review the timeline
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
