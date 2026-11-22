import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, extractErrorMessage, formatAUD2 } from "@/lib/api";
import { track } from "@/lib/analytics";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import {
    Loader2, ArrowLeft, Trash2, TrendingUp, TrendingDown, AlertTriangle,
    PiggyBank, Minus, PartyPopper, X, ChevronDown, ChevronRight, FileText,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const MILESTONE_TIERS = [
    { threshold: 1000, label: "$1,000", copy: "$1,000 in tracked savings. That's a whole month of grocery runs, thanks to your diligence." },
    { threshold: 500, label: "$500", copy: "$500 saved by keeping an eye on prices. Real money, back in the family budget." },
    { threshold: 250, label: "$250", copy: "$250 saved so far. This is what active price-watching looks like." },
    { threshold: 100, label: "$100", copy: "Your first $100 saved. Small habits, meaningful money." },
];

/**
 * WS8 chronological log, redesigned as a clear, colour-coded TABLE.
 * Every saved rate is one row (Date · Service & Provider · Rate · Change),
 * expandable to reveal best/highest/first-saved detail, and individually
 * deletable. A savings snapshot band + rate-increase flags sit on top.
 */
export default function PriceCheckerHistoryPage() {
    const nav = useNavigate();
    const [checks, setChecks] = useState(null);
    const [error, setError] = useState(null);
    const [milestones, setMilestones] = useState(null);
    const [activeMilestone, setActiveMilestone] = useState(null);
    const dismissedRef = useRef(false);

    const reload = () => api.get("/ppc/checks").then((r) => setChecks(r.data?.checks || []));

    useEffect(() => {
        try { track.ppc.historyOpened({}); } catch (_) { /* noop */ }
        Promise.all([
            api.get("/ppc/checks").then((r) => setChecks(r.data?.checks || [])).catch((err) => setError(extractErrorMessage(err, "Could not load history."))),
            api.get("/ppc/milestones").then((r) => setMilestones(r.data || {})).catch(() => setMilestones({})),
        ]);
    }, []);

    // Group by (service, provider) to compute per-group stats + rate flags.
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
        for (const g of m.values()) {
            g.rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            g.stats = computeGroupStats(g.rows);
            g.increases12mo = countIncreases12mo(g.rows);
        }
        return Array.from(m.values());
    }, [checks]);

    // One flat, newest-first list — the table body.
    const rows = useMemo(() => {
        if (!groups) return null;
        const out = [];
        for (const g of groups) {
            g.rows.forEach((c, i) => {
                const prev = i > 0 ? Number(g.rows[i - 1].rate) : null;
                const cur = Number(c.rate);
                const changeAbs = prev != null ? cur - prev : null;
                const changePct = prev ? (changeAbs / prev) * 100 : null;
                out.push({ ...c, __group: g, changeAbs, changePct, groupFlagged: g.increases12mo > 2 });
            });
        }
        out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return out;
    }, [groups]);

    const snapshot = useMemo(() => {
        if (!groups || groups.length === 0) return null;
        let dropped = 0, rising = 0, flat = 0, totalSaved = 0;
        for (const g of groups) {
            const dir = g.stats?.trendDirection;
            if (dir === "down") dropped += 1; else if (dir === "up") rising += 1; else flat += 1;
            if (g.stats?.savingsVsHighest > 0) totalSaved += g.stats.savingsVsHighest;
        }
        return { total: checks.length, groups: groups.length, dropped, rising, flat, totalSaved };
    }, [groups, checks]);

    useEffect(() => {
        if (!snapshot || !milestones || dismissedRef.current) return;
        if (activeMilestone) return;
        const totalSaved = snapshot.totalSaved || 0;
        const uncelebrated = MILESTONE_TIERS.find((t) => totalSaved >= t.threshold && !milestones[`crossed_${t.threshold}`]);
        if (uncelebrated) {
            setActiveMilestone(uncelebrated);
            api.post("/ppc/milestones/mark", { threshold: uncelebrated.threshold })
                .then((r) => setMilestones(r.data || milestones)).catch(() => { /* non-fatal */ });
            try { track.ppc?.milestoneCrossed?.({ threshold: uncelebrated.threshold, total: totalSaved }); } catch (_) { /* noop */ }
        }
    }, [snapshot, milestones, activeMilestone]);

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-5xl px-6 pt-10 pb-4">
                <Link to="/ai-tools/provider-price-checker" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1" data-testid="ppc-history-back">
                    <ArrowLeft className="h-4 w-4" /> Back to Price Checker
                </Link>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight" data-testid="ppc-history-title">
                    Your Price History
                </h1>
                <p className="mt-3 text-base sm:text-lg text-muted-k max-w-2xl leading-relaxed">
                    Every rate you have saved, in one clear table. Tap a row to see the detail, and delete any entry you no longer need.
                </p>
            </section>

            <section className="mx-auto max-w-5xl px-6 pb-16">
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
                    <div className="bg-surface border border-kindred rounded-2xl p-5 mb-6" data-testid="ppc-history-snapshot">
                        <div className="flex items-center gap-2 text-xs text-muted-k uppercase tracking-wider">
                            <PiggyBank className="h-3.5 w-3.5" /> Savings snapshot
                        </div>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <SnapshotStat label="Rates saved" value={snapshot.total} tone="teal" testid="ppc-snap-total" />
                            <SnapshotStat label="Prices dropped" value={snapshot.dropped} tone="good" testid="ppc-snap-dropped" />
                            <SnapshotStat label="Prices rising" value={snapshot.rising} tone="warn" testid="ppc-snap-rising" />
                            <SnapshotStat label="Steady" value={snapshot.flat} tone="neutral" testid="ppc-snap-flat" />
                        </div>
                        {snapshot.totalSaved > 0 && (
                            <div className="mt-4 rounded-xl border border-sage/30 bg-sage/10 px-4 py-3 flex items-center justify-between gap-3" data-testid="ppc-total-saved">
                                <div className="min-w-0">
                                    <div className="text-[11px] text-muted-k uppercase tracking-wider">Estimated savings tracked</div>
                                    <div className="font-heading text-2xl text-sage tabular-nums">{formatAUD2(snapshot.totalSaved)}</div>
                                </div>
                                <div className="text-[11px] text-muted-k text-right max-w-[220px] leading-snug">
                                    Sum of price drops caught across your providers. Units mix (per hour / km / visit) so treat this as an estimate.
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {rows && rows.length === 0 && (
                    <div className="bg-surface border border-kindred rounded-2xl p-8 text-center" data-testid="ppc-history-empty">
                        <div className="font-heading text-2xl text-primary-k">No saved checks yet</div>
                        <p className="mt-2 text-muted-k">Head to the Price Checker and tap &quot;Save this result&quot; after your first comparison — this table then builds up over time.</p>
                        <button type="button" onClick={() => nav("/ai-tools/provider-price-checker")} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-k text-white text-sm hover:bg-[#091D33]">
                            Open the Price Checker
                        </button>
                    </div>
                )}

                {rows && rows.length > 0 && (
                    <div className="bg-surface border border-kindred rounded-2xl overflow-hidden" data-testid="ppc-history-table">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-primary-k text-white/90 text-[11px] uppercase tracking-wider">
                                        <th className="px-4 py-3 font-semibold">Date</th>
                                        <th className="px-4 py-3 font-semibold">Service &amp; provider</th>
                                        <th className="px-4 py-3 font-semibold text-right">Rate</th>
                                        <th className="px-4 py-3 font-semibold text-right">Change</th>
                                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, idx) => (
                                        <PriceRow key={r.id} row={r} zebra={idx % 2 === 1} onChanged={reload} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}

function countIncreases12mo(rows) {
    const cutoff = Date.now() - 365 * 24 * 3600 * 1000;
    let n = 0;
    for (let i = 1; i < rows.length; i += 1) {
        const t = new Date(rows[i].created_at).getTime();
        if (t >= cutoff && Number(rows[i].rate) > Number(rows[i - 1].rate)) n += 1;
    }
    return n;
}

function computeGroupStats(rows) {
    if (!rows || rows.length === 0) {
        return { latest: null, previous: null, highest: null, lowest: null, unit: null, savingsVsHighest: 0, trendDirection: "flat" };
    }
    const rates = rows.map((r) => Number(r.rate)).filter((n) => Number.isFinite(n));
    const latest = rates[rates.length - 1];
    const previous = rates.length > 1 ? rates[rates.length - 2] : null;
    const highest = Math.max(...rates);
    const lowest = Math.min(...rates);
    const unit = rows[rows.length - 1]?.unit || rows[0]?.unit || "unit";
    const savingsVsHighest = highest - latest;
    let trendDirection = "flat";
    if (previous !== null) trendDirection = latest < previous ? "down" : latest > previous ? "up" : "flat";
    return { latest, previous, highest, lowest, unit, savingsVsHighest, trendDirection };
}

function SnapshotStat({ label, value, tone, testid }) {
    const toneClass = tone === "good" ? "text-sage" : tone === "warn" ? "text-clay" : tone === "teal" ? "text-primary-k" : "text-muted-k";
    const bg = tone === "good" ? "bg-sage/10 border-sage/25" : tone === "warn" ? "bg-clay/10 border-clay/25" : tone === "teal" ? "bg-primary-k/[0.06] border-primary-k/15" : "bg-surface border-kindred";
    return (
        <div className={`rounded-xl border px-3 py-2.5 ${bg}`}>
            <div className={`font-heading text-3xl tabular-nums ${toneClass}`} data-testid={testid}>{value}</div>
            <div className="text-xs text-muted-k mt-0.5">{label}</div>
        </div>
    );
}

function ChangeBadge({ abs, pct, unit }) {
    if (abs === null || abs === undefined) {
        return <span className="text-[11px] text-muted-k">First save</span>;
    }
    const down = abs < 0, up = abs > 0;
    const Icon = down ? TrendingDown : up ? TrendingUp : Minus;
    const cls = down ? "text-sage bg-sage/10 border-sage/25" : up ? "text-clay bg-clay/10 border-clay/25" : "text-muted-k bg-surface border-kindred";
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
            <Icon className="h-3 w-3" />
            {down ? "−" : up ? "+" : ""}{formatAUD2(Math.abs(abs))}
            {pct ? <span className="text-[10px] font-normal">({Math.abs(pct).toFixed(1)}%)</span> : null}
        </span>
    );
}

function PriceRow({ row, zebra, onChanged }) {
    const [open, setOpen] = useState(false);
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const g = row.__group;
    const stats = g?.stats;

    const doDelete = async (confirmFlag = false) => {
        setBusy(true); setError(null);
        try {
            const res = await api.delete(`/ppc/checks/${row.id}`, { params: { confirm: confirmFlag } });
            if (res.data?.deleted === false && res.data?.requires_confirmation) {
                setConfirm({ message: res.data.explanation, before: res.data.flag_before, after: res.data.flag_after });
                return;
            }
            setConfirm(null);
            try { track.ppc.checkDeleted({ check_id: row.id }); } catch (_) { /* noop */ }
            onChanged?.();
        } catch (err) {
            setError(extractErrorMessage(err, "Delete failed."));
        } finally { setBusy(false); }
    };

    return (
        <>
            <tr
                className={`border-t border-kindred cursor-pointer hover:bg-primary-k/[0.03] ${zebra ? "bg-primary-k/[0.015]" : ""}`}
                onClick={() => setOpen((o) => !o)}
                data-testid={`ppc-history-tr-${row.id}`}
            >
                <td className="px-4 py-3 align-top whitespace-nowrap text-sm text-primary-k">
                    <div className="inline-flex items-center gap-1.5">
                        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-k" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-k" />}
                        {formatIso(row.created_at)}
                    </div>
                </td>
                <td className="px-4 py-3 align-top">
                    <div className="text-sm font-medium text-primary-k">{titleCase(row.service)}</div>
                    <div className="text-xs text-muted-k">{row.provider_display_name || "No provider entered"}</div>
                    {row.groupFlagged && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-clay/10 border border-clay/25 text-clay px-2 py-0.5 text-[10px] font-medium" data-testid={`ppc-history-flag-${row.id}`}>
                            <AlertTriangle className="h-3 w-3" /> {g.increases12mo} rises in 12 months
                        </span>
                    )}
                </td>
                <td className="px-4 py-3 align-top text-right whitespace-nowrap text-sm text-primary-k tabular-nums">
                    {formatAUD2(row.rate)}<span className="text-xs text-muted-k">/{row.unit || "unit"}</span>
                </td>
                <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                    <ChangeBadge abs={row.changeAbs} pct={row.changePct} unit={row.unit} />
                </td>
                <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); doDelete(false); }}
                        disabled={busy}
                        className="p-1.5 rounded-full text-muted-k hover:text-terracotta hover:bg-terracotta/10"
                        aria-label="Delete this entry"
                        data-testid={`ppc-history-row-delete-${row.id}`}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                </td>
            </tr>
            {open && (
                <tr className="bg-primary-k/[0.02]" data-testid={`ppc-history-detail-${row.id}`}>
                    <td colSpan={5} className="px-4 pb-4 pt-0">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <DetailStat label="Latest rate" value={`${formatAUD2(stats?.latest ?? row.rate)}/${stats?.unit || row.unit || "unit"}`} tone="teal" />
                            <DetailStat label="Best you've seen" value={`${formatAUD2(stats?.lowest ?? row.rate)}/${stats?.unit || row.unit || "unit"}`} tone="good" />
                            <DetailStat label="Highest seen" value={`${formatAUD2(stats?.highest ?? row.rate)}/${stats?.unit || row.unit || "unit"}`} tone="warn" />
                            <DetailStat label="Saved checks" value={`${g?.rows?.length ?? 1}`} tone="neutral" />
                        </div>
                        {row.source_statement_id && (
                            <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-k">
                                <FileText className="h-3.5 w-3.5" /> Captured from a decoded statement
                            </div>
                        )}
                        {error && <div className="mt-2 text-xs text-terracotta">{error}</div>}
                    </td>
                </tr>
            )}
            <Dialog open={Boolean(confirm)} onOpenChange={(v) => { if (!v) setConfirm(null); }}>
                <DialogContent data-testid="ppc-history-row-delete-confirm">
                    <DialogHeader><DialogTitle>Confirm delete</DialogTitle></DialogHeader>
                    <div className="text-sm text-primary-k">
                        <p>{confirm?.message}</p>
                        <p className="mt-2 text-xs text-muted-k">{`Before: ${confirm?.before ?? 0} increases counted. After: ${confirm?.after ?? 0} increases.`}</p>
                    </div>
                    <DialogFooter className="gap-2">
                        <button type="button" onClick={() => setConfirm(null)} className="px-3.5 py-2 rounded-full border border-kindred text-primary-k text-sm">Keep it</button>
                        <button type="button" onClick={() => doDelete(true)} className="px-3.5 py-2 rounded-full bg-terracotta text-white text-sm" data-testid="ppc-history-row-delete-confirm-btn">Delete anyway</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function DetailStat({ label, value, tone }) {
    const cls = tone === "good" ? "text-sage" : tone === "warn" ? "text-clay" : tone === "teal" ? "text-primary-k" : "text-muted-k";
    return (
        <div className="rounded-xl border border-kindred bg-surface px-3 py-2.5">
            <div className="text-[11px] text-muted-k uppercase tracking-wider">{label}</div>
            <div className={`text-sm font-medium tabular-nums ${cls}`}>{value}</div>
        </div>
    );
}

