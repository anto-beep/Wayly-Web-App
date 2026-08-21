import React, { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/formatDate";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, formatAUD, formatAUD2 } from "@/lib/api";
import StreamProgress from "@/components/StreamProgress";
import DashboardInsights from "@/components/DashboardInsights";
import DashboardTimelinePanel from "@/components/DashboardTimelinePanel";
import ShareDashboardButton from "@/components/ShareDashboardButton";
import { ProfileCompletionBanner } from "./Onboarding";
import OnboardingEnvelopeTile from "@/pages/journey/OnboardingEnvelopeTile";
import JourneyStartBanner from "@/pages/journey/JourneyStartBanner";
import QP1DashboardTile from "@/pages/qp1/QP1DashboardTile";
import { relativeTime } from "@/components/ProfileInlinePrompts";
import { EmailVerificationBanner } from "./VerifyEmail";
import {
    AlertTriangle, FileText, ArrowRight, Sparkles, Users2, Shield, MessageCircle,
    Crown, Lock, Calendar, TrendingUp, Bell, CheckCircle2, Clock, Users, ChevronDown,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useParticipants } from "@/context/ParticipantsContext";
import ParticipantContactsPanel from "@/components/ParticipantContactsPanel";
import BC2Projection from "@/components/BC2Projection";
import SmartAISummary from "@/components/SmartAISummary";
import DashboardActionBar from "@/components/DashboardActionBar";
import { TOOL_COUNT } from "@/config/toolRegistry";

const PLAN_LABELS = {
    free: { label: "Free plan", tone: "bg-sage/15 text-[#0F5648]", desc: `2 of ${TOOL_COUNT} AI tools · no household tracking` },
    solo: { label: "Solo plan · Trial", tone: "bg-gold/20 text-primary-k", desc: `All ${TOOL_COUNT} tools · 1 Caregiver seat` },
    family: { label: "Family plan · Trial", tone: "bg-primary-k/15 text-primary-k", desc: `All ${TOOL_COUNT} tools · 5 family seats · Sunday digest` },
};

function PlanBadge({ plan }) {
    const cfg = PLAN_LABELS[plan] || PLAN_LABELS.free;
    return (
        <div className="inline-flex items-center gap-2 rounded-full bg-surface border border-kindred px-3 py-1.5" data-testid="dashboard-plan-badge">
            <Crown className="h-3.5 w-3.5 text-gold" />
            <span className={`text-xs font-medium uppercase tracking-wider rounded-full px-2 py-0.5 ${cfg.tone}`}>{cfg.label}</span>
        </div>
    );
}

function FreePlanLimitCard() {
    return (
        <div className="bg-surface border border-gold rounded-2xl p-6 sm:p-7" data-testid="free-plan-limit-card">
            <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                    <Lock className="h-5 w-5 text-primary-k" />
                </div>
                <div className="flex-1">
                    <h2 className="font-heading text-xl text-primary-k">Your trial has ended. Choose a plan to bring everything back.</h2>
                    <p className="mt-2 text-sm text-muted-k leading-relaxed">
                        You can still view every statement, anomaly, contact and AT-HM record we have on file for you. To add new entries, decode new statements, lodge support tickets, or use the AI tools, choose a plan.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/settings/billing" className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#091D33]" data-testid="dashboard-upgrade-cta">Choose a Plan</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * "Last touched by" pill, for Family plan caregivers, surfaces who saved
 * the participant profile most recently. Reuses `field_modifications` so no
 * new API call is needed. Hides itself if the participant has never been
 * touched (e.g. legacy migrated docs).
 */
const FIELD_LABELS = {
    applicable_supplements: "Supplements",
    care_manager_name: "Care manager",
    care_manager_phone: "Care manager phone",
    care_manager_email: "Care manager email",
    full_address: "Address",
    mac_reference_number: "MAC reference",
    part_pension_actual_independence_pct: "Independence rate",
    part_pension_actual_everyday_pct: "Everyday rate",
    is_grandfathered_hcp: "HCP transition",
    hcp_level: "HCP level",
    preferred_name: "Preferred name",
    suburb: "Suburb",
    state: "State",
    caregiver_relationship: "Relationship",
    caregiver_phone: "Caregiver phone",
    pension_status: "Pension status",
    classification_level: "Classification",
    provider_name: "Provider",
    statement_delivery: "Statement delivery",
    authorisation_confirmed: "Authorisation",
    first_name: "First name",
    last_name: "Last name",
    dob: "Date of birth",
};

function LastTouchedByPill({ participant }) {
    const trail = participant?.field_modifications || {};
    const entries = Object.entries(trail);
    if (entries.length === 0) return null;
    // Newest update wins
    let latest = null;
    for (const [field, meta] of entries) {
        if (!meta?.at) continue;
        if (!latest || meta.at > latest.at) latest = { field, ...meta };
    }
    if (!latest) return null;
    const label = FIELD_LABELS[latest.field] || latest.field.replace(/_/g, " ");
    return (
        <p
            data-testid="participant-last-touched"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-k"
        >
            <Clock className="h-3 w-3" />
            <span>
                Last updated by <strong className="text-primary-k font-medium">{latest.actor_name || "a caregiver"}</strong> · {relativeTime(latest.at)} · <span className="italic">{label}</span>
            </span>
        </p>
    );
}

/**
 * AtAGlance — one calm, high-contrast summary that replaces the old wall of
 * four stat cards. Leads with the single number that matters most (money left
 * this quarter) and keeps the rest as quiet, tappable mini-stats.
 */
function AtAGlance({ budget, statements, alertCount }) {
    const spent = budget.streams.reduce((a, s) => a + s.spent, 0);
    const usable = budget.quarterly_usable ?? budget.quarterly_total;
    const left = usable - spent;
    const pctLeft = usable > 0 ? Math.max(0, Math.min(100, (left / usable) * 100)) : 0;
    return (
        <section
            data-testid="dashboard-at-a-glance"
            className="rounded-2xl border border-kindred bg-surface overflow-hidden"
        >
            {/* Headline: money left this quarter */}
            <div className="relative p-6 sm:p-7 border-l-4 border-gold">
                <span className="overline text-muted-k">Left to spend this quarter</span>
                <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                    <span className="font-heading text-4xl sm:text-5xl text-primary-k tabular-nums" data-testid="glance-left">
                        {formatAUD(left)}
                    </span>
                    <span className="text-sm text-muted-k">of {formatAUD(usable)} this quarter</span>
                </div>
                <div className="mt-3 h-2 w-full max-w-md bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-sage" style={{ width: `${pctLeft}%` }} />
                </div>
            </div>
            {/* Quiet mini-stats */}
            <div className="grid grid-cols-3 divide-x divide-kindred border-t border-kindred">
                <Link to="/app/budget-alerts" className="p-4 sm:p-5 hover:bg-surface-2 transition-colors" data-testid="glance-alerts">
                    <div className="flex items-center gap-1.5 text-muted-k"><Bell className="h-3.5 w-3.5" /><span className="overline">To review</span></div>
                    <div className={`mt-1 font-heading text-2xl tabular-nums ${alertCount > 0 ? "text-gold" : "text-primary-k"}`}>{alertCount}</div>
                </Link>
                <Link to="/app/statements" className="p-4 sm:p-5 hover:bg-surface-2 transition-colors" data-testid="glance-statements">
                    <div className="flex items-center gap-1.5 text-muted-k"><FileText className="h-3.5 w-3.5" /><span className="overline">Statements</span></div>
                    <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums">{statements.length}</div>
                </Link>
                <Link to="/app/reports" className="p-4 sm:p-5 hover:bg-surface-2 transition-colors" data-testid="glance-cap">
                    <div className="flex items-center gap-1.5 text-muted-k"><CheckCircle2 className="h-3.5 w-3.5" /><span className="overline">Lifetime cap</span></div>
                    <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums">{budget.lifetime_pct.toFixed(0)}<span className="text-base text-muted-k">%</span></div>
                </Link>
            </div>
        </section>
    );
}

export default function CaregiverDashboard() {
    const { household, user } = useAuth();
    const { active: activeParticipant } = useParticipants();
    const [showContacts, setShowContacts] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    // Sidebar "Key Contacts" links to /app?contacts=open. Pick that up and
    // open the panel automatically, then clean the search param so reloads
    // don't keep re-triggering it.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get("contacts") === "open") {
            setShowContacts(true);
            params.delete("contacts");
            navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" }, { replace: true });
        }
    }, [location.search, location.pathname, navigate]);
    // When a non-primary participant is selected, prefer their fields over the
    // household snapshot (the household record was created from the primary).
    const displayName = activeParticipant
        ? `${activeParticipant.first_name || ""} ${activeParticipant.last_name || ""}`.trim()
        : (household?.participant_name || "");
    const displayProvider = activeParticipant?.provider_name || household?.provider_name || "";
    const caregiverFirst = user?.first_name || (user?.name || "").split(" ")[0] || "there";
    const hourNow = new Date().getHours();
    const greeting = hourNow < 12 ? "Good morning" : hourNow < 18 ? "Good afternoon" : "Good evening";
    const [budget, setBudget] = useState(null);
    const [statements, setStatements] = useState([]);
    const [familyMsgs, setFamilyMsgs] = useState([]);
    const [audit, setAudit] = useState([]);
    const [chatHistory, setChatHistory] = useState([]);
    const [pathways, setPathways] = useState(null);
    const [loading, setLoading] = useState(true);
    // Server-computed in-app nudges (e.g. Family second-participant reminder).
    const [nudges, setNudges] = useState([]);

    const plan = user?.plan || "free";
    const isFree = plan === "free";
    const isFamily = plan === "family";

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get("/nudges");
                if (!cancelled) setNudges(data?.nudges || []);
            } catch { /* nudges are best-effort */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const dismissNudge = async (key) => {
        setNudges((ns) => ns.filter((n) => n.key !== key));
        try { await api.post(`/nudges/${key}/dismiss`); } catch { /* non-fatal */ }
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const [b, s, f, a, c, p] = await Promise.all([
                    api.get("/budget/current").catch(() => ({ data: null })),
                    api.get("/statements").catch(() => ({ data: [] })),
                    api.get("/family-thread").catch(() => ({ data: [] })),
                    api.get("/audit-log").catch(() => ({ data: [] })),
                    api.get("/chat/history").catch(() => ({ data: [] })),
                    api.get("/budget/eligible-pathways").catch(() => ({ data: null })),
                ]);
                if (cancelled) return;
                setBudget(b.data);
                setStatements(s.data || []);
                setFamilyMsgs(f.data || []);
                setAudit(a.data || []);
                setChatHistory(c.data || []);
                setPathways(p.data);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeParticipant?.id]);

    const latest = statements[0];
    const allAnomalies = statements.flatMap((s) =>
        (s.anomalies || []).map((a) => ({ ...a, statement_id: s.id, period_label: s.period_label }))
    );

    return (
        <div className="space-y-8" data-testid="caregiver-dashboard">
            <EmailVerificationBanner />
            <ProfileCompletionBanner />
            <JourneyStartBanner />
            <QP1DashboardTile />
            <OnboardingEnvelopeTile />
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold mb-1" style={{ color: "var(--kindred-sage)" }} data-testid="dashboard-greeting">{greeting}, {caregiverFirst}</p>
                    <div className="flex items-center gap-3 flex-wrap mt-2">
                        <PlanBadge plan={plan} />
                    </div>
                    {isFamily && activeParticipant?.field_modifications && (
                        <LastTouchedByPill participant={activeParticipant} />
                    )}
                    {budget && (
                        <p className="text-muted-k mt-2 text-sm">
                            {budget.quarter_label} · {budget.classification_label}{displayProvider ? ` · ${displayProvider}` : ""}
                        </p>
                    )}
                </div>
                {!isFree && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <ShareDashboardButton />
                        <Link
                            to="/app/statements/upload"
                            data-testid="dashboard-upload-cta"
                            className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90 transition-colors"
                        >
                            <FileText className="h-4 w-4" /> Upload a statement
                        </Link>
                    </div>
                )}
                {activeParticipant?.id && (
                    <button
                        type="button"
                        onClick={() => setShowContacts(true)}
                        data-testid="dashboard-key-contacts-cta"
                        className="inline-flex items-center gap-2 bg-white border-2 border-primary-k text-primary-k rounded-full px-4 py-2.5 text-sm hover:bg-primary-k hover:text-white transition-colors"
                        aria-label="Open Key Contacts panel"
                    >
                        <Users className="h-4 w-4" /> Key Contacts
                    </button>
                )}
            </div>

            {/* What would you like to do? — the navigator */}
            {!loading && <DashboardActionBar />}

            {!loading && (
                <SmartAISummary
                    pageKey="dashboard"
                    context={{
                        participant_name: displayName || null,
                        provider: displayProvider || null,
                        plan,
                        quarter_label: budget?.quarter_label,
                        quarterly_usable_aud: budget?.quarterly_usable ?? budget?.quarterly_total,
                        quarterly_spent_aud: budget?.spent_aud ?? budget?.spent,
                        quarterly_headroom_aud: budget?.headroom_aud ?? budget?.headroom,
                        statements_count: statements.length,
                        latest_statement_period: latest?.period_label || null,
                        latest_statement_provider: latest?.provider_name || latest?.extracted_json?.provider_name || null,
                        open_anomaly_count: allAnomalies.length,
                        unread_family_messages: familyMsgs.filter((m) => !m.read).length,
                    }}
                />
            )}

            {/* In-app nudges (Family second-participant, etc.) */}
            {nudges.length > 0 && (
                <div className="space-y-2" data-testid="dashboard-nudges">
                    {nudges.map((n) => (
                        <div
                            key={n.key}
                            className="flex items-start gap-3 rounded-xl border-2 border-gold/50 bg-gradient-to-br from-gold/15 to-gold/5 p-4"
                            data-testid={`dashboard-nudge-${n.key}`}
                        >
                            <div className="h-9 w-9 rounded-lg bg-gold/25 text-primary-k inline-flex items-center justify-center shrink-0">
                                <Users2 className="h-4 w-4" aria-hidden="true" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-primary-k text-sm">{n.title}</div>
                                <p className="text-xs text-primary-k/80 mt-0.5 leading-relaxed">{n.body}</p>
                            </div>
                            {n.cta_href && n.cta_label && (
                                <Link
                                    to={n.cta_href}
                                    className="inline-flex items-center gap-1 bg-primary-k text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:brightness-95 whitespace-nowrap"
                                    data-testid={`dashboard-nudge-${n.key}-cta`}
                                >
                                    {n.cta_label} <ArrowRight className="h-3 w-3" />
                                </Link>
                            )}
                            {n.dismissible && (
                                <button
                                    type="button"
                                    onClick={() => dismissNudge(n.key)}
                                    className="text-muted-k hover:text-primary-k text-xs px-2 py-1 rounded"
                                    data-testid={`dashboard-nudge-${n.key}-dismiss`}
                                    aria-label="Dismiss"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {loading && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse" data-testid="dashboard-skeleton">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="bg-surface-2 border border-kindred rounded-xl p-5 h-[110px]">
                            <div className="h-3 w-16 bg-surface rounded" />
                            <div className="mt-3 h-6 w-24 bg-surface rounded" />
                            <div className="mt-2 h-3 w-32 bg-surface rounded" />
                        </div>
                    ))}
                </div>
            )}

            {/* Free plan: show paywall, hide all tracked household sections */}
            {isFree && !loading && <FreePlanLimitCard />}

            {!isFree && budget && (
                <AtAGlance budget={budget} statements={statements} alertCount={allAnomalies.length} />
            )}

            {!isFree && budget && (
                <details className="group rounded-2xl border-2 border-primary-k/25 bg-primary-k/[0.04] overflow-hidden" data-testid="dashboard-more-detail">
                    <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-5 list-none select-none hover:bg-primary-k/[0.07] transition-colors">
                        <span className="flex items-center gap-3 min-w-0">
                            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gold/15 text-gold">
                                <TrendingUp className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block font-heading text-lg text-primary-k leading-tight">Budget detail, insights and history</span>
                                <span className="block text-xs text-muted-k mt-0.5">Spending streams, pathways, insights and your lifetime cap</span>
                            </span>
                        </span>
                        <span
                            data-testid="dashboard-more-detail-btn"
                            className="inline-flex flex-none items-center gap-1.5 rounded-pill bg-primary-k text-white px-4 py-2.5 text-sm font-semibold whitespace-nowrap group-hover:bg-[#091D33] transition-colors"
                        >
                            <span className="group-open:hidden">Show detail</span>
                            <span className="hidden group-open:inline">Hide detail</span>
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                        </span>
                    </summary>
                    <div className="space-y-6 px-5 pb-6 pt-2 border-t border-primary-k/15">
                        {activeParticipant?.id && (
                            <BC2Projection participantId={activeParticipant.id} />
                        )}

                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {budget.streams.map((s) => (
                                <StreamProgress key={s.stream} stream={s} />
                            ))}
                        </div>
                        {budget.streams_note && (
                            <div
                                data-testid="dashboard-streams-note"
                                className="flex items-start justify-between gap-3 rounded-lg border border-kindred bg-surface-2/70 px-4 py-3 text-xs text-muted-k leading-relaxed"
                            >
                                <span>{budget.streams_note}</span>
                                <span
                                    data-testid="dashboard-streams-source"
                                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider font-semibold border ${
                                        budget.allocation_source === "statement"
                                            ? "bg-sage/15 text-sage border-sage/40"
                                            : "bg-gold/25 text-[#6B4A0F] border-gold/60"
                                    }`}
                                >
                                    {budget.allocation_source === "statement" ? "From your latest statement" : "Indicative split"}
                                </span>
                            </div>
                        )}
                        {pathways && pathways.eligible && pathways.eligible.length > 0 && (
                            <div
                                data-testid="dashboard-pathways"
                                className="bg-surface border border-sage/40 rounded-xl p-5"
                            >
                                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                                    <span className="overline">Pathways the participant may qualify for</span>
                                    <span className="text-[10px] uppercase tracking-wider rounded-full bg-sage/10 text-sage px-2.5 py-1">
                                        {pathways.eligible.length} match{pathways.eligible.length === 1 ? "" : "es"}
                                    </span>
                                </div>
                                <ul className="mt-4 space-y-3">
                                    {pathways.eligible.map((p) => (
                                        <li
                                            key={p.pathway}
                                            data-testid={`dashboard-pathway-${p.pathway}`}
                                            className="border-b border-kindred pb-3 last:border-0"
                                        >
                                            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                                                <span className="text-sm text-primary-k font-medium">{p.title}</span>
                                                {p.episode_aud && (
                                                    <span className="text-xs text-muted-k tabular-nums">
                                                        Up to ${Number(p.episode_aud).toLocaleString()} · {p.duration_days} days
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-k mt-1 leading-relaxed">{p.reason}</p>
                                            <div className="flex items-center gap-3 mt-2 text-[10px] uppercase tracking-wider text-muted-k">
                                                <span>{p.section_ref}</span>
                                                {p.next_step && (
                                                    <a
                                                        href={p.next_step}
                                                        className="text-sage hover:text-primary-k normal-case tracking-normal text-xs underline"
                                                        data-testid={`dashboard-pathway-cta-${p.pathway}`}
                                                    >
                                                        Draft a request letter →
                                                    </a>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-[11px] text-muted-k mt-3 leading-relaxed">{pathways.disclaimer}</p>
                            </div>
                        )}

                        <DashboardInsights statements={statements} />

                        <DashboardTimelinePanel />

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
                    </div>
                </details>
            )}

            {!isFree && (
                <details className="group rounded-2xl border-2 border-primary-k/25 bg-primary-k/[0.04] overflow-hidden" data-testid="things-to-know-details">
                    <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-5 list-none select-none hover:bg-primary-k/[0.07] transition-colors">
                        <span className="flex items-center gap-3 min-w-0">
                            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gold/15 text-gold">
                                <AlertTriangle className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block font-heading text-lg text-primary-k leading-tight">Things to know</span>
                                <span className="block text-xs text-muted-k mt-0.5">
                                    {allAnomalies.length > 0
                                        ? `${allAnomalies.length} item${allAnomalies.length === 1 ? "" : "s"} that may need your attention`
                                        : "Alerts and anomalies picked up from your statements"}
                                </span>
                            </span>
                        </span>
                        <span
                            data-testid="things-to-know-btn"
                            className="inline-flex flex-none items-center gap-1.5 rounded-pill bg-primary-k text-white px-4 py-2.5 text-sm font-semibold whitespace-nowrap group-hover:bg-[#091D33] transition-colors"
                        >
                            <span className="group-open:hidden">Show</span>
                            <span className="hidden group-open:inline">Hide</span>
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                        </span>
                    </summary>
                    <div className="px-5 pb-6 pt-2 border-t border-primary-k/15" data-testid="alerts-card">
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
                                        <Link to={`/app/statements/${a.statement_id}`} className="text-xs text-primary-k underline">
                                            View
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </details>
            )}

            {!isFree && (
                <div className="grid lg:grid-cols-3 gap-6">
                    <div className="bg-surface border border-kindred rounded-xl p-6 lg:col-span-3" data-testid="recent-statements-card">
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
            )}

            {!isFree && latest?.summary && (
                <div className="bg-surface-2 rounded-xl p-6 border border-kindred" data-testid="latest-summary-card">
                    <span className="overline">Latest statement, in plain English</span>
                    <p className="mt-3 text-primary-k leading-relaxed text-[0.95rem]">{latest.summary}</p>
                    <Link
                        to={`/app/statements/${latest.id}`}
                        className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k underline"
                    >
                        Open full statement <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            )}

            {/* AI chat preview, Solo & Family */}
            {!isFree && (
                <div className="grid lg:grid-cols-3 gap-6">
                    <div className="bg-surface border border-kindred rounded-xl p-6 lg:col-span-2" data-testid="chat-preview-card">
                        <div className="flex items-center justify-between">
                            <span className="overline flex items-center gap-2"><MessageCircle className="h-4 w-4" /> AI chat, last conversation</span>
                            <Link to="/app/ask-wayly" className="text-xs text-primary-k underline">Open chat</Link>
                        </div>
                        {chatHistory.length === 0 ? (
                            <div className="mt-4 text-sm text-muted-k">
                                No chat yet. Ask Wayly anything about {household?.participant_name || "the participant"}&#39;s budget, statement, or care plan. <Link to="/app/ask-wayly" className="text-primary-k underline">Start a chat</Link>.
                            </div>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {chatHistory.slice(-3).map((m) => (
                                    <li key={m.id} className="text-sm">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-k">{m.role === "user" ? "You" : "Wayly"} · {formatDateTime(m.created_at)}</div>
                                        <div className="text-primary-k mt-0.5 line-clamp-2">{m.content}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="audit-preview-card">
                        <div className="flex items-center justify-between">
                            <span className="overline flex items-center gap-2"><Shield className="h-4 w-4" /> Audit Log</span>
                            <Link to="/app/audit" className="text-xs text-primary-k underline">View all</Link>
                        </div>
                        {audit.length === 0 ? (
                            <div className="mt-4 text-sm text-muted-k">No actions logged yet.</div>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {audit.slice(0, 4).map((e) => (
                                    <li key={e.id} className="text-xs">
                                        <div className="font-medium text-primary-k">{e.action.replace(/_/g, " ")}</div>
                                        <div className="text-muted-k mt-0.5">{e.actor_name} · {formatDateTime(e.created_at)}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Family thread, Family plan only */}
            {isFamily && (
                <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="family-preview-card">
                    <div className="flex items-center justify-between">
                        <span className="overline flex items-center gap-2"><Users2 className="h-4 w-4" /> Family thread</span>
                        <Link to="/app/family" className="text-xs text-primary-k underline">Open thread</Link>
                    </div>
                    {familyMsgs.length === 0 ? (
                        <div className="mt-4 text-sm text-muted-k">
                            No family messages yet. Share what&#39;s happening with siblings or your advisor without group SMS chains.
                        </div>
                    ) : (
                        <ul className="mt-4 space-y-3">
                            {familyMsgs.slice(-3).map((m) => (
                                <li key={m.id} className="border-b border-kindred pb-2 last:border-0">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-k">{m.author_name} · {formatDateTime(m.created_at)}</div>
                                    <div className="text-sm text-primary-k mt-0.5">{m.body}</div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Solo upgrade nudge to Family */}
            {plan === "solo" && (
                <div className="bg-surface-2 border border-kindred rounded-xl p-5 flex items-start gap-3" data-testid="upgrade-to-family-card">
                    <Calendar className="h-5 w-5 text-primary-k mt-0.5" />
                    <div className="flex-1">
                        <div className="font-medium text-primary-k">Want siblings, advisors, or a GP looped in?</div>
                        <p className="text-sm text-muted-k mt-1">Family plan adds 5 seats, role‑based permissions, and the Sunday digest. Upgrade any time, no card surprises.</p>
                    </div>
                    <Link to="/pricing" className="text-sm text-primary-k underline whitespace-nowrap">Compare plans</Link>
                </div>
            )}
            {activeParticipant?.id && (
                <ParticipantContactsPanel
                    open={showContacts}
                    onClose={() => setShowContacts(false)}
                    participantId={activeParticipant.id}
                    participantName={activeParticipant.first_name || activeParticipant.name}
                />
            )}
        </div>
    );
}
