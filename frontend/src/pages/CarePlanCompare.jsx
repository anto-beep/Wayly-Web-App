/**
 * CarePlanCompare, /app/care-plans/compare/:leftId/:rightId
 *
 * Side-by-side comparison of two care plans (Section G).
 *
 * Sections:
 *   1. Header diff, provider, dates, classification, budget, services count
 *   2. Only-left findings (present in left, resolved in right)
 *   3. Only-right findings (new in right)
 *   4. Persisting-both findings (present in both, hasn't shifted)
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertOctagon, ArrowLeft, ArrowRight, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";

const SEV_META = {
    compliance: { label: "Compliance", cls: "bg-terracotta text-white", Icon: AlertOctagon },
    choice: { label: "Choice", cls: "bg-clay text-white", Icon: ShieldAlert },
    efficiency: { label: "Efficiency", cls: "bg-gold text-white", Icon: Shield },
    info: { label: "Info", cls: "bg-sage text-white", Icon: ShieldCheck },
};

function HeaderPanel({ side, header, plan }) {
    return (
        <div className="rounded-xl border border-kindred bg-surface p-4" data-testid={`compare-header-${side}`}>
            <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">{side.toUpperCase()} PLAN</div>
            <div className="text-sm text-primary-k space-y-1">
                <div><strong>Provider:</strong> {header?.provider || ","}</div>
                <div><strong>Effective:</strong> {header?.effective_from ? formatDate(header.effective_from) : ","}{header?.effective_to && ` → ${formatDate(header.effective_to)}`}</div>
                <div><strong>Classification:</strong> {header?.classification || ","}</div>
                <div><strong>Quarterly budget:</strong> {header?.quarterly_budget ? `$${header.quarterly_budget.toLocaleString()}` : ","}</div>
                <div><strong>Services:</strong> {header?.services_count ?? 0}</div>
                <div className="text-xs text-muted-k pt-1">Uploaded {plan?.uploaded_at ? formatDate(plan.uploaded_at) : ","}</div>
            </div>
        </div>
    );
}

function FindingLine({ f }) {
    const meta = SEV_META[f.severity] || SEV_META.info;
    return (
        <div className="border-l-2 pl-2.5 py-1" style={{ borderColor: meta.cls.includes("terracotta") ? "#B14C36" : meta.cls.includes("clay") ? "#B65D3D" : meta.cls.includes("gold") ? "#C88A2E" : "#7FA083" }}>
            <div className="flex items-center gap-2">
                <span className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 ${meta.cls}`}>{meta.label}</span>
            </div>
            <div className="text-sm font-medium text-primary-k mt-1">{f.title}</div>
            {f.citation_source && (
                <div className="text-[10px] text-muted-k mt-0.5">{f.citation_source}</div>
            )}
        </div>
    );
}

const GOAL_STATUS_TINT = {
    active_ongoing: "bg-emerald-50 text-emerald-700 border-emerald-100",
    achieved: "bg-primary-k/5 text-primary-k/70 border-primary-k/10",
    no_longer_relevant: "bg-amber-50 text-amber-700 border-amber-100",
    superseded_by_new_goal: "bg-amber-50 text-amber-700 border-amber-100",
};

function GoalRow({ g }) {
    const tint = GOAL_STATUS_TINT[g.status] || "bg-primary-k/5 text-primary-k/70 border-primary-k/10";
    return (
        <div className="rounded-lg border border-kindred p-2.5" data-testid={`goal-row-${g.id}`}>
            <div className="text-sm text-primary-k">{g.goal_text}</div>
            <span className={`mt-1 inline-block text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 ${tint}`}>
                {(g.status || "").replace(/_/g, " ")}
            </span>
        </div>
    );
}

function GoalContinuity({ participantId, leftId, rightId }) {
    const [goals, setGoals] = useState(null);
    useEffect(() => {
        if (!participantId) { setGoals([]); return; }
        let cancelled = false;
        api.get(`/cpr2/participants/${participantId}/goals`)
            .then((r) => { if (!cancelled) setGoals(r.data.goals || []); })
            .catch(() => { if (!cancelled) setGoals([]); });
        return () => { cancelled = true; };
    }, [participantId]);

    if (goals == null) return null;

    const inLeft = (g) => (g.appears_in_plan_ids || []).includes(leftId);
    const inRight = (g) => (g.appears_in_plan_ids || []).includes(rightId);
    const carried = goals.filter((g) => inLeft(g) && inRight(g));
    const dropped = goals.filter((g) => inLeft(g) && !inRight(g));
    const added = goals.filter((g) => !inLeft(g) && inRight(g));

    if (carried.length + dropped.length + added.length === 0) return null;

    return (
        <div className="mt-10" data-testid="goal-continuity">
            <h2 className="text-lg font-serif tracking-tight text-primary-k">Goal continuity</h2>
            <p className="mt-1 text-sm text-muted-k">
                How the person's goals carried across from the left plan to the right plan.
            </p>
            <div className="mt-4 grid md:grid-cols-3 gap-4">
                <div data-testid="goals-carried">
                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">Carried forward ({carried.length})</div>
                    <div className="space-y-2">{carried.map((g) => <GoalRow key={g.id} g={g} />)}</div>
                    {carried.length === 0 && <div className="text-xs text-muted-k">None</div>}
                </div>
                <div data-testid="goals-dropped">
                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">Dropped from right ({dropped.length})</div>
                    <div className="space-y-2">{dropped.map((g) => <GoalRow key={g.id} g={g} />)}</div>
                    {dropped.length === 0 && <div className="text-xs text-muted-k">None</div>}
                </div>
                <div data-testid="goals-added">
                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">New in right ({added.length})</div>
                    <div className="space-y-2">{added.map((g) => <GoalRow key={g.id} g={g} />)}</div>
                    {added.length === 0 && <div className="text-xs text-muted-k">None</div>}
                </div>
            </div>
        </div>
    );
}

export default function CarePlanCompare() {
    const { leftId, rightId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const { data } = await api.get(`/care-plans/compare/${leftId}/${rightId}`);
            setData(data);
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Compare failed.");
        } finally {
            setLoading(false);
        }
    }, [leftId, rightId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-muted-k" data-testid="loading">Loading comparison…</div>;
    if (error) return <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-terracotta" data-testid="error">{error}</div>;
    if (!data) return null;

    const { left, right, diff } = data;

    return (
        <div className="max-w-5xl mx-auto px-4 py-8" data-testid="care-plan-compare">
            <Link to="/app/care-plans" className="inline-flex items-center gap-1.5 text-xs text-muted-k hover:text-primary-k">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Care Plans
            </Link>
            <h1 className="mt-3 text-3xl font-serif tracking-tight text-primary-k">
                Care plan comparison
            </h1>
            <p className="mt-1 text-sm text-muted-k">
                Side-by-side diff of {left?.plan?.provider_name || "left plan"} and {right?.plan?.provider_name || "right plan"}.
            </p>

            <div className="mt-6 grid md:grid-cols-2 gap-4">
                <HeaderPanel side="left" header={left.header} plan={left.plan} />
                <HeaderPanel side="right" header={right.header} plan={right.plan} />
            </div>

            <GoalContinuity
                participantId={left?.plan?.participant_id || right?.plan?.participant_id}
                leftId={leftId}
                rightId={rightId}
            />

            {/* Only-left (resolved in right) */}
            {(diff.only_left_findings || []).length > 0 && (
                <div className="mt-8" data-testid="diff-only-left">
                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">
                        Present in left, not in right ({diff.only_left_findings.length}), resolved or dropped
                    </div>
                    <ul className="space-y-2">
                        {diff.only_left_findings.map((f, i) => (
                            <li key={i}><FindingLine f={f} /></li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Only-right (new in right) */}
            {(diff.only_right_findings || []).length > 0 && (
                <div className="mt-6" data-testid="diff-only-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">
                        New in right ({diff.only_right_findings.length})
                    </div>
                    <ul className="space-y-2">
                        {diff.only_right_findings.map((f, i) => (
                            <li key={i}><FindingLine f={f} /></li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Persisting in both */}
            {(diff.resolved_or_persisting_pairs || []).length > 0 && (
                <div className="mt-6" data-testid="diff-persisting">
                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">
                        Persisting in both ({diff.resolved_or_persisting_pairs.length})
                    </div>
                    <ul className="space-y-2">
                        {diff.resolved_or_persisting_pairs.map((pair, i) => (
                            <li key={i} className="grid md:grid-cols-2 gap-3">
                                <FindingLine f={pair.left} />
                                <FindingLine f={pair.right} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {(diff.only_left_findings || []).length === 0 &&
             (diff.only_right_findings || []).length === 0 &&
             (diff.resolved_or_persisting_pairs || []).length === 0 && (
                <div className="mt-8 text-sm text-muted-k">
                    Neither plan has any findings yet. Run a review on each first.
                </div>
            )}
        </div>
    );
}
