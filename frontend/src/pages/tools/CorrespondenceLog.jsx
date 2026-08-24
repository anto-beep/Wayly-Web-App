import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { api, extractErrorMessage } from "@/lib/api";
import {
    Loader2, ArrowLeft, Mail, MessageSquare, FileText, AlertTriangle,
    ShieldAlert, ChevronRight, Clock, CheckCircle2, ArrowUpRight, TrendingUp,
} from "lucide-react";

/**
 * LF-1 v1.2, Correspondence log page (WS8) + follow-up panel (Iter 3).
 *
 * Renders:
 *   - Overdue and upcoming follow-ups pulled from GET /api/lf1/follow-ups,
 *     each with a one-click "Escalate" (POST /:id/escalate).
 *   - The full chronological list of entries below.
 */

const ARCHETYPE_ICON = {
    request: FileText,
    dispute: FileText,
    complaint: MessageSquare,
    escalation: AlertTriangle,
    notification: FileText,
    response_draft: Mail,
    guided_pathway: ShieldAlert,
};

const STATUS_TONE = {
    draft:              { chip: "bg-surface-2 text-muted-k border-kindred", label: "Draft" },
    sent:               { chip: "bg-primary-k/10 text-primary-k border-primary-k/25", label: "Sent" },
    awaiting_response:  { chip: "bg-clay/10 text-clay border-clay/25", label: "Awaiting response" },
    responded:          { chip: "bg-sage/10 text-sage border-sage/25", label: "Responded" },
    escalated:          { chip: "bg-terracotta/10 text-terracotta border-terracotta/25", label: "Escalated" },
    closed:             { chip: "bg-surface-2 text-muted-k border-kindred", label: "Closed" },
};

