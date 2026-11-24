/**
 * FundtrackPanel, compact FUNDTRACK-1 capture strip for the Today dashboard
 * and Budget Scenarios. Shows the alerts and the primary actions (Add a charge,
 * What if I add care?, open the weekly view). Hosts the charge-entry + what-if
 * dialogs. Renders nothing when the feature is off for the household.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Plus, CalendarClock, ArrowRight } from "lucide-react";
import FundtrackAlerts from "./FundtrackAlerts";
import ChargeEntryDialog from "./ChargeEntryDialog";
import WhatIfCareDialog from "./WhatIfCareDialog";

export default function FundtrackPanel({ participantId, onChanged }) {
    const [data, setData] = useState(null);
    const [dialog, setDialog] = useState(null); // "charge" | "whatif"
    const navigate = useNavigate();

    const load = useCallback(async () => {
        if (!participantId) return;
        try {
            const { data } = await api.get(`/fundtrack/participants/${participantId}/overview`);
            setData(data);
        } catch { setData(null); }
    }, [participantId]);

    useEffect(() => { load(); }, [load]);

    const handleSaved = () => { load(); onChanged?.(); };
    // Adding a charge from the dashboard jumps the user to the Weekly View so
    // they can see the updated figures and the new entry in context.
    const handleChargeSaved = () => { load(); onChanged?.(); navigate("/app/weekly-budget"); };
    const onAlertAction = (action) => {
        if (action === "what_if") setDialog("whatif");
        else if (action === "weekly") navigate("/app/weekly-budget");
        else if (action === "upload") navigate("/app/statements/upload");
        else if (action === "letter") navigate("/app/letters");
    };

    if (!data || !data.enabled) return null;

    return (
        <section className="rounded-2xl border border-primary-k/15 overflow-hidden shadow-sm" data-testid="fundtrack-panel">
            {/* prominent teal header, easy to spot, with a graphic badge */}
            <div className="panel-solid-teal relative bg-[linear-gradient(135deg,#0E4D52,#13646A)] px-5 py-4 text-white">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                            <CalendarClock className="h-5 w-5 text-white" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/70">Track the spend</p>
                            <h3 className="font-heading text-lg sm:text-xl leading-tight text-white">Keep This Quarter's Figures Real</h3>
                        </div>
                    </div>
                    <button onClick={() => navigate("/app/weekly-budget")} data-testid="fundtrack-open-weekly"
                        className="inline-flex items-center gap-1.5 rounded-pill bg-white px-4 py-2 text-sm font-bold text-primary-k shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all">
                        Weekly View <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="bg-surface p-4 space-y-3">
                <FundtrackAlerts alerts={data.alerts} onAction={onAlertAction} />

                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setDialog("charge")} data-testid="fundtrack-add-charge"
                        className="inline-flex items-center gap-1.5 rounded-pill bg-primary-k text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#09363a] transition-colors">
                        <Plus className="w-4 h-4" /> Add a charge
                    </button>
                    <button onClick={() => setDialog("whatif")} data-testid="fundtrack-whatif"
                        className="inline-flex items-center gap-1.5 rounded-pill border border-primary-k/25 px-4 py-2.5 text-sm font-semibold text-primary-k hover:border-clay/50 transition-colors">
                        <CalendarClock className="w-4 h-4" /> What if I add care?
                    </button>
                </div>

                {data.booked_unpriced_count > 0 && (
                    <p className="text-[11px] text-muted-k" data-testid="fundtrack-unpriced-note">
                        {data.booked_unpriced_count} unpriced visit{data.booked_unpriced_count === 1 ? "" : "s"} booked, add an amount to count {data.booked_unpriced_count === 1 ? "it" : "them"}.
                    </p>
                )}
            </div>

            {dialog === "charge" && (
                <ChargeEntryDialog pid={participantId} savedServices={data.saved_services} onClose={() => setDialog(null)} onSaved={handleChargeSaved} />
            )}
            {dialog === "whatif" && (
                <WhatIfCareDialog pid={participantId} savedServices={data.saved_services} onClose={() => setDialog(null)} onSaved={handleSaved} />
            )}
        </section>
    );
}
