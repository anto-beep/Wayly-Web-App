import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatAUD2 } from "@/lib/api";
import { FileText, ArrowRight } from "lucide-react";

export default function StatementsList() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/statements");
                setItems(data);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <div className="space-y-6" data-testid="statements-list-page">
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <span className="overline">All statements</span>
                    <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2">Statements</h1>
                </div>
                <Link
                    to="/app/statements/upload"
                    data-testid="statements-upload-cta"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90"
                >
                    <FileText className="h-4 w-4" /> Upload
                </Link>
            </div>

            {loading ? (
                <div className="text-muted-k">Loading…</div>
            ) : items.length === 0 ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center">
                    <FileText className="h-8 w-8 text-muted-k mx-auto" />
                    <p className="mt-3 text-muted-k">No statements yet.</p>
                    <Link to="/app/statements/upload" className="mt-4 inline-block text-primary-k underline">
                        Upload your first
                    </Link>
                </div>
            ) : (
                <ul className="bg-surface border border-kindred rounded-xl divide-y divide-[var(--kindred-border)]">
                    {items.map((s) => {
                        const total = (s.line_items || []).reduce((acc, li) => acc + (li.total || 0), 0);
                        return (
                            <li key={s.id}>
                                <Link
                                    to={`/app/statements/${s.id}`}
                                    data-testid={`statement-row-${s.id}`}
                                    className="flex items-center justify-between p-5 hover:bg-surface-2 transition-colors"
                                >
                                    <div>
                                        <div className="font-medium text-primary-k">{s.period_label || s.filename}</div>
                                        <div className="text-sm text-muted-k">
                                            {(s.line_items || []).length} line items · {formatAUD2(total)}
                                            {s.anomalies?.length ? ` · ${s.anomalies.length} alert${s.anomalies.length === 1 ? "" : "s"}` : ""}
                                        </div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-k" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
