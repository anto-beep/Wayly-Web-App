/**
 * BC-2 v2 · Budget Scenarios (what-if adjustment sliders + scenario compare).
 *
 * Route: /app/budget-scenarios (scoped to the active participant).
 *
 * Lets a caregiver model "what if" the classification changed, spending went
 * up/down, or indexation applied, then save named scenarios and compare two
 * side-by-side.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import PageIntro from "@/components/PageIntro";
import SmartAISummary from "@/components/SmartAISummary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlidersHorizontal, Save, Trash2, GitCompare, TrendingUp, TrendingDown, Loader2 } from "lucide-react";

const AUD = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(n) || 0);

function DeltaPill({ value, invert }) {
    // value = adjusted - baseline. For spend/cost: positive = extra cost (red),
    // negative = saving (green). `invert` flips it for headroom (more = green).
    if (value == null || Math.round(Number(value)) === 0) {
        return <span className="text-[11px] text-muted-k">no change</span>;
    }
    const raw = Number(value);
    const isCost = invert ? raw < 0 : raw > 0;
    const abs = Math.abs(raw);
    return (
        <span className={`text-xs font-bold inline-flex items-center gap-0.5 ${isCost ? "text-red-600" : "text-emerald-600"}`}>
            {isCost ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {isCost ? "+" : "-"}{AUD(abs)}
        </span>
    );
}

function ProjectionColumn({ title, data, testid, baseline, variant = "baseline" }) {
    if (!data) return null;
    const cur = data.current_quarter;
    const adjusted = variant === "adjusted";

    // Net impact across the 3 projected quarters (adjusted vs baseline).
    let netSpend = 0;
    if (adjusted && baseline?.next_quarters) {
        data.next_quarters.forEach((q, i) => {
            const b = baseline.next_quarters[i];
            if (b) netSpend += (q.projected_spend_aud - b.projected_spend_aud);
        });
    }
    const saves = netSpend < -0.5;
    const costs = netSpend > 0.5;

    return (
        <div
            className={`rounded-2xl p-4 space-y-3 ${adjusted
                ? "border-2 border-clay bg-clay/10 ring-1 ring-clay/40 shadow-sm"
                : "border border-primary-k/10 bg-white"}`}
            data-testid={testid}
        >
            <div className="flex items-center justify-between">
                <p className={`text-xs uppercase tracking-wider ${adjusted ? "text-clay font-bold" : "text-primary-k/50"}`}>{title}</p>
                {adjusted
                    ? <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-clay text-white px-2 py-0.5" data-testid={`${testid}-badge`}>What-If</span>
                    : <span className="text-[11px] rounded-full bg-primary-k/5 px-2 py-0.5 text-primary-k/70">Class {data.classification}</span>}
            </div>

            {/* Net impact banner (adjusted only) */}
            {adjusted && (saves || costs) && (
                <div className={`rounded-xl px-3 py-2 text-sm font-bold flex items-center gap-1.5 ${saves ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}
                    data-testid={`${testid}-net-impact`}>
                    {saves ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                    {saves ? `Saves ${AUD(Math.abs(netSpend))} over 3 quarters` : `Extra ${AUD(netSpend)} over 3 quarters`}
                </div>
            )}

            <div>
                <p className="text-[11px] text-muted-k">{cur.quarter_label} spend vs budget</p>
                <p className="text-lg font-heading text-primary-k">
                    {AUD(cur.burn_total_aud)} <span className="text-sm text-muted-k">/ {AUD(cur.quarterly_budget_aud)}</span>
                </p>
                <p className={`text-[11px] ${cur.headroom_aud < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {AUD(cur.headroom_aud)} headroom
                </p>
            </div>
            <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider text-primary-k/40">Next 3 quarters</p>
                {data.next_quarters.map((q, i) => {
                    const baseQ = baseline?.next_quarters?.[i];
                    return (
                        <div key={i} className="flex items-center justify-between text-sm" data-testid={`${testid}-q${i}`}>
                            <span className="text-muted-k truncate mr-2">{q.quarter_label}</span>
                            <span className="text-primary-k font-medium">{AUD(q.projected_spend_aud)}</span>
                            {adjusted && baseQ && <DeltaPill value={q.projected_spend_aud - baseQ.projected_spend_aud} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function BudgetScenarios() {
    const { activeId, active } = useParticipants();
    const pid = activeId || active?.id;

    const [baseline, setBaseline] = useState(null);
    const [preview, setPreview] = useState(null);
    const [scenarios, setScenarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previewing, setPreviewing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [label, setLabel] = useState("");

    // Adjustment sliders
    const [cls, setCls] = useState(4);
    const [spendPct, setSpendPct] = useState(0);
    const [indexPct, setIndexPct] = useState(0);

    // Compare selections
    const [cmp, setCmp] = useState([]);

    const overrides = useMemo(() => ({
        classification: Number(cls),
        spend_adjustment_pct: Number(spendPct),
        indexation_percent: Number(indexPct),
    }), [cls, spendPct, indexPct]);

    const loadBaseline = useCallback(async () => {
        if (!pid) { setLoading(false); return; }
        setLoading(true);
        try {
            const { data } = await api.get(`/bc2/participants/${pid}/projection`);
            setBaseline(data);
            setCls(data.classification || 4);
        } catch {
            setBaseline(null);
        } finally {
            setLoading(false);
        }
    }, [pid]);

    const loadScenarios = useCallback(async () => {
        if (!pid) return;
        try {
            const { data } = await api.get(`/bc2/participants/${pid}/scenarios`);
            setScenarios(data.scenarios || []);
        } catch { /* ignore */ }
    }, [pid]);

    useEffect(() => { loadBaseline(); loadScenarios(); }, [loadBaseline, loadScenarios]);

    // Recompute the preview whenever the sliders change.
    useEffect(() => {
        if (!pid || !baseline) return;
        let cancelled = false;
        setPreviewing(true);
        const t = setTimeout(() => {
            api.post(`/bc2/participants/${pid}/projection-preview`, overrides)
                .then((r) => { if (!cancelled) setPreview(r.data); })
                .catch(() => { if (!cancelled) setPreview(null); })
                .finally(() => { if (!cancelled) setPreviewing(false); });
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [pid, baseline, overrides]);

    const dirty = useMemo(() => (
        Number(spendPct) !== 0 || Number(indexPct) !== 0 ||
        (baseline && Number(cls) !== baseline.classification)
    ), [spendPct, indexPct, cls, baseline]);

    const saveScenario = async () => {
        if (!label.trim()) { toast.error("Give the scenario a name first."); return; }
        setSaving(true);
        try {
            await api.post(`/bc2/participants/${pid}/scenarios`, {
                label: label.trim(),
                note: "",
                overrides,
            });
            toast.success("Scenario saved");
            setLabel("");
            loadScenarios();
        } catch {
            toast.error("Could not save the scenario.");
        } finally {
            setSaving(false);
        }
    };

    const deleteScenario = async (id) => {
        try {
            await api.delete(`/bc2/participants/${pid}/scenarios/${id}`);
            setScenarios((s) => s.filter((x) => x.id !== id));
            setCmp((c) => c.filter((x) => x !== id));
        } catch {
            toast.error("Could not delete the scenario.");
        }
    };

    const toggleCompare = (id) => {
        setCmp((c) => {
            if (c.includes(id)) return c.filter((x) => x !== id);
            if (c.length >= 2) return [c[1], id];
            return [...c, id];
        });
    };

    const compareData = cmp.map((id) => scenarios.find((s) => s.id === id)).filter(Boolean);

    if (!pid) {
        return (
            <div className="max-w-2xl" data-testid="budget-scenarios-no-participant">
                <PageIntro eyebrow="Budget" title="Budget Scenarios"
                    description="Pick a participant from the switcher at the top to model budget scenarios." />
            </div>
        );
    }

    return (
        <div className="max-w-5xl space-y-6" data-testid="budget-scenarios-page">
            <PageIntro
                eyebrow="Budget · What-if"
                title="Budget Scenarios"
                description="Model what happens to the budget if the classification, spending pace, or indexation changed, then save and compare scenarios."
                whatItDoes="Recomputes the quarterly budget projection using your what-if adjustments, without changing the participant's real record."
                howToUse={["Move the sliders to set your assumptions", "Watch the adjusted projection update against the baseline", "Save a scenario and compare two side-by-side"]}
                whatYouGet={["A live baseline vs adjusted comparison", "Named scenarios you can revisit and compare"]}
            />

            {baseline && (
                <SmartAISummary
                    pageKey="budget-scenarios"
                    context={{
                        classification: baseline.classification,
                        quarter_budget_aud: baseline.current_quarter?.total_budget_aud,
                        quarter_spent_aud: baseline.current_quarter?.spent_aud,
                        headroom_aud: baseline.current_quarter?.headroom_aud,
                        adjusted_headroom_aud: preview?.current_quarter?.headroom_aud,
                        adjusted_spend_delta: preview && baseline
                            ? (preview.current_quarter?.projected_spend_aud || 0) - (baseline.current_quarter?.projected_spend_aud || 0)
                            : 0,
                        saved_scenarios_count: scenarios.length,
                        classification_now: cls,
                        spend_adjustment_pct: spendPct,
                        indexation_pct: indexPct,
                    }}
                />
            )}

            {loading ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 animate-pulse h-40" />
            ) : !baseline ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 text-sm text-muted-k" data-testid="budget-scenarios-empty">
                    We couldn't load a baseline budget for this participant yet. Upload a statement to get started.
                    <div className="mt-3"><Link to="/app/statements/upload" className="text-primary-k underline">Upload a statement</Link></div>
                </div>
            ) : (
                <>
                    {/* Sliders */}
                    <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-5" data-testid="bc2-sliders">
                        <div className="flex items-center gap-2 text-primary-k">
                            <SlidersHorizontal className="w-4 h-4" />
                            <h2 className="font-heading text-lg">Adjustment sliders</h2>
                            {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-k" />}
                        </div>

                        <div className="grid gap-5 md:grid-cols-3">
                            <label className="space-y-1.5 block">
                                <span className="text-sm text-primary-k">Classification level</span>
                                <select
                                    value={cls}
                                    onChange={(e) => setCls(Number(e.target.value))}
                                    data-testid="bc2-slider-classification"
                                    className="w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white"
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                                        <option key={n} value={n}>Level {n}{n === baseline.classification ? " (current)" : ""}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-1.5 block">
                                <span className="text-sm text-primary-k">Spending pace: {spendPct > 0 ? "+" : ""}{spendPct}%</span>
                                <input
                                    type="range" min="-50" max="50" step="5" value={spendPct}
                                    onChange={(e) => setSpendPct(Number(e.target.value))}
                                    data-testid="bc2-slider-spend"
                                    className="w-full accent-[#0E4D52]"
                                />
                                <span className="text-[11px] text-muted-k">Higher means faster spend on future quarters</span>
                            </label>

                            <label className="space-y-1.5 block">
                                <span className="text-sm text-primary-k">Indexation: {indexPct > 0 ? "+" : ""}{indexPct}%</span>
                                <input
                                    type="range" min="0" max="10" step="0.5" value={indexPct}
                                    onChange={(e) => setIndexPct(Number(e.target.value))}
                                    data-testid="bc2-slider-indexation"
                                    className="w-full accent-[#0E4D52]"
                                />
                                <span className="text-[11px] text-muted-k">Annual budget uplift applied per future quarter</span>
                            </label>
                        </div>

                        <div className="flex flex-wrap items-end gap-3 pt-1">
                            <div className="flex-1 min-w-[200px]">
                                <label className="text-sm text-primary-k">Save this scenario as</label>
                                <Input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="e.g. If reassessed to Level 5"
                                    data-testid="bc2-scenario-label"
                                    className="mt-1"
                                />
                            </div>
                            <Button onClick={saveScenario} disabled={saving || !dirty} data-testid="bc2-save-scenario">
                                <Save className="w-4 h-4 mr-1.5" />
                                {saving ? "Saving..." : "Save scenario"}
                            </Button>
                        </div>
                        {!dirty && <p className="text-[11px] text-muted-k">Move a slider to create a what-if scenario worth saving.</p>}
                    </div>

                    {/* Baseline vs adjusted */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <ProjectionColumn title="Baseline (today)" data={baseline} testid="bc2-baseline-col" variant="baseline" />
                        <ProjectionColumn title="Adjusted (what-if)" data={preview} baseline={baseline} testid="bc2-adjusted-col" variant="adjusted" />
                    </div>
                </>
            )}

            {/* Saved scenarios + compare */}
            {scenarios.length > 0 && (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4" data-testid="bc2-scenarios-list">
                    <div className="flex items-center gap-2 text-primary-k">
                        <GitCompare className="w-4 h-4" />
                        <h2 className="font-heading text-lg">Saved scenarios</h2>
                        <span className="text-xs text-muted-k">Tick two to compare</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {scenarios.map((s) => (
                            <div key={s.id}
                                className={`flex items-center justify-between rounded-lg border p-3 ${cmp.includes(s.id) ? "border-clay ring-1 ring-clay" : "border-primary-k/10"}`}
                                data-testid={`bc2-scenario-${s.id}`}>
                                <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={cmp.includes(s.id)}
                                        onChange={() => toggleCompare(s.id)}
                                        data-testid={`bc2-scenario-check-${s.id}`}
                                        className="accent-[#A5512B]"
                                    />
                                    <span className="text-sm text-primary-k truncate">{s.label}</span>
                                </label>
                                <button onClick={() => deleteScenario(s.id)} data-testid={`bc2-scenario-delete-${s.id}`}
                                    className="text-muted-k hover:text-red-600 shrink-0" aria-label="Delete scenario">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {compareData.length === 2 && (
                        <div className="grid gap-4 md:grid-cols-2 pt-2" data-testid="bc2-compare-results">
                            {compareData.map((s, idx) => (
                                <ProjectionColumn key={s.id} title={s.label} data={s.projection_snapshot}
                                    baseline={compareData[0].projection_snapshot} testid={`bc2-compare-col-${s.id}`}
                                    variant={idx === 0 ? "baseline" : "adjusted"} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
