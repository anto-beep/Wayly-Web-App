/**
 * WhatIfCareDialog, FUNDTRACK-1 "What if I add care?" (locked decision #3).
 * Inputs: service, date, frequency (once / every week until a date). Outputs:
 * number of visits, total budget impact at the full service price, participant
 * share, the REVISED spare (H), and any quarter boundary crossed. "Book this
 * care" persists the visits as booked (counting in G).
 */
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Loader2, CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";

const nextWeek = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };
const quarterEndGuess = () => { const d = new Date(); const m = d.getMonth(); const qEndMonth = [2, 2, 2, 5, 5, 5, 8, 8, 8, 11, 11, 11][m]; const day = [31, 31, 31, 30, 30, 30, 30, 30, 30, 31, 31, 31][m]; return new Date(d.getFullYear(), qEndMonth, day).toISOString().slice(0, 10); };
const AUD = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
const STREAMS = ["Clinical", "Independence", "Everyday Living"];

export default function WhatIfCareDialog({ pid, savedServices = [], onClose, onSaved }) {
    const first = savedServices[0];
    const [serviceName, setServiceName] = useState(first?.service_name || "");
    const [stream, setStream] = useState(first?.stream || "Everyday Living");
    const [unitPrice, setUnitPrice] = useState(first ? String(first.last_amount) : "");
    const [date, setDate] = useState(nextWeek());
    const [frequency, setFrequency] = useState("weekly");
    const [until, setUntil] = useState(quarterEndGuess());
    const [result, setResult] = useState(null);
    const [computing, setComputing] = useState(false);
    const [booking, setBooking] = useState(false);
    const timer = useRef(null);

    const pickSaved = (e) => {
        const svc = savedServices.find((s) => s.service_id === e.target.value);
        if (svc) { setServiceName(svc.service_name); setStream(svc.stream); setUnitPrice(String(svc.last_amount)); }
    };

    useEffect(() => {
        if (!serviceName || unitPrice === "") { setResult(null); return; }
        clearTimeout(timer.current);
        setComputing(true);
        timer.current = setTimeout(async () => {
            try {
                const { data } = await api.post(`/fundtrack/participants/${pid}/what-if`, {
                    service_name: serviceName, stream, unit_price: Number(unitPrice),
                    date, frequency, until: frequency === "weekly" ? until : null,
                });
                setResult(data.what_if);
            } catch { setResult(null); } finally { setComputing(false); }
        }, 350);
        return () => clearTimeout(timer.current);
    }, [pid, serviceName, stream, unitPrice, date, frequency, until]);

    const book = async () => {
        setBooking(true);
        try {
            const { data } = await api.post(`/fundtrack/participants/${pid}/what-if`, {
                service_name: serviceName, stream, unit_price: Number(unitPrice),
                date, frequency, until: frequency === "weekly" ? until : null, save: true,
            });
            toast.success("Booked. It now counts in the care you have booked.");
            onSaved?.(data.saved);
            onClose?.();
        } catch (e) { toast.error(e?.response?.data?.detail || "Could not book that care."); }
        finally { setBooking(false); }
    };

    const over = result?.revised_spare_is_negative;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" data-testid="whatif-dialog" onClick={onClose}>
            <div className="bg-white rounded-2xl p-5 max-w-lg w-full shadow-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-heading text-xl text-primary-k inline-flex items-center gap-2"><CalendarClock className="w-5 h-5 text-clay" /> What if I add care?</h3>
                    <button onClick={onClose} className="text-muted-k hover:text-primary-k" data-testid="whatif-close"><X className="w-5 h-5" /></button>
                </div>

                <div className="mt-3 space-y-3">
                    {savedServices.length > 0 && (
                        <label className="block"><span className="text-xs text-muted-k">Pick from your usual care</span>
                            <select onChange={pickSaved} data-testid="whatif-saved" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                                <option value="">Choose a service…</option>
                                {savedServices.map((s) => <option key={s.service_id} value={s.service_id}>{s.service_name} · {AUD(s.last_amount)}</option>)}
                            </select></label>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block col-span-2"><span className="text-xs text-muted-k">Service</span>
                            <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="e.g. Cleaning" data-testid="whatif-service" className="mt-1" /></label>
                        <label className="block"><span className="text-xs text-muted-k">Price per visit</span>
                            <div className="relative mt-1">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-k">$</span>
                                <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} data-testid="whatif-price" className="pl-7" /></div></label>
                        <label className="block"><span className="text-xs text-muted-k">Category</span>
                            <select value={stream} onChange={(e) => setStream(e.target.value)} data-testid="whatif-stream" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                                {STREAMS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select></label>
                        <label className="block"><span className="text-xs text-muted-k">Starting</span>
                            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="whatif-date" className="mt-1" /></label>
                        <label className="block"><span className="text-xs text-muted-k">How often</span>
                            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} data-testid="whatif-frequency" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                                <option value="once">Just once</option>
                                <option value="weekly">Every week</option>
                            </select></label>
                        {frequency === "weekly" && (
                            <label className="block col-span-2"><span className="text-xs text-muted-k">Until</span>
                                <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} data-testid="whatif-until" className="mt-1" /></label>
                        )}
                    </div>

                    <div className="rounded-2xl border p-4" style={{ borderColor: over ? "rgba(180,71,43,0.35)" : "rgba(14,77,82,0.2)", backgroundColor: over ? "rgba(180,71,43,0.06)" : "rgba(14,77,82,0.05)" }} data-testid="whatif-result">
                        {computing ? (
                            <p className="text-sm text-muted-k inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Working it out…</p>
                        ) : !result ? (
                            <p className="text-sm text-muted-k">Pick a service and price to see the effect.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <Stat label="Visits" value={result.visits} />
                                    <Stat label="Total cost" value={AUD(result.total_budget_impact_aud)} />
                                    <Stat label="Est. participant share" value={AUD(result.participant_share_aud)} />
                                    <Stat label="Spare for extra care, after" value={AUD(result.revised_spare_aud)} tone={over ? "over" : "ok"} testid="whatif-revised-h" />
                                </div>
                                {result.quarter_boundary_crossed && (
                                    <p className="mt-3 text-xs text-primary-k/80 inline-flex items-start gap-1.5" data-testid="whatif-boundary">
                                        <AlertTriangle className="w-4 h-4 text-clay mt-0.5 flex-none" />
                                        {result.visits_next_quarter} of these visits fall in next quarter and use next quarter's funding, shown as unconfirmed until that quarter starts.
                                    </p>
                                )}
                                {over ? (
                                    <p className="mt-3 text-sm font-medium text-terracotta">This would take the spare below zero. It may push the quarter into overspend, check prices or talk to the provider first.</p>
                                ) : (
                                    <p className="mt-3 text-sm text-sage inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> This fits within what's left this quarter.</p>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex justify-end gap-2">
                        <button onClick={onClose} className="text-sm text-primary-k px-4 py-2 rounded-md hover:bg-primary-k/5">Close</button>
                        <Button onClick={book} disabled={booking || !result} data-testid="whatif-book">{booking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Book this care"}</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value, tone, testid }) {
    const color = tone === "over" ? "#B4472B" : "#0E4D52";
    return (
        <div data-testid={testid}>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-k">{label}</p>
            <p className="font-heading text-xl mt-0.5 tabular-nums" style={{ color }}>{value}</p>
        </div>
    );
}
