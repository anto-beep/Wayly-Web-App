/**
 * AdviserScenarios — means-test contribution modeller for advisers.
 * Live-recomputes outputs as the adviser tweaks inputs.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Calculator, ArrowLeft, Save, Trash2, Briefcase } from "lucide-react";

const DEFAULT_INPUTS = {
    assets: 250000,
    annual_income: 35000,
    partner_status: "single",
    homeowner: true,
    classification: 4,
    pensioner: false,
};

function fmt(n) {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

export default function AdviserScenarios() {
    const { user, loading: authLoading } = useAuth();
    const [inputs, setInputs] = useState(DEFAULT_INPUTS);
    const [outputs, setOutputs] = useState(null);
    const [computing, setComputing] = useState(false);
    const [saved, setSaved] = useState([]);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);

    const update = (patch) => setInputs((i) => ({ ...i, ...patch }));

    const compute = useCallback(async () => {
        setComputing(true);
        try {
            const { data } = await api.post("/adviser/scenarios/calc", inputs);
            setOutputs(data);
        } catch (e) {
            // ignore intermediate validation errors
        } finally { setComputing(false); }
    }, [inputs]);

    useEffect(() => {
        const t = setTimeout(compute, 250);
        return () => clearTimeout(t);
    }, [compute]);

    const loadSaved = useCallback(async () => {
        try {
            const { data } = await api.get("/adviser/scenarios");
            setSaved(data.items || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { if (user?.plan === "adviser") loadSaved(); }, [user, loadSaved]);

    if (authLoading) return <div className="min-h-screen flex items-center justify-center text-muted-k">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (user.plan !== "adviser") return <Navigate to="/adviser" replace />;

    const save = async () => {
        if (!name.trim()) { toast.error("Give this scenario a name first."); return; }
        setSaving(true);
        try {
            await api.post("/adviser/scenarios", { name: name.trim(), inputs });
            toast.success("Scenario saved");
            setName("");
            await loadSaved();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not save"));
        } finally { setSaving(false); }
    };

    const del = async (sid) => {
        if (!window.confirm("Delete this scenario?")) return;
        try { await api.delete(`/adviser/scenarios/${sid}`); await loadSaved(); }
        catch { toast.error("Could not delete"); }
    };

    const restore = (s) => { setInputs(s.inputs); toast.info(`Loaded "${s.name}"`); };

    return (
        <div className="min-h-screen bg-kindred">
            <header className="border-b border-kindred bg-surface">
                <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
                    <Link to="/adviser" className="flex items-center gap-2 text-sm text-primary-k hover:underline">
                        <ArrowLeft className="h-4 w-4" /> Back to clients
                    </Link>
                    <span className="font-heading text-lg text-primary-k flex items-center gap-2"><Briefcase className="h-5 w-5" /> Adviser</span>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-10" data-testid="adviser-scenarios-page">
                <div>
                    <span className="overline">Scenario modeller</span>
                    <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight flex items-center gap-2">
                        <Calculator className="h-6 w-6 text-gold" /> Means-test contributions
                    </h1>
                    <p className="text-sm text-muted-k mt-2 max-w-xl">
                        Compare quarterly contributions and lifetime-cap trajectories against the 2026-27 Support at Home means test.
                    </p>
                </div>

                <div className="mt-8 grid lg:grid-cols-[1fr_1fr] gap-6">
                    {/* Inputs */}
                    <div className="bg-surface border border-kindred rounded-2xl p-5 space-y-4" data-testid="scenarios-inputs">
                        <h2 className="font-heading text-lg text-primary-k">Client situation</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <NumberField label="Assets" value={inputs.assets} onChange={(v) => update({ assets: v })} testId="scenario-assets" prefix="$" />
                            <NumberField label="Annual income" value={inputs.annual_income} onChange={(v) => update({ annual_income: v })} testId="scenario-income" prefix="$" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-muted-k">Status</label>
                                <select value={inputs.partner_status} onChange={(e) => update({ partner_status: e.target.value })} data-testid="scenario-partner" className="w-full mt-1 rounded-md border border-kindred px-3 py-2">
                                    <option value="single">Single</option>
                                    <option value="couple">Couple</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Classification</label>
                                <select value={inputs.classification} onChange={(e) => update({ classification: Number(e.target.value) })} data-testid="scenario-classification" className="w-full mt-1 rounded-md border border-kindred px-3 py-2">
                                    {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>Class {n}</option>)}
                                </select>
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={inputs.homeowner} onChange={(e) => update({ homeowner: e.target.checked })} data-testid="scenario-homeowner" />
                            Homeowner
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={inputs.pensioner} onChange={(e) => update({ pensioner: e.target.checked })} data-testid="scenario-pensioner" />
                            Receives Age Pension
                        </label>

                        <div className="pt-3 border-t border-kindred">
                            <label className="text-xs text-muted-k">Save this scenario</label>
                            <div className="mt-1 flex gap-2">
                                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" className="flex-1 rounded-md border border-kindred px-3 py-2" data-testid="scenario-name-input" />
                                <button onClick={save} disabled={saving} data-testid="scenario-save-btn" className="inline-flex items-center gap-1.5 bg-primary-k text-white rounded-md px-3 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60">
                                    <Save className="h-3.5 w-3.5" /> Save
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Outputs */}
                    <div className="bg-surface border border-kindred rounded-2xl p-5 space-y-4" data-testid="scenarios-outputs">
                        <div className="flex items-center justify-between">
                            <h2 className="font-heading text-lg text-primary-k">Result</h2>
                            {computing && <span className="text-[11px] text-muted-k">Recomputing…</span>}
                        </div>
                        {outputs && (
                            <>
                                <div className="bg-gold/10 border border-gold/30 rounded-xl p-4">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-k">Means-test band</div>
                                    <div className="font-heading text-xl text-primary-k mt-1" data-testid="scenario-band">{outputs.means_test_band}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Stat label="Per day" value={fmt(outputs.contribution_per_day)} testId="scenario-per-day" />
                                    <Stat label="Per quarter" value={fmt(outputs.contribution_per_quarter)} testId="scenario-per-quarter" />
                                    <Stat label="Per year" value={fmt(outputs.contribution_per_year)} testId="scenario-per-year" />
                                    <Stat label="Govt subsidy /yr" value={fmt(outputs.government_subsidy_per_year)} testId="scenario-subsidy" />
                                </div>
                                <div className="bg-surface-2 border border-kindred rounded-xl p-4">
                                    <div className="text-[11px] uppercase tracking-wider text-muted-k">Lifetime cap trajectory</div>
                                    <div className="font-heading text-2xl text-primary-k mt-1" data-testid="scenario-cap-years">
                                        {outputs.lifetime_cap_years >= 100 ? "100+" : `${outputs.lifetime_cap_years.toFixed(1)}`} years
                                    </div>
                                    <div className="text-[11px] text-muted-k">at current contribution rate</div>
                                </div>
                                <details className="text-xs text-muted-k">
                                    <summary className="cursor-pointer hover:text-primary-k">Assumptions ({outputs.assumptions?.version})</summary>
                                    <pre className="mt-2 bg-surface-2 rounded-md p-3 overflow-x-auto">{JSON.stringify(outputs.assumptions, null, 2)}</pre>
                                </details>
                            </>
                        )}
                    </div>
                </div>

                {/* Saved scenarios */}
                <section className="mt-10" data-testid="scenarios-saved">
                    <h2 className="font-heading text-lg text-primary-k">Saved scenarios</h2>
                    {saved.length === 0 ? (
                        <div className="bg-surface-2 border border-dashed border-kindred rounded-xl p-6 text-sm text-muted-k mt-3">No saved scenarios yet.</div>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                            {saved.map((s) => (
                                <div key={s.id} className="bg-surface border border-kindred rounded-xl p-4" data-testid={`scenario-row-${s.id}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-medium text-primary-k truncate">{s.name}</div>
                                            <div className="text-[11px] text-muted-k">{fmt(s.outputs.contribution_per_quarter)} / quarter</div>
                                        </div>
                                        <button onClick={() => del(s.id)} className="text-muted-k hover:text-terracotta p-1" title="Delete" data-testid={`scenario-delete-${s.id}`}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <button onClick={() => restore(s)} className="mt-3 text-xs text-primary-k hover:underline" data-testid={`scenario-load-${s.id}`}>Load these inputs</button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

function NumberField({ label, value, onChange, testId, prefix }) {
    return (
        <div>
            <label className="text-xs text-muted-k">{label}</label>
            <div className="mt-1 relative">
                {prefix && <span className="absolute left-3 top-2 text-sm text-muted-k">{prefix}</span>}
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value) || 0)}
                    data-testid={testId}
                    className={`w-full rounded-md border border-kindred ${prefix ? "pl-7" : "pl-3"} pr-3 py-2`}
                />
            </div>
        </div>
    );
}

function Stat({ label, value, testId }) {
    return (
        <div className="bg-surface-2 border border-kindred rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-k">{label}</div>
            <div className="font-heading text-lg text-primary-k mt-1 tabular-nums" data-testid={testId}>{value}</div>
        </div>
    );
}
