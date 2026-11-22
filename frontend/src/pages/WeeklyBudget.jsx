/**
 * WeeklyBudget — the FUNDTRACK-1 "weekly screen". Order locked by spec:
 * the dashboard ladder card (unchanged), then the booked care behind G visit by
 * visit, then the three actions: Add a charge, What if I add care?, Something
 * changed. Below that: what's been used, what a statement has replaced, and any
 * pending visits. Lives inside the app — no new nav tool.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import BudgetLadderCard from "@/components/BudgetLadderCard";
import FundtrackAlerts from "@/components/fundtrack/FundtrackAlerts";
import ChargeEntryDialog from "@/components/fundtrack/ChargeEntryDialog";
import WhatIfCareDialog from "@/components/fundtrack/WhatIfCareDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, CalendarClock, RefreshCw, X, CheckCircle2, Archive, Clock, Loader2, CalendarDays } from "lucide-react";

const AUD = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
const fmtDate = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); } catch { return iso; } };
const weekRange = () => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const d = (x) => x.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    return `${d(mon)} – ${d(sun)}`;
};

const CHANGES = [
    { key: "did_not_happen", label: "Didn't happen" },
    { key: "shorter", label: "Shorter" },
    { key: "longer", label: "Longer" },
    { key: "extra_visit", label: "Extra visit" },
    { key: "cancelled", label: "Cancelled late" },
];

export default function WeeklyBudget() {
    const { activeId, active } = useParticipants();
    const pid = activeId || active?.id;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState(null);       // "charge" | "whatif"
    const [changeVisit, setChangeVisit] = useState(null); // visit row being changed

    const load = useCallback(async () => {
        if (!pid) { setLoading(false); return; }
        try { const { data } = await api.get(`/fundtrack/participants/${pid}/overview`); setData(data); }
        catch { setData(null); } finally { setLoading(false); }
    }, [pid]);
    useEffect(() => { load(); }, [load]);

    const onAlertAction = (action) => {
        if (action === "what_if") setDialog("whatif");
        else if (action === "upload") window.location.assign("/app/statements/upload");
        else if (action === "letter") window.location.assign("/app/letters");
    };

    if (!pid) {
        return (
            <div className="max-w-2xl" data-testid="weekly-no-participant">
                <h1 className="font-heading text-3xl text-primary-k">This week's budget</h1>
                <p className="text-muted-k mt-2">Pick a participant from the switcher at the top.</p>
            </div>
        );
    }

    if (data && !data.enabled) {
        return (
            <div className="max-w-2xl" data-testid="weekly-disabled">
                <h1 className="font-heading text-3xl text-primary-k">This week's budget</h1>
                <p className="text-muted-k mt-2">Budget tracking isn't switched on for this household yet.</p>
            </div>
        );
    }

    return (
        <div className="max-w-[900px] space-y-5" data-testid="weekly-page">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="font-heading text-3xl sm:text-4xl font-bold text-primary-k tracking-tight">This Week's Budget</h1>
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary-k/[0.06] border border-primary-k/20 px-3 py-1 text-xs font-semibold text-primary-k" data-testid="weekly-week-range"><CalendarDays className="w-3.5 h-3.5" /> {weekRange()}</span>
                    </div>
                    {data && <p className="text-sm text-muted-k mt-0.5" data-testid="weekly-context">{data.participant_name} · {data.quarter_label} · Classification {data.classification}</p>}
                </div>
                <button onClick={load} className="inline-flex items-center gap-1.5 text-xs text-muted-k hover:text-primary-k" data-testid="weekly-refresh"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
            </div>

            {loading ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 animate-pulse h-48" data-testid="weekly-loading" />
            ) : !data ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 text-sm text-muted-k" data-testid="weekly-empty">
                    We couldn't load the budget. <button onClick={load} className="text-primary-k underline">Try again</button>.
                </div>
            ) : (
                <>
                    {/* 1 · the dashboard card, unchanged */}
                    {data.ladder && <BudgetLadderCard ladder={data.ladder} />}

                    {/* alerts */}
                    <FundtrackAlerts alerts={data.alerts} onAction={onAlertAction} />

                    {/* 2 · booked care behind G, visit by visit */}
                    <div className="rounded-2xl border border-primary-k/10 bg-white p-4" data-testid="weekly-booked">
                        <h2 className="font-heading text-lg text-primary-k mb-2 inline-flex items-center gap-2"><CalendarDays className="w-4 h-4 text-teal" /> Care You've Booked</h2>
                        {(data.booked || []).length === 0 ? (
                            <p className="text-sm text-muted-k">Nothing booked ahead this quarter. Use "What if I add care?" to plan a visit, then book it.</p>
                        ) : (
                            <ul className="space-y-2">
                                {data.booked.map((b) => (
                                    <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-primary-k/10 px-3 py-2" data-testid={`weekly-booked-${b.id}`}>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-primary-k truncate">{b.service_name}</span>
                                            <span className="block text-xs text-muted-k">{fmtDate(b.date)} · {b.stream}{b.unpriced ? " · unpriced" : ""}</span>
                                        </span>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-sm font-semibold text-primary-k tabular-nums">{b.unpriced ? "—" : AUD(b.amount)}</span>
                                            <button onClick={() => setChangeVisit(b)} data-testid={`weekly-change-${b.id}`} className="text-xs text-primary-k underline">Something changed</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* 3 · the three actions, in this order */}
                    <div className="grid sm:grid-cols-3 gap-3" data-testid="weekly-actions">
                        <ActionCard testid="weekly-add-charge" Icon={Plus} title="Add a charge" hint="Record what actually happened" onClick={() => setDialog("charge")} tone="teal" />
                        <ActionCard testid="weekly-whatif" Icon={CalendarClock} title="What if I add care?" hint="See the spare before you book" onClick={() => setDialog("whatif")} tone="clay" />
                        <ActionCard testid="weekly-something-changed" Icon={RefreshCw} title="Something changed" hint="A visit was missed or different" onClick={() => setChangeVisit(data.booked?.[0] || { blank: true })} tone="gold" />
                    </div>

                    {/* what you've used */}
                    {(data.used || []).length > 0 && (
                        <div className="rounded-2xl border border-primary-k/10 bg-white p-4" data-testid="weekly-used">
                            <h2 className="font-heading text-lg text-primary-k mb-2 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-sage" /> What you've recorded this quarter</h2>
                            <ul className="divide-y divide-primary-k/10">
                                {data.used.slice(0, 12).map((u) => (
                                    <li key={u.id} className="flex items-center justify-between gap-3 py-2" data-testid={`weekly-used-${u.id}`}>
                                        <span className="min-w-0">
                                            <span className="block text-sm text-primary-k truncate">{u.service_name}</span>
                                            <span className="block text-xs text-muted-k">{fmtDate(u.date)} · {u.source === "invoice" ? "from an invoice" : u.source === "catch_up" ? "catch-up" : "you entered"}</span>
                                        </span>
                                        <span className="text-sm font-semibold text-primary-k tabular-nums shrink-0">{u.unpriced ? "unpriced" : AUD(u.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* superseded by a statement */}
                    {(data.superseded || []).length > 0 && (
                        <div className="rounded-2xl border border-primary-k/10 bg-primary-k/[0.03] p-4" data-testid="weekly-superseded">
                            <h2 className="font-heading text-base text-primary-k mb-1 inline-flex items-center gap-2"><Archive className="w-4 h-4 text-muted-k" /> Replaced by your statement</h2>
                            <p className="text-xs text-muted-k mb-2">A statement is the official record for its period, so we've set these entries aside. We kept them so you can still see what you logged.</p>
                            <ul className="space-y-1">
                                {data.superseded.slice(0, 8).map((s) => (
                                    <li key={s.id} className="flex items-center justify-between gap-3 text-xs text-muted-k" data-testid={`weekly-superseded-${s.id}`}>
                                        <span className="truncate line-through">{s.service_name} · {fmtDate(s.date)}</span>
                                        <span className="shrink-0 line-through">{s.unpriced ? "unpriced" : AUD(s.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* pending */}
                    {(data.pending || []).length > 0 && (
                        <div className="rounded-2xl border border-clay/30 bg-clay/[0.05] p-4" data-testid="weekly-pending">
                            <h2 className="font-heading text-base text-primary-k mb-1 inline-flex items-center gap-2"><Clock className="w-4 h-4 text-clay" /> Possible pending visits</h2>
                            <p className="text-xs text-muted-k mb-2">Booked visits whose date has passed but aren't confirmed yet. We haven't counted these in what's left — confirm or change them.</p>
                            <ul className="space-y-2">
                                {data.pending.map((p) => (
                                    <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-clay/20 bg-white px-3 py-2" data-testid={`weekly-pending-${p.id}`}>
                                        <span className="text-sm text-primary-k truncate">{p.service_name} · {fmtDate(p.date)}</span>
                                        <button onClick={() => setChangeVisit(p)} className="text-xs text-clay underline shrink-0">Confirm or change</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <p className="text-[11px] text-muted-k" data-testid="weekly-source-note">{data.source_note}</p>
                </>
            )}

            {dialog === "charge" && <ChargeEntryDialog pid={pid} savedServices={data?.saved_services || []} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}
            {dialog === "whatif" && <WhatIfCareDialog pid={pid} savedServices={data?.saved_services || []} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}
            {changeVisit && <VisitChangeDialog pid={pid} visit={changeVisit} onClose={() => setChangeVisit(null)} onSaved={() => { setChangeVisit(null); load(); }} />}
        </div>
    );
}

function ActionCard({ title, hint, Icon, onClick, tone = "teal", testid }) {
    const tones = {
        teal: { card: "border-primary-k bg-primary-k", title: "text-white", hint: "text-white/85", icon: "bg-white/20 text-white" },
        clay: { card: "border-terracotta bg-terracotta", title: "text-white", hint: "text-white/85", icon: "bg-white/20 text-white" },
        gold: { card: "border-[#C2683D] bg-[#C2683D]", title: "text-white", hint: "text-white/85", icon: "bg-white/20 text-white" },
    };
    const t = tones[tone] || tones.teal;
    return (
        <button onClick={onClick} data-testid={testid}
            className={`text-left rounded-xl border p-3 transition-all hover:shadow-sm ${t.card}`}>
            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${t.icon}`}><Icon className="w-4 h-4" /></span>
            <p className={`mt-2 text-sm font-semibold ${t.title}`}>{title}</p>
            <p className={`text-xs mt-0.5 ${t.hint}`}>{hint}</p>
        </button>
    );
}

/** Mark what changed for a visit (no free text required). */
function VisitChangeDialog({ pid, visit, onClose, onSaved }) {
    const [change, setChange] = useState("did_not_happen");
    const [amount, setAmount] = useState(visit?.amount ? String(visit.amount) : "");
    const [name, setName] = useState("");
    const [date, setDate] = useState(visit?.date || new Date().toISOString().slice(0, 10));
    const [busy, setBusy] = useState(false);
    const needsAmount = change === "shorter" || change === "longer";
    const isExtra = change === "extra_visit";

    const submit = async () => {
        setBusy(true);
        try {
            await api.post(`/fundtrack/participants/${pid}/something-changed`, {
                charge_id: visit?.blank ? null : visit?.id,
                service_name: isExtra ? (name || "Extra visit") : visit?.service_name,
                stream: visit?.stream,
                date: isExtra ? date : (visit?.date || date),
                change,
                amount: (needsAmount || isExtra) ? (amount === "" ? null : Number(amount)) : null,
                scope: "just_this",
            });
            toast.success("Noted. The figures have been updated.");
            onSaved?.();
        } catch (e) { toast.error(e?.response?.data?.detail || "Could not record that."); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" data-testid="visit-change-dialog" onClick={onClose}>
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-heading text-lg text-primary-k">Something changed</h3>
                    <button onClick={onClose} className="text-muted-k hover:text-primary-k"><X className="w-5 h-5" /></button>
                </div>
                {!visit?.blank && <p className="text-xs text-muted-k mt-1">{visit?.service_name} · {fmtDate(visit?.date)}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {CHANGES.map((c) => (
                        <button key={c.key} onClick={() => setChange(c.key)} data-testid={`visit-change-${c.key}`}
                            className={`rounded-lg border px-3 py-2 text-sm text-left ${change === c.key ? "border-primary-k bg-primary-k/5 font-semibold text-primary-k" : "border-primary-k/15 text-primary-k/80"}`}>
                            {c.label}
                        </button>
                    ))}
                </div>
                {isExtra && (
                    <label className="block mt-3"><span className="text-xs text-muted-k">What was the extra visit?</span>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Extra cleaning" data-testid="visit-change-name" className="mt-1" /></label>
                )}
                {(needsAmount || isExtra) && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        <label className="block"><span className="text-xs text-muted-k">Amount</span>
                            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="visit-change-amount" className="mt-1" /></label>
                        {isExtra && <label className="block"><span className="text-xs text-muted-k">When</span>
                            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" /></label>}
                    </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="text-sm text-primary-k px-4 py-2 rounded-md hover:bg-primary-k/5">Cancel</button>
                    <Button onClick={submit} disabled={busy} data-testid="visit-change-save">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
                </div>
            </div>
        </div>
    );
}
