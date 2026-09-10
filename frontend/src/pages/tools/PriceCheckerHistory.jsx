import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, extractErrorMessage, formatAUD2 } from "@/lib/api";
import { track } from "@/lib/analytics";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Loader2, ArrowLeft, Trash2, TrendingUp, TrendingDown, AlertTriangle, PiggyBank, Minus, PartyPopper, X, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const MILESTONE_TIERS = [
    { threshold: 1000, label: "$1,000", copy: "$1,000 in tracked savings. That's a whole month of grocery runs, thanks to your diligence." },
    { threshold: 500, label: "$500", copy: "$500 saved by keeping an eye on prices. Real money, back in the family budget." },
    { threshold: 250, label: "$250", copy: "$250 saved so far. This is what active price-watching looks like." },
    { threshold: 100, label: "$100", copy: "Your first $100 saved. Small habits, meaningful money." },
];

/**
 * WS8 chronological log + WS11 rate-increase surfacing + WS13 erasure UI.
 *
 * Loads the user's saved checks, groups them by (service, provider), and
 * renders a card per group with a sparkline time series + delta indicators
 * + rate-increase flag when count > 2 in last 12 months.
 */
export default function PriceCheckerHistoryPage() {
    const nav = useNavigate();
    const [checks, setChecks] = useState(null);
    const [error, setError] = useState(null);
    const [milestones, setMilestones] = useState(null);
    const [activeMilestone, setActiveMilestone] = useState(null); // {threshold, label, copy} being celebrated
    const dismissedRef = useRef(false);

    useEffect(() => {
        try { track.ppc.historyOpened({}); } catch (_) { /* noop */ }
        Promise.all([
            api.get("/ppc/checks").then((r) => setChecks(r.data?.checks || [])).catch((err) => setError(extractErrorMessage(err, "Could not load history."))),
            api.get("/ppc/milestones").then((r) => setMilestones(r.data || {})).catch(() => setMilestones({})),
        ]);
    }, []);

    const groups = useMemo(() => {
        if (!checks) return null;
        const m = new Map();
        for (const c of checks) {
            const key = `${c.service}::${c.provider_normalised_name || ""}`;
            if (!m.has(key)) m.set(key, {
                key,
                service: c.service,
                provider_display_name: c.provider_display_name || "No provider entered",
                provider_normalised_name: c.provider_normalised_name || "",
                rows: [],
            });
            m.get(key).rows.push(c);
        }
        // Sort each group's rows oldest -> newest to compute stats consistently.
        for (const g of m.values()) {
            g.rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            g.stats = computeGroupStats(g.rows);
        }
        return Array.from(m.values()).sort((a, b) => a.service.localeCompare(b.service));
    }, [checks]);

    const snapshot = useMemo(() => {
        if (!groups || groups.length === 0) return null;
        let dropped = 0;
        let rising = 0;
        let flat = 0;
        let totalSaved = 0;
        for (const g of groups) {
            const dir = g.stats?.trendDirection;
            if (dir === "down") dropped += 1;
            else if (dir === "up") rising += 1;
            else flat += 1;
            // Estimated total saved: sum of positive (highest - latest) per group.
            // Note: units mix (per hour / per km / per visit) so this is an
            // *estimate* per-unit, we label it clearly in the copy.
            if (g.stats?.savingsVsHighest > 0) totalSaved += g.stats.savingsVsHighest;
        }
        return { total: groups.length, dropped, rising, flat, totalSaved };
    }, [groups]);

    // Milestone-crossing detection. Fires exactly once per threshold per user.
    useEffect(() => {
        if (!snapshot || !milestones || dismissedRef.current) return;
        if (activeMilestone) return;
        const totalSaved = snapshot.totalSaved || 0;
        // Highest tier the user has crossed but not yet been congratulated for.
        const uncelebrated = MILESTONE_TIERS.find(
            (t) => totalSaved >= t.threshold && !milestones[`crossed_${t.threshold}`],
        );
        if (uncelebrated) {
            setActiveMilestone(uncelebrated);
            // Persist so we don't fire again on next visit.
            api.post("/ppc/milestones/mark", { threshold: uncelebrated.threshold })
                .then((r) => setMilestones(r.data || milestones))
                .catch(() => { /* non-fatal */ });
            try { track.ppc?.milestoneCrossed?.({ threshold: uncelebrated.threshold, total: totalSaved }); } catch (_) { /* noop */ }
        }
    }, [snapshot, milestones, activeMilestone]);

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-10 pb-4">
                <Link
                    to="/ai-tools/provider-price-checker"
                    className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"
                    data-testid="ppc-history-back"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Price Checker
                </Link>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight" data-testid="ppc-history-title">
                    Your Price History
                </h1>
                <p className="mt-3 text-lg text-muted-k max-w-2xl leading-relaxed">
                    {"Every rate you've saved, grouped by service and provider. We flag providers whose rates have moved more than twice in the past year, and show what you'd be saving compared to your prior rates."}
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-16">
                {checks === null && !error && (
                    <div className="text-muted-k inline-flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                )}
                {error && <div className="text-sm text-terracotta" data-testid="ppc-history-error">{error}</div>}
                {activeMilestone && (
                    <MilestoneBanner
                        milestone={activeMilestone}
                        totalSaved={snapshot?.totalSaved || 0}
                        onDismiss={() => { setActiveMilestone(null); dismissedRef.current = true; }}
                    />
                )}
                {snapshot && (
                    <div
                        className="bg-surface border border-kindred rounded-2xl p-5 mb-6"
                        data-testid="ppc-history-snapshot"
                    >
                        <div className="flex items-center gap-2 text-xs text-muted-k uppercase tracking-wider">
                            <PiggyBank className="h-3.5 w-3.5" /> Savings snapshot
                        </div>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <SnapshotStat label="Tracked" value={snapshot.total} tone="neutral" testid="ppc-snap-total" />
                            <SnapshotStat label="Prices dropped" value={snapshot.dropped} tone="good" testid="ppc-snap-dropped" />
                            <SnapshotStat label="Prices rising" value={snapshot.rising} tone="warn" testid="ppc-snap-rising" />
                            <SnapshotStat label="Steady" value={snapshot.flat} tone="neutral" testid="ppc-snap-flat" />
                        </div>
                        {snapshot.totalSaved > 0 && (
                            <div
                                className="mt-4 rounded-xl border border-sage/25 bg-sage/5 px-4 py-3 flex items-center justify-between gap-3"
                                data-testid="ppc-total-saved"
                            >
                                <div className="min-w-0">
                                    <div className="text-[11px] text-muted-k uppercase tracking-wider">Estimated savings tracked</div>
                                    <div className="font-heading text-2xl text-sage tabular-nums">
                                        {formatAUD2(snapshot.totalSaved)}
                                    </div>
                                </div>
                                <div className="text-[11px] text-muted-k text-right max-w-[220px] leading-snug">
                                    Sum of price drops caught across your providers. Units mix (per hour / km / visit) so treat this as an estimate.
                                </div>
                            </div>
                        )}
                        <p className="mt-3 text-xs text-muted-k">
                            {"We compare each provider's most recent saved rate to your prior scans, so you can see where you're saving and where costs are creeping up."}
                        </p>
                    </div>
                )}
                {groups && groups.length === 0 && (
                    <div className="bg-surface border border-kindred rounded-2xl p-8 text-center" data-testid="ppc-history-empty">
                        <div className="font-heading text-2xl text-primary-k">No saved checks yet</div>
                        <p className="mt-2 text-muted-k">{"Head to the Price Checker and click 'Save this result' after your first comparison, this page then builds up over time."}</p>
                        <button
                            type="button"
                            onClick={() => nav("/ai-tools/provider-price-checker")}
                            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-k text-white text-sm hover:bg-[#091D33]"
                        >
                            Open the Price Checker
                        </button>
                    </div>
                )}
                {groups && groups.length > 0 && (
                    <div className="space-y-4">
                        {groups.map((g) => (
                            <HistoryGroup
                                key={g.key}
                                group={g}
                                onDeleted={() => {
                                    api.get("/ppc/checks").then((r) => setChecks(r.data?.checks || []));
                                }}
                            />
                        ))}
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}

function computeGroupStats(rows) {
    // rows sorted oldest -> newest, each with .rate (number) and .unit.
    if (!rows || rows.length === 0) {
        return {
            latest: null,
            previous: null,
            highest: null,
            lowest: null,
            unit: null,
            savingsVsHighest: 0,
            savingsVsHighestPct: 0,
            savingsVsPrevious: 0,
            savingsVsPreviousPct: 0,
            trendDirection: "flat",
        };
    }
    const rates = rows.map((r) => Number(r.rate)).filter((n) => Number.isFinite(n));
    const latest = rates[rates.length - 1];
    const previous = rates.length > 1 ? rates[rates.length - 2] : null;
    const highest = Math.max(...rates);
    const lowest = Math.min(...rates);
    const unit = rows[rows.length - 1]?.unit || rows[0]?.unit || "unit";

    const savingsVsHighest = highest - latest;
    const savingsVsHighestPct = highest > 0 ? (savingsVsHighest / highest) * 100 : 0;
    const savingsVsPrevious = previous !== null ? previous - latest : 0;
    const savingsVsPreviousPct = previous ? (savingsVsPrevious / previous) * 100 : 0;

    let trendDirection = "flat";
    if (previous !== null) {
        if (latest < previous) trendDirection = "down";
        else if (latest > previous) trendDirection = "up";
    }

    return {
        latest,
        previous,
        highest,
        lowest,
        unit,
        savingsVsHighest,
        savingsVsHighestPct,
        savingsVsPrevious,
        savingsVsPreviousPct,
        trendDirection,
    };
}

function SnapshotStat({ label, value, tone, testid }) {
    const toneClass =
        tone === "good" ? "text-sage"
        : tone === "warn" ? "text-clay"
        : "text-primary-k";
    return (
        <div>
            <div className={`font-heading text-3xl tabular-nums ${toneClass}`} data-testid={testid}>
                {value}
            </div>
            <div className="text-xs text-muted-k mt-0.5">{label}</div>
        </div>
    );
}

function SavingsBlock({ stats }) {
    if (!stats || stats.latest === null) return null;
    const hasPrevious = stats.previous !== null;
    const hasHighest = stats.highest > stats.latest;

    const pill = (label, value, pct, kind, testid) => {
        const isPositive = value > 0;
        const isNegative = value < 0;
        const Icon = isPositive ? TrendingDown : isNegative ? TrendingUp : Minus;
        const iconClass = isPositive ? "text-sage" : isNegative ? "text-clay" : "text-muted-k";
        const valueClass = isPositive ? "text-sage" : isNegative ? "text-clay" : "text-muted-k";
        const bg = isPositive ? "bg-sage/5 border-sage/25" : isNegative ? "bg-clay/5 border-clay/25" : "bg-surface border-kindred";
        const prefix = isPositive ? "Saved " : isNegative ? "Up " : "No change";
        const magnitude = Math.abs(value);
        const pctText = pct ? ` (${Math.abs(pct).toFixed(1)}%)` : "";
        return (
            <div
                className={`rounded-xl border px-3 py-2.5 ${bg} flex items-start gap-2`}
                data-testid={testid}
            >
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} aria-hidden="true" />
                <div className="min-w-0">
                    <div className="text-[11px] text-muted-k uppercase tracking-wider">{label} {kind}</div>
                    <div className={`text-sm font-medium tabular-nums ${valueClass}`}>
                        {(isPositive || isNegative) ? (
                            <>{prefix}{formatAUD2(magnitude)}<span className="text-xs font-normal">/{stats.unit}</span>{pctText}</>
                        ) : (
                            "No change"
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-testid="ppc-history-savings-block">
            {hasHighest && pill("vs Highest ever", stats.savingsVsHighest, stats.savingsVsHighestPct, `(${formatAUD2(stats.highest)}/${stats.unit})`, "ppc-savings-vs-highest")}
            {hasPrevious && pill("vs Last scan", stats.savingsVsPrevious, stats.savingsVsPreviousPct, `(${formatAUD2(stats.previous)}/${stats.unit})`, "ppc-savings-vs-previous")}
            <div className="rounded-xl border border-kindred bg-surface px-3 py-2.5" data-testid="ppc-savings-current">
                <div className="text-[11px] text-muted-k uppercase tracking-wider">Latest saved rate</div>
                <div className="text-sm font-medium text-primary-k tabular-nums">
                    {formatAUD2(stats.latest)}<span className="text-xs font-normal text-muted-k">/{stats.unit}</span>
                </div>
            </div>
            <div className="rounded-xl border border-kindred bg-surface px-3 py-2.5" data-testid="ppc-savings-best">
                <div className="text-[11px] text-muted-k uppercase tracking-wider">Best price you&apos;ve seen</div>
                <div className="text-sm font-medium text-primary-k tabular-nums">
                    {formatAUD2(stats.lowest)}<span className="text-xs font-normal text-muted-k">/{stats.unit}</span>
                </div>
            </div>
        </div>
    );
}

function HistoryGroup({ group, onDeleted }) {
    const [history, setHistory] = useState(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [qualityProfile, setQualityProfile] = useState(null);

    useEffect(() => {
        const params = { service: group.service, provider: group.provider_display_name };
        api.get("/ppc/checks/history", { params })
            .then((r) => setHistory(r.data))
            .catch(() => setHistory(null));
    }, [group.service, group.provider_display_name]);

    useEffect(() => {
        // PPC-3: fetch composite quality summary for this provider
        const provider = group.provider_display_name;
        if (!provider || provider === "No provider entered") return;
        api.get(`/ppc3/providers/${encodeURIComponent(provider)}/quality-profile`)
            .then((r) => setQualityProfile(r.data.profile))
            .catch(() => setQualityProfile(null));
    }, [group.provider_display_name]);

    const flagged = (history?.rate_increases_last_12mo || 0) > 2;
    const summary = qualityProfile?.composite_quality_summary;
    const SIGNAL_TONE = {
        many_positive_signals: "bg-emerald-50 text-emerald-800 border-emerald-200",
        mixed_signals: "bg-amber-50 text-amber-800 border-amber-200",
        several_concerns: "bg-red-50 text-red-800 border-red-200",
        insufficient_data_for_summary: "bg-primary-k/5 text-primary-k/60 border-primary-k/10",
    };
    const SIGNAL_LABEL = {
        many_positive_signals: "Many Positive Signals",
        mixed_signals: "Mixed Signals",
        several_concerns: "Several Concerns",
        insufficient_data_for_summary: "Insufficient Data",
    };

    return (
        <div
            className={`bg-surface border rounded-2xl p-5 ${flagged ? "border-clay/40" : "border-kindred"}`}
            data-testid={`ppc-history-group-${group.service.toLowerCase().replace(/\s+/g, "-")}`}
        >
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="text-xs text-muted-k uppercase tracking-wider">{group.service}</div>
                    <div className="font-heading text-2xl text-primary-k mt-0.5">{group.provider_display_name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <div className="text-xs text-muted-k">
                            {group.rows.length} saved check{group.rows.length !== 1 ? "s" : ""}
                        </div>
                        {summary && summary.overall_signal && (
                            <Link
                                to={`/app/tools/provider-price-checker/quality/${encodeURIComponent(group.provider_display_name)}`}
                                className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${SIGNAL_TONE[summary.overall_signal]}`}
                                data-testid={`ppc-quality-chip-${group.provider_normalised_name || "n-a"}`}
                                title={summary.explanation_tokens?.caregiver || ""}
                            >
                                <Shield className="w-3 h-3" />
                                {SIGNAL_LABEL[summary.overall_signal]}
                            </Link>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {flagged && (
                        <span
                            className="inline-flex items-center gap-1 rounded-full bg-clay/10 border border-clay/25 text-clay px-2.5 py-1 text-xs font-medium"
                            data-testid="ppc-history-flag"
                        >
                            <AlertTriangle className="h-3 w-3" />
                            {history.rate_increases_last_12mo} increases in 12 months
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setBulkOpen(true)}
                        data-testid="ppc-history-bulk-delete"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-k hover:text-terracotta"
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Delete provider history
                    </button>
                </div>
            </div>

            {history && history.change_delta !== null && history.change_delta !== undefined && (
                <div className="mt-3 text-sm text-primary-k flex items-center gap-2">
                    {history.change_delta > 0 ? (
                        <>
                            <TrendingUp className="h-4 w-4 text-clay" aria-hidden="true" />
                            <span className="tabular-nums">
                                Up {formatAUD2(Math.abs(history.change_delta))} ({history.change_pct?.toFixed(1)}%) since first save
                            </span>
                        </>
                    ) : history.change_delta < 0 ? (
                        <>
                            <TrendingDown className="h-4 w-4 text-sage" aria-hidden="true" />
                            <span className="tabular-nums">
                                Down {formatAUD2(Math.abs(history.change_delta))} ({Math.abs(history.change_pct || 0).toFixed(1)}%) since first save
                            </span>
                        </>
                    ) : (
                        <span className="text-muted-k">No change since first save</span>
                    )}
                </div>
            )}

            <SavingsBlock stats={group.stats} />

            {history && history.checks?.length > 0 && (
                <div className="mt-4">
                    <TimeSeries checks={history.checks} />
                </div>
            )}

            {history && history.checks?.length > 0 && (
                <div className="mt-4 divide-y divide-kindred">
                    {history.checks.map((c) => (
                        <HistoryRow
                            key={c.id}
                            row={c}
                            unit={c.unit}
                            onDeleted={onDeleted}
                        />
                    ))}
                </div>
            )}

            <BulkDeleteModal
                open={bulkOpen}
                onClose={() => setBulkOpen(false)}
                service={group.service}
                provider={group.provider_display_name}
                onDeleted={() => { setBulkOpen(false); onDeleted(); }}
            />
        </div>
    );
}

function TimeSeries({ checks }) {
    // Compact SVG sparkline (140px wide × 40px tall). Oldest → newest.
    const rev = [...checks].reverse();
    const rates = rev.map((c) => Number(c.rate));
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const span = Math.max(max - min, 1);
    const w = 200;
    const h = 44;
    const stepX = rates.length > 1 ? w / (rates.length - 1) : 0;
    const points = rates.map((r, i) => {
        const y = h - ((r - min) / span) * h;
        return `${(i * stepX).toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width={w} height={h} data-testid="ppc-history-sparkline">
            <polyline
                fill="none"
                stroke="var(--primary-k, #0E4D52)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
            />
            {rates.map((r, i) => {
                const y = h - ((r - min) / span) * h;
                return <circle key={i} cx={(i * stepX).toFixed(1)} cy={y.toFixed(1)} r="2.5" fill="var(--primary-k, #0E4D52)" />;
            })}
        </svg>
    );
}

function HistoryRow({ row, unit, onDeleted }) {
    const [confirm, setConfirm] = useState(null); // {message, before, after}
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const doDelete = async (confirmFlag = false) => {
        setBusy(true);
        setError(null);
        try {
            const res = await api.delete(`/ppc/checks/${row.id}`, { params: { confirm: confirmFlag } });
            if (res.data?.deleted === false && res.data?.requires_confirmation) {
                setConfirm({
                    message: res.data.explanation,
                    before: res.data.flag_before,
                    after: res.data.flag_after,
                });
                return;
            }
            setConfirm(null);
            try { track.ppc.checkDeleted({ check_id: row.id }); } catch (_) { /* noop */ }
            onDeleted?.();
        } catch (err) {
            setError(extractErrorMessage(err, "Delete failed."));
        } finally {
            setBusy(false);
        }
    };

    const pct = row.pct_vs_previous;
    return (
        <div className="py-3 flex items-center justify-between gap-3">
            <div className="text-sm text-primary-k">
                <span className="tabular-nums font-medium">{formatAUD2(row.rate)}</span>
                <span className="text-muted-k text-xs ml-1">per {unit || "unit"}</span>
                {pct !== null && pct !== undefined && (
                    <span className={`ml-3 text-xs tabular-nums ${pct > 0 ? "text-clay" : pct < 0 ? "text-sage" : "text-muted-k"}`}>
                        {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                    </span>
                )}
                <div className="text-xs text-muted-k mt-0.5">
                    {formatIso(row.created_at)}
                    {row.source_statement_id && <span> · from decoded statement</span>}
                </div>
            </div>
            <button
                type="button"
                onClick={() => doDelete(false)}
                disabled={busy}
                className="text-xs text-muted-k hover:text-terracotta inline-flex items-center gap-1"
                data-testid={`ppc-history-row-delete-${row.id}`}
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
            {error && <div className="text-xs text-terracotta">{error}</div>}
            <Dialog open={Boolean(confirm)} onOpenChange={(v) => { if (!v) setConfirm(null); }}>
                <DialogContent data-testid="ppc-history-row-delete-confirm">
                    <DialogHeader><DialogTitle>Confirm delete</DialogTitle></DialogHeader>
                    <div className="text-sm text-primary-k">
                        <p>{confirm?.message}</p>
                        <p className="mt-2 text-xs text-muted-k">
                            {`Before: ${confirm?.before ?? 0} increases counted. After: ${confirm?.after ?? 0} increases.`}
                        </p>
                    </div>
                    <DialogFooter className="gap-2">
                        <button
                            type="button"
                            onClick={() => setConfirm(null)}
                            className="px-3.5 py-2 rounded-full border border-kindred text-primary-k text-sm"
                        >
                            Keep it
                        </button>
                        <button
                            type="button"
                            onClick={() => doDelete(true)}
                            className="px-3.5 py-2 rounded-full bg-terracotta text-white text-sm"
                            data-testid="ppc-history-row-delete-confirm-btn"
                        >
                            Delete anyway
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function BulkDeleteModal({ open, onClose, service, provider, onDeleted }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const doDelete = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.delete("/ppc/checks/provider", { params: { service, provider } });
            onDeleted();
        } catch (err) {
            setError(extractErrorMessage(err, "Bulk delete failed."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent data-testid="ppc-history-bulk-modal">
                <DialogHeader><DialogTitle>Delete all history for this provider?</DialogTitle></DialogHeader>
                <div className="text-sm text-primary-k space-y-2">
                    <p>{`This will erase every saved check for ${provider} on ${service}. It also scrubs the anonymised rows from Wayly's provider aggregate.`}</p>
                    <p className="text-xs text-muted-k italic">This action cannot be undone.</p>
                    {error && <p className="text-sm text-terracotta">{error}</p>}
                </div>
                <DialogFooter className="gap-2">
                    <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-full border border-kindred text-primary-k text-sm">Cancel</button>
                    <button
                        type="button"
                        onClick={doDelete}
                        disabled={busy}
                        className="px-3.5 py-2 rounded-full bg-terracotta text-white text-sm disabled:opacity-60"
                        data-testid="ppc-history-bulk-confirm"
                    >
                        {busy ? "Deleting…" : "Delete provider history"}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function formatIso(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    } catch { return iso; }
}


function MilestoneBanner({ milestone, totalSaved, onDismiss }) {
    // Auto-dismiss after 12s if the user doesn't click. Doesn't fire again on
    // reload, the milestone is already marked server-side.
    useEffect(() => {
        const t = setTimeout(onDismiss, 12000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div
            className="mb-6 rounded-2xl border border-sage/40 bg-gradient-to-r from-sage/10 via-sage/5 to-transparent px-5 py-4 flex items-start gap-4 shadow-sm"
            data-testid="ppc-milestone-banner"
            data-milestone={milestone.threshold}
            role="status"
            aria-live="polite"
        >
            <div className="shrink-0 h-10 w-10 rounded-full bg-sage/15 flex items-center justify-center">
                <PartyPopper className="h-5 w-5 text-sage" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-heading text-lg text-primary-k" data-testid="ppc-milestone-heading">
                    You&apos;ve crossed {milestone.label} saved
                </div>
                <p className="text-sm text-muted-k leading-snug mt-0.5">
                    {milestone.copy}
                </p>
                <p className="text-xs text-muted-k mt-1.5 tabular-nums" data-testid="ppc-milestone-total">
                    Estimated total tracked: <span className="font-medium text-primary-k">{formatAUD2(totalSaved)}</span>
                </p>
            </div>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss milestone"
                data-testid="ppc-milestone-dismiss"
                className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-full text-muted-k hover:text-primary-k hover:bg-white/60"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