function titleCase(s) {
    if (!s) return s;
    return String(s).replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function formatIso(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; }
}

function MilestoneBanner({ milestone, totalSaved, onDismiss }) {
    useEffect(() => { const t = setTimeout(onDismiss, 12000); return () => clearTimeout(t); }, [onDismiss]);
    return (
        <div className="mb-6 rounded-2xl border border-sage/40 bg-gradient-to-r from-sage/10 via-sage/5 to-transparent px-5 py-4 flex items-start gap-4 shadow-sm" data-testid="ppc-milestone-banner" data-milestone={milestone.threshold} role="status" aria-live="polite">
            <div className="shrink-0 h-10 w-10 rounded-full bg-sage/15 flex items-center justify-center">
                <PartyPopper className="h-5 w-5 text-sage" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-heading text-lg text-primary-k" data-testid="ppc-milestone-heading">You&apos;ve crossed {milestone.label} saved</div>
                <p className="text-sm text-muted-k leading-snug mt-0.5">{milestone.copy}</p>
                <p className="text-xs text-muted-k mt-1.5 tabular-nums" data-testid="ppc-milestone-total">Estimated total tracked: <span className="font-medium text-primary-k">{formatAUD2(totalSaved)}</span></p>
            </div>
            <button type="button" onClick={onDismiss} aria-label="Dismiss milestone" data-testid="ppc-milestone-dismiss" className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-full text-muted-k hover:text-primary-k hover:bg-white/60">
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
