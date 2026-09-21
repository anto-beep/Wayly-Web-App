/**
 * OverchargeAlerts (Phase G)
 *
 * Surfaces providers who have overcharged on MORE THAN ONE invoice in the
 * user's history. A repeated pattern is a much stronger basis for a formal
 * complaint or refund than a one-off, so we flag it prominently at the top
 * of the invoice history. Backed by GET /api/invoices/overcharge-alerts.
 */
import React, { useEffect, useState } from "react";
import { api, formatAUD2 } from "@/lib/api";
import { AlertTriangle, ArrowRight } from "lucide-react";

export default function OverchargeAlerts({ onViewProvider }) {
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        let cancelled = false;
        api.get("/invoices/overcharge-alerts")
            .then(({ data }) => { if (!cancelled) setAlerts(data?.alerts || []); })
            .catch(() => { /* silent — non-blocking */ });
        return () => { cancelled = true; };
    }, []);

    if (alerts.length === 0) return null;

    return (
        <div className="panel-terracotta rounded-2xl p-5 sm:p-6 space-y-4" data-testid="overcharge-alerts">
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-terracotta text-white">
                    <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                    <h3 className="font-heading text-lg text-primary-k">Repeated overcharges detected</h3>
                    <p className="text-sm text-muted-k mt-0.5 max-w-2xl">
                        The same provider has billed questionable charges on more than one of your invoices. A repeated pattern is worth raising as a formal complaint or refund request across every affected invoice.
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                {alerts.map((a, idx) => (
                    <div
                        key={a.provider_name || idx}
                        data-testid={`overcharge-alert-${idx}`}
                        className="rounded-xl border border-kindred bg-surface p-4"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="font-semibold text-primary-k">{a.provider_name}</div>
                                <div className="text-sm text-clay-k mt-0.5" data-testid={`overcharge-count-${idx}`}>
                                    Flagged on <strong>{a.invoice_count}</strong> of your {a.total_invoices} invoice{a.total_invoices === 1 ? "" : "s"}
                                    {a.total_amount > 0 && <> · about <strong>{formatAUD2(a.total_amount)}</strong> in questionable charges</>}
                                </div>
                            </div>
                            {onViewProvider && (
                                <button
                                    type="button"
                                    onClick={() => onViewProvider(a.provider_name)}
                                    data-testid={`overcharge-view-${idx}`}
                                    className="inline-flex flex-none items-center gap-1.5 rounded-full bg-primary-k text-white text-xs font-medium px-3.5 py-2 hover:bg-primary-k/90"
                                >
                                    Show these <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {(a.check_types || []).map((c) => (
                                <span
                                    key={c.code}
                                    className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-kindred text-clay-k px-2.5 py-1 text-xs"
                                >
                                    {c.title}{c.count > 1 && <span className="font-semibold">&times;{c.count}</span>}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
