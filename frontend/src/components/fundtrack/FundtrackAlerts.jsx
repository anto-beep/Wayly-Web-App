/**
 * FundtrackAlerts — FUNDTRACK-1 alerts (forfeit risk, shortfall, statement
 * overdue, possible billing difference). Rendered on the Today dashboard, the
 * weekly screen and Budget Scenarios. Copy comes from the server.
 */
import React from "react";
import { AlertTriangle, Clock, Receipt, HelpCircle } from "lucide-react";
import { useTheme } from "@/uxf/theme";

const ICON = { forfeit_risk: AlertTriangle, shortfall_risk: AlertTriangle, statement_overdue: Clock, possible_billing_difference: HelpCircle };
const TONE_LIGHT = {
    warning: { bg: "rgba(194,104,61,0.08)", border: "rgba(194,104,61,0.35)", icon: "#B25C2B", title: "#6B4A0F", body: "rgba(14,77,82,0.80)" },
    danger: { bg: "rgba(180,71,43,0.08)", border: "rgba(180,71,43,0.35)", icon: "#B4472B", title: "#B4472B", body: "rgba(14,77,82,0.80)" },
    info: { bg: "rgba(14,77,82,0.06)", border: "rgba(14,77,82,0.20)", icon: "#0E4D52", title: "#0E4D52", body: "rgba(14,77,82,0.80)" },
};
const TONE_DARK = {
    warning: { bg: "rgba(232,154,111,0.16)", border: "rgba(232,154,111,0.42)", icon: "#E89A6F", title: "#F2CDB2", body: "rgba(240,240,240,0.88)" },
    danger: { bg: "rgba(240,133,122,0.16)", border: "rgba(240,133,122,0.42)", icon: "#F0857A", title: "#F4C3BB", body: "rgba(240,240,240,0.88)" },
    info: { bg: "rgba(127,200,160,0.14)", border: "rgba(127,200,160,0.36)", icon: "#7FC8A0", title: "#CDE7E6", body: "rgba(240,240,240,0.88)" },
};

export default function FundtrackAlerts({ alerts }) {
    const { isDark } = useTheme();
    const TONE = isDark ? TONE_DARK : TONE_LIGHT;
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
