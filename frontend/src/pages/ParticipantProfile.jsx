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
import {
    User, FileText, Receipt, ClipboardList, ListChecks, DollarSign,
    Mail, TrendingUp, Users, Clock, AlertCircle, ExternalLink,
    Sparkles, ChevronRight,
} from "lucide-react";

// Persona is derived from the profile response itself, so we do not need a
// separate /auth/me round-trip. This removes a race and a spurious re-fetch.

function ClassificationBadge({ classification }) {
    if (!classification?.band) return null;
    const conf = classification.confidence;
    return (
        <span
            data-testid="core1-classification-badge"
            className="inline-flex items-center gap-2 rounded-full bg-primary-k/10 text-primary-k px-3 py-1 text-sm font-medium"
        >
            Level {classification.band}
            {conf && <span className="text-xs opacity-70">· {conf} confidence</span>}
        </span>
    );
}

function FinancialCard({ financial, personaFramingParticipantName, participantId }) {
    const cap = financial?.lifetime_cap_total?.amount;
    const spent = financial?.spent_to_date_this_quarter?.amount;
    const budget = financial?.quarterly_budget?.amount;
    return (
        <section
            data-testid="core1-financial-card"
            className="rounded-2xl border border-primary-k/10 bg-white p-6 shadow-sm"
        >
            <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-base font-semibold text-primary-k">Financial Position</h2>
                {participantId && (
                    <Link
                        to={`/app/participants/${participantId}/contribution-position`}
                        data-testid="core1-view-contribution-position"
                        className="text-xs text-primary-k hover:underline"
                    >
                        See Contribution Position →
                    </Link>
                )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FinancialItem label="Quarterly Budget" value={budget} />
                <FinancialItem label="Spent This Quarter" value={spent} />
                <FinancialItem label="Lifetime Cap" value={cap} sublabel={financial?.lifetime_cap_total?.effective_date_of_underlying_rule ? `as at ${formatDate(financial.lifetime_cap_total.effective_date_of_underlying_rule)}` : null} />
                <FinancialItem label="Last Statement" value={financial?.last_statement_date ? formatDate(financial.last_statement_date) : ","} raw />
            </div>
            {(!budget && !spent) && (
                <p className="mt-4 text-sm text-primary-k/60">
                    Run the Budget Calculator or upload a statement to see {personaFramingParticipantName}&apos;s live position.
                </p>
            )}
        </section>
    );
}

function FinancialItem({ label, value, sublabel, raw }) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-primary-k/60">{label}</div>
            <div className="text-lg font-semibold text-primary-k mt-1">
                {raw ? (value || ",") : value != null ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value) : ","}
            </div>
            {sublabel && <div className="text-xs text-primary-k/50 mt-0.5">{sublabel}</div>}
        </div>
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

