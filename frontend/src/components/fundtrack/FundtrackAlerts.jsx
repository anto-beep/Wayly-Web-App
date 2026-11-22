/**
 * FundtrackAlerts — FUNDTRACK-1 alerts (forfeit risk, shortfall, statement
 * overdue, possible billing difference). Rendered on the Today dashboard, the
 * weekly screen and Budget Scenarios. Copy comes from the server.
 */
import React from "react";
import { AlertTriangle, Clock, Receipt, HelpCircle } from "lucide-react";

const ICON = { forfeit_risk: AlertTriangle, shortfall_risk: AlertTriangle, statement_overdue: Clock, possible_billing_difference: HelpCircle };
const TONE = {
    warning: { bg: "rgba(194,104,61,0.08)", border: "rgba(194,104,61,0.35)", icon: "#B25C2B", title: "#6B4A0F" },
    danger: { bg: "rgba(180,71,43,0.08)", border: "rgba(180,71,43,0.35)", icon: "#B4472B", title: "#B4472B" },
    info: { bg: "rgba(14,77,82,0.06)", border: "rgba(14,77,82,0.20)", icon: "#0E4D52", title: "#0E4D52" },
};

export default function FundtrackAlerts({ alerts }) {
    if (!alerts || alerts.length === 0) return null;
    return (
        <div className="space-y-2" data-testid="fundtrack-alerts">
            {alerts.map((a) => {
                const Icon = ICON[a.kind] || Receipt;
                const t = TONE[a.severity] || TONE.info;
                return (
                    <div key={a.id} className="rounded-2xl border p-4 flex items-start gap-3"
                        style={{ backgroundColor: t.bg, borderColor: t.border }} data-testid={`ft-alert-${a.kind}`}>
                        <span className="mt-0.5 flex-none"><Icon className="w-5 h-5" style={{ color: t.icon }} /></span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold" style={{ color: t.title }}>{a.title}</p>
                            <p className="text-sm text-primary-k/80 mt-0.5 leading-relaxed">{a.body}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
