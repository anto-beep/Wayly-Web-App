/**
 * QP-1 v1 (MVP), Quarterly Pacing UI.
 *
 * Single container that renders three tabs:
 *   - Pacing    : envelope, current spend, projection, colour indicator,
 *                 confidence, and an expandable "How is this calculated?"
 *   - This week : today/this week's ledger with Confirm / Missed / Changed
 *                 actions, plus an ad-hoc entry form.
 *   - Schedules : create + list recurring service schedules.
 *
 * The pace status colours follow the QP-1 v1 spec:
 *   Green (±5%), Amber (±15%), Red (>15% over), Underspend (below 15% under)
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatAUD } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { useAuth } from "@/context/AuthContext";
import SeoHead from "@/seo/SeoHead";
import {
    AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronUp, FileCheck2, Info,
    Loader2, MinusCircle, Plus, TrendingDown, TrendingUp, XCircle,
} from "lucide-react";

const CADENCE_OPTIONS = [
    { value: "weekly",       label: "Weekly" },
    { value: "fortnightly",  label: "Fortnightly" },
    { value: "monthly",      label: "Monthly" },
    { value: "one_off",      label: "One-off" },
];
const DAYS = [
    { value: 0, label: "Monday" },
    { value: 1, label: "Tuesday" },
    { value: 2, label: "Wednesday" },
    { value: 3, label: "Thursday" },
    { value: 4, label: "Friday" },
    { value: 5, label: "Saturday" },
    { value: 6, label: "Sunday" },
];

const PACE_META = {
    green:      { label: "On track",                  tone: "bg-sage/15 text-[#0F5648] border-sage/50",         Icon: CheckCircle2 },
    amber:      { label: "Watch this",                tone: "bg-gold/20 text-[#7A5B00] border-gold/60",         Icon: AlertTriangle },
    red:        { label: "Over pace",                 tone: "bg-terracotta/15 text-[#8A2E1B] border-terracotta/50", Icon: TrendingUp },
    underspend: { label: "Underspending",             tone: "bg-primary-k/10 text-primary-k border-primary-k/40",     Icon: TrendingDown },
    unknown:    { label: "Not enough data yet",       tone: "bg-surface-2 text-muted-k border-kindred",         Icon: Info },
};

export default function QuarterlyPacing() {
    const { items: participants, activeId: activeParticipantId } = useParticipants();
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const [tab, setTab] = useState(params.get("tab") || "pacing");
    const [pacing, setPacing] = useState(null);
    const [ledger, setLedger] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const activeParticipant = useMemo(
        () => (participants || []).find((p) => p.id === activeParticipantId) || (participants || [])[0],
        [participants, activeParticipantId],
    );
    const participantId = activeParticipant?.id;
    const classification = Number(activeParticipant?.classification_level) || null;

    const reload = useCallback(async () => {
        if (!participantId) return;
        setLoading(true);
        setError("");
        try {
            const q = classification ? `?participant_id=${participantId}&classification=${classification}` : `?participant_id=${participantId}`;
            const [p, l, s] = await Promise.all([
                api.get(`/qp1/pacing${q}`),
                api.get(`/qp1/ledger?participant_id=${participantId}`),
                api.get(`/qp1/schedules?participant_id=${participantId}`),
            ]);
            setPacing(p.data);
            setLedger(l.data?.entries || []);
            setSchedules(s.data?.schedules || []);
        } catch (e) {
            setError(e?.response?.data?.detail || "Could not load pacing.");
        } finally { setLoading(false); }
    }, [participantId, classification]);

    useEffect(() => { reload(); }, [reload]);

    function switchTab(t) {
        setTab(t);
        const next = new URLSearchParams(params);
        next.set("tab", t);
        setParams(next, { replace: true });
    }

    if (!participants || participants.length === 0) {
        return (
            <div className="space-y-6" data-testid="qp1-root">
                <SeoHead title="Quarterly Pacing | Wayly" />
                <EmptyStateNoParticipant />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="qp1-root">
            <SeoHead title="Quarterly Pacing | Wayly" />
            <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                <div>
                    <span className="overline">Quarterly pacing</span>
                    <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2">
                        {activeParticipant?.first_name ? `${activeParticipant.first_name}, this quarter` : "This quarter"}
                    </h1>
                    {pacing?.quarter?.label && (
                        <p className="text-muted-k mt-2 text-sm">
                            {pacing.quarter.label} · Day {pacing.quarter.elapsed_days} of {pacing.quarter.total_days}
                        </p>
                    )}
                </div>
                <nav className="inline-flex rounded-full border border-kindred bg-white p-1" data-testid="qp1-tabs">
                    {[
                        { k: "pacing",    label: "Pacing" },
                        { k: "week",      label: "This week" },
                        { k: "schedules", label: "Schedules" },
                        { k: "history",   label: "History" },
                    ].map((t) => (
                        <button
                            key={t.k}
                            type="button"
                            onClick={() => switchTab(t.k)}
                            data-testid={`qp1-tab-${t.k}`}
                            className={`px-4 py-1.5 text-sm rounded-full transition ${tab === t.k ? "bg-primary-k text-white" : "text-primary-k hover:bg-surface-2"}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </nav>
            </header>

            {error && (
                <div className="rounded-xl border border-terracotta/40 bg-terracotta/5 p-4 text-sm text-terracotta" data-testid="qp1-error">
                    {error}
                </div>
            )}

            {loading && !pacing ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 text-primary-k animate-spin" />
                </div>
            ) : (
                <>
                    {tab === "pacing"    && <PacingTab pacing={pacing} />}
                    {tab === "week"      && (
                        <WeekTab
                            ledger={ledger}
                            participantId={participantId}
                            onChanged={reload}
                        />
                    )}
                    {tab === "schedules" && (
                        <SchedulesTab
                            schedules={schedules}
                            participantId={participantId}
                            onChanged={reload}
                        />
                    )}
                    {tab === "history"   && (
                        <HistoryTab
                            participantId={participantId}
                            classification={classification}
                        />
                    )}
                </>
            )}
        </div>
    );
}

// ================================ PACING TAB ================================

function PacingTab({ pacing }) {
    const [openCalc, setOpenCalc] = useState(false);
    if (!pacing) return null;
    const meta = PACE_META[pacing.pace_status] || PACE_META.unknown;
    const { Icon } = meta;

    return (
        <section className="space-y-6" data-testid="qp1-pacing-view">
            <div className={`rounded-2xl border p-6 sm:p-8 flex flex-col gap-4 ${meta.tone}`} data-testid={`qp1-pace-card-${pacing.pace_status}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/70">
                            <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <div>
                            <div className="text-xs uppercase tracking-[0.14em]">Pace</div>
                            <div className="font-heading text-2xl sm:text-3xl">{meta.label}</div>
                        </div>
                    </div>
                    <span className="text-xs uppercase tracking-[0.14em]">Confidence: {pacing.confidence}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Stat label="Envelope" value={formatAUD(pacing.envelope)} testId="qp1-stat-envelope" />
                    <Stat label="Actual spent" value={formatAUD(pacing.actual_spent)} testId="qp1-stat-spent" />
                    <Stat label="Projected total" value={formatAUD(pacing.projected_end_of_quarter_total)} testId="qp1-stat-projected" />
                </div>
                {pacing.underspend_flag && (
                    <div className="rounded-xl bg-white/70 p-4 text-sm text-primary-k flex items-start gap-3" data-testid="qp1-underspend-warning">
                        <TrendingDown className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                        <div>
                            <strong>Heads up, funds may roll off.</strong>{" "}
                            You&apos;re on track to underspend by more than the rollover cap ({formatAUD(pacing.rollover_cap_aud)}).
                            Consider bringing forward services that were paused.
                        </div>
                    </div>
                )}
            </div>

            <details
                className="rounded-2xl border border-kindred bg-white"
                open={openCalc}
                onToggle={(e) => setOpenCalc(e.currentTarget.open)}
                data-testid="qp1-how-calculated"
            >
                <summary className="cursor-pointer list-none flex items-center justify-between p-5 sm:p-6">
                    <span className="font-heading text-lg text-primary-k">How is this calculated?</span>
                    {openCalc ? <ChevronUp className="h-5 w-5 text-muted-k" /> : <ChevronDown className="h-5 w-5 text-muted-k" />}
                </summary>
                <div className="px-5 sm:px-6 pb-6 space-y-3 text-sm text-primary-k/85 leading-relaxed">
                    <p>
                        Actual spent = reconciled + confirmed + assumed + ad-hoc totals.
                        Reconciled comes from decoded statements, confirmed comes from your weekly check-in,
                        assumed applies to services scheduled &gt; 7 days ago but still not confirmed, and
                        ad-hoc is anything you logged outside a schedule.
                    </p>
                    <p>
                        Projected end-of-quarter total = actual spent + the sum of remaining expected
                        entries in your ledger for this quarter.
                    </p>
                    <p>
                        Pace status: <strong>Green</strong> when projected is within 5% of envelope,{" "}
                        <strong>Amber</strong> within 15%, <strong>Red</strong> more than 15% over.
                        We flag underspend separately when projected falls more than the rollover cap below envelope.
                    </p>
                    <ul className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <li>Reconciled: {formatAUD(pacing.reconciled_total)}</li>
                        <li>Confirmed: {formatAUD(pacing.confirmed_total)}</li>
                        <li>Assumed: {formatAUD(pacing.assumed_total)}</li>
                        <li>Ad-hoc: {formatAUD(pacing.adhoc_total)}</li>
                        <li>Expected remaining: {formatAUD(pacing.expected_remaining_total)}</li>
                        <li>Pace target today: {formatAUD(pacing.expected_pace_today)}</li>
                    </ul>
                </div>
            </details>
        </section>
    );
}

function Stat({ label, value, testId }) {
    return (
        <div className="rounded-xl bg-white/70 p-4" data-testid={testId}>
            <div className="text-xs uppercase tracking-wider text-muted-k">{label}</div>
            <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums">{value}</div>
        </div>
    );
}

// ================================ WEEK TAB =================================

function WeekTab({ ledger, participantId, onChanged }) {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const mondayISO = monday.toISOString().slice(0, 10);
    const sundayISO = sunday.toISOString().slice(0, 10);

    const inWeek = ledger.filter((e) => e.expected_date >= mondayISO && e.expected_date <= sundayISO);
    const past   = ledger.filter((e) => e.expected_date <  mondayISO && (e.state === "expected" || e.state === "assumed")).slice(-8);

    return (
        <section className="space-y-6" data-testid="qp1-week-view">
            <AdHocForm participantId={participantId} onSaved={onChanged} />
            <ReconcileFromStatementForm participantId={participantId} onDone={onChanged} />
            <ReconcileForm participantId={participantId} onDone={onChanged} />
            <BucketList
                title="This week"
                subtitle={`${mondayISO} to ${sundayISO}`}
                entries={inWeek}
                onChanged={onChanged}
                emptyText="Nothing scheduled this week. Add an ad-hoc service if something happened."
                testIdPrefix="qp1-week-current"
            />
            {past.length > 0 && (
                <BucketList
                    title="Not yet confirmed"
                    subtitle="Older expected services still open, confirm, mark missed, or note a change."
                    entries={past}
                    onChanged={onChanged}
                    emptyText="Everything up to date."
                    testIdPrefix="qp1-week-past"
                />
            )}
        </section>
    );
}

function BucketList({ title, subtitle, entries, onChanged, emptyText, testIdPrefix }) {
    return (
        <div className="rounded-2xl border border-kindred bg-white p-5 sm:p-6" data-testid={`${testIdPrefix}-card`}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="font-heading text-xl text-primary-k">{title}</h2>
                    {subtitle && <p className="text-xs text-muted-k mt-1">{subtitle}</p>}
                </div>
                <span className="text-xs text-muted-k">{entries.length} item{entries.length === 1 ? "" : "s"}</span>
            </div>
            {entries.length === 0 ? (
                <p className="mt-4 text-sm text-muted-k">{emptyText}</p>
            ) : (
                <ul className="mt-4 space-y-3">
                    {entries.map((e) => (
                        <LedgerRow key={e.id} entry={e} onChanged={onChanged} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function LedgerRow({ entry, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [showChanged, setShowChanged] = useState(false);
    const [dur, setDur] = useState(entry.expected_duration_hours ?? "");
    const [rate, setRate] = useState(entry.expected_rate ?? "");
    const [note, setNote] = useState("");

    const stateBadge = {
        expected:   { label: "Expected",   cls: "bg-surface-2 text-muted-k" },
        confirmed:  { label: "Confirmed",  cls: "bg-sage/15 text-[#0F5648]" },
        missed:     { label: "Missed",     cls: "bg-terracotta/15 text-[#8A2E1B]" },
        changed:    { label: "Changed",    cls: "bg-gold/20 text-[#7A5B00]" },
        assumed:    { label: "Assumed",    cls: "bg-gold/15 text-[#7A5B00]" },
        ad_hoc:     { label: "Ad-hoc",     cls: "bg-primary-k/10 text-primary-k" },
        reconciled: { label: "Reconciled", cls: "bg-sage/25 text-[#0F5648]" },
    }[entry.state] || { label: entry.state, cls: "bg-surface-2 text-muted-k" };

    const done = entry.state !== "expected" && entry.state !== "assumed";

    async function act(kind, body) {
        setBusy(true);
        try {
            const url = kind === "confirm" ? `/qp1/ledger/${entry.id}/confirm`
                      : kind === "missed"  ? `/qp1/ledger/${entry.id}/missed`
                      : `/qp1/ledger/${entry.id}/changed`;
            await api.post(url, body || {});
            setShowChanged(false);
            await onChanged?.();
        } catch { /* silent */ }
        finally { setBusy(false); }
    }

    return (
        <li className={`rounded-xl border p-4 flex flex-col gap-3 ${done ? "border-kindred/60 bg-surface" : "border-kindred bg-white"}`} data-testid={`qp1-ledger-row-${entry.id}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading text-lg text-primary-k">{entry.service_type}</span>
                        <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ${stateBadge.cls}`} data-testid={`qp1-ledger-state-${entry.id}`}>
                            {stateBadge.label}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-k">
                        {entry.expected_date}
                        {entry.provider_name ? ` · ${entry.provider_name}` : ""}
                        {entry.expected_duration_hours ? ` · ${entry.expected_duration_hours}h @ ${formatAUD(entry.expected_rate || 0)}/hr` : ""}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <div className="font-heading text-lg text-primary-k tabular-nums">
                        {formatAUD(entry.actual_amount ?? entry.expected_amount ?? 0)}
                    </div>
                    {entry.actual_amount != null && entry.expected_amount != null && entry.actual_amount !== entry.expected_amount && (
                        <div className="text-xs text-muted-k line-through">{formatAUD(entry.expected_amount)}</div>
                    )}
                </div>
            </div>

            {!done && (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => act("confirm")}
                        disabled={busy}
                        data-testid={`qp1-confirm-${entry.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-primary-k text-white px-3 py-1.5 text-sm hover:bg-primary-k/90 disabled:opacity-60"
                    >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                    </button>
                    <button
                        type="button"
                        onClick={() => act("missed")}
                        disabled={busy}
                        data-testid={`qp1-missed-${entry.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-terracotta/40 text-terracotta px-3 py-1.5 text-sm hover:bg-terracotta/5 disabled:opacity-60"
                    >
                        <XCircle className="h-3.5 w-3.5" /> Missed
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowChanged((v) => !v)}
                        disabled={busy}
                        data-testid={`qp1-changed-toggle-${entry.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-kindred text-primary-k px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60"
                    >
                        <MinusCircle className="h-3.5 w-3.5" /> Changed…
                    </button>
                </div>
            )}

            {!done && showChanged && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid={`qp1-changed-form-${entry.id}`}>
                    <label className="text-xs text-muted-k">
                        Actual hours
                        <input
                            type="number"
                            min="0.25"
                            step="0.25"
                            value={dur}
                            onChange={(e) => setDur(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-kindred px-3 py-1.5 text-sm"
                            data-testid={`qp1-changed-hours-${entry.id}`}
                        />
                    </label>
                    <label className="text-xs text-muted-k">
                        Actual $/hr
                        <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={rate}
                            onChange={(e) => setRate(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-kindred px-3 py-1.5 text-sm"
                            data-testid={`qp1-changed-rate-${entry.id}`}
                        />
                    </label>
                    <label className="text-xs text-muted-k sm:col-span-1">
                        Note (optional)
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-kindred px-3 py-1.5 text-sm"
                            data-testid={`qp1-changed-note-${entry.id}`}
                        />
                    </label>
                    <div className="sm:col-span-3">
                        <button
                            type="button"
                            onClick={() => act("changed", {
                                actual_duration_hours: Number(dur) || null,
                                actual_rate: Number(rate) || null,
                                notes: note || null,
                            })}
                            disabled={busy}
                            data-testid={`qp1-changed-save-${entry.id}`}
                            className="inline-flex items-center gap-1 rounded-full bg-primary-k text-white px-4 py-1.5 text-sm hover:bg-primary-k/90 disabled:opacity-60"
                        >
                            Save change
                        </button>
                    </div>
                </div>
            )}

            {entry.notes && (
                <p className="text-xs text-muted-k italic">Note: {entry.notes}</p>
            )}
        </li>
    );
}

function AdHocForm({ participantId, onSaved }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [serviceType, setServiceType] = useState("");
    const [provider, setProvider] = useState("");
    const [when, setWhen] = useState(new Date().toISOString().slice(0, 10));
    const [dur, setDur] = useState("1");
    const [rate, setRate] = useState("");
    const [note, setNote] = useState("");
    const [err, setErr] = useState("");

    async function save() {
        setErr("");
        if (!serviceType.trim()) { setErr("Add a service type"); return; }
        if (!dur || !rate) { setErr("Enter duration and rate"); return; }
        setBusy(true);
        try {
            await api.post("/qp1/ledger/ad_hoc", {
                participant_id: participantId,
                service_type: serviceType.trim(),
                provider_name: provider.trim() || null,
                actual_date: when,
                actual_duration_hours: Number(dur),
                actual_rate: Number(rate),
                notes: note.trim() || null,
            });
            setServiceType(""); setProvider(""); setDur("1"); setRate(""); setNote("");
            setOpen(false);
            await onSaved?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not save");
        } finally { setBusy(false); }
    }

    return (
        <div className="rounded-2xl border border-kindred bg-white p-5 sm:p-6" data-testid="qp1-adhoc-card">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="font-heading text-lg text-primary-k">Log a one-off service</h2>
                    <p className="text-xs text-muted-k mt-1">Anything that happened outside your schedule.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-sm hover:bg-primary-k/5"
                    data-testid="qp1-adhoc-toggle"
                >
                    <Plus className="h-3.5 w-3.5" /> {open ? "Close" : "Log ad-hoc"}
                </button>
            </div>
            {open && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="qp1-adhoc-form">
                    <TextField label="Service type" value={serviceType} onChange={setServiceType} testId="qp1-adhoc-service" />
                    <TextField label="Provider (optional)" value={provider} onChange={setProvider} testId="qp1-adhoc-provider" />
                    <TextField label="Date" type="date" value={when} onChange={setWhen} testId="qp1-adhoc-date" />
                    <TextField label="Hours" type="number" value={dur} onChange={setDur} testId="qp1-adhoc-hours" />
                    <TextField label="Rate $/hr" type="number" value={rate} onChange={setRate} testId="qp1-adhoc-rate" />
                    <TextField label="Note (optional)" value={note} onChange={setNote} testId="qp1-adhoc-note" />
                    {err && <p className="sm:col-span-2 text-xs text-terracotta">{err}</p>}
                    <div className="sm:col-span-2">
                        <button
                            type="button"
                            onClick={save}
                            disabled={busy}
                            data-testid="qp1-adhoc-save"
                            className="inline-flex items-center gap-1 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-primary-k/90 disabled:opacity-60"
                        >
                            Save one-off
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================== SCHEDULES TAB ==============================

function SchedulesTab({ schedules, participantId, onChanged }) {
    return (
        <section className="space-y-6" data-testid="qp1-schedules-view">
            <ScheduleForm participantId={participantId} onSaved={onChanged} />
            <div className="rounded-2xl border border-kindred bg-white p-5 sm:p-6">
                <h2 className="font-heading text-xl text-primary-k">Your schedules</h2>
                {schedules.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-k">No schedules yet. Add one above to start tracking pacing.</p>
                ) : (
                    <ul className="mt-4 space-y-3">
                        {schedules.map((s) => (
                            <ScheduleRow key={s.id} sched={s} onChanged={onChanged} />
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function ScheduleRow({ sched, onChanged }) {
    const [busy, setBusy] = useState(false);
    async function end() {
        setBusy(true);
        try { await api.delete(`/qp1/schedules/${sched.id}`); await onChanged?.(); }
        catch { /* silent */ }
        finally { setBusy(false); }
    }
    const cadenceLabel = sched.cadence === "weekly" || sched.cadence === "fortnightly"
        ? `${sched.cadence} · ${DAYS[sched.cadence_day ?? 0]?.label || ""}`
        : sched.cadence === "monthly" ? `monthly · day ${sched.cadence_day_of_month || 1}`
        : "one-off";
    return (
        <li className="rounded-xl border border-kindred p-4 flex items-start justify-between gap-3 flex-wrap" data-testid={`qp1-schedule-row-${sched.id}`}>
            <div className="min-w-0">
                <div className="font-heading text-lg text-primary-k">{sched.service_type}</div>
                <div className="text-xs text-muted-k mt-1">
                    {cadenceLabel} · {sched.duration_hours}h @ {formatAUD(sched.hourly_rate)}/hr
                    {sched.provider_name ? ` · ${sched.provider_name}` : ""}
                    · from {sched.effective_from}
                </div>
            </div>
            <button
                type="button"
                onClick={end}
                disabled={busy}
                data-testid={`qp1-schedule-end-${sched.id}`}
                className="text-sm text-terracotta hover:underline disabled:opacity-60"
            >
                End schedule
            </button>
        </li>
    );
}

function ScheduleForm({ participantId, onSaved }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [serviceType, setServiceType] = useState("");
    const [provider, setProvider] = useState("");
    const [cadence, setCadence] = useState("weekly");
    const [day, setDay] = useState(1); // Tue default
    const [dom, setDom] = useState(1);
    const [dur, setDur] = useState("1");
    const [rate, setRate] = useState("");
    const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
    const [err, setErr] = useState("");

    async function save() {
        setErr("");
        if (!serviceType.trim() || !dur || !rate) { setErr("Fill service type, duration and rate"); return; }
        setBusy(true);
        try {
            const body = {
                participant_id: participantId,
                service_type: serviceType.trim(),
                provider_name: provider.trim() || null,
                cadence,
                cadence_day: (cadence === "weekly" || cadence === "fortnightly") ? Number(day) : null,
                cadence_day_of_month: cadence === "monthly" ? Number(dom) : null,
                duration_hours: Number(dur),
                hourly_rate: Number(rate),
                effective_from: from,
            };
            await api.post("/qp1/schedules", body);
            setServiceType(""); setProvider(""); setDur("1"); setRate("");
            setOpen(false);
            await onSaved?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not save");
        } finally { setBusy(false); }
    }

    return (
        <div className="rounded-2xl border border-kindred bg-white p-5 sm:p-6" data-testid="qp1-schedule-form-card">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="font-heading text-lg text-primary-k">Add a recurring service</h2>
                    <p className="text-xs text-muted-k mt-1">This drives your pacing calculation.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-sm hover:bg-primary-k/5"
                    data-testid="qp1-schedule-toggle"
                >
                    <Plus className="h-3.5 w-3.5" /> {open ? "Close" : "Add schedule"}
                </button>
            </div>
            {open && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="qp1-schedule-form">
                    <TextField label="Service type" value={serviceType} onChange={setServiceType} testId="qp1-schedule-service" />
                    <TextField label="Provider (optional)" value={provider} onChange={setProvider} testId="qp1-schedule-provider" />
                    <SelectField label="Cadence" value={cadence} onChange={setCadence} options={CADENCE_OPTIONS} testId="qp1-schedule-cadence" />
                    {(cadence === "weekly" || cadence === "fortnightly") && (
                        <SelectField label="Day of week" value={day} onChange={(v) => setDay(Number(v))} options={DAYS} testId="qp1-schedule-day" />
                    )}
                    {cadence === "monthly" && (
                        <TextField label="Day of month" type="number" value={dom} onChange={setDom} testId="qp1-schedule-dom" />
                    )}
                    <TextField label="Hours per visit" type="number" value={dur} onChange={setDur} testId="qp1-schedule-hours" />
                    <TextField label="Rate $/hr" type="number" value={rate} onChange={setRate} testId="qp1-schedule-rate" />
                    <TextField label="Start date" type="date" value={from} onChange={setFrom} testId="qp1-schedule-from" />
                    {err && <p className="sm:col-span-2 text-xs text-terracotta">{err}</p>}
                    <div className="sm:col-span-2">
                        <button
                            type="button"
                            onClick={save}
                            disabled={busy}
                            data-testid="qp1-schedule-save"
                            className="inline-flex items-center gap-1 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-primary-k/90 disabled:opacity-60"
                        >
                            Save schedule
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ================================ SHARED UI ================================

function TextField({ label, value, onChange, type = "text", testId }) {
    return (
        <label className="text-xs text-muted-k">
            {label}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-kindred px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-k"
                data-testid={testId}
            />
        </label>
    );
}

function SelectField({ label, value, onChange, options, testId }) {
    return (
        <label className="text-xs text-muted-k">
            {label}
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-kindred px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-k"
                data-testid={testId}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </label>
    );
}

function EmptyStateNoParticipant() {
    return (
        <div className="rounded-2xl border border-kindred bg-white p-8 text-center" data-testid="qp1-empty-participant">
            <Calendar className="h-8 w-8 text-muted-k mx-auto" aria-hidden />
            <h1 className="mt-4 font-heading text-2xl text-primary-k">Add a participant to start pacing</h1>
            <p className="mt-3 text-sm text-muted-k">
                Quarterly Pacing needs a participant profile so it knows the classification level and quarterly envelope.
            </p>
        </div>
    );
}


// ============================== RECONCILE FORM ==============================

const PACE_META_HISTORY = {
    green:      { label: "On track",     cls: "bg-sage/15 text-[#0F5648] border-sage/40" },
    amber:      { label: "Watch this",   cls: "bg-gold/20 text-[#7A5B00] border-gold/50" },
    red:        { label: "Over pace",    cls: "bg-terracotta/15 text-[#8A2E1B] border-terracotta/40" },
    underspend: { label: "Underspent",   cls: "bg-primary-k/10 text-primary-k border-primary-k/30" },
    unknown:    { label: "No data",      cls: "bg-surface-2 text-muted-k border-kindred" },
};


// ==================== RECONCILE FROM DECODED STATEMENT ====================

function ReconcileFromStatementForm({ participantId, onDone }) {
    const [open, setOpen] = useState(false);
    const [statements, setStatements] = useState(null);
    const [selectedId, setSelectedId] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (!open || statements !== null) return;
        (async () => {
            try {
                const { data } = await api.get("/statements");
                const items = Array.isArray(data) ? data : (data?.items || []);
                // Filter to statements with line items; sort newest first.
                const withLines = items.filter((s) => (s.line_items || []).length > 0);
                withLines.sort((a, b) => String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || "")));
                setStatements(withLines);
                if (withLines[0]) setSelectedId(withLines[0].id);
            } catch (e) {
                setErr(e?.response?.data?.detail || "Could not load statements");
                setStatements([]);
            }
        })();
    }, [open, statements]);

    async function submit() {
        setErr(""); setResult(null);
        if (!selectedId) { setErr("Choose a statement"); return; }
        setBusy(true);
        try {
            const { data } = await api.post("/qp1/reconciliations/from-statement", {
                participant_id: participantId,
                statement_id: selectedId,
                create_adhoc_for_unmatched: true,
            });
            setResult(data);
            await onDone?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || "Reconciliation failed");
        } finally { setBusy(false); }
    }

    return (
        <div className="rounded-2xl border border-sage/50 bg-sage/5 p-5 sm:p-6" data-testid="qp1-reconcile-statement-card">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="font-heading text-lg text-primary-k">Reconcile from a decoded statement</h2>
                        <span className="inline-flex items-center rounded-full bg-sage text-white text-[10px] uppercase tracking-wider px-2 py-0.5 font-semibold">Recommended</span>
                    </div>
                    <p className="text-xs text-muted-k mt-1">
                        Pull line items straight from a Wayly-decoded statement, no copy-paste. Matches lift confidence to high.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full bg-sage text-white px-3 py-1.5 text-sm hover:opacity-90"
                    data-testid="qp1-reconcile-statement-toggle"
                >
                    <FileCheck2 className="h-3.5 w-3.5" /> {open ? "Close" : "Pick a statement"}
                </button>
            </div>
            {open && (
                <div className="mt-4 space-y-3" data-testid="qp1-reconcile-statement-form">
                    {statements === null ? (
                        <div className="text-sm text-muted-k">Loading statements…</div>
                    ) : statements.length === 0 ? (
                        <div className="text-sm text-muted-k">
                            No decoded statements with line items yet. Upload one on the Statements page and it will appear here.
                        </div>
                    ) : (
                        <>
                            <label className="text-xs text-muted-k block">
                                Statement
                                <select
                                    value={selectedId}
                                    onChange={(e) => setSelectedId(e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-kindred bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-k"
                                    data-testid="qp1-reconcile-statement-select"
                                >
                                    {statements.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {(s.period_label || s.filename || s.id.slice(0, 8))} · {(s.line_items || []).length} lines
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {err && <p className="text-xs text-terracotta" data-testid="qp1-reconcile-statement-error">{err}</p>}
                            <button
                                type="button"
                                onClick={submit}
                                disabled={busy || !selectedId}
                                data-testid="qp1-reconcile-statement-submit"
                                className="inline-flex items-center gap-1 rounded-full bg-sage text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60"
                            >
                                {busy ? "Reconciling…" : "Reconcile now"}
                            </button>
                            {result && (
                                <div className="mt-3 rounded-xl border border-sage/40 bg-white p-3 text-sm" data-testid="qp1-reconcile-statement-result">
                                    <div className="font-heading text-base text-[#0F5648]">
                                        {result.matched_count} matched · {result.unmatched_count} logged as ad-hoc · {result.lines_considered} lines considered
                                    </div>
                                    <ul className="mt-2 text-xs text-primary-k/80 space-y-0.5 max-h-40 overflow-auto">
                                        {(result.dispositions || []).slice(0, 30).map((d, i) => (
                                            <li key={i}>
                                                {d.line_date} · {formatAUD(d.line_amount)} → <strong>{String(d.outcome).replace("_", " ")}</strong>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function ReconcileForm({ participantId, onDone }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [ref, setRef] = useState("");
    const [csv, setCsv] = useState("");
    const [result, setResult] = useState(null);
    const [err, setErr] = useState("");

    function parseCsv(input) {
        // Accepts lines like: 2026-08-04, 108.75, BlueBerry Care visit
        return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
            const parts = line.split(",").map((s) => s.trim());
            if (parts.length < 2) return null;
            const iso = parts[0];
            const amount = Number(parts[1]);
            const description = parts.slice(2).join(",").trim() || null;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(amount)) return null;
            return { line_date: iso, amount, description };
        }).filter(Boolean);
    }

    async function submit() {
        setErr(""); setResult(null);
        const lines = parseCsv(csv);
        if (lines.length === 0) { setErr("Paste at least one line: YYYY-MM-DD, amount[, description]"); return; }
        setBusy(true);
        try {
            const { data } = await api.post("/qp1/reconciliations", {
                participant_id: participantId,
                statement_ref: ref.trim() || null,
                lines,
                create_adhoc_for_unmatched: true,
            });
            setResult(data);
            await onDone?.();
        } catch (e) {
            setErr(e?.response?.data?.detail || "Reconciliation failed");
        } finally { setBusy(false); }
    }

    return (
        <div className="rounded-2xl border border-kindred bg-white p-5 sm:p-6" data-testid="qp1-reconcile-card">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="font-heading text-lg text-primary-k">Reconcile against a statement</h2>
                    <p className="text-xs text-muted-k mt-1">
                        Paste one line per row from your provider statement (date, amount, description). Matches replace assumed spend and lift the pacing confidence.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-sm hover:bg-primary-k/5"
                    data-testid="qp1-reconcile-toggle"
                >
                    <FileCheck2 className="h-3.5 w-3.5" /> {open ? "Close" : "Reconcile"}
                </button>
            </div>
            {open && (
                <div className="mt-4 space-y-3" data-testid="qp1-reconcile-form">
                    <TextField label="Statement reference (optional)" value={ref} onChange={setRef} testId="qp1-reconcile-ref" />
                    <label className="text-xs text-muted-k block">
                        Statement lines (one per row: YYYY-MM-DD, amount, description)
                        <textarea
                            value={csv}
                            onChange={(e) => setCsv(e.target.value)}
                            rows={5}
                            placeholder="2026-08-04, 108.75, BlueBerry Care visit"
                            className="mt-1 w-full rounded-lg border border-kindred px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-k"
                            data-testid="qp1-reconcile-csv"
                        />
                    </label>
                    {err && <p className="text-xs text-terracotta" data-testid="qp1-reconcile-error">{err}</p>}
                    <button
                        type="button"
                        onClick={submit}
                        disabled={busy}
                        data-testid="qp1-reconcile-submit"
                        className="inline-flex items-center gap-1 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-primary-k/90 disabled:opacity-60"
                    >
                        {busy ? "Reconciling…" : "Reconcile lines"}
                    </button>
                    {result && (
                        <div className="mt-3 rounded-xl border border-sage/40 bg-sage/5 p-3 text-sm" data-testid="qp1-reconcile-result">
                            <div className="font-heading text-base text-[#0F5648]">
                                {result.matched_count} matched · {result.unmatched_count} logged as ad-hoc
                            </div>
                            <ul className="mt-2 text-xs text-primary-k/80 space-y-0.5">
                                {(result.dispositions || []).slice(0, 20).map((d, i) => (
                                    <li key={i}>
                                        {d.line_date} · {formatAUD(d.line_amount)} → <strong>{d.outcome.replace("_", " ")}</strong>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ================================ HISTORY TAB ================================

function HistoryTab({ participantId, classification }) {
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!participantId) return;
        let alive = true;
        (async () => {
            setLoading(true); setErr("");
            try {
                const q = classification ? `?participant_id=${participantId}&classification=${classification}&quarters=4`
                                         : `?participant_id=${participantId}&quarters=4`;
                const { data } = await api.get(`/qp1/pacing/history${q}`);
                if (alive) setHistory(data.history || []);
            } catch (e) {
                if (alive) setErr(e?.response?.data?.detail || "Could not load history");
            } finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [participantId, classification]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16" data-testid="qp1-history-loading">
                <Loader2 className="h-6 w-6 text-primary-k animate-spin" />
            </div>
        );
    }
    if (err) {
        return <div className="rounded-xl border border-terracotta/40 bg-terracotta/5 p-4 text-sm text-terracotta" data-testid="qp1-history-error">{err}</div>;
    }

    return (
        <section className="space-y-6" data-testid="qp1-history-view">
            <div className="max-w-2xl">
                <span className="overline">Past quarters</span>
                <h2 className="mt-2 font-heading text-2xl sm:text-3xl text-primary-k tracking-tight">
                    How the last four quarters landed.
                </h2>
                <p className="mt-2 text-sm text-primary-k/85">
                    Ledger totals across previous quarters. Blank ones mean no data was tracked in Wayly at the time.
                </p>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(history || []).map((h) => (
                    <HistoryCard key={h.quarter.start} snap={h} />
                ))}
            </ul>
        </section>
    );
}

function HistoryCard({ snap }) {
    const meta = PACE_META_HISTORY[snap.pace_status] || PACE_META_HISTORY.unknown;
    const pct = snap.envelope > 0 ? Math.min(1.2, snap.actual_spent / snap.envelope) : 0;
    const noData = snap.entries_counted === 0;
    return (
        <li
            className={`rounded-2xl border p-5 ${meta.cls}`}
            data-testid={`qp1-history-card-${snap.quarter.start}`}
            data-status={snap.pace_status}
        >
            <div className="flex items-baseline justify-between gap-3">
                <div className="font-heading text-lg">{snap.quarter.label}</div>
                <span className="text-xs uppercase tracking-[0.14em]">{meta.label}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                    <div className="text-xs opacity-80">Envelope</div>
                    <div className="font-heading text-lg tabular-nums">{formatAUD(snap.envelope)}</div>
                </div>
                <div>
                    <div className="text-xs opacity-80">Spent</div>
                    <div className="font-heading text-lg tabular-nums">{noData ? "," : formatAUD(snap.actual_spent)}</div>
                </div>
            </div>
            {!noData && snap.envelope > 0 && (
                <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
                        <div className="h-full bg-current opacity-60" style={{ width: `${Math.round(pct * 100)}%` }} />
                    </div>
                    <div className="mt-1 text-xs opacity-80">
                        {Math.round(pct * 100)}% of envelope · {snap.entries_counted} entries
                    </div>
                </div>
            )}
        </li>
    );
}