function ArtefactCard({ kind, artefact }) {
    const meta = ARTEFACT_META[kind] || {};
    const Icon = meta.icon || FileText;
    if (!artefact) {
        const cta = ARTEFACT_CTA[kind];
        return (
            <div
                data-testid={`core1-artefact-${kind}-empty`}
                className="rounded-xl border border-primary-k/10 bg-white/50 p-4"
            >
                <div className="flex items-center gap-2 text-sm text-primary-k/70 mb-3">
                    <Icon className="w-4 h-4" aria-hidden />
                    <span className="font-medium">{meta.label}</span>
                </div>
                <p className="text-xs text-primary-k/50 mb-3">Not yet run.</p>
                {cta && (
                    <Link
                        to={cta.url}
                        data-testid={`core1-artefact-${kind}-cta`}
                        className="inline-flex items-center gap-1 text-sm text-primary-k font-medium hover:underline"
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
            className="block rounded-xl border border-primary-k/10 bg-white p-4 hover:border-primary-k/30 hover:shadow-sm transition"
        >
            <div className="flex items-center gap-2 text-sm text-primary-k mb-2">
                <Icon className="w-4 h-4" aria-hidden />
                <span className="font-medium">{meta.label}</span>
                <ExternalLink className="w-3 h-3 opacity-40 ml-auto" aria-hidden />
            </div>
            <p className="text-sm text-primary-k/80 line-clamp-2">{artefact.summary_line}</p>
            <div className="flex items-center gap-2 text-xs text-primary-k/50 mt-2">
                <Clock className="w-3 h-3" aria-hidden />
                {formatDate(artefact.created_at)}
                {artefact.status && <span className="ml-auto px-2 py-0.5 rounded-full bg-primary-k/5">{artefact.status}</span>}
            </div>
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

function TimelineList({ events }) {
    if (!events?.length) {
        return (
            <p className="text-sm text-primary-k/50 italic">No events yet. As you use Wayly&apos;s tools, they will appear here.</p>
        );
    }
    return (
        <ol className="space-y-3" data-testid="core1-timeline-list">
            {events.map((e) => {
                const Icon = EVENT_ICON[e.event_type] || Sparkles;
                return (
                    <li
                        key={e.id}
                        data-testid="core1-timeline-event"
                        aria-label={`${e.event_type.replace(/_/g, " ")} on ${formatDate(e.event_timestamp)}`}
                        className="flex items-start gap-3 pb-3 border-b border-primary-k/5 last:border-0"
                    >
                        <div className="mt-0.5 p-2 rounded-full bg-primary-k/5">
                            <Icon className="w-4 h-4 text-primary-k" aria-hidden />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-primary-k">{e.summary}</p>
                            <p className="text-xs text-primary-k/50 mt-0.5">{formatDate(e.event_timestamp)}</p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

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
            className="rounded-2xl border border-primary-k/10 bg-white p-5"
        >
            <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-primary-k" aria-hidden />
                <h2 className="text-base font-semibold text-primary-k">Patterns Wayly Noticed</h2>
            </div>
            <ul className="space-y-2">
                {patterns.map((p) => (
                    <li key={p.case_type} data-testid={`loop1-pattern-${p.case_type}`} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-primary-k/10 bg-primary-k/[0.02]">
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
                className="rounded-2xl border border-primary-k/10 bg-white p-5"
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
            className="rounded-2xl border border-primary-k/10 bg-white p-5"
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
                            className="flex items-start justify-between gap-3 p-3 rounded-lg border border-primary-k/10 hover:border-primary-k/30 hover:bg-primary-k/[0.02] transition"
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
            className="rounded-2xl border border-primary-k/10 bg-white p-5"
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
                    Back to dashboard
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

    return (
        <div className="max-w-6xl mx-auto p-6 lg:p-8" data-testid="core1-participant-profile">
            {/* Page header */}
            <header data-testid="core1-profile-header" className="mb-8">
                <p className="text-xs uppercase tracking-wider text-primary-k/50">Participant Profile</p>
                <div className="flex items-center gap-3 flex-wrap mt-1">
                    <h1 className="text-3xl sm:text-4xl font-heading text-primary-k tracking-tight">
                        {personaFraming.title}
                    </h1>
                    <ClassificationBadge classification={p.classification} />
                </div>
                <p className="text-sm text-muted-k mt-2 max-w-2xl">
                    A single place to see every important detail about {personaFraming.name}. Financial position, open follow-ups, care plan health and recent activity all sit side by side.
                </p>
            </header>

            {/* Two-column shell */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] gap-6">
                {/* Sidebar: at-a-glance identity */}
                <aside className="space-y-4" data-testid="core1-profile-sidebar">
                    <section className="rounded-2xl border border-primary-k/10 bg-white p-5 shadow-sm space-y-3">
                        <p className="text-xs uppercase tracking-wider text-primary-k/50">Personal Details</p>
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

                    <section className="rounded-2xl border border-primary-k/10 bg-white p-5 shadow-sm">
                        <p className="text-xs uppercase tracking-wider text-primary-k/50 mb-3">Quick Actions</p>
                        <div className="flex flex-col gap-2">
                            <Link
                                to={`/app/participants/${id}/voice-check`}
                                data-testid="core1-voice-check-open"
                                className="text-xs px-3 py-2 rounded-lg bg-primary-k text-white text-center"
                            >Start Voice Check</Link>
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
                    <section
                        data-testid="core1-voice-check-card"
                        className="rounded-2xl border border-primary-k/10 bg-white p-6 shadow-sm"
                    >
                        <p className="text-xs uppercase tracking-wider text-primary-k/50">Support Plan Voice Check</p>
                        <h2 className="text-base font-semibold text-primary-k mt-1">Did Every Goal Come From {personaFraming.name}?</h2>
                        <p className="text-sm text-primary-k/60 mt-1">
                            Walk through each goal and record whether it was truly participant-led or provider-led. About a minute per goal.
                        </p>
                    </section>

                    {/* CMP-1 Complaints entry point */}
                    <section
                        data-testid="core1-complaints-card"
                        className="rounded-2xl border border-primary-k/10 bg-white p-6 shadow-sm"
                    >
                        <p className="text-xs uppercase tracking-wider text-primary-k/50">Complaints</p>
                        <h2 className="text-base font-semibold text-primary-k mt-1">Track a Complaint From Provider To Regulator</h2>
                        <p className="text-sm text-primary-k/60 mt-1">
                            Open a complaint with full stage tracking, evidence bundle, and elder-abuse safeguards.
                        </p>
                    </section>

                    {/* Latest artefacts grid */}
                    <section data-testid="core1-artefacts-grid" className="rounded-2xl border border-primary-k/10 bg-white p-6 shadow-sm">
                        <h2 className="text-base font-semibold text-primary-k mb-4">Latest Activity</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {["statement", "invoice_check", "care_plan_review", "classification_check", "contribution_estimate", "letter", "price_check", "budget_projection"].map((k) => (
                                <ArtefactCard key={k} kind={k} artefact={artefacts[k]} />
                            ))}
                        </div>
                    </section>

                    {/* Timeline */}
                    <section
                        data-testid="core1-timeline-section"
                        className="rounded-2xl border border-primary-k/10 bg-white p-6 shadow-sm"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-base font-semibold text-primary-k">Timeline</h2>
                            <Link
                                to={`/app/participants/${id}/timeline`}
                                className="text-xs text-primary-k/60 hover:text-primary-k hover:underline"
                            >
                                Full Timeline →
                            </Link>
                        </div>
                        <TimelineList events={data.timeline} />
                    </section>
                </main>
            </div>
        </div>
    );
}
