import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatAUD, formatAUD2 } from "@/lib/api";
import StreamProgress from "@/components/StreamProgress";
import { AlertTriangle, FileText, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function CaregiverDashboard() {
    const { household } = useAuth();
    const [budget, setBudget] = useState(null);
    const [statements, setStatements] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [b, s] = await Promise.all([
                    api.get("/budget/current"),
                    api.get("/statements"),
                ]);
                setBudget(b.data);
                setStatements(s.data);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const latest = statements[0];
    const allAnomalies = statements.flatMap((s) =>
        (s.anomalies || []).map((a) => ({ ...a, statement_id: s.id, period_label: s.period_label }))
    );

    return (
        <div className="space-y-8" data-testid="caregiver-dashboard">
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <span className="overline">Wellbeing summary</span>
                    <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2">
                        {household?.participant_name ? `${household.participant_name}, this quarter` : "Your dashboard"}
                    </h1>
                    {budget && (
                        <p className="text-muted-k mt-2">
                            {budget.quarter_label} · {budget.classification_label} · {formatAUD(budget.quarterly_total)} per quarter
                        </p>
                    )}
                </div>
                <Link
                    to="/app/statements/upload"
                    data-testid="dashboard-upload-cta"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90 transition-colors"
                >
                    <FileText className="h-4 w-4" /> Upload a statement
                </Link>
            </div>

            {loading && <div className="text-muted-k">Loading…</div>}

            {budget && (
                <>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {budget.streams.map((s) => (
                            <StreamProgress key={s.stream} stream={s} />
                        ))}
                    </div>

                    <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="lifetime-cap-card">
                        <div className="flex items-baseline justify-between">
                            <span className="overline">Lifetime contribution cap</span>
                            <span className="text-xs text-muted-k">{budget.is_grandfathered ? "Grandfathered" : "New entrant"}</span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between flex-wrap gap-3">
                            <div className="font-heading text-2xl text-primary-k">
                                {formatAUD2(budget.lifetime_contributions)}{" "}
                                <span className="text-sm font-sans text-muted-k">of {formatAUD(budget.lifetime_cap)}</span>
                            </div>
                            <div className="text-sm text-muted-k">{budget.lifetime_pct.toFixed(2)}%</div>
                        </div>
                        <div className="mt-3 h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                            <div className="bg-[#2A3B32] h-full" style={{ width: `${Math.min(100, budget.lifetime_pct)}%` }} />
                        </div>
                    </div>
                </>
            )}

            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-surface border border-kindred rounded-xl p-6" data-testid="alerts-card">
                    <div className="flex items-center justify-between">
                        <span className="overline">Things to know</span>
                        {allAnomalies.length > 0 && (
                            <span className="text-xs text-muted-k">{allAnomalies.length} item{allAnomalies.length === 1 ? "" : "s"}</span>
                        )}
                    </div>
                    {allAnomalies.length === 0 ? (
                        <div className="mt-4 text-muted-k text-sm flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-sage" /> Nothing unusual at the moment.
                        </div>
                    ) : (
                        <ul className="mt-4 space-y-3">
                            {allAnomalies.slice(0, 6).map((a) => (
                                <li key={a.id} className="flex items-start gap-3 border-b border-kindred pb-3 last:border-0">
                                    <AlertTriangle className={`h-4 w-4 mt-1 ${a.severity === "alert" ? "text-terracotta" : "text-sage"}`} />
                                    <div className="flex-1">
                                        <div className="font-medium text-primary-k text-sm">{a.title}</div>
                                        <div className="text-xs text-muted-k mt-0.5">{a.detail}</div>
                                        {a.suggested_action && (
                                            <div className="text-xs text-primary-k mt-1.5 italic">→ {a.suggested_action}</div>
                                        )}
                                    </div>
                                    <Link
                                        to={`/app/statements/${a.statement_id}`}
                                        className="text-xs text-primary-k underline"
                                    >
                                        View
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="recent-statements-card">
                    <span className="overline">Recent statements</span>
                    {statements.length === 0 ? (
                        <div className="mt-4 text-sm text-muted-k">
                            No statements yet.{" "}
                            <Link to="/app/statements/upload" className="text-primary-k underline">Upload one</Link>.
                        </div>
                    ) : (
                        <ul className="mt-4 space-y-3">
                            {statements.slice(0, 5).map((s) => (
                                <li key={s.id}>
                                    <Link
                                        to={`/app/statements/${s.id}`}
                                        className="flex items-center justify-between rounded-lg p-2 -mx-2 hover:bg-surface-2 transition-colors"
                                    >
                                        <div>
                                            <div className="text-sm font-medium text-primary-k">{s.period_label || s.filename}</div>
                                            <div className="text-xs text-muted-k">{(s.line_items || []).length} line items</div>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-muted-k" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {latest?.summary && (
                <div className="bg-surface-2 rounded-xl p-6 border border-kindred" data-testid="latest-summary-card">
                    <span className="overline">Latest statement, in plain English</span>
                    <p className="mt-3 text-primary-k leading-relaxed">{latest.summary}</p>
                    <Link
                        to={`/app/statements/${latest.id}`}
                        className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k underline"
                    >
                        Open full statement <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            )}
        </div>
    );
}
