/**
 * BSC-1 · Budget Scenarios — "Will the money last?"
 *
 * Question-led, forward-looking scenario tool. All figures come from the
 * shared /bsc1 engine (server-side Decimal); this screen renders results
 * only. Replaces the old slider-based BC-2 what-if screen. No duplicate
 * overall-budget — that lives on the dashboard.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Plus, Pencil, Trash2, SlidersHorizontal, Save, X, ChevronDown, ChevronRight,
    CheckCircle2, AlertTriangle, TrendingUp, Clock, Loader2, Wallet, ArrowRight,
} from "lucide-react";

const AUD0 = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const fmtDate = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } };
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");
// Title-case service names for display, matching the Provider Price Checker.
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "per", "with"]);
const titleCase = (str) => !str ? "" : String(str).split(/(\s+)/).map((tok, i) => {
    if (/^\s+$/.test(tok)) return tok;
    const lower = tok.toLowerCase();
    if (i !== 0 && SMALL_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}).join("");

const STATUS_META = {
    on_track: { label: "On track", color: "#6B8F71", bg: "#6B8F71", Icon: CheckCircle2 },
    tight: { label: "Tight", color: "#C2683D", bg: "#C2683D", Icon: AlertTriangle },
    runs_out: { label: "Runs out", color: "#C2683D", bg: "#C2683D", Icon: Clock },
    already_over: { label: "Already over", color: "#B4472B", bg: "#B4472B", Icon: TrendingUp },
};

// Distinct, meaning-coded tints for the hero stat pills so each figure reads at
// a glance on the dark hero (soft coloured fill + ring + icon, white value).
const PILL_TONES = {
    neutral: { bg: "rgba(255,255,255,0.12)", ring: "rgba(255,255,255,0.20)", icon: "#CFE6E6", label: "rgba(255,255,255,0.72)" },
    budget: { bg: "rgba(96,165,250,0.22)", ring: "rgba(96,165,250,0.48)", icon: "#BBD9FB", label: "rgba(255,255,255,0.80)" },
    spend: { bg: "rgba(226,160,106,0.24)", ring: "rgba(226,160,106,0.50)", icon: "#F2CDA9", label: "rgba(255,255,255,0.82)" },
    left: { bg: "rgba(127,200,160,0.24)", ring: "rgba(127,200,160,0.50)", icon: "#AEE6C6", label: "rgba(255,255,255,0.82)" },
    over: { bg: "rgba(240,133,122,0.26)", ring: "rgba(240,133,122,0.52)", icon: "#F6B8B0", label: "rgba(255,255,255,0.84)" },
    status: { bg: "rgba(255,255,255,0.14)", ring: "rgba(255,255,255,0.24)", icon: "#CFE6E6", label: "rgba(255,255,255,0.72)" },
};
// The status pill borrows the colour that matches the status so the hero reads
// as a mix of colours, not a wall of teal.
const STATUS_PILL_TONE = { on_track: "left", tight: "spend", runs_out: "over", already_over: "over" };

const QUESTION_CARDS = [
    { key: "add_service", title: "Add or change a service", hint: "What if we add cleaning, or go from 2 to 3 hours a visit?", Icon: Plus },
    { key: "classification_change", title: "Classification changes", hint: "What if they're reassessed to a higher level?", Icon: SlidersHorizontal },
    { key: "spending_pace", title: "Spending pace", hint: "What if we spend a bit faster or slower?", Icon: TrendingUp },
];
const MORE_SITUATIONS = [
    { key: "pause_services", title: "Pause services (e.g. hospital stay)" },
    { key: "one_off_cost", title: "A one-off cost (e.g. respite week)" },
    { key: "price_change", title: "Provider price change" },
    { key: "remove_service", title: "Stop a service" },
];

export default function BudgetScenarios() {
    const { activeId, active } = useParticipants();
    const pid = activeId || active?.id;

    const [catalogue, setCatalogue] = useState([]);
    const [result, setResult] = useState(null);
    const [stale, setStale] = useState(false);
    const [loading, setLoading] = useState(true);
    const [computing, setComputing] = useState(false);
    const [changes, setChanges] = useState([]);
    const [scenarios, setScenarios] = useState([]);
    const [sheet, setSheet] = useState(null);        // { type, editId? }
    const [moreOpen, setMoreOpen] = useState(false);
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [spendToDate, setSpendToDate] = useState("");
    const [pacePct, setPacePct] = useState("");
    const [carryIn, setCarryIn] = useState("");
    const [saveName, setSaveName] = useState("");
    const lastGood = useRef(null);

    const overrides = useMemo(() => ({
        spend_to_date_aud: spendToDate === "" ? null : Number(spendToDate),
        pace_pct: pacePct === "" ? null : Number(pacePct),
        carry_forward_in_aud: carryIn === "" ? null : Number(carryIn),
    }), [spendToDate, pacePct, carryIn]);

    useEffect(() => {
        api.get("/bsc1/service-catalogue").then((r) => setCatalogue(r.data.services || [])).catch(() => setCatalogue([]));
    }, []);
    const loadScenarios = useCallback(async () => {
        if (!pid) return;
        try { const { data } = await api.get(`/bsc1/participants/${pid}/scenarios`); setScenarios(data.scenarios || []); } catch { /* ignore */ }
    }, [pid]);
    useEffect(() => { loadScenarios(); }, [loadScenarios]);

    // Debounced compute whenever changes or adjustments move.
    useEffect(() => {
        if (!pid) { setLoading(false); return; }
        let cancelled = false;
        setComputing(true);
        const t = setTimeout(() => {
            api.post("/bsc1/compute", { participant_id: pid, changes, ...overrides })
                .then((r) => { if (!cancelled) { setResult(r.data); lastGood.current = r.data; setStale(false); } })
                .catch(() => { if (!cancelled && lastGood.current) setStale(true); })
                .finally(() => { if (!cancelled) { setComputing(false); setLoading(false); } });
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
    }, [pid, changes, overrides]);

    const addOrUpdateChange = (change) => {
        setChanges((cur) => {
            if (change.id && cur.some((c) => c.id === change.id)) return cur.map((c) => c.id === change.id ? change : c);
            return [...cur, { ...change, id: change.id || `ch-${Date.now()}` }];
        });
        setSheet(null);
    };
    const removeChange = (id) => setChanges((cur) => cur.filter((c) => c.id !== id));
    const resetChanges = () => { if (changes.length <= 2 || window.confirm("Clear all your changes?")) setChanges([]); };

    const saveScenario = async () => {
        if (!saveName.trim()) { toast.error("Give the scenario a name first."); return; }
        try {
            await api.post(`/bsc1/participants/${pid}/scenarios`, { name: saveName.trim(), changes, ...overrides });
            toast.success("Scenario saved");
            setSaveName("");
            loadScenarios();
        } catch (e) { toast.error(e?.response?.data?.detail || "Could not save the scenario."); }
    };
    const openScenario = (s) => { setChanges(s.changes || []); setSpendToDate(s.spend_to_date_aud ?? ""); setPacePct(s.pace_pct ?? ""); setCarryIn(s.carry_forward_in_aud ?? ""); window.scrollTo({ top: 0, behavior: "smooth" }); };
    const deleteScenario = async (id) => { try { await api.delete(`/bsc1/scenarios/${id}`); setScenarios((s) => s.filter((x) => x.id !== id)); } catch { toast.error("Could not delete."); } };

    if (!pid) {
        return (
            <div className="max-w-2xl" data-testid="bsc1-no-participant">
                <h1 className="font-heading text-3xl text-primary-k">Will the money last?</h1>
                <p className="text-muted-k mt-2">Pick a participant from the switcher at the top to check the budget.</p>
            </div>
        );
    }

    const hero = result?.hero;
    const meta = hero ? (STATUS_META[hero.status] || STATUS_META.on_track) : STATUS_META.on_track;

    return (
        <div className="max-w-[900px] space-y-5" data-testid="bsc1-page">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h1 className="font-heading text-3xl sm:text-4xl font-bold text-primary-k tracking-tight">Will the Money Last?</h1>
                    {result && <p className="text-sm text-muted-k mt-0.5" data-testid="bsc1-context">Caring for {result.participant_name} · Classification {result.classification}</p>}
                </div>
                {computing && <span className="inline-flex items-center gap-1.5 text-xs text-muted-k"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…</span>}
            </div>

            {loading ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 animate-pulse h-48" data-testid="bsc1-loading" />
            ) : !result ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 text-sm text-muted-k" data-testid="bsc1-empty">
                    We couldn&apos;t work out a budget for this participant yet. <Link to="/app/statements/upload" className="text-primary-k underline">Upload a statement</Link> to get started.
                </div>
            ) : (
                <>
                    {/* HERO ANSWER */}
                    <div className="relative overflow-hidden rounded-2xl p-6 text-white shadow-lg" style={{ background: "linear-gradient(135deg, #0E4D52 0%, #0A3B3F 55%, #10474B 100%)" }} data-testid="bsc1-hero">
                        <div className="pointer-events-none absolute -right-12 -top-12 w-44 h-44 rounded-full opacity-25 blur-3xl" style={{ backgroundColor: meta.bg }} />
                        <div className="pointer-events-none absolute -left-8 bottom-0 w-32 h-32 rounded-full opacity-10 blur-2xl bg-white" />
                        <div className="relative">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm" style={{ backgroundColor: meta.bg }}>
                                    <meta.Icon className="w-3.5 h-3.5" /> {meta.label}
                                </span>
                                <span className="text-[11px] uppercase tracking-widest text-white/70 font-semibold">Your answer, right now</span>
                                {stale && <span className="text-[10px] uppercase tracking-wider text-amber-200">· not updated</span>}
                            </div>
                            <p className="mt-3 font-heading text-2xl leading-snug text-white" data-testid="bsc1-hero-answer">{hero.answer}</p>
                            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <HeroPill tone="budget" Icon={Wallet} label="Budget this quarter" value={AUD0(hero.available_aud)} />
                                <HeroPill tone="spend" Icon={TrendingUp} label="Projected spend" value={AUD0(hero.projected_total_aud)} />
                                <HeroPill tone={hero.unspent_aud < 0 ? "over" : "left"} Icon={hero.unspent_aud < 0 ? AlertTriangle : CheckCircle2} label={hero.unspent_aud < 0 ? "Projected over" : "Projected left"} value={AUD0(hero.unspent_aud)} />
                                <HeroPill tone={STATUS_PILL_TONE[hero.status] || "status"} Icon={meta.Icon} label={hero.run_out_date ? "Runs out" : "Status"} value={hero.run_out_date ? fmtDate(hero.run_out_date) : meta.label} />
                            </div>
                            <div className="mt-5 flex items-center justify-between flex-wrap gap-2">
                                <p className="text-sm text-white/85">{hero.action_line}</p>
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full bg-white px-3 py-1.5 shadow-sm" style={{ color: "#0E4D52" }} data-testid="bsc1-confidence">
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.bg }} />
                                    Confidence: {cap(result.confidence)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* FUNDING + CONTRIBUTION STRIP */}
                    <div className="rounded-2xl border border-primary-k/10 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between" data-testid="bsc1-funding-strip">
                        <div className="flex items-start gap-2">
                            <Wallet className="w-4 h-4 text-teal mt-0.5" />
                            <p className="text-sm text-muted-k">
                                The government funds <strong className="text-primary-k">{AUD0(result.funding.quarterly_budget_aud)}</strong> this quarter.
                                What {result.participant_name} pays depends on their means assessment.
                            </p>
                        </div>
                        <div className="text-sm text-muted-k shrink-0">
                            Lifetime cap left: <strong className="text-primary-k">{AUD0(result.contribution.lifetime_remaining_aud)}</strong>
                            <Link to="/ai-tools/contribution-estimator" className="ml-2 text-primary-k underline text-xs">Estimate my contribution</Link>
                        </div>
                    </div>

                    {/* QUESTION CARDS */}
                    <div>
                        <h2 className="font-heading text-lg text-primary-k mb-2">What Do You Want to Check?</h2>
                        <div className="grid sm:grid-cols-3 gap-3" data-testid="bsc1-question-cards">
                            {QUESTION_CARDS.map((q) => (
                                <button key={q.key} onClick={() => setSheet({ type: q.key })} data-testid={`bsc1-q-${q.key}`}
                                    className="group text-left rounded-xl border border-primary-k/10 bg-white p-3 hover:border-clay/50 hover:shadow-sm transition-all duration-200">
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-clay/10 text-clay">
                                        <q.Icon className="w-4 h-4" />
                                    </span>
                                    <p className="mt-2 text-sm font-semibold text-primary-k">{q.title}</p>
                                    <p className="text-sm text-muted-k mt-0.5 leading-snug">{q.hint}</p>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setMoreOpen((v) => !v)} data-testid="bsc1-more-situations" className="mt-2 text-sm text-primary-k inline-flex items-center gap-1 hover:underline">
                            {moreOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} More situations
                        </button>
                        {moreOpen && (
                            <div className="mt-2 grid sm:grid-cols-2 gap-2">
                                {MORE_SITUATIONS.map((m) => (
                                    <button key={m.key} onClick={() => setSheet({ type: m.key })} data-testid={`bsc1-q-${m.key}`}
                                        className="text-left text-sm rounded-xl border border-primary-k/10 bg-white px-4 py-3 hover:border-primary-k/40">
                                        {m.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* YOUR CHANGES */}
                    {changes.length > 0 && (
                        <div className="rounded-2xl border border-primary-k/10 bg-white p-4" data-testid="bsc1-change-list">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="font-heading text-lg text-primary-k">Your Changes</h2>
                                <button onClick={resetChanges} data-testid="bsc1-reset" className="text-xs text-muted-k hover:text-primary-k underline">Reset to today</button>
                            </div>
                            <div className="space-y-2">
                                {changes.map((c) => {
                                    const d = (result.change_deltas || []).find((x) => x.change_id === c.id);
                                    return (
                                        <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-primary-k/10 px-3 py-2" data-testid={`bsc1-change-${c.id}`}>
                                            <span className="text-sm text-primary-k truncate">{c.label || c.name || c.type}</span>
                                            <div className="flex items-center gap-3 shrink-0">
                                                {d && d.delta_aud != null && <span className={`text-xs font-bold ${d.delta_aud > 0 ? "text-red-600" : "text-emerald-600"}`}>{d.delta_aud > 0 ? "+" : ""}{AUD0(d.delta_aud)}/qtr</span>}
                                                <button onClick={() => setSheet({ type: c.type, editId: c.id, change: c })} data-testid={`bsc1-edit-${c.id}`} className="text-muted-k hover:text-primary-k"><Pencil className="w-4 h-4" /></button>
                                                <button onClick={() => removeChange(c.id)} data-testid={`bsc1-remove-${c.id}`} className="text-muted-k hover:text-red-600"><X className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-3 flex items-end gap-2 flex-wrap">
                                <div className="flex-1 min-w-[180px]">
                                    <label className="text-xs text-muted-k">Save this scenario as</label>
                                    <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. If we add cleaning" data-testid="bsc1-save-name" className="mt-1" />
                                </div>
                                <Button onClick={saveScenario} data-testid="bsc1-save"><Save className="w-4 h-4 mr-1.5" /> Save</Button>
                            </div>
                        </div>
                    )}

                    {/* COMPARE TODAY vs WITH CHANGES */}
                    {changes.length > 0 && (
                        <div className="rounded-2xl border border-primary-k/10 bg-white p-4" data-testid="bsc1-compare">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-clay/10 text-clay"><TrendingUp className="w-4 h-4" /></span>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-semibold text-clay">Scenario impact</p>
                                    <h2 className="font-heading text-lg text-primary-k leading-none">Compared to Today</h2>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <CompareCol title="Today" q={result.baseline.quarters[0]} />
                                <CompareCol title="With your changes" q={result.quarters[0]} highlight />
                            </div>
                            <div className="mt-4">
                                <div className="flex items-center gap-2 px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-k font-semibold">
                                    <span className="flex-1">Quarter</span>
                                    <span className="w-20 text-right">Today</span>
                                    <span className="w-5" />
                                    <span className="w-20 text-right">Changes</span>
                                    <span className="w-28 text-right">Difference</span>
                                </div>
                                <div className="space-y-1.5">
                                    {result.quarters.slice(1).map((q, i) => {
                                        const b = result.baseline.quarters[i + 1];
                                        const diff = q.projected_total_aud - (b?.projected_total_aud || 0);
                                        const up = diff > 0.5, down = diff < -0.5;
                                        return (
                                            <div key={q.quarter_label} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-primary-k/[0.03]" data-testid={`bsc1-compare-row-${i}`}>
                                                <span className="flex-1 text-sm text-primary-k truncate">{q.quarter_label}</span>
                                                <span className="w-20 text-right text-xs text-muted-k">{AUD0(b?.projected_total_aud || 0)}</span>
                                                <ArrowRight className="w-3.5 h-3.5 text-muted-k/40 shrink-0" />
                                                <span className="w-20 text-right text-sm font-semibold text-primary-k">{AUD0(q.projected_total_aud)}</span>
                                                <span className={`w-28 text-center text-[11px] font-bold rounded-full px-2 py-1 ${up ? "bg-red-100 text-red-700" : down ? "bg-emerald-100 text-emerald-700" : "bg-primary-k/5 text-muted-k"}`}>
                                                    {Math.abs(diff) < 0.5 ? "no change" : `${up ? "▲ +" : "▼ −"}${AUD0(Math.abs(diff))}`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ADJUST DRAWER */}
                    <div className="rounded-2xl border border-primary-k/10 bg-white" data-testid="bsc1-adjust">
                        <button onClick={() => setAdjustOpen((v) => !v)} data-testid="bsc1-adjust-toggle" className="w-full flex items-center justify-between px-4 py-3 text-sm text-primary-k">
                            <span className="inline-flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" /> Adjust the detail</span>
                            {adjustOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        {adjustOpen && (
                            <div className="px-4 pb-4 grid sm:grid-cols-3 gap-3">
                                <label className="block"><span className="text-xs text-muted-k">Spend so far this quarter</span>
                                    <Input type="number" value={spendToDate} onChange={(e) => setSpendToDate(e.target.value)} placeholder="auto" data-testid="bsc1-spend-to-date" className="mt-1" /></label>
                                <label className="block"><span className="text-xs text-muted-k">Spending pace %</span>
                                    <Input type="number" value={pacePct} onChange={(e) => setPacePct(e.target.value)} placeholder="0" data-testid="bsc1-pace" className="mt-1" /></label>
                                <label className="block"><span className="text-xs text-muted-k">Carry-forward in</span>
                                    <Input type="number" value={carryIn} onChange={(e) => setCarryIn(e.target.value)} placeholder="0" data-testid="bsc1-carry" className="mt-1" /></label>
                                <p className="text-[11px] text-muted-k sm:col-span-3">Indexation is set by government and applied automatically — it isn&apos;t something you adjust here.</p>
                            </div>
                        )}
                    </div>

                    {/* SAVED SCENARIOS */}
                    {scenarios.length > 0 && (
                        <div className="rounded-2xl border border-primary-k/10 bg-white p-4" data-testid="bsc1-saved">
                            <h2 className="font-heading text-lg text-primary-k mb-2">Saved scenarios <span className="text-xs text-muted-k">({scenarios.length} of 5)</span></h2>
                            <div className="grid sm:grid-cols-2 gap-2">
                                {scenarios.map((s) => {
                                    const st = STATUS_META[s.last_result?.hero?.status] || STATUS_META.on_track;
                                    return (
                                        <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-primary-k/10 px-3 py-2" data-testid={`bsc1-saved-${s.id}`}>
                                            <div className="min-w-0">
                                                <p className="text-sm text-primary-k truncate">{s.name}</p>
                                                <p className="text-[11px]" style={{ color: st.color }}>{st.label}</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button onClick={() => openScenario(s)} data-testid={`bsc1-open-${s.id}`} className="text-xs text-primary-k underline inline-flex items-center gap-0.5">Open <ArrowRight className="w-3 h-3" /></button>
                                                <button onClick={() => deleteScenario(s.id)} data-testid={`bsc1-delete-${s.id}`} className="text-muted-k hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <p className="text-[11px] text-muted-k" data-testid="bsc1-disclaimer">{result.disclaimer} Figures as at {fmtDate(result.as_of)} · Schedule {result.index1_version}.</p>
                </>
            )}

            {sheet && (
                <ChangeSheet
                    sheet={sheet}
                    catalogue={catalogue}
                    onClose={() => setSheet(null)}
                    onSave={addOrUpdateChange}
                />
            )}
        </div>
    );
}

function HeroPill({ label, value, tone = "neutral", Icon }) {
    const t = PILL_TONES[tone] || PILL_TONES.neutral;
    return (
        <div className="rounded-xl px-3 py-2.5 border" style={{ backgroundColor: t.bg, borderColor: t.ring }}>
            <div className="flex items-center gap-1.5">
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: t.icon }} />}
                <p className="text-[10px] uppercase tracking-wider font-semibold truncate" style={{ color: t.label }}>{label}</p>
            </div>
            <p className="font-heading text-lg text-white mt-1">{value}</p>
        </div>
    );
}

function CompareCol({ title, q, highlight }) {
    const over = q.projected_unspent_aud < 0;
    const tone = highlight
        ? { bg: "#FBEEE6", border: "#A5512B", label: "#A5512B", value: "#8A421F" }
        : { bg: "#E6EFF0", border: "#0E4D52", label: "#0E4D52", value: "#0E4D52" };
    return (
        <div className="rounded-xl p-4 border" style={{ backgroundColor: tone.bg, borderColor: tone.border + "33" }} data-testid={`bsc1-compare-col-${highlight ? "changes" : "today"}`}>
            <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider font-bold" style={{ color: tone.label }}>{title}</p>
                {highlight && <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: tone.border }}>New</span>}
            </div>
            <p className="font-heading text-2xl mt-1.5" style={{ color: tone.value }}>{AUD0(q.projected_total_aud)}</p>
            <p className="text-[11px] mt-0.5" style={{ color: over ? "#B4472B" : "#6B8F71" }}>projected · {over ? "over by " : "left "}{AUD0(Math.abs(q.projected_unspent_aud))}</p>
        </div>
    );
}

/** One adaptive change editor for all 8 change types. */
function ChangeSheet({ sheet, catalogue, onClose, onSave }) {
    const edit = sheet.change || {};
    const [type, setType] = useState(sheet.type);
    const [serviceId, setServiceId] = useState(edit.service_id || (catalogue[0]?.service_id || ""));
    const [price, setPrice] = useState(edit.unit_price != null ? String(edit.unit_price) : "");
    const [quantity, setQuantity] = useState(edit.quantity ?? 2);
    const [freq, setFreq] = useState(edit.frequency_per_week ?? 1);
    const [newQuantity, setNewQuantity] = useState(edit.new_quantity ?? 3);
    const [pct, setPct] = useState(edit.pct ?? 10);
    const [amount, setAmount] = useState(edit.amount ?? 500);
    const [weeks, setWeeks] = useState(edit.weeks ?? 3);
    const [quarterIndex, setQuarterIndex] = useState(edit.quarter_index ?? 0);
    const [toClass, setToClass] = useState(edit.to_classification ?? 5);

    const svc = catalogue.find((s) => s.service_id === serviceId) || catalogue[0];
    const unitPrice = price === "" ? (svc?.unit_price || 0) : Number(price);

    const build = () => {
        const base = { id: sheet.editId, type };
        if (type === "add_service") return { ...base, service_id: serviceId, name: svc?.name, label: `Add ${titleCase(svc?.plain_name || svc?.name)}`, unit_price: unitPrice, quantity: Number(quantity), frequency_per_week: Number(freq) };
        if (type === "remove_service") return { ...base, service_id: serviceId, name: svc?.name, label: `Stop ${titleCase(svc?.plain_name || svc?.name)}`, unit_price: unitPrice, quantity: Number(quantity), frequency_per_week: Number(freq) };
        if (type === "change_service") return { ...base, service_id: serviceId, name: svc?.name, label: `${titleCase(svc?.name)}: ${quantity}→${newQuantity} ${svc?.unit || "units"}`, unit_price: unitPrice, quantity: Number(quantity), new_quantity: Number(newQuantity), frequency_per_week: Number(freq) };
        if (type === "pause_services") return { ...base, label: `Pause for ${weeks} week${weeks == 1 ? "" : "s"}`, weeks: Number(weeks), weekly_cost: Number(unitPrice * quantity * freq), quarter_index: Number(quarterIndex) };
        if (type === "spending_pace") return { ...base, label: `Spend ${pct > 0 ? "+" : ""}${pct}%`, pct: Number(pct) };
        if (type === "price_change") return { ...base, label: `Prices ${pct > 0 ? "+" : ""}${pct}%`, pct: Number(pct) };
        if (type === "one_off_cost") return { ...base, label: `One-off ${AUD0(amount)}`, amount: Number(amount), quarter_index: Number(quarterIndex) };
        if (type === "classification_change") return { ...base, label: `Reassessed to Level ${toClass}`, to_classification: Number(toClass) };
        return base;
    };

    const needsService = ["add_service", "remove_service", "change_service", "pause_services"].includes(type);
    const quarters = ["This quarter", "Next quarter", "In 2 quarters", "In 3 quarters"];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" data-testid="bsc1-change-sheet" onClick={onClose}>
            <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-heading text-xl text-primary-k">Set up the change</h3>
                    <button onClick={onClose} className="text-muted-k hover:text-primary-k"><X className="w-5 h-5" /></button>
                </div>

                <label className="block mt-3"><span className="text-xs text-muted-k">Type of change</span>
                    <select value={type} onChange={(e) => setType(e.target.value)} data-testid="bsc1-sheet-type" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                        <option value="add_service">Add a service</option>
                        <option value="change_service">Change a service</option>
                        <option value="remove_service">Stop a service</option>
                        <option value="pause_services">Pause services</option>
                        <option value="spending_pace">Spending pace</option>
                        <option value="price_change">Provider price change</option>
                        <option value="one_off_cost">One-off cost</option>
                        <option value="classification_change">Classification change</option>
                    </select>
                </label>

                {needsService && (
                    <label className="block mt-3"><span className="text-xs text-muted-k">Service</span>
                        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} data-testid="bsc1-sheet-service" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                            {catalogue.map((s) => <option key={s.service_id} value={s.service_id}>{titleCase(s.name)}</option>)}
                        </select>
                    </label>
                )}

                {needsService && (
                    <label className="block mt-3"><span className="text-xs text-muted-k">Price per {svc?.unit || "unit"} you pay{svc ? ` (typical ${AUD0(svc.unit_price)})` : ""}</span>
                        <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={svc ? String(svc.unit_price) : "Enter price"} data-testid="bsc1-sheet-price" className="mt-1" /></label>
                )}

                {(type === "add_service" || type === "remove_service" || type === "change_service" || type === "pause_services") && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                        <label className="block"><span className="text-xs text-muted-k">{svc?.unit === "hour" ? "Hours each visit" : "Units each visit"}{type === "change_service" ? " (now)" : ""}</span>
                            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="bsc1-sheet-qty" className="mt-1" /></label>
                        {type === "change_service" ? (
                            <label className="block"><span className="text-xs text-muted-k">Units each visit (new)</span>
                                <Input type="number" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} data-testid="bsc1-sheet-new-qty" className="mt-1" /></label>
                        ) : (
                            <label className="block"><span className="text-xs text-muted-k">Times per week</span>
                                <Input type="number" step="0.5" value={freq} onChange={(e) => setFreq(e.target.value)} data-testid="bsc1-sheet-freq" className="mt-1" /></label>
                        )}
                    </div>
                )}

                {type === "pause_services" && (
                    <label className="block mt-3"><span className="text-xs text-muted-k">For how many weeks</span>
                        <Input type="number" value={weeks} onChange={(e) => setWeeks(e.target.value)} data-testid="bsc1-sheet-weeks" className="mt-1" /></label>
                )}
                {(type === "spending_pace" || type === "price_change") && (
                    <label className="block mt-3"><span className="text-xs text-muted-k">{type === "spending_pace" ? "Spend faster (+) or slower (−) by" : "Prices up (+) or down (−) by"} %</span>
                        <Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} data-testid="bsc1-sheet-pct" className="mt-1" /></label>
                )}
                {type === "one_off_cost" && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                        <label className="block"><span className="text-xs text-muted-k">Amount</span>
                            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="bsc1-sheet-amount" className="mt-1" /></label>
                        <label className="block"><span className="text-xs text-muted-k">When</span>
                            <select value={quarterIndex} onChange={(e) => setQuarterIndex(e.target.value)} data-testid="bsc1-sheet-when" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                                {quarters.map((q, i) => <option key={i} value={i}>{q}</option>)}
                            </select></label>
                    </div>
                )}
                {type === "classification_change" && (
                    <label className="block mt-3"><span className="text-xs text-muted-k">Reassessed to level</span>
                        <select value={toClass} onChange={(e) => setToClass(e.target.value)} data-testid="bsc1-sheet-class" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Level {n}</option>)}
                        </select></label>
                )}

                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={onClose} className="text-sm text-primary-k px-4 py-2 rounded-md hover:bg-primary-k/5">Cancel</button>
                    <Button onClick={() => onSave(build())} data-testid="bsc1-sheet-save">{sheet.editId ? "Update" : "Add change"}</Button>
                </div>
            </div>
        </div>
    );
}
