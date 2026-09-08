/**
 * SD-3 · Statement of Rights annotations panel.
 * Shows which of the participant's rights the statement findings touch and what
 * they can do about it. Read-only; general information, not legal advice.
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Scale, ChevronDown } from "lucide-react";

export default function StatementRightsPanel({ statementId }) {
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.get(`/sd3/statements/${statementId}/rights-annotations`)
            .then((r) => { if (!cancelled) setData(r.data); })
            .catch(() => { if (!cancelled) setData(null); });
        return () => { cancelled = true; };
    }, [statementId]);

    if (!data || !(data.annotations || []).length) return null;

    return (
        <div className="section-clay-soft border border-kindred rounded-xl p-6" data-testid="statement-rights-panel">
            <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3"
                data-testid="statement-rights-toggle">
                <span className="inline-flex items-center gap-2.5">
                    <span className="h-9 w-9 rounded-full bg-clay-k/15 flex items-center justify-center">
                        <Scale className="h-4 w-4 text-clay-k" />
                    </span>
                    <span className="text-left">
                        <span className="block font-heading text-lg text-primary-k leading-tight">Your rights</span>
                        <span className="block text-xs text-muted-k">What these findings mean you can do</span>
                    </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-k transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <>
                    <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                        {data.annotations.map((a) => (
                            <li key={a.right_id} className={`rounded-xl p-4 border ${a.is_baseline ? "bg-surface border-kindred" : "bg-surface border-clay/40 border-l-4 border-l-clay-k"}`} data-testid={`right-${a.right_id}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="font-semibold text-primary-k text-sm">{a.title}</div>
                                    {!a.is_baseline && (
                                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-clay-k text-white px-2 py-0.5 shrink-0 font-semibold">
                                            Relevant here
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-k mt-1 leading-relaxed">{a.plain}</div>
                                <div className="mt-2.5 flex items-start gap-1.5 text-xs text-primary-k font-medium bg-primary-k/[0.06] rounded-lg px-2.5 py-2">
                                    <span className="text-clay-k">→</span><span>{a.what_you_can_do}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 text-[11px] text-muted-k">{data.disclaimer} {data.source}</p>
                </>
            )}
        </div>
    );
}
