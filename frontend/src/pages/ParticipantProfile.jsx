/**
 * CORE-1 v1 · Participant Profile Backbone
 *
 * Canonical route: /app/participants/:id
 * Shortcut route:  /app/me  (resolves to the participant self record)
 *
 * Aggregates every tool's most recent artefact for a single participant into
 * one profile page: header, financial position, open cases (LOOP-1 seam),
 * latest artefacts grid, household panel, timeline.
 *
 * Reads from GET /api/core/participants/:id/profile
 *
 * Feature flag: CORE1_PROFILE_ENABLED on the backend. Route returns 404 when off.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";
import { toTitleCase as titleCase } from "@/lib/titleCase";
import { useParticipants } from "@/context/ParticipantsContext";
import Skeleton from "@/components/Skeleton";
import { DotField, GaugeRing, CompareRow } from "@/components/BrandVisuals";
import {
    User, FileText, Receipt, ClipboardList, ListChecks, DollarSign,
    Mail, TrendingUp, Users, Clock, AlertCircle, ExternalLink,
    Sparkles, ChevronRight, ChevronDown,
} from "lucide-react";

// Persona is derived from the profile response itself, so we do not need a
// separate /auth/me round-trip. This removes a race and a spurious re-fetch.

const AUD0 = (v) => (v != null && isFinite(v)
    ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(v)
    : "—");

// Financial position hero — the standout data-viz panel. A budget gauge plus
// plain-English bars turn the raw figures into something a caregiver can read
// at a glance. Whole panel links through to the full contribution position.
function FinancialCard({ financial, personaFramingParticipantName, participantId }) {
    const cap = financial?.lifetime_cap_total?.amount;
    const spent = financial?.spent_to_date_this_quarter?.amount;
    const budget = financial?.quarterly_budget?.amount;
    const hasData = budget != null || spent != null;
    const pct = budget > 0 ? Math.min(100, Math.round(((spent || 0) / budget) * 100)) : 0;
    const remaining = budget != null ? Math.max(0, budget - (spent || 0)) : null;
    const lastStmt = financial?.last_statement_date ? formatDate(financial.last_statement_date) : "—";
    return (
        <section
            data-testid="core1-financial-card"
            className="relative overflow-hidden rounded-2xl p-6 sm:p-7 shadow-md"
            style={{ background: "linear-gradient(135deg,#0E4D52,#0A3E42)" }}
        >
            <DotField />
            <div className="relative flex items-center justify-between gap-2 mb-5">
                <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-white/80" aria-hidden />
                    <h2 className="text-base font-semibold text-white">Financial Position</h2>
                </div>
                {participantId && (
                    <Link
                        to={`/app/participants/${participantId}/contribution-position`}
                        data-testid="core1-view-contribution-position"
                        className="inline-flex items-center gap-1 text-xs font-medium text-white/85 hover:text-white hover:underline"
                    >
                        See Contribution Position <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                )}
            </div>
            {hasData ? (
                <div className="relative flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                    <div className="flex flex-col items-center flex-none">
                        <GaugeRing pct={pct} label={`${pct}%`} sub="of budget used" bar={pct >= 90 ? "#F0857A" : "#F0B267"} />
                    </div>
                    <div className="flex-1 w-full space-y-3.5">
                        <CompareRow label="Quarterly budget" value={AUD0(budget)} pct={budget != null ? 100 : 0} tone="#8FBF95" />
                        <CompareRow label="Spent this quarter" value={AUD0(spent)} pct={pct} tone="#F0B267" />
                        {remaining != null && (
                            <CompareRow label="Remaining" value={AUD0(remaining)} pct={budget > 0 ? Math.round((remaining / budget) * 100) : 0} tone="#A3CBCC" />
                        )}
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/15">
                            <div>
                                <div className="text-[10px] uppercase tracking-wider text-white/55">Lifetime cap</div>
                                <div className="text-white font-semibold tabular-nums mt-0.5">{AUD0(cap)}</div>
                                {financial?.lifetime_cap_total?.effective_date_of_underlying_rule && (
                                    <div className="text-[10px] text-white/50 mt-0.5">as at {formatDate(financial.lifetime_cap_total.effective_date_of_underlying_rule)}</div>
                                )}
                            </div>
                            <div>
                                <div className="text-[10px] uppercase tracking-wider text-white/55">Last statement</div>
                                <div className="text-white font-semibold mt-0.5">{lastStmt}</div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <p className="relative text-sm text-white/80">
                    Run the Budget Calculator or upload a statement to see {personaFramingParticipantName}&apos;s live position.
                </p>
            )}
        </section>
    );
}

const ARTEFACT_META = {
    statement: { icon: FileText, label: "Statement Decoder", tint: "sage" },
    invoice_check: { icon: Receipt, label: "Invoice Checker", tint: "clay" },
    care_plan_review: { icon: ClipboardList, label: "Support Plan Reviewer", tint: "teal" },
    classification_check: { icon: ListChecks, label: "Classification Check", tint: "primary" },
    contribution_estimate: { icon: TrendingUp, label: "Contribution Estimator", tint: "primary" },
    letter: { icon: Mail, label: "Letters & Follow-ups", tint: "clay" },
    price_check: { icon: DollarSign, label: "Price Checker", tint: "teal" },
    budget_projection: { icon: TrendingUp, label: "Budget Calculator", tint: "sage" },
};

const ARTEFACT_CTA = {
    statement: { label: "Decode a statement", url: "/tools/statement-decoder" },
    invoice_check: { label: "Check an invoice", url: "/ai-tools/invoice-checker" },
    care_plan_review: { label: "Review a care plan", url: "/tools/care-plan-reviewer" },
    classification_check: { label: "Run classification check", url: "/ai-tools/classification-self-check" },
    contribution_estimate: { label: "Estimate contribution", url: "/ai-tools/contribution-estimator" },
    letter: { label: "Draft a letter", url: "/ai-tools/letters-and-follow-ups" },
    price_check: { label: "Check a price", url: "/ai-tools/provider-price-checker" },
    budget_projection: { label: "Calculate budget", url: "/ai-tools/budget-calculator" },
};

const TINT_HEX = { sage: "#4E6E54", clay: "#A5512B", teal: "#0E4D52", primary: "#0E2A47" };

// Turn a raw status code (e.g. "check_before_paying") into readable sentence
// case ("Check before paying") so the badge reads clearly to a caregiver.
const humanizeStatus = (s) => {
    if (!s) return "";
    const t = String(s).replace(/[_-]+/g, " ").trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
};

// Drop a trailing raw status token from a summary line (e.g.
// "Invoice from …, check_before_paying") — the status pill already shows it.
const stripTrailingStatus = (summary, status) => {
    if (!summary || !status) return summary || "";
    const esc = String(status).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return summary.replace(new RegExp(`[,;·\\-\\s]*${esc}\\s*$`, "i"), "").trim();
};

function ArtefactCard({ kind, artefact }) {
    const meta = ARTEFACT_META[kind] || {};
    const Icon = meta.icon || FileText;
    const accent = TINT_HEX[meta.tint] || "#0E4D52";
    if (!artefact) {
        const cta = ARTEFACT_CTA[kind];
        return (
            <div
                data-testid={`core1-artefact-${kind}-empty`}
                className="rounded-xl border border-kindred p-4"
                style={{ backgroundColor: `${accent}0F` }}
            >
                <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="h-8 w-8 rounded-lg flex items-center justify-center flex-none" style={{ backgroundColor: `${accent}14`, color: accent }}>
                        <Icon className="w-4 h-4" aria-hidden />
                    </span>
                    <span className="text-sm font-medium text-primary-k">{meta.label}</span>
                </div>
                <p className="text-xs text-muted-k mb-2.5">Not yet run.</p>
                {cta && (
                    <Link
                        to={cta.url}
                        data-testid={`core1-artefact-${kind}-cta`}
                        className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                        style={{ color: accent }}
                    >
                        {cta.label} <ChevronRight className="w-3 h-3" />
                    </Link>
                )}
            </div>
        );
    }
    return (
        <Link
            to={artefact.url}
            data-testid={`core1-artefact-${kind}`}
            className="block rounded-xl border border-kindred p-4 hover:border-primary-k/30 transition"
            style={{ borderLeftWidth: 4, borderLeftColor: accent, backgroundColor: `${accent}0F` }}
        >
            <div className="flex items-center gap-2.5 mb-2">
                <span className="h-8 w-8 rounded-lg flex items-center justify-center flex-none" style={{ backgroundColor: `${accent}14`, color: accent }}>
                    <Icon className="w-4 h-4" aria-hidden />
                </span>
                <span className="text-sm font-medium text-primary-k">{meta.label}</span>
                <ExternalLink className="w-3 h-3 text-muted-k ml-auto" aria-hidden />
            </div>
            <p className="text-sm text-primary-k/75 line-clamp-2">{stripTrailingStatus(artefact.summary_line, artefact.status)}</p>
            {artefact.status && (
                <div className="mt-2.5">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-surface-2 text-primary-k/80 text-xs font-medium">{humanizeStatus(artefact.status)}</span>
                </div>
            )}
        </Link>
    );
}

const EVENT_ICON = {
    statement_decoded: FileText,
    invoice_checked: Receipt,
    care_plan_reviewed: ClipboardList,
    csc_completed: ListChecks,
    contribution_estimated: TrendingUp,
    letter_drafted: Mail,
    letter_sent: Mail,
    price_check_saved: DollarSign,
    classification_updated: ListChecks,
    provider_changed: Users,
    pension_status_changed: DollarSign,
    transition_status_changed: Sparkles,
    participant_created: User,
    household_membership_granted: Users,
};

// Only the events that genuinely matter on a glanceable timeline — keeps it
// short and easy to scan (applies everywhere TimelineList is used).
const MAJOR_TIMELINE_EVENTS = new Set([
    "statement_decoded",
    "invoice_checked",
    "care_plan_reviewed",
    "letter_sent",
    "classification_updated",
    "provider_changed",
    "pension_status_changed",
    "transition_status_changed",
    "participant_created",
]);

const EVENT_TINT = {
    statement_decoded: "#0E4D52",
    invoice_checked: "#A5512B",
    care_plan_reviewed: "#4E6E54",
    csc_completed: "#0E4D52",
    contribution_estimated: "#A5512B",
    letter_drafted: "#4E6E54",
    letter_sent: "#4E6E54",
    price_check_saved: "#0E4D52",
    classification_updated: "#0E4D52",
    provider_changed: "#A5512B",
    pension_status_changed: "#A5512B",
    transition_status_changed: "#4E6E54",
    participant_created: "#0E4D52",
    household_membership_granted: "#0E4D52",
};

function TimelineList({ events, showAll = false }) {
    const [open, setOpen] = React.useState(false);
    const major = React.useMemo(
        () => (showAll ? (events || []) : (events || []).filter((e) => MAJOR_TIMELINE_EVENTS.has(e.event_type))),
        [events, showAll],
    );
    if (!major.length) {
        return (
            <p className="text-sm text-muted-k italic">No major events yet. Key milestones will appear here as you use Wayly.</p>
        );
    }
    // Non-"showAll" mode: a single toggle button that expands AND collapses the list.
    const toggleBtn = (
        <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            data-testid="core1-timeline-expand"
            aria-expanded={open}
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-kindred bg-surface-2 px-4 py-3 text-sm font-semibold text-primary-k hover:bg-kindred transition-colors"
        >
            <span>{open ? "Hide" : "Show"} {major.length} key milestone{major.length === 1 ? "" : "s"}</span>
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary-k/10 text-primary-k transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>
                <ChevronDown className="h-4 w-4" />
            </span>
        </button>
    );
    const listEl = (
        <ol className="relative space-y-4 pl-1" data-testid="core1-timeline-list">
            <span className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-primary-k/15" aria-hidden />
            {major.map((e) => {
                const Icon = EVENT_ICON[e.event_type] || Sparkles;
                const tint = EVENT_TINT[e.event_type] || "#0E4D52";
                return (
                    <li
                        key={e.id}
                        data-testid="core1-timeline-event"
                        aria-label={`${e.event_type.replace(/_/g, " ")} on ${formatDate(e.event_timestamp)}`}
                        className="relative flex items-start gap-3"
                    >
                        <span
                            className="relative z-10 mt-0.5 h-7 w-7 flex-none rounded-full flex items-center justify-center ring-4 ring-surface"
                            style={{ backgroundColor: `${tint}1F`, color: tint }}
                        >
                            <Icon className="w-3.5 h-3.5" aria-hidden />
                        </span>
                        <div className="flex-1 min-w-0 pb-1">
                            <p className="text-sm text-primary-k">{e.summary}</p>
                            <p className="text-xs text-muted-k mt-0.5">{formatDate(e.event_timestamp)}</p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
    if (showAll) return listEl;
    return (
        <div className="space-y-4">
            {toggleBtn}
            {open && listEl}
        </div>
    );
}

const SEV_HEX = { high: "#F0857A", medium: "#F0B267", low: "#8FBF95" };

function PatternAlertsCard({ patterns, onDismiss }) {
    if (!patterns || patterns.length === 0) return null;
    const sevTint = {
        high: "bg-red-50 text-red-700 border-red-100",
        medium: "bg-amber-50 text-amber-700 border-amber-100",
        low: "bg-primary-k/5 text-primary-k border-primary-k/10",
    };
    return (
        <section
            data-testid="loop1-patterns-card"
            className="rounded-2xl border border-kindred border-l-4 border-l-[#0E4D52] bg-[#0E4D52]/[0.05] p-5"
        >
            <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-primary-k" aria-hidden />
                <h2 className="text-base font-semibold text-primary-k">Patterns Wayly Noticed</h2>
            </div>
            <ul className="space-y-2">
                {patterns.map((p) => (
                    <li key={p.case_type} data-testid={`loop1-pattern-${p.case_type}`} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-kindred bg-surface-2 border-l-4" style={{ borderLeftColor: SEV_HEX[p.severity] || SEV_HEX.medium }}>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm text-primary-k">{p.headline}</div>
                            <div className="text-xs text-primary-k/50 mt-1">
                                {p.count} open case{p.count !== 1 ? "s" : ""} across {p.participant_count} participant{p.participant_count !== 1 ? "s" : ""}
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full border ${sevTint[p.severity] || sevTint.medium}`}>
                                {p.severity}
                            </span>
                            <button
                                data-testid={`loop1-pattern-dismiss-${p.case_type}`}
                                onClick={() => onDismiss(p.case_type)}
                                className="text-[10px] text-primary-k/50 hover:text-primary-k underline"
                                aria-label={`Snooze this pattern for 7 days`}
                            >
                                Snooze 7d
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function OpenCasesCard({ cases, totalCount, participantId, personaFraming }) {
    const hasCases = Array.isArray(cases) && cases.length > 0;
    const total = totalCount != null ? totalCount : (cases?.length || 0);
    if (!hasCases) {
        return (
            <section
                data-testid="core1-open-cases-empty"
                className="rounded-2xl border border-kindred border-l-4 border-l-[#A5512B] bg-[#A5512B]/[0.05] p-5"
            >
                <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-primary-k/60" aria-hidden />
                    <h2 className="text-base font-semibold text-primary-k">Open Follow-Ups</h2>
                </div>
                <p className="text-sm text-primary-k/60">
                    No open follow-ups right now. {personaFraming.pronoun_possessive_capitalised === "Your" ? "You're" : "You are"} all clear.
                </p>
            </section>
        );
    }
    const sevTint = {
        high: "bg-red-50 text-red-700 border-red-100",
        medium: "bg-amber-50 text-amber-700 border-amber-100",
        low: "bg-primary-k/5 text-primary-k border-primary-k/10",
    };
    return (
        <section
            data-testid="core1-open-cases-card"
            className="rounded-2xl border border-kindred border-l-4 border-l-[#A5512B] bg-[#A5512B]/[0.05] p-5"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-primary-k" aria-hidden />
                    <h2 className="text-base font-semibold text-primary-k">Open Follow-Ups</h2>
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-primary-k/10 text-xs text-primary-k font-medium" data-testid="core1-open-cases-count">
                        {total}
                    </span>
                </div>
                <Link
                    to={`/app/participants/${participantId}/cases`}
                    data-testid="core1-view-all-cases"
                    className="text-xs text-primary-k/60 hover:text-primary-k hover:underline"
                >
                    View all →
                </Link>
            </div>
            <ul className="space-y-2">
                {cases.slice(0, 5).map((c) => (
                    <li key={c.id}>
                        <Link
                            to={`/app/participants/${participantId}/cases/${c.id}`}
                            data-testid={`core1-open-case-${c.id}`}
                            className="flex items-start justify-between gap-3 p-3 rounded-lg border border-kindred bg-surface-2 border-l-4 hover:shadow-sm transition"
                            style={{ borderLeftColor: SEV_HEX[c.severity] || SEV_HEX.medium }}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-primary-k line-clamp-1">{c.title}</div>
                                {c.summary && <div className="text-xs text-primary-k/60 mt-0.5 line-clamp-1">{c.summary}</div>}
                            </div>
                            <span className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full border ${sevTint[c.severity] || sevTint.medium}`}>
                                {c.severity}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function OpenCasesPlaceholder({ personaFraming }) {
    return (
        <section
            data-testid="core1-open-cases-placeholder"
            className="rounded-2xl border border-dashed border-primary-k/20 bg-white/40 p-5"
        >
            <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-primary-k/60" aria-hidden />
                <h2 className="text-base font-semibold text-primary-k">Open Follow-Ups</h2>
            </div>
            <p className="text-sm text-primary-k/60">
                {personaFraming.pronoun_possessive_capitalised === "Your"
                    ? "You&apos;ll see open follow-ups here once we launch case tracking."
                    : `You'll see ${personaFraming.name}'s open follow-ups here once we launch case tracking.`}
            </p>
        </section>
    );
}

function HouseholdPanel({ members }) {
    return (
        <section
            data-testid="core1-household-panel"
            className="rounded-2xl border border-kindred border-l-4 border-l-[#0E4D52] bg-[#0E4D52]/[0.05] p-5"
        >
            <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-primary-k" aria-hidden />
                <h2 className="text-base font-semibold text-primary-k">Household Members</h2>
            </div>
            <ul className="space-y-2">
                {members.map((m) => (
                    <li key={m.user_id} className="flex items-center justify-between text-sm">
                        <div>
                            <span className="font-medium text-primary-k">{m.name || m.email}</span>
                            <span className="ml-2 text-xs text-primary-k/50">{m.role}</span>
                        </div>
                        <span className="text-xs text-primary-k/40">{m.email}</span>
                    </li>
                ))}
            </ul>
            <Link
                to="/settings/household"
                data-testid="core1-manage-access-cta"
                className="inline-flex items-center gap-1 text-sm text-primary-k font-medium hover:underline mt-3"
            >
                Manage access <ChevronRight className="w-3 h-3" />
            </Link>
        </section>
    );
}

function ProfileSkeleton() {
    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        </div>
    );
}

export default function ParticipantProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { active, setActiveId } = useParticipants();
    const [data, setData] = useState(null);
    const [patterns, setPatterns] = useState([]);
    const [error, setError] = useState(null);
    const [errorDetail, setErrorDetail] = useState("");
    const [retryTick, setRetryTick] = useState(0);
    const persona = data?.persona || "caregiver";

    // URL <-> switcher sync. On direct navigation to /app/participants/:id
    // the URL wins so a bookmark always shows that person, even if
    // localStorage has a different persisted active participant. Once
    // context has caught up we listen for switcher changes and update the
    // URL accordingly.
    const lastSyncedIdRef = useRef(null);
    const urlWonRef = useRef(false);
    useEffect(() => {
        if (!id) return;
        if (lastSyncedIdRef.current !== id) {
            // URL id changed (initial mount OR nav to a different participant).
            // URL wins. Push it into context.
            lastSyncedIdRef.current = id;
            urlWonRef.current = false;
            if ((!active || active.id !== id) && typeof setActiveId === "function") {
                setActiveId(id);
            } else if (active && active.id === id) {
                urlWonRef.current = true;
            }
            return;
        }
        if (!urlWonRef.current) {
            if (active && active.id === id) urlWonRef.current = true;
            return;
        }
        if (active?.id && active.id !== id) {
            navigate(`/app/participants/${active.id}`, { replace: true });
        }
    }, [id, active?.id, navigate, setActiveId]);

    // Direct listener for the switcher event as a belt-and-braces fallback.
    // If the header switcher fires before the ParticipantsContext state
    // propagates, this listener still moves the URL to the newly selected
    // participant immediately.
    useEffect(() => {
        const onSwitcherChange = (e) => {
            const newId = e?.detail?.id;
            if (!newId) return;
            if (newId !== id) {
                navigate(`/app/participants/${newId}`, { replace: true });
            }
        };
        window.addEventListener("wayly:participant-changed", onSwitcherChange);
        return () => window.removeEventListener("wayly:participant-changed", onSwitcherChange);
    }, [id, navigate]);

    useEffect(() => {
        const controller = new AbortController();
        setError(null);
        setErrorDetail("");
        setData(null);
        api.get(`/core/participants/${id}/profile`, { signal: controller.signal })
            .then((r) => {
                if (controller.signal.aborted) return;
                setData(r.data);
            })
            .catch((e) => {
                if (controller.signal.aborted || e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return;
                const status = e?.response?.status;
                const msg = e?.response?.data?.detail || e?.message || "";
                console.error("[core1] profile fetch failed", { status, msg, err: e });
                if (status === 404) setError("not_found");
                else if (status === 401 || status === 402) setError("auth");
                else setError("error");
                setErrorDetail(typeof msg === "string" ? msg : JSON.stringify(msg));
            });
        // Also fetch cross-case patterns (best-effort, non-blocking)
        api.get("/loop/patterns", { signal: controller.signal })
            .then((r) => { if (!controller.signal.aborted) setPatterns(r.data?.patterns || []); })
            .catch(() => { /* patterns are non-critical */ });
        return () => { controller.abort(); };
    }, [id, retryTick]);

    // Emit view event
    useEffect(() => {
        if (data) {
            try {
                if (window.plausible) window.plausible("profile_viewed", { props: { participant_id: id } });
                if (window.posthog) window.posthog.capture("profile_viewed", { participant_id: id });
            } catch (e) { /* noop */ }
        }
    }, [data, id]);

    const personaFraming = useMemo(() => {
        const name = data?.participant?.preferred_name || data?.participant?.first_name || data?.participant?.display_name || "the participant";
        const isSelf = persona === "participant_self";
        return {
            name,
            title: isSelf ? "Your Profile" : `${name}'s Profile`,
            pronoun_possessive_capitalised: isSelf ? "Your" : `${name}'s`,
        };
    }, [data, persona]);

    if (error === "not_found") {
        return (
            <div data-testid="core1-not-found" className="max-w-2xl mx-auto p-8 text-center">
                <h1 className="text-xl font-semibold text-primary-k mb-2">Profile not found</h1>
                <p className="text-sm text-primary-k/60">This participant does not exist or you do not have access.</p>
                <button
                    onClick={() => navigate("/app")}
                    className="mt-4 inline-flex items-center px-4 py-2 rounded-full bg-primary-k text-white text-sm"
                    data-testid="core1-back-to-dashboard"
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }

    if (error === "auth") {
        return (
            <div data-testid="core1-auth-error" className="max-w-2xl mx-auto p-8 text-center">
                <h1 className="text-xl font-semibold text-primary-k mb-2">Please sign in again</h1>
                <p className="text-sm text-primary-k/60">Your session may have expired.</p>
                <button
                    onClick={() => navigate("/login")}
                    className="mt-4 inline-flex items-center px-4 py-2 rounded-full bg-primary-k text-white text-sm"
                    data-testid="core1-signin-cta"
                >
                    Sign in
                </button>
            </div>
        );
    }

    if (error === "error") {
        return (
            <div data-testid="core1-error" className="max-w-2xl mx-auto p-8 text-center">
                <AlertCircle className="w-8 h-8 text-primary-k/40 mx-auto mb-3" aria-hidden />
                <p className="text-sm text-primary-k/70">Something went wrong loading this profile.</p>
                {errorDetail && (
                    <p data-testid="core1-error-detail" className="text-xs text-primary-k/40 mt-2 font-mono break-all">{errorDetail}</p>
                )}
                <button
                    onClick={() => setRetryTick((t) => t + 1)}
                    className="mt-4 inline-flex items-center px-4 py-2 rounded-full bg-primary-k text-white text-sm"
                    data-testid="core1-retry-btn"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (!data) return <ProfileSkeleton />;

    const p = data.participant;
    const artefacts = data.latest_artefacts || {};
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
        || p.display_name || p.preferred_name || personaFraming.name;

    return (
        <div className="max-w-6xl mx-auto p-6 lg:p-8" data-testid="core1-participant-profile">
            {/* Page header */}
            <header data-testid="core1-profile-header" className="mb-6 rounded-2xl border border-kindred bg-[#0E4D52]/[0.05] p-5 sm:p-6 shadow-sm">
                <div className="flex items-center gap-4 flex-wrap">
                    <span className="h-14 w-14 flex-none rounded-2xl bg-primary-k/10 flex items-center justify-center text-primary-k">
                        <User className="h-7 w-7" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.16em] text-primary-k/50">Participant Profile</p>
                        <h1 className="text-2xl sm:text-3xl font-heading text-primary-k tracking-tight leading-tight">
                            {fullName}
                        </h1>
                    </div>
                </div>
                <p className="text-sm text-primary-k/60 mt-3 truncate" data-testid="core1-profile-subtitle">
                    Everything important about {personaFraming.name}, all in one place.
                </p>
            </header>

            {/* Two-column shell */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] gap-6">
                {/* Sidebar: at-a-glance identity */}
                <aside className="space-y-4" data-testid="core1-profile-sidebar">
                    <section className="rounded-2xl border border-kindred bg-[#4E6E54]/[0.06] p-5 shadow-sm space-y-3">
                        <p className="text-sm font-bold uppercase tracking-wider text-primary-k">Personal Details</p>
                        <dl className="text-sm space-y-2">
                            {p.provider?.primary && (
                                <div>
                                    <dt className="text-primary-k/50 text-xs">Provider</dt>
                                    <dd className="text-primary-k font-medium">{titleCase(p.provider.primary)}</dd>
                                </div>
                            )}
                            <div>
                                <dt className="text-primary-k/50 text-xs">Classification</dt>
                                <dd className="text-primary-k font-medium">
                                    {typeof p.classification === "object"
                                        ? (p.classification?.band != null ? `Level ${p.classification.band}` : "-")
                                        : (p.classification != null ? `Level ${p.classification}` : "-")}
                                </dd>
                            </div>
                            {p.pension_status && p.pension_status !== "unknown" && (
                                <div>
                                    <dt className="text-primary-k/50 text-xs">Pension Status</dt>
                                    <dd className="text-primary-k font-medium">{titleCase(p.pension_status.replace(/_/g, " "))}</dd>
                                </div>
                            )}
                        </dl>
                    </section>

                    <section className="rounded-2xl border border-kindred bg-[#A5512B]/[0.06] p-5 shadow-sm">
                        <p className="text-sm font-bold uppercase tracking-wider text-primary-k mb-3">Quick Actions</p>
                        <div className="flex flex-col gap-2">
                            <Link
                                to={`/app/participants/${id}/voice-check`}
                                data-testid="core1-voice-check-open"
                                className="text-xs px-3 py-2 rounded-lg bg-primary-k text-white text-center"
                            >Open My Care Goals</Link>
                            <Link
                                to={`/app/participants/${id}/complaints`}
                                data-testid="core1-complaints-open"
                                className="text-xs px-3 py-2 rounded-lg border border-primary-k/20 text-primary-k text-center hover:bg-surface-2"
                            >Open Complaints</Link>
                            <Link
                                to={`/app/participants/${id}/timeline`}
                                data-testid="core1-timeline-full-link"
                                className="text-xs px-3 py-2 rounded-lg border border-primary-k/20 text-primary-k text-center hover:bg-surface-2"
                            >Full Timeline</Link>
                            <Link
                                to={`/app/participants/${id}/attendance`}
                                data-testid="sdl1-attendance-open"
                                className="text-xs px-3 py-2 rounded-lg border border-primary-k/20 text-primary-k text-center hover:bg-surface-2"
                            >Attendance Log</Link>
                            <Link
                                to={`/app/participants/${id}/coordinator`}
                                data-testid="fc2-coordinator-open"
                                className="text-xs px-3 py-2 rounded-lg border border-primary-k/20 text-primary-k text-center hover:bg-surface-2"
                            >Family Coordinator</Link>
                        </div>
                    </section>

                    {data.household?.length > 0 && <HouseholdPanel members={data.household} />}
                </aside>

                {/* Main column: sections */}
                <main className="space-y-6 min-w-0" data-testid="core1-profile-main">
                    {/* Financial */}
                    <FinancialCard financial={data.financial_position} personaFramingParticipantName={personaFraming.name} participantId={id} />

                    {/* Patterns Wayly noticed (LOOP-1 v1.1) */}
                    <PatternAlertsCard patterns={patterns} onDismiss={async (caseType) => {
                        try {
                            await api.post(`/loop/patterns/${caseType}/dismiss`);
                            setPatterns((prev) => prev.filter((p) => p.case_type !== caseType));
                        } catch (e) { /* noop */ }
                    }} />

                    {/* Open cases (LOOP-1) */}
                    <OpenCasesCard cases={data.open_cases} totalCount={data.open_cases_total} participantId={id} personaFraming={personaFraming} />

                    {/* CPR-2 Voice Check entry point */}
                    <Link
                        to={`/app/participants/${id}/voice-check`}
                        data-testid="core1-voice-check-card"
                        className="block rounded-2xl border border-kindred border-l-4 border-l-[#0E4D52] bg-[#0E4D52]/[0.05] p-6 shadow-sm hover:border-primary-k/30 transition"
                    >
                        <div className="flex items-start gap-3">
                            <span className="h-10 w-10 flex-none rounded-xl bg-[#0E4D52]/10 text-[#0E4D52] flex items-center justify-center">
                                <ListChecks className="h-5 w-5" aria-hidden />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs uppercase tracking-wider text-primary-k/50">My Care Goals</p>
                                <h2 className="text-base font-semibold text-primary-k mt-0.5">Did Every Goal Come From {personaFraming.name}?</h2>
                                <p className="text-sm text-primary-k/60 mt-1">
                                    Walk through each goal and record whether it was truly participant-led or provider-led. About a minute per goal.
                                </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-primary-k/40 mt-1 flex-none" aria-hidden />
                        </div>
                    </Link>

                    {/* CMP-1 Complaints entry point */}
                    <Link
                        to={`/app/participants/${id}/complaints`}
                        data-testid="core1-complaints-card"
                        className="block rounded-2xl border border-kindred border-l-4 border-l-[#A5512B] bg-[#A5512B]/[0.05] p-6 shadow-sm hover:border-primary-k/30 transition"
                    >
                        <div className="flex items-start gap-3">
                            <span className="h-10 w-10 flex-none rounded-xl bg-[#A5512B]/10 text-[#A5512B] flex items-center justify-center">
                                <AlertCircle className="h-5 w-5" aria-hidden />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs uppercase tracking-wider text-primary-k/50">Complaints</p>
                                <h2 className="text-base font-semibold text-primary-k mt-0.5">Track a Complaint From Provider To Regulator</h2>
                                <p className="text-sm text-primary-k/60 mt-1">
                                    Open a complaint with full stage tracking, evidence bundle, and elder-abuse safeguards.
                                </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-primary-k/40 mt-1 flex-none" aria-hidden />
                        </div>
                    </Link>

                    {/* Latest artefacts grid */}
                    <section data-testid="core1-artefacts-grid" className="rounded-2xl border border-kindred bg-[#4E6E54]/[0.06] p-6 shadow-sm">
                        <h2 className="text-base font-semibold text-primary-k mb-4">Latest Activity</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {["statement", "invoice_check", "care_plan_review", "classification_check", "contribution_estimate", "letter", "price_check", "budget_projection"].map((k) => (
                                <ArtefactCard key={k} kind={k} artefact={artefacts[k]} />
                            ))}
                        </div>
                    </section>

                    {/* Timeline */}
                    <details
                        open
                        data-testid="core1-timeline-section"
                        className="group rounded-2xl border border-kindred bg-[#0E4D52]/[0.05] p-6 shadow-sm"
                    >
                        <summary className="flex items-center justify-between mb-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <div className="flex items-center gap-2">
                                <Clock className="h-5 w-5 text-primary-k" aria-hidden />
                                <h2 className="text-base font-semibold text-primary-k">Timeline</h2>
                            </div>
                            <div className="flex items-center gap-3">
                                <Link
                                    to={`/app/participants/${id}/timeline`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs text-primary-k/60 hover:text-primary-k hover:underline"
                                >
                                    Full Timeline →
                                </Link>
                                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary-k/10 text-primary-k transition-colors group-hover:bg-primary-k/20 group-open:rotate-180" aria-hidden>
                                    <ChevronDown className="h-4 w-4" />
                                </span>
                            </div>
                        </summary>
                        <TimelineList events={data.timeline} />
                    </details>
                </main>
            </div>
        </div>
    );
}
