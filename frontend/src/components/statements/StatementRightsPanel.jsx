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
        <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="statement-rights-panel">
            <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3"
                data-testid="statement-rights-toggle">
                <span className="inline-flex items-center gap-2 overline">
                    <Scale className="h-4 w-4 text-primary-k" /> Your rights
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-k transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <>
                    <p className="mt-2 text-xs text-muted-k">{data.disclaimer}</p>
                    <ul className="mt-4 space-y-3">
                        {data.annotations.map((a) => (
                            <li key={a.right_id} className="border-b border-kindred pb-3 last:border-0" data-testid={`right-${a.right_id}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="font-medium text-primary-k text-sm">{a.title}</div>
                                    {!a.is_baseline && (
                                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-terracotta/10 text-terracotta px-2 py-0.5 shrink-0">
                                            Relevant here
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-k mt-0.5">{a.plain}</div>
                                <div className="text-xs text-primary-k mt-1.5">→ {a.what_you_can_do}</div>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-muted-k">{data.source}</p>
                </>
            )}
        </div>
    );
}
