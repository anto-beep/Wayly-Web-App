/**
 * QP-1 v1, Dashboard pacing tile. Replaces the OJ-1 envelope tile when
 * the participant has at least one schedule (or one ledger entry).
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatAUD } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { ArrowRight, CheckCircle2, AlertTriangle, TrendingDown, TrendingUp, Info } from "lucide-react";

const PACE_META = {
    green:      { label: "On track",       tone: "bg-sage/15 text-[#0F5648] border-sage/50",             Icon: CheckCircle2 },
    amber:      { label: "Watch this",     tone: "bg-gold/20 text-[#7A5B00] border-gold/60",             Icon: AlertTriangle },
    red:        { label: "Over pace",      tone: "bg-terracotta/15 text-[#8A2E1B] border-terracotta/50", Icon: TrendingUp },
    underspend: { label: "Underspending",  tone: "bg-primary-k/10 text-primary-k border-primary-k/40",   Icon: TrendingDown },
    unknown:    { label: "Not enough data",tone: "bg-surface-2 text-muted-k border-kindred",             Icon: Info },
};

export default function QP1DashboardTile() {
    const { items: participants, activeId: activeParticipantId } = useParticipants();
    const active = (participants || []).find((p) => p.id === activeParticipantId) || (participants || [])[0];
    const participantId = active?.id;
    const classification = Number(active?.classification_level) || null;
    const [pacing, setPacing] = useState(null);
    const [hasSchedules, setHasSchedules] = useState(false);

    useEffect(() => {
        if (!participantId) return;
        let alive = true;
        (async () => {
            try {
                const q = classification ? `?participant_id=${participantId}&classification=${classification}` : `?participant_id=${participantId}`;
                const [p, s] = await Promise.all([
                    api.get(`/qp1/pacing${q}`),
                    api.get(`/qp1/schedules?participant_id=${participantId}`),
                ]);
                if (!alive) return;
                setPacing(p.data);
                setHasSchedules((s.data?.schedules || []).length > 0);
            } catch { /* silent */ }
        })();
        return () => { alive = false; };
    }, [participantId, classification]);

    // Only render when the user has real data, otherwise the OJ-1 envelope
    // tile stays put.
    if (!participantId || !pacing || (!hasSchedules && (pacing.entries_counted || 0) === 0)) return null;

    const meta = PACE_META[pacing.pace_status] || PACE_META.unknown;
    const { Icon } = meta;
    const ratio = pacing.envelope ? Math.min(1.2, pacing.projected_end_of_quarter_total / pacing.envelope) : 0;

    return (
        <aside
            className={`rounded-2xl border p-5 sm:p-6 ${meta.tone}`}
            data-testid="qp1-dashboard-tile"
            data-status={pacing.pace_status}
        >
            <div className="flex items-start gap-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/70 shrink-0">
                    <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <div className="text-xs uppercase tracking-[0.14em]">Quarterly pacing</div>
                            <div className="font-heading text-lg sm:text-xl">{meta.label} · {pacing.quarter?.label}</div>
                        </div>
                        <Link
                            to="/app/pacing"
                            className="inline-flex items-center gap-1 text-sm underline hover:no-underline"
                            data-testid="qp1-dashboard-cta"
                        >
                            Open pacing <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <MiniStat label="Envelope"        value={formatAUD(pacing.envelope)} />
                        <MiniStat label="Spent so far"    value={formatAUD(pacing.actual_spent)} />
                        <MiniStat label="Projected total" value={formatAUD(pacing.projected_end_of_quarter_total)} />
                    </div>
                    {pacing.envelope > 0 && (
                        <div className="mt-3">
                            <div className="h-2 rounded-full bg-white/60 overflow-hidden">
                                <div
                                    className="h-full bg-current opacity-60"
                                    style={{ width: `${Math.round(ratio * 100)}%` }}
                                    role="progressbar"
                                    aria-valuenow={Math.round(ratio * 100)}
                                    aria-valuemin={0}
                                    aria-valuemax={120}
                                    aria-label="Projected quarter progress"
                                />
                            </div>
                            <div className="mt-1 text-xs opacity-80">
                                {Math.round(ratio * 100)}% of envelope · {pacing.quarter?.elapsed_days} of {pacing.quarter?.total_days} days elapsed
                            </div>
                        </div>
                    )}
                    {pacing.underspend_flag && (
                        <p className="mt-3 text-xs">
                            Heads up: on track to underspend by more than the rollover cap ({formatAUD(pacing.rollover_cap_aud)}).
                        </p>
                    )}
                </div>
            </div>
        </aside>
    );
}

function MiniStat({ label, value }) {
    return (
        <div className="rounded-lg bg-white/70 p-3">
            <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
            <div className="mt-0.5 font-heading text-lg text-primary-k tabular-nums">{value}</div>
        </div>
    );
}
