/**
 * PSW-1 v1 · Provider switching workflow overview + decision walkthrough.
 * Routes:
 *   /app/participants/:id/switches                      , overview
 *   /app/participants/:id/switches/:sid/decision        , walkthrough
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { ChevronLeft, Plus, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import PageIntro from "@/components/PageIntro";
import LF2ChainGenerator from "@/components/LF2ChainGenerator";
import SmartAISummary from "@/components/SmartAISummary";

const REASONS = [
    { key: "billing_disputes_unresolved", label: "Unresolved billing disputes" },
    { key: "care_quality_declined", label: "Care quality declined" },
    { key: "worker_experience_issues", label: "Worker experience issues" },
    { key: "provider_communication_breakdown", label: "Provider communication breakdown" },
    { key: "financial_reasons", label: "Financial reasons" },
    { key: "location_change", label: "Location change" },
    { key: "care_manager_concerns", label: "Care manager concerns" },
    { key: "care_plan_alignment_issues", label: "Care plan alignment issues" },
    { key: "other", label: "Other" },
];
const STAGE_LABEL = {
    deciding: "Deciding",
    decision_confirmed: "Decision confirmed",
    notice_being_prepared: "Notice being prepared",
    notice_given_awaiting_effective_date: "Notice given · awaiting effective date",
    care_plan_transitioning: "Care plan transitioning",
    overlap_period_active: "Overlap period active",
    old_provider_closing_out: "Old provider closing out",
    final_settlement_pending: "Final settlement pending",
    new_provider_onboarded: "New provider onboarded",
    completed: "Completed",
    abandoned: "Abandoned",
};
const STAGE_TINT = {
    deciding: "bg-amber-50 text-amber-800 border-amber-100",
    decision_confirmed: "bg-blue-50 text-blue-800 border-blue-100",
    notice_being_prepared: "bg-blue-50 text-blue-800 border-blue-100",
    notice_given_awaiting_effective_date: "bg-blue-50 text-blue-800 border-blue-100",
    care_plan_transitioning: "bg-blue-50 text-blue-800 border-blue-100",
    overlap_period_active: "bg-orange-50 text-orange-800 border-orange-100",
    old_provider_closing_out: "bg-orange-50 text-orange-800 border-orange-100",
    final_settlement_pending: "bg-orange-50 text-orange-800 border-orange-100",
    new_provider_onboarded: "bg-emerald-50 text-emerald-800 border-emerald-100",
    completed: "bg-emerald-50 text-emerald-800 border-emerald-100",
    abandoned: "bg-primary-k/5 text-primary-k/50 border-primary-k/10",
};

function NewSwitchModal({ pid, onClose, onCreated }) {
    const [form, setForm] = useState({
        current_provider_name: "",
        initial_reason_for_switch: "billing_disputes_unresolved",
        reason_notes: "",
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post(`/psw1/participants/${pid}/switches`, form);
            onCreated(data.switch);
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not create switch.");
        } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
             onClick={onClose} data-testid="psw1-new-modal">
            <div className="max-w-lg w-full bg-white rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-heading text-primary-k">Start a Provider Switch</h3>
                <p className="text-xs text-primary-k/60">
                    Wayly supports the switching process once decided. We do not recommend providers.
                </p>
                <div className="space-y-2">
                    <label className="text-sm text-primary-k">
                        Current provider name
                        <input value={form.current_provider_name}
                               onChange={e => setForm({...form, current_provider_name: e.target.value})}
                               className="mt-1 w-full text-sm border border-primary-k/20 rounded-lg p-2"
                               data-testid="psw1-modal-provider" />
                    </label>
                    <label className="text-sm text-primary-k">
                        Main reason
                        <select value={form.initial_reason_for_switch}
                                onChange={e => setForm({...form, initial_reason_for_switch: e.target.value})}
                                className="mt-1 w-full text-sm border border-primary-k/20 rounded-lg p-2"
                                data-testid="psw1-modal-reason">
                            {REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                    </label>
                    <label className="text-sm text-primary-k">
                        Notes (optional)
                        <textarea value={form.reason_notes}
                                  onChange={e => setForm({...form, reason_notes: e.target.value})}
                                  className="mt-1 w-full text-sm border border-primary-k/20 rounded-lg p-2"
                                  rows={3} data-testid="psw1-modal-notes" />
                    </label>
                </div>
                {err && <p className="text-xs text-red-700" data-testid="psw1-modal-error">{err}</p>}
                <div className="flex items-center justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-4 py-2 rounded-full border border-primary-k/20">
                        Cancel
                    </button>
                    <button onClick={submit} disabled={busy || !form.current_provider_name.trim()}
                            className="text-xs px-4 py-2 rounded-full bg-primary-k text-white disabled:opacity-50"
                            data-testid="psw1-modal-submit">
                        {busy ? "Creating..." : "Start switch"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function SwitchesList() {
    const { id: pid } = useParams();
    const [rows, setRows] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);

    const load = useCallback(async () => {
        const { data } = await api.get(`/psw1/participants/${pid}/switches`);
        setRows(data.switches);
    }, [pid]);

    useEffect(() => { load(); }, [load]);

    if (!rows) return <div className="max-w-3xl mx-auto p-6"><Skeleton className="h-40" /></div>;

    const active = rows.filter(r => !["completed", "abandoned"].includes(r.switch_stage));
    const history = rows.filter(r => ["completed", "abandoned"].includes(r.switch_stage));

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="psw1-list-root">
            <Link to={`/app/participants/${pid}`}
                  className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back to profile
            </Link>

            <header>
                <PageIntro
                    eyebrow="Provider Switches"
                    title="Managing a Provider Switch, End-to-End"
                    description="Switching provider is one of the most stressful things a family can do. Wayly holds your hand from the notice letter through the overlap period to the final settlement, so nothing gets lost between the two providers."
                    whatItDoes="Tracks each switch as a workflow: notice served, transition window, service overlap, and post-switch settlement of refunds or top-up invoices."
                    howToUse={[
                        "Start a new switch and pick your outgoing / incoming providers.",
                        "Follow the guided steps to serve notice and log the transition dates.",
                        "Use the Switch Settlement dashboard for anything owed after the switch date.",
                        "Close out the switch when both providers confirm the change is complete.",
                    ]}
                    whatYouGet={[
                        "A single ledger of every provider switch in progress or history.",
                        "Clear next-step prompts so you don't miss a legislated deadline.",
                        "A settlement paper trail for refunds, top-ups, and outstanding balances.",
                    ]}
                >
                    <div className="flex justify-end">
                        <button onClick={() => setModalOpen(true)}
                                className="text-xs inline-flex items-center gap-1 px-4 py-2 rounded-full bg-primary-k text-white"
                                data-testid="psw1-new-btn">
                            <Plus className="w-3 h-3" /> New Switch
                        </button>
                    </div>
                </PageIntro>
            </header>

            {rows.length > 0 && (
                <SmartAISummary
                    pageKey="provider-switches"
                    context={{
                        total: rows.length,
                        active_count: active.length,
                        history_count: history.length,
                        by_stage: rows.reduce((acc, r) => {
                            acc[r.switch_stage] = (acc[r.switch_stage] || 0) + 1;
                            return acc;
                        }, {}),
                        deciding_count: rows.filter((r) => r.switch_stage === "deciding").length,
                        settlement_pending: rows.filter((r) => r.switch_stage === "final_settlement_pending").length,
                    }}
                />
            )}

            {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-primary-k/20 p-8 text-center"
                     data-testid="psw1-empty">
                    <AlertCircle className="w-8 h-8 text-primary-k/30 mx-auto" />
                    <p className="text-sm text-primary-k/60 mt-2">No provider switches in progress.</p>
                </div>
            ) : (
                <>
                    {active.length > 0 && (
                        <section data-testid="psw1-active-list">
                            <p className="text-xs uppercase tracking-wide text-primary-k/50 mb-3">Active switches</p>
                            <ul className="space-y-3">
                                {active.map(r => (
                                    <SwitchRow key={r.id} row={r} pid={pid} />
                                ))}
                            </ul>
                        </section>
                    )}
                    {history.length > 0 && (
                        <section data-testid="psw1-history-list">
                            <p className="text-xs uppercase tracking-wide text-primary-k/50 mb-3">History</p>
                            <ul className="space-y-3">
                                {history.map(r => (
                                    <SwitchRow key={r.id} row={r} pid={pid} />
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            )}

            {modalOpen && (
                <NewSwitchModal
                    pid={pid}
                    onClose={() => setModalOpen(false)}
                    onCreated={(sw) => {
                        setModalOpen(false);
                        setRows(prev => [sw, ...(prev || [])]);
                    }}
                />
            )}
        </div>
    );
}

function SwitchRow({ row, pid }) {
    const stageEnter = row.stage_history?.[row.stage_history.length - 1]?.entered_at;
    const days = stageEnter ? Math.floor((Date.now() - new Date(stageEnter).getTime()) / 86400000) : null;
    return (
        <li className="rounded-2xl border border-primary-k/10 bg-white p-4"
            data-testid={`psw1-row-${row.id}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary-k truncate">
                        {row.current_provider_name} {row.new_provider_name && <>→ {row.new_provider_name}</>}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${STAGE_TINT[row.switch_stage]}`}
                              data-testid={`psw1-stage-${row.id}`}>
                            {STAGE_LABEL[row.switch_stage] || row.switch_stage}
                        </span>
                        {days !== null && (
                            <span className="text-[10px] text-primary-k/50">{days}d at this stage</span>
                        )}
                    </div>
                </div>
                {row.switch_stage === "deciding" ? (
                    <Link to={`/app/participants/${pid}/switches/${row.id}/decision`}
                          className="text-xs text-primary-k underline"
                          data-testid={`psw1-decision-link-${row.id}`}>
                        Complete Decision Walkthrough →
                    </Link>
                ) : ["final_settlement_pending", "new_provider_onboarded", "completed"].includes(row.switch_stage) ? (
                    <Link to={`/app/participants/${pid}/switches/${row.id}/settlement`}
                          className="text-xs text-primary-k underline"
                          data-testid={`psw1-settlement-link-${row.id}`}>
                        Settlement & Refund →
                    </Link>
                ) : (
                    <span className="text-[10px] text-primary-k/40">Stage in progress</span>
                )}
            </div>
        </li>
    );
}

// ---------------------------------------------------------------------------
// Decision walkthrough (Section F)
// ---------------------------------------------------------------------------

export function SwitchDecisionWalkthrough() {
    const { id: pid, sid } = useParams();
    const navigate = useNavigate();
    const [sw, setSw] = useState(null);
    const [context, setContext] = useState(null);
    const [step, setStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [form, setForm] = useState({
        switching_reasons: [],
        switching_reason_details: "",
        considerations_reviewed: {
            notice_period_understood: false,
            care_disruption_risk_considered: false,
            financial_implications_reviewed: false,
            alternative_provider_researched: false,
            unresolved_disputes_reviewed: false,
            participant_involvement_confirmed: false,
        },
        alternative_actions_considered: {
            formal_complaint_against_current: false,
            dialogue_with_current_care_manager: false,
            change_worker_within_current: false,
            partial_service_change: false,
        },
        final_decision: "proceed_with_switch",
        final_decision_notes: "",
    });

    useEffect(() => {
        api.get(`/psw1/switches/${sid}`).then(r => setSw(r.data.switch)).catch(() => {});
        // Fetch decision-support counts up-front so cross-tool context surfaces
        // BEFORE the user commits their decision.
        api.get(`/psw1/switches/${sid}/context-snapshot`)
            .then(r => setContext({
                unresolved_complaints_at_current_count: r.data.unresolved_complaints_at_current_count,
                open_loop_cases_at_current_count: r.data.open_loop_cases_at_current_count,
                final_decision: null,
            }))
            .catch(() => setContext({
                unresolved_complaints_at_current_count: 0,
                open_loop_cases_at_current_count: 0,
                final_decision: null,
            }));
    }, [sid]);

    const toggleReason = (key) => {
        setForm(f => ({
            ...f,
            switching_reasons: f.switching_reasons.includes(key)
                ? f.switching_reasons.filter(k => k !== key)
                : [...f.switching_reasons, key],
        }));
    };

    const toggleConsideration = (key) => {
        setForm(f => ({
            ...f,
            considerations_reviewed: { ...f.considerations_reviewed, [key]: !f.considerations_reviewed[key] },
        }));
    };

    const toggleAlt = (key) => {
        setForm(f => ({
            ...f,
            alternative_actions_considered: { ...f.alternative_actions_considered, [key]: !f.alternative_actions_considered[key] },
        }));
    };

    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post(`/psw1/switches/${sid}/decision-walkthrough`, form);
            setContext(data.walkthrough);
            setStep(6);
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not submit walkthrough.");
        } finally { setBusy(false); }
    };

    if (!sw) return <div className="max-w-3xl mx-auto p-6"><Skeleton className="h-40" /></div>;

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6" data-testid="psw1-walkthrough-root">
            <Link to={`/app/participants/${pid}/switches`}
                  className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back to switches
            </Link>

            <header>
                <p className="text-xs uppercase tracking-wide text-primary-k/50">Decision Walkthrough</p>
                <h1 className="text-2xl font-heading text-primary-k mt-1" data-testid="psw1-walkthrough-title">
                    Confirm the Decision to Switch from {sw.current_provider_name}
                </h1>
                <p className="text-sm text-primary-k/60 mt-1">
                    Wayly does not push either direction. This walkthrough helps you think through the decision.
                </p>
                {step < 6 && (
                    <>
                        <div className="mt-4 h-1.5 rounded-full bg-primary-k/10 overflow-hidden" data-testid="psw1-progress">
                            <div className="h-full bg-primary-k transition-all" style={{width: `${(step/5)*100}%`}} />
                        </div>
                        <p className="text-[11px] text-primary-k/50 mt-1">Step {step} of 5</p>
                    </>
                )}
            </header>

            {context && (
                <section className="rounded-2xl border border-primary-k/10 bg-primary-k/5 p-4"
                         data-testid="psw1-cross-tool-context">
                    <p className="text-xs uppercase tracking-wide text-primary-k/60 font-semibold">Cross-tool context</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <p className="text-primary-k/60">Unresolved complaints against current provider</p>
                            <p className="text-primary-k font-medium" data-testid="psw1-context-complaints">
                                {context.unresolved_complaints_at_current_count ?? 0}
                            </p>
                        </div>
                        <div>
                            <p className="text-primary-k/60">Open LOOP-1 cases</p>
                            <p className="text-primary-k font-medium" data-testid="psw1-context-cases">
                                {context.open_loop_cases_at_current_count ?? 0}
                            </p>
                        </div>
                    </div>
                </section>
            )}

            <section className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4"
                     data-testid={`psw1-walkthrough-step-${step}`}>
                {step === 1 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">Your reasons for switching</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {REASONS.map(r => (
                                <button key={r.key} type="button" onClick={() => toggleReason(r.key)}
                                        data-testid={`psw1-reason-${r.key}`}
                                        className={`text-xs px-3 py-1.5 rounded-full border ${form.switching_reasons.includes(r.key) ? "bg-primary-k text-white border-primary-k" : "border-primary-k/20 text-primary-k"}`}>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        <textarea value={form.switching_reason_details}
                                  onChange={e => setForm({...form, switching_reason_details: e.target.value})}
                                  placeholder="Notes (optional)"
                                  className="w-full mt-2 text-sm border border-primary-k/20 rounded-lg p-2"
                                  data-testid="psw1-reason-details" rows={2} />
                    </>
                )}
                {step === 2 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">Have you considered alternatives?</p>
                        {[
                            ["formal_complaint_against_current", "File a formal complaint (CMP-1)"],
                            ["dialogue_with_current_care_manager", "Talk to the care manager"],
                            ["change_worker_within_current", "Change worker within current provider"],
                            ["partial_service_change", "Partial service change (not full switch)"],
                        ].map(([k, label]) => (
                            <label key={k} className="flex items-center gap-2 py-1"
                                   data-testid={`psw1-alt-${k}-row`}>
                                <input type="checkbox"
                                       checked={form.alternative_actions_considered[k]}
                                       onChange={() => toggleAlt(k)}
                                       data-testid={`psw1-alt-${k}`} />
                                <span className="text-sm text-primary-k">{label}</span>
                            </label>
                        ))}
                    </>
                )}
                {step === 3 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">Considerations checklist</p>
                        {[
                            ["notice_period_understood", "I understand the notice period requirements"],
                            ["care_disruption_risk_considered", "I&#39;ve considered the risk of care disruption"],
                            ["financial_implications_reviewed", "I&#39;ve reviewed financial implications"],
                            ["alternative_provider_researched", "I&#39;ve researched an alternative provider"],
                            ["unresolved_disputes_reviewed", "I&#39;ve reviewed unresolved disputes"],
                            ["participant_involvement_confirmed", "The participant is involved in this decision"],
                        ].map(([k, label]) => (
                            <label key={k} className="flex items-center gap-2 py-1">
                                <input type="checkbox"
                                       checked={form.considerations_reviewed[k]}
                                       onChange={() => toggleConsideration(k)}
                                       data-testid={`psw1-consideration-${k}`} />
                                <span className="text-sm text-primary-k">{label}</span>
                            </label>
                        ))}
                    </>
                )}
                {step === 4 && (
                    <>
                        <p className="text-sm font-medium text-primary-k">Final decision</p>
                        {[
                            ["proceed_with_switch", "Proceed with the switch"],
                            ["defer_and_reassess_in_30_days", "Defer and reassess in 30 days"],
                            ["abandon_switch_pursue_alternatives", "Abandon switch, pursue alternatives"],
                            ["escalate_via_complaint_first", "Escalate via complaint first"],
                        ].map(([k, label]) => (
                            <label key={k} className="flex items-center gap-2 py-1">
                                <input type="radio" name="final_decision"
                                       checked={form.final_decision === k}
                                       onChange={() => setForm({...form, final_decision: k})}
                                       data-testid={`psw1-final-${k}`} />
                                <span className="text-sm text-primary-k">{label}</span>
                            </label>
                        ))}
                        <textarea value={form.final_decision_notes}
                                  onChange={e => setForm({...form, final_decision_notes: e.target.value})}
                                  placeholder="Notes (optional)"
                                  className="w-full mt-2 text-sm border border-primary-k/20 rounded-lg p-2"
                                  rows={2} data-testid="psw1-final-notes" />
                    </>
                )}
                {step === 5 && (
                    <div data-testid="psw1-review">
                        <p className="text-sm font-medium text-primary-k">Review</p>
                        <dl className="text-xs mt-2 space-y-2">
                            <div>
                                <dt className="text-primary-k/60 uppercase tracking-wide">Reasons</dt>
                                <dd className="text-primary-k">{form.switching_reasons.map(k => REASONS.find(r => r.key === k)?.label).join(", ") || ","}</dd>
                            </div>
                            <div>
                                <dt className="text-primary-k/60 uppercase tracking-wide">Final decision</dt>
                                <dd className="text-primary-k">{form.final_decision.replace(/_/g, " ")}</dd>
                            </div>
                        </dl>
                    </div>
                )}
                {step === 6 && context && context.final_decision && (
                    <div className="space-y-4" data-testid="psw1-walkthrough-done">
                        <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-primary-k">Walkthrough Saved</p>
                                <p className="text-xs text-primary-k/60 mt-1">
                                    Final decision: <strong>{context.final_decision.replace(/_/g, " ")}</strong>.
                                </p>
                            </div>
                        </div>
                        {context.final_decision === "proceed_with_switch" && (
                            <div className="rounded-lg border border-primary-k/10 bg-primary-k/[0.02] p-4 space-y-2" data-testid="psw1-lf2-chain">
                                <p className="text-sm font-medium text-primary-k">Draft the Provider Letters</p>
                                <p className="text-xs text-primary-k/70">Wayly can pre-fill the formal notice to your current provider and a welcome letter to the incoming provider. Review and send both from Letters and Follow-ups.</p>
                                <LF2ChainGenerator
                                    chainKey="psw_switch_full"
                                    participantIdParam={pid}
                                    contextExtras={{
                                        switch_effective_date: sw?.effective_switch_date || sw?.notice_period_end_date || "the confirmed switch date",
                                        incoming_provider_name: sw?.new_provider_name || "the incoming provider",
                                    }}
                                    sourceTool="psw1"
                                    sourceCaseId={sid}
                                />
                            </div>
                        )}
                        <button onClick={() => navigate(`/app/participants/${pid}/switches`)}
                                className="text-xs px-4 py-2 rounded-full bg-primary-k text-white"
                                data-testid="psw1-walkthrough-return">
                            Back to Switches <ArrowRight className="inline w-3 h-3 ml-1" />
                        </button>
                    </div>
                )}
                {err && <p className="text-xs text-red-700" data-testid="psw1-walkthrough-error">{err}</p>}
            </section>

            {step < 6 && (
                <div className="flex items-center justify-between">
                    <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
                            className="text-xs text-primary-k/60 disabled:opacity-30"
                            data-testid="psw1-walkthrough-back">
                        ← Back
                    </button>
                    {step < 5 ? (
                        <button onClick={() => setStep(s => s + 1)}
                                className="text-xs px-4 py-2 rounded-full bg-primary-k text-white"
                                data-testid="psw1-walkthrough-next">
                            Next →
                        </button>
                    ) : (
                        <button onClick={submit} disabled={busy}
                                className="text-xs px-4 py-2 rounded-full bg-primary-k text-white disabled:opacity-50"
                                data-testid="psw1-walkthrough-submit">
                            {busy ? "Saving..." : "Save walkthrough"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
