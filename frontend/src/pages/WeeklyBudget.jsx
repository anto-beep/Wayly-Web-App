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
import { Plus, CalendarClock, RefreshCw, X, CheckCircle2, Archive, Clock, Loader2, CalendarDays, Pencil, Trash2, Search, ArrowUpDown } from "lucide-react";
import { useTheme } from "@/uxf/theme";

const AUD = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
const toTitle = (s) => String(s || "").replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
const SOURCE_LABEL = { entered: "You Entered", invoice: "From An Invoice", catch_up: "Catch-Up", booked: "Booked" };
const sourceLabel = (s) => SOURCE_LABEL[s] || "You Entered";
const STREAMS = ["Clinical", "Independence", "Everyday Living"];
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); } catch { return iso; } };
const fmtDateFull = (iso) => { if (!iso) return ""; try { const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; } catch { return iso; } };
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

                    {/* what you've recorded — sortable/filterable table with edit + delete */}
                    {(data.used || []).length > 0 && (
                        <UsedEntriesTable items={data.used} onChanged={load} pid={pid} savedServices={data.saved_services || []} />
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
    const { isDark } = useTheme();
    const tones = {
        teal: isDark ? "#1A696E" : "#0E4D52",
        clay: isDark ? "#C85A3C" : "#B4472B",
        gold: isDark ? "#D98A4E" : "#C2683D",
    };
    const bg = tones[tone] || tones.teal;
    return (
        <button onClick={onClick} data-testid={testid}
            className="text-left rounded-xl border p-3 transition-all hover:shadow-sm" style={{ backgroundColor: bg, borderColor: bg }}>
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 text-white"><Icon className="w-4 h-4" /></span>
            <p className="mt-2 text-sm font-semibold text-white">{title}</p>
            <p className="text-xs mt-0.5 text-white/85">{hint}</p>
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
            toast.success("Noted — the figures have been updated. Check your latest balance.");
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

/** Sortable + filterable table of recorded entries, with edit + delete. */
function UsedEntriesTable({ items, onChanged, pid, savedServices = [] }) {
    const [query, setQuery] = useState("");
    const [source, setSource] = useState("all");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [sortKey, setSortKey] = useState("date");
    const [sortDir, setSortDir] = useState("desc");
    const [editing, setEditing] = useState(null);
    const [confirmId, setConfirmId] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [adding, setAdding] = useState(false);

    const sources = Array.from(new Set(items.map((i) => i.source))).filter(Boolean);
    const filtered = items
        .filter((i) => source === "all" || i.source === source)
        .filter((i) => !query.trim() || (i.service_name || "").toLowerCase().includes(query.trim().toLowerCase()))
        .filter((i) => { const d = (i.date || "").slice(0, 10); if (fromDate && d < fromDate) return false; if (toDate && d > toDate) return false; return true; });
    const sorted = [...filtered].sort((a, b) => {
        let av, bv;
        if (sortKey === "service") { av = (a.service_name || "").toLowerCase(); bv = (b.service_name || "").toLowerCase(); }
        else if (sortKey === "amount") { av = a.amount ?? -1; bv = b.amount ?? -1; }
        else { av = a.date || ""; bv = b.date || ""; }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
    });

    const toggleSort = (key) => {
        if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else { setSortKey(key); setSortDir(key === "service" ? "asc" : "desc"); }
    };

    const del = async (id) => {
        setBusyId(id);
        try { await api.delete(`/fundtrack/charges/${id}`); toast.success("Entry deleted. Your budget's been updated — check your latest balance."); setConfirmId(null); onChanged?.(); }
        catch (e) { toast.error(e?.response?.data?.detail || "Could not delete that entry."); }
        finally { setBusyId(null); }
    };

    const SortHead = ({ k, children, align = "left" }) => (
        <th className={`px-3 py-2 font-semibold text-${align}`}>
            <button onClick={() => toggleSort(k)} data-testid={`weekly-used-sort-${k}`} className={`inline-flex items-center gap-1 hover:text-primary-k ${align === "right" ? "flex-row-reverse" : ""}`}>
                {children}
                <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? "text-primary-k" : "text-muted-k/40"}`} />
            </button>
        </th>
    );

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-4" data-testid="weekly-used">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h2 className="font-heading text-lg text-primary-k inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-sage" /> What You Have Recorded This Quarter</h2>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-muted-k absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Services" data-testid="weekly-used-search"
                            className="pl-7 pr-3 py-1.5 text-sm rounded-lg border border-primary-k/15 bg-white w-40 sm:w-48" />
                    </div>
                    <select value={source} onChange={(e) => setSource(e.target.value)} data-testid="weekly-used-filter-source"
                        className="py-1.5 px-2 text-sm rounded-lg border border-primary-k/15 bg-white text-primary-k">
                        <option value="all">All Sources</option>
                        {sources.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
                    </select>
                    <div className="flex items-center gap-1.5 text-xs text-muted-k">
                        <span>From</span>
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="weekly-used-filter-from" className="py-1.5 px-2 rounded-lg border border-primary-k/15 bg-white text-primary-k" />
                        <span>To</span>
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="weekly-used-filter-to" className="py-1.5 px-2 rounded-lg border border-primary-k/15 bg-white text-primary-k" />
                    </div>
                    <button onClick={() => setAdding(true)} data-testid="weekly-used-add" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-k px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-k/90 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Add Entry
                    </button>
                </div>
            </div>
            {sorted.length === 0 ? (
                <p className="text-sm text-muted-k py-6 text-center" data-testid="weekly-used-empty">No Entries Match Your Filter.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse" data-testid="weekly-used-table">
                        <thead>
                            <tr className="text-xs uppercase tracking-wider text-muted-k border-b border-primary-k/10">
                                <SortHead k="service">Service</SortHead>
                                <SortHead k="date">Date</SortHead>
                                <th className="px-3 py-2 text-left font-semibold">Source</th>
                                <SortHead k="amount" align="right">Amount</SortHead>
                                <th className="px-3 py-2 text-right font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((u) => (
                                <tr key={u.id} className="border-b border-primary-k/5 hover:bg-primary-k/[0.03] transition-colors" data-testid={`weekly-used-${u.id}`}>
                                    <td className="px-3 py-2.5 text-primary-k font-medium">{toTitle(u.service_name)}</td>
                                    <td className="px-3 py-2.5 text-muted-k whitespace-nowrap">{fmtDateFull(u.date)}</td>
                                    <td className="px-3 py-2.5"><span className="inline-block rounded-pill bg-primary-k/[0.08] px-2 py-0.5 text-xs font-medium text-primary-k whitespace-nowrap">{sourceLabel(u.source)}</span></td>
                                    <td className="px-3 py-2.5 text-right font-semibold text-primary-k tabular-nums whitespace-nowrap">{u.unpriced ? "Unpriced" : AUD(u.amount)}</td>
                                    <td className="px-3 py-2.5">
                                        {confirmId === u.id ? (
                                            <div className="flex items-center justify-end gap-3">
                                                <button onClick={() => del(u.id)} disabled={busyId === u.id} data-testid={`weekly-used-delete-confirm-${u.id}`} className="text-xs font-semibold text-terracotta hover:underline">{busyId === u.id ? "…" : "Confirm Delete"}</button>
                                                <button onClick={() => setConfirmId(null)} className="text-xs text-muted-k hover:underline">Cancel</button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-3">
                                                <button onClick={() => setEditing(u)} data-testid={`weekly-used-edit-${u.id}`} className="inline-flex items-center gap-1 text-xs text-primary-k hover:underline"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                                <button onClick={() => setConfirmId(u.id)} data-testid={`weekly-used-delete-${u.id}`} className="inline-flex items-center gap-1 text-xs text-terracotta hover:underline"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {editing && <EditEntryDialog entry={editing} pid={pid} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged?.(); }} />}
            {adding && <EditEntryDialog pid={pid} savedServices={savedServices} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged?.(); }} />}
        </div>
    );
}

/** Add (POST) or edit (PATCH) a recorded entry. */
function EditEntryDialog({ entry, pid, savedServices = [], onClose, onSaved }) {
    const isCreate = !entry?.id;
    const [serviceName, setServiceName] = useState(entry?.service_name || "");
    const [date, setDate] = useState((entry?.date || todayISO()).slice(0, 10));
    const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : "");
    const [stream, setStream] = useState(entry?.stream || "Everyday Living");
    const [busy, setBusy] = useState(false);

    const save = async () => {
        if (!serviceName.trim()) { toast.error("Add a service name."); return; }
        setBusy(true);
        try {
            if (isCreate) {
                await api.post(`/fundtrack/participants/${pid}/charges`, {
                    source: "entered", service_name: serviceName.trim(), stream,
                    date: date || todayISO(), amount: amount === "" ? null : Number(amount),
                });
                toast.success("Entry added. Your budget's been updated — check your latest balance.");
            } else {
                await api.patch(`/fundtrack/charges/${entry.id}`, {
                    service_name: serviceName.trim(), date, amount: amount === "" ? null : Number(amount),
                });
                toast.success("Entry updated. Your budget's been updated — check your latest balance.");
            }
            onSaved?.();
        } catch (e) { toast.error(e?.response?.data?.detail || "Could not save that entry."); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" data-testid="edit-entry-dialog" onClick={onClose}>
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-heading text-lg text-primary-k">{isCreate ? "Add Entry" : "Edit Entry"}</h3>
                    <button onClick={onClose} className="text-muted-k hover:text-primary-k" data-testid="edit-entry-close"><X className="w-5 h-5" /></button>
                </div>
                {isCreate && savedServices.length > 0 && (
                    <div className="mt-3">
                        <span className="text-xs text-muted-k">Quick pick from your usual care</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {savedServices.slice(0, 8).map((s) => (
                                <button key={s.service_id} data-testid={`edit-entry-pick-${s.service_id}`}
                                    onClick={() => { setServiceName(s.service_name); setStream(s.stream || "Everyday Living"); if (s.last_amount != null) setAmount(String(s.last_amount)); }}
                                    className="text-xs rounded-pill border border-primary-k/20 px-2.5 py-1 text-primary-k hover:border-clay/50 transition-colors">{s.service_name}</button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="mt-3 space-y-3">
                    <label className="block"><span className="text-xs text-muted-k">Service</span>
                        <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="e.g. Personal care" data-testid="edit-entry-service" className="mt-1" /></label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block"><span className="text-xs text-muted-k">Date</span>
                            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="edit-entry-date" className="mt-1" /></label>
                        <label className="block"><span className="text-xs text-muted-k">Amount</span>
                            <div className="relative mt-1">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-k">$</span>
                                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Unpriced" data-testid="edit-entry-amount" className="pl-7" /></div></label>
                    </div>
                    {isCreate && (
                        <label className="block"><span className="text-xs text-muted-k">Category</span>
                            <select value={stream} onChange={(e) => setStream(e.target.value)} data-testid="edit-entry-stream" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                                {STREAMS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select></label>
                    )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="text-sm text-primary-k px-4 py-2 rounded-md hover:bg-primary-k/5">Cancel</button>
                    <Button onClick={save} disabled={busy || !serviceName.trim()} data-testid="edit-entry-save">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (isCreate ? "Add Entry" : "Save Changes")}</Button>
                </div>
            </div>
        </div>
    );
}