export default function CorrespondenceLog() {
    const [entries, setEntries] = useState(null);
    const [error, setError] = useState(null);
    const [followUps, setFollowUps] = useState({ overdue: [], upcoming: [] });

    const loadAll = () => {
        api.get("/lf1/correspondence")
            .then((r) => setEntries(r.data?.entries || []))
            .catch((err) => setError(extractErrorMessage(err, "Could not load correspondence log.")));
        api.get("/lf1/follow-ups")
            .then((r) => setFollowUps({
                overdue: r.data?.overdue || [],
                upcoming: r.data?.upcoming || [],
            }))
            .catch(() => setFollowUps({ overdue: [], upcoming: [] }));
    };

    useEffect(() => { loadAll(); }, []);

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-10 pb-4">
                <Link
                    to="/ai-tools/letters-and-follow-ups"
                    className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"
                    data-testid="lf1-log-back"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Letters & Follow-ups
                </Link>
                <h1
                    className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight"
                    data-testid="lf1-log-title"
                >
                    Your correspondence log
                </h1>
                <p className="mt-3 text-lg text-muted-k max-w-2xl leading-relaxed">
                    {"Every letter you've drafted, sent, or received. Track follow-ups, escalate on time, and keep a case file for each situation."}
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-16 space-y-6">
                {entries === null && !error && (
                    <div className="text-muted-k inline-flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                )}
                {error && <div className="text-sm text-terracotta" data-testid="lf1-log-error">{error}</div>}

                {/* Follow-up + escalation panel */}
                {(followUps.overdue.length > 0 || followUps.upcoming.length > 0) && (
                    <FollowUpPanel
                        followUps={followUps}
                        onEscalated={loadAll}
                    />
                )}

                {entries && entries.length === 0 && (
                    <div
                        className="bg-surface border border-kindred rounded-2xl p-8 text-center"
                        data-testid="lf1-log-empty"
                    >
                        <div className="font-heading text-2xl text-primary-k">No letters yet</div>
                        <p className="mt-2 text-muted-k">
                            {"Start with the situation that fits, we'll build the draft and track the response."}
                        </p>
                        <Link
                            to="/ai-tools/letters-and-follow-ups"
                            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-k text-white text-sm hover:bg-[#091D33]"
                        >
                            Open Letters & Follow-ups
                        </Link>
                    </div>
                )}

                {entries && entries.length > 0 && (
                    <div className="space-y-3">
                        {entries.map((e) => (
                            <EntryCard key={e.id} entry={e} />
                        ))}
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}


// ---------------------------------------------------------------------
// Follow-up + escalation panel (Iter 3)
// ---------------------------------------------------------------------

function FollowUpPanel({ followUps, onEscalated }) {
    return (
        <div className="bg-surface border border-clay/25 rounded-2xl p-5" data-testid="lf1-follow-up-panel">
            <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-clay" aria-hidden="true" />
                <div className="font-heading text-xl text-primary-k">Follow-ups</div>
            </div>
            {followUps.overdue.length > 0 && (
                <div className="mt-3">
                    <div className="text-xs uppercase tracking-wider text-terracotta mb-2">
                        Overdue ({followUps.overdue.length})
                    </div>
                    <ul className="space-y-2" data-testid="lf1-followups-overdue">
                        {followUps.overdue.map((e) => (
                            <FollowUpRow key={e.id} entry={e} isOverdue onEscalated={onEscalated} />
                        ))}
                    </ul>
                </div>
            )}
            {followUps.upcoming.length > 0 && (
                <div className="mt-4">
                    <div className="text-xs uppercase tracking-wider text-muted-k mb-2">
                        Due soon ({followUps.upcoming.length})
                    </div>
                    <ul className="space-y-2" data-testid="lf1-followups-upcoming">
                        {followUps.upcoming.map((e) => (
                            <FollowUpRow key={e.id} entry={e} onEscalated={onEscalated} />
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function FollowUpRow({ entry, isOverdue = false, onEscalated }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const canEscalate = entry.recipient_type && ["provider_cm", "provider_senior", "mac", "acqsc"].includes(entry.recipient_type);

    const escalate = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/lf1/correspondence/${entry.id}/escalate`);
            onEscalated?.();
        } catch (err) {
            setError(extractErrorMessage(err, "Could not escalate."));
        } finally {
            setBusy(false);
        }
    };

    const daysCopy = () => {
        const d = entry.days_until_due;
        if (d === undefined) return "";
        if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
        if (d === 0) return "Due today";
        return `Due in ${d} day${d === 1 ? "" : "s"}`;
    };

    return (
        <li className="rounded-xl border border-kindred bg-surface p-3.5">
            <div className="flex items-start gap-3">
                <Clock className={isOverdue ? "h-4 w-4 mt-0.5 text-terracotta" : "h-4 w-4 mt-0.5 text-muted-k"} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                    <Link
                        to={`/tools/letters-and-follow-ups/${entry.id}`}
                        className="text-sm text-primary-k hover:underline"
                        data-testid={`lf1-followup-open-${entry.id}`}
                    >
                        {entry.situation_label || entry.archetype}
                    </Link>
                    <div className="text-xs text-muted-k mt-0.5">
                        {daysCopy()} · Suggested: {entry.suggested_next_action}
                    </div>
                </div>
                {canEscalate && (
                    <button
                        type="button"
                        onClick={escalate}
                        disabled={busy}
                        data-testid={`lf1-followup-escalate-${entry.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-primary-k text-primary-k px-3 py-1 text-xs hover:bg-primary-k hover:text-white disabled:opacity-60"
                    >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpRight className="h-3 w-3" />}
                        Escalate
                    </button>
                )}
            </div>
            {error && <div className="mt-1 text-xs text-terracotta" data-testid={`lf1-followup-error-${entry.id}`}>{error}</div>}
        </li>
    );
}


// ---------------------------------------------------------------------
// Entry card
// ---------------------------------------------------------------------

function EntryCard({ entry }) {
    const Icon = ARCHETYPE_ICON[entry.archetype] || FileText;
    const tone = STATUS_TONE[entry.status] || STATUS_TONE.draft;
    const isInbound = entry.direction === "inbound";
    return (
        <Link
            to={`/tools/letters-and-follow-ups/${entry.id}`}
            className="block bg-surface border border-kindred rounded-2xl p-5 hover:border-primary-k transition-colors"
            data-testid={`lf1-log-entry-${entry.id}`}
        >
            <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-primary-k mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-k uppercase tracking-wider">
                        {isInbound ? "Inbound message" : (entry.situation_label || entry.archetype)}
                    </div>
                    <div className="text-primary-k mt-0.5 truncate">
                        {isInbound
                            ? `From ${entry.inbound_from_label || entry.inbound_source}`
                            : entry.recipient_specific?.entity_name || recipientTypeLabel(entry.recipient_type)}
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                        <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 border ${tone.chip}`}
                            data-testid={`lf1-log-entry-status-${entry.id}`}
                        >
                            {tone.label}
                        </span>
                        {entry.follow_up_date && entry.status !== "responded" && entry.status !== "closed" && (
                            <span className="text-muted-k inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Follow up by {formatDate(entry.follow_up_date)}
                            </span>
                        )}
                        {entry.sent_at && (
                            <span className="text-muted-k inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Sent {formatDate(entry.sent_at)}
                            </span>
                        )}
                    </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-k mt-1" />
            </div>
        </Link>
    );
}

function recipientTypeLabel(rt) {
    return ({
        mac: "My Aged Care",
        acqsc: "Aged Care Quality and Safety Commission",
        complaints_commissioner: "Aged Care Complaints Commissioner",
        ombudsman: "Commonwealth Ombudsman",
        provider_cm: "Provider care manager",
        provider_senior: "Provider (senior)",
        services_australia_aged_care: "Services Australia, Aged Care",
        opan: "OPAN",
        other: "Other recipient",
    })[rt] || rt || "Recipient not set";
}

function formatDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    } catch { return iso; }
}
