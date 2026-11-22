/**
 * FundtrackPanel — compact FUNDTRACK-1 capture strip for the Today dashboard
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
    const onAlertAction = (action) => {
        if (action === "what_if") setDialog("whatif");
        else if (action === "weekly") navigate("/app/weekly-budget");
        else if (action === "upload") navigate("/app/statements/upload");
        else if (action === "letter") navigate("/app/letters");
    };

    if (!data || !data.enabled) return null;

    return (
        <section className="rounded-2xl border border-primary-k/15 bg-surface p-4 space-y-3" data-testid="fundtrack-panel">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-clay">Track the spend</p>
                    <h3 className="font-heading text-lg text-primary-k leading-tight">Keep this quarter's figures real</h3>
                </div>
                <button onClick={() => navigate("/app/weekly-budget")} data-testid="fundtrack-open-weekly"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary-k hover:underline">
                    Weekly view <ArrowRight className="w-4 h-4" />
                </button>
            </div>

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
                    {data.booked_unpriced_count} unpriced visit{data.booked_unpriced_count === 1 ? "" : "s"} booked — add an amount to count {data.booked_unpriced_count === 1 ? "it" : "them"}.
                </p>
            )}

            {dialog === "charge" && (
                <ChargeEntryDialog pid={participantId} savedServices={data.saved_services} onClose={() => setDialog(null)} onSaved={handleSaved} />
            )}
            {dialog === "whatif" && (
                <WhatIfCareDialog pid={participantId} savedServices={data.saved_services} onClose={() => setDialog(null)} onSaved={handleSaved} />
            )}
        </section>
    );
}
