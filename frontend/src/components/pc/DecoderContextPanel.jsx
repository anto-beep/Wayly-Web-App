import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FileText, AlertTriangle, Info } from "lucide-react";

/**
 * WS4, Decoder integration panel. Reads the most recent decoded statement
 * for the current user's household and surfaces:
 *   - Statement Decoder anomalies filtered to the selected service.
 *   - Prior charged rates for the service so the user can spot changes.
 *
 * Hidden by default; render is gated by the `ppc_decoder_integration`
 * feature flag which is polled at mount time.
 */
export default function DecoderContextPanel({ service }) {
    const [flagOn, setFlagOn] = useState(false);
    const [context, setContext] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        api.get("/features/ppc_decoder_integration")
            .then((r) => setFlagOn(Boolean(r.data?.enabled)))
            .catch(() => setFlagOn(false));
    }, []);

    useEffect(() => {
        if (!flagOn || !service) return;
        setLoading(true);
        api.get("/ppc/decoder-context", { params: { service } })
            .then((r) => setContext(r.data || null))
            .catch(() => setContext(null))
            .finally(() => setLoading(false));
    }, [flagOn, service]);

    if (!flagOn) return null;
    if (loading) return (
        <div className="bg-surface border border-kindred rounded-2xl p-4 text-sm text-muted-k" data-testid="pc-decoder-loading">
            Loading decoder context…
        </div>
    );
    if (!context || (!context.line_items?.length && !context.anomalies?.length)) return null;

    return (
        <div
            className="bg-primary-k/[0.04] border border-primary-k/25 rounded-2xl p-5 space-y-3"
            data-testid="pc-decoder-context"
        >
            <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary-k" aria-hidden="true" />
                <div className="text-sm font-medium text-primary-k">From your recent statement</div>
                {context.statement?.period_label && (
                    <span className="text-xs text-muted-k">· {context.statement.period_label}</span>
                )}
            </div>

            {context.anomalies?.length > 0 && (
                <div className="space-y-1.5" data-testid="pc-decoder-anomalies">
                    {context.anomalies.slice(0, 3).map((a, i) => (
                        <div key={i} className="text-xs text-primary-k flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-clay flex-shrink-0" aria-hidden="true" />
                            <span>
                                <span className="font-medium">{a.rule}</span>{", "}{a.message}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {context.line_items?.length > 0 && (
                <div className="text-xs text-primary-k">
                    <div className="text-muted-k mb-1">Prior charged rates for {service.toLowerCase()}:</div>
                    <div className="flex flex-wrap gap-2">
                        {context.line_items.slice(0, 6).map((li, i) => (
                            <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-primary-k/25 bg-white/60 text-primary-k px-2.5 py-1 tabular-nums"
                                title={li.period_label || ""}
                            >
                                ${Number(li.unit_price).toFixed(2)}
                                {li.period_label && (
                                    <span className="ml-1.5 text-muted-k">{li.period_label}</span>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
