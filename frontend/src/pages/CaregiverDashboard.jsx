import React, { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/formatDate";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, formatAUD, formatAUD2 } from "@/lib/api";
import StreamProgress from "@/components/StreamProgress";
import DashboardInsights from "@/components/DashboardInsights";
import ShareDashboardButton from "@/components/ShareDashboardButton";
import OnboardingEnvelopeTile from "@/pages/journey/OnboardingEnvelopeTile";
import JourneyStartBanner from "@/pages/journey/JourneyStartBanner";
import { relativeTime } from "@/components/ProfileInlinePrompts";
import { humanize, shortSummary, flagTint } from "@/lib/plainText";

import {
    AlertTriangle, FileText, ArrowRight, Sparkles, Users2, Shield, MessageCircle,
    Crown, Lock, Calendar, TrendingUp, Bell, CheckCircle2, Clock, Users, ChevronDown, Lightbulb, Info,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usePersonaCopy } from "@/hooks/usePersonaCopy";
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
                        <Link to="/settings/billing" className="text-sm bg-primary-k text-white rounded-lg px-5 py-2.5 hover:bg-[#091D33]" data-testid="dashboard-upgrade-cta">Choose a Plan</Link>
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

// Budget donut — a simple, easily-read ring showing how much of the quarter's
// budget has been used. Tone shifts sage → clay → red as it fills / goes over.
function BudgetDonut({ pctFill, pctLabel, tone, size = 168, stroke = 20 }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, pctFill));
    const off = c - (clamped / 100) * c;
    return (
        <div className="relative inline-flex flex-none items-center justify-center" style={{ width: size, height: size }} data-testid="glance-donut">
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(14,77,82,0.10)" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
                    strokeLinecap="round" strokeDasharray={c}
                    style={{ strokeDashoffset: off, transition: "stroke-dashoffset 700ms ease" }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-heading text-3xl sm:text-4xl leading-none tabular-nums" style={{ color: tone }} data-testid="glance-donut-pct">{pctLabel}%</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-k mt-1">used</span>
            </div>
        </div>
    );
}

/**
 * AtAGlance — one calm, high-contrast summary that replaces the old wall of
 * four stat cards. Leads with the single number that matters most (money left
 * this quarter) and keeps the rest as quiet, tappable mini-stats.
 */
function AtAGlance({ budget, statements, alertCount, toReviewHref, lifetimeCapHref }) {
    const spent = budget.streams.reduce((a, s) => a + s.spent, 0);
    // Official quarterly budget = annual ÷ 4 (includes the 10% care-management share),
    // so the headline matches the plan, calculator and reviewer for this classification.
    const quarterlyBudget = budget.quarterly_gross ?? budget.quarterly_total ?? budget.quarterly_usable;
    const careMgmt = budget.care_management_quarterly ?? 0;
    const left = quarterlyBudget - spent;
    const pctUsed = quarterlyBudget > 0 ? Math.max(0, Math.min(100, (spent / quarterlyBudget) * 100)) : 0;
    // Uncapped % for the text row so the over-budget state carries a real signal
    // (e.g. "150% of budget used"); the progress bar stays clamped at 100% for layout.
    const pctUsedDisplay = quarterlyBudget > 0 ? Math.max(0, Math.round((spent / quarterlyBudget) * 100)) : 0;
    const over = left < 0;
    const toneHex = (over || pctUsed >= 90) ? "#C0392B" : pctUsed >= 75 ? "#C2683D" : "#4E6E54";
    return (
        <section
            data-testid="dashboard-at-a-glance"
            className="rounded-2xl border border-kindred bg-surface overflow-hidden shadow-sm"
        >
            {/* Headline: an easy-to-read budget donut + the figures that matter */}
            <div className="relative p-6 sm:p-7 bg-[linear-gradient(135deg,rgba(14,77,82,0.06),rgba(107,143,113,0.05))]">
                <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                    <BudgetDonut pctFill={pctUsed} pctLabel={pctUsedDisplay} tone={toneHex} />
                    <div className="min-w-0 flex-1 w-full text-center sm:text-left">
                        <span className={`block text-sm sm:text-[15px] uppercase tracking-[0.14em] font-bold ${over ? "text-terracotta" : "text-primary-k"}`} data-testid="glance-budget-status">
                            {over ? "Over budget this quarter" : "Left to spend this quarter"}
                        </span>
                        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap justify-center sm:justify-start">
                            <span className={`font-heading text-3xl tabular-nums leading-tight ${over ? "text-terracotta" : "text-primary-k"}`} data-testid="glance-left">
                                {formatAUD2(Math.abs(left))}
                            </span>
                            <span className="text-sm text-primary-k/70 font-medium">of</span>
                            <span className="font-heading text-3xl tabular-nums leading-tight text-primary-k/80" data-testid="glance-budget">
                                {formatAUD2(quarterlyBudget)}
                            </span>
                            <span className="text-sm text-primary-k/70 font-medium">this quarter</span>
                        </div>
                        <p className="mt-3.5 inline-flex items-center gap-2 text-base font-semibold text-primary-k" data-testid="glance-spent">
                            <span className="h-3 w-3 rounded-full flex-none" style={{ backgroundColor: toneHex }} />
                            <span className="tabular-nums font-bold">{formatAUD2(spent)}</span> spent so far
                        </p>
                        {careMgmt > 0 && (
                            <p className="mt-2 text-sm text-primary-k/70" data-testid="glance-care-management">{formatAUD2(careMgmt)} of this is care management (10% of the quarterly budget).</p>
                        )}
                    </div>
                </div>
            </div>
            {/* Mini-stats: three distinct, soft colours */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 p-3 sm:p-4 border-t border-kindred">
                <Link to={toReviewHref} data-testid="glance-alerts" className="rounded-xl border-l-4 border-l-gold border border-gold/30 bg-gold/[0.10] p-3.5 sm:p-4 shadow-sm hover:bg-gold/[0.18] transition-colors">
                    <div className="flex items-center gap-1.5 text-[#6B4A0F]"><Bell className="h-4 w-4" /><span className="text-[10px] uppercase tracking-[0.12em] font-semibold">To review</span></div>
                    <div className="mt-1 font-heading text-[1.75rem] leading-none text-primary-k tabular-nums">{alertCount}</div>
                    <div className="mt-0.5 text-[10px] text-muted-k leading-tight">On your latest statement</div>
                </Link>
                <Link to="/app/statements" data-testid="glance-statements" className="rounded-xl border-l-4 border-l-primary-k border border-primary-k/15 bg-primary-k/[0.06] p-3.5 sm:p-4 shadow-sm hover:bg-primary-k/[0.11] transition-colors">
                    <div className="flex items-center gap-1.5 text-primary-k"><FileText className="h-4 w-4" /><span className="text-[10px] uppercase tracking-[0.12em] font-semibold">Statements</span></div>
                    <div className="mt-1 font-heading text-[1.75rem] leading-none text-primary-k tabular-nums">{statements.length}</div>
                </Link>
                <Link to={lifetimeCapHref} data-testid="glance-cap" className="rounded-xl border-l-4 border-l-clay border border-clay/30 bg-clay/[0.09] p-3.5 sm:p-4 shadow-sm hover:bg-clay/[0.16] transition-colors">
                    <div className="flex items-center gap-1.5 text-clay"><CheckCircle2 className="h-4 w-4" /><span className="text-[10px] uppercase tracking-[0.12em] font-semibold">Lifetime cap</span></div>
                    <div className="mt-1 font-heading text-[1.4rem] sm:text-[1.6rem] leading-none text-primary-k tabular-nums">{formatAUD(budget.lifetime_contributions)}</div>
                    <div className="mt-0.5 text-[10px] text-muted-k leading-tight tabular-nums">{budget.lifetime_pct.toFixed(0)}% of {formatAUD(budget.lifetime_cap)}</div>
                </Link>
            </div>
        </section>
    );
}

export default function CaregiverDashboard() {
    const { household, user } = useAuth();
    const persona = usePersonaCopy();
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
    const [invoices, setInvoices] = useState([]);
    const [familyMsgs, setFamilyMsgs] = useState([]);
    const [audit, setAudit] = useState([]);
    const [chatHistory, setChatHistory] = useState([]);
    const [pathways, setPathways] = useState(null);
    const [loading, setLoading] = useState(true);
    // Server-computed in-app nudges (e.g. Family second-participant reminder).
    const [nudges, setNudges] = useState([]);
    const [showAllTtk, setShowAllTtk] = useState(false);

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
                const [b, s, f, a, c, p, inv] = await Promise.all([
                    api.get("/budget/current").catch(() => ({ data: null })),
                    api.get("/statements").catch(() => ({ data: [] })),
                    api.get("/family-thread").catch(() => ({ data: [] })),
                    api.get("/audit-log").catch(() => ({ data: [] })),
                    api.get("/chat/history").catch(() => ({ data: [] })),
                    api.get("/budget/eligible-pathways").catch(() => ({ data: null })),
                    api.get("/invoices").catch(() => ({ data: { items: [] } })),
                ]);
                if (cancelled) return;
                setBudget(b.data);
                setStatements(s.data || []);
                setFamilyMsgs(f.data || []);
                setAudit(a.data || []);
                setChatHistory(c.data || []);
                setPathways(p.data);
                setInvoices((inv.data && inv.data.items) || []);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeParticipant?.id]);

    const latest = statements[0];
    // Things To Know and the dashboard summary reflect ONLY the most recent
    // statement and the most recent invoice, never an aggregate across every
    // statement (which would balloon into hundreds of stale items).
    const latestStatementAnomalies = (latest?.anomalies || []).map((a) => ({
        ...a, statement_id: latest.id, period_label: latest.period_label,
    }));
    const latestInvoice = invoices[0] || null;
    const latestInvoiceFindings = (latestInvoice?.reconciliation?.findings) || [];
    const ttkCount = latestStatementAnomalies.length + latestInvoiceFindings.length;

    // Budget view — mirror AtAGlance exactly so the Wayly Summary tells the
    // SAME story as the donut (spent, % used, over / left).
    const budgetSpent = budget ? budget.streams.reduce((acc, s) => acc + s.spent, 0) : 0;
    const budgetQuarterly = budget
        ? (budget.quarterly_gross ?? budget.quarterly_total ?? budget.quarterly_usable ?? 0)
        : 0;
    const budgetLeft = budgetQuarterly - budgetSpent;
    const budgetOver = budgetLeft < 0;
    const budgetPctUsed = budgetQuarterly > 0
        ? Math.max(0, Math.round((budgetSpent / budgetQuarterly) * 100))
        : 0;

    return (
        <div className="space-y-8" data-testid="caregiver-dashboard">
            <JourneyStartBanner />
            <OnboardingEnvelopeTile />
            <div>
                <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-primary-k tracking-tight" data-testid="dashboard-greeting">
                    {greeting}, {caregiverFirst}. What would you like to do?
                </h1>
                {activeParticipant && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full section-teal px-4 py-2 text-sm" data-testid="dashboard-viewing-for">
                        <Users className="h-4 w-4 text-gold" />
                        <span className="text-white/85">Viewing care for</span>
                        <span className="font-semibold text-white">{displayName || "your household"}</span>
                    </div>
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
                        quarterly_budget_aud: budgetQuarterly || null,
                        quarterly_spent_aud: budgetSpent || null,
                        budget_percent_used: budget ? budgetPctUsed : null,
                        over_budget: budget ? budgetOver : null,
                        amount_over_budget_aud: budget && budgetOver ? Math.abs(budgetLeft) : null,
                        amount_remaining_aud: budget && !budgetOver ? budgetLeft : null,
                        quarterly_care_management_aud: budget?.care_management_quarterly ?? null,
                        statements_count: statements.length,
                        latest_statement_period: latest?.period_label || null,
                        latest_statement_provider: latest?.provider_name || latest?.extracted_json?.provider_name || null,
                        latest_statement_open_anomalies: latestStatementAnomalies.length,
                        latest_invoice_provider: latestInvoice?.provider_name || null,
                        latest_invoice_issue_count: latestInvoice ? latestInvoiceFindings.length : null,
                        has_invoice_on_file: invoices.length > 0,
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
                                    className="inline-flex items-center gap-1 bg-primary-k text-white rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
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
                <AtAGlance
                    budget={budget}
                    statements={statements}
                    alertCount={(latest?.anomalies || []).length}
                    toReviewHref={latest ? `/app/statements/${latest.id}` : "/app/statements"}
                    lifetimeCapHref={activeParticipant?.id ? `/app/participants/${activeParticipant.id}/contribution-position` : "/app/contribution-position"}
                />
            )}

            {!isFree && budget && (
                <details className="group rounded-2xl border border-primary-k/20 bg-surface overflow-hidden shadow-sm" data-testid="dashboard-more-detail">
                    <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-5 list-none select-none border-l-4 border-l-primary-k bg-[linear-gradient(135deg,rgba(14,77,82,0.10),rgba(107,143,113,0.06))] hover:brightness-[0.98] transition-colors">
                        <span className="flex items-center gap-3 min-w-0">
                            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary-k text-white shadow-sm">
                                <TrendingUp className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block font-heading text-lg text-primary-k leading-tight">Budget Detail, Insights &amp; History</span>
                                <span className="block text-xs text-muted-k mt-0.5">Spending streams, pathways, insights and your lifetime cap</span>
                            </span>
                        </span>
                        <span
                            data-testid="dashboard-more-detail-btn"
                            className="dash-detail-btn inline-flex flex-none items-center gap-1.5 rounded-pill bg-primary-k text-white px-4 py-2.5 text-sm font-semibold whitespace-nowrap group-hover:bg-[#091D33] transition-colors"
                        >
                            <span className="group-open:hidden">Show Detail</span>
                            <span className="hidden group-open:inline">Hide Detail</span>
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
                                className={`rounded-xl px-4 py-3.5 leading-relaxed ${
                                    budget.allocation_source === "statement"
                                        ? "border border-kindred bg-surface-2/70 text-xs text-muted-k"
                                        : "border-2 border-gold/70 bg-gold/[0.14] text-sm"
                                }`}
                            >
                                <div className="flex items-start gap-2.5">
                                    {budget.allocation_source === "statement" ? (
                                        <CheckCircle2 className="h-4 w-4 text-sage flex-none mt-0.5" />
                                    ) : (
                                        <Info className="h-4 w-4 text-[#6B4A0F] flex-none mt-0.5" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <span
                                            data-testid="dashboard-streams-source"
                                            className={`inline-block rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold border ${
                                                budget.allocation_source === "statement"
                                                    ? "bg-sage/15 text-sage border-sage/40"
                                                    : "bg-gold/40 text-[#6B4A0F] border-gold"
                                            }`}
                                        >
                                            {budget.allocation_source === "statement" ? "From your latest statement" : "Indicative split only"}
                                        </span>
                                        {budget.allocation_source !== "statement" && (
                                            <p className="mt-2 font-semibold text-[#6B4A0F]">
                                                These per-category figures are an estimated split, not your provider's actual numbers. Upload a statement to see the real split.
                                            </p>
                                        )}
                                        <p className={budget.allocation_source === "statement" ? "" : "mt-1 text-[#6B4A0F]/85"}>{budget.streams_note}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {pathways && pathways.eligible && pathways.eligible.length > 0 && (
                            <div
                                data-testid="dashboard-pathways"
                                className="bg-sage/[0.06] border border-sage/40 rounded-xl p-5"
                            >
                                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                                    <span className="overline">{persona.isParticipant ? "Pathways you may qualify for" : "Pathways the participant may qualify for"}</span>
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
                    </div>
                </details>
            )}

            {!isFree && (
                <details className="group rounded-2xl overflow-hidden border border-gold/40 shadow-sm" data-testid="things-to-know-details">
                    <summary className={`flex cursor-pointer items-center justify-between gap-4 px-5 py-5 list-none select-none border-l-4 hover:brightness-[0.98] transition-colors ${ttkCount > 0 ? "border-l-terracotta bg-[linear-gradient(135deg,rgba(192,57,43,0.10),rgba(240,178,103,0.10))]" : "border-l-gold bg-[linear-gradient(135deg,rgba(165,81,43,0.10),rgba(240,178,103,0.08))]"}`}>
                        <span className="flex items-center gap-3 min-w-0">
                            <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-white shadow-sm ${ttkCount > 0 ? "bg-terracotta" : "bg-gold"}`}>
                                <AlertTriangle className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block font-heading text-lg text-primary-k leading-tight">Things To Know</span>
                                <span className="block text-xs text-muted-k mt-0.5">Based on your latest statement and invoice</span>
                            </span>
                        </span>
                        <span className="flex flex-none items-center gap-2.5">
                            {ttkCount > 0 && (
                                <span data-testid="things-to-know-count" className="inline-flex items-center justify-center rounded-full bg-terracotta text-white text-sm font-bold h-7 min-w-[1.75rem] px-2 shadow-sm">
                                    {ttkCount > 99 ? "99+" : ttkCount}
                                </span>
                            )}
                            <span
                                data-testid="things-to-know-btn"
                                className="dash-detail-btn inline-flex items-center gap-1.5 rounded-pill bg-gold text-white px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors"
                            >
                                <span className="group-open:hidden">Show</span>
                                <span className="hidden group-open:inline">Hide</span>
                                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                            </span>
                        </span>
                    </summary>
                    <div className="px-5 pb-6 pt-4 bg-surface" data-testid="alerts-card">
                        {/* STATEMENTS — latest statement only */}
                        <div data-testid="ttk-statements-section">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary-k" />
                                <span className="font-heading text-base text-primary-k">Statements</span>
                            </div>
                            <p className="text-xs text-muted-k mt-0.5">
                                Based on the latest statement{latest?.period_label ? ` (${latest.period_label})` : ""}.
                            </p>
                            {latestStatementAnomalies.length === 0 ? (
                                <div className="mt-3 text-muted-k text-sm flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-sage" /> Nothing unusual on your latest statement.
                                </div>
                            ) : (
                                <>
                                <ul className="mt-3 space-y-3">
                                    {(showAllTtk ? latestStatementAnomalies : latestStatementAnomalies.slice(0, 10)).map((a, ttkIdx) => {
                                        const summary = shortSummary(a.detail);
                                        const fullDetail = humanize(a.detail);
                                        const showWhy = fullDetail && fullDetail !== summary;
                                        const isAlert = a.severity === "alert";
                                        return (
                                        <li key={a.id} className={`rounded-xl border p-4 ${flagTint(ttkIdx)}`}>
                                            <div className="flex items-start gap-3">
                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-none ${isAlert ? "bg-terracotta text-white" : "bg-gold text-white"}`}>
                                                    <AlertTriangle className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 text-white ${isAlert ? "bg-terracotta" : "bg-gold"}`}>
                                                            {isAlert ? "Alert" : "Heads up"}
                                                        </span>
                                                        <span className="font-semibold text-primary-k text-sm">{humanize(a.title)}</span>
                                                    </div>
                                                    {summary && <p className="text-sm text-muted-k mt-1.5 leading-relaxed">{summary}</p>}
                                                    {a.suggested_action && (
                                                        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-gold/10 border border-gold/30 px-3 py-2">
                                                            <Lightbulb className="h-3.5 w-3.5 flex-none text-gold mt-0.5" />
                                                            <span className="text-xs text-primary-k leading-relaxed"><span className="font-semibold">What to do: </span>{humanize(a.suggested_action)}</span>
                                                        </div>
                                                    )}
                                                    {showWhy && (
                                                        <details className="mt-2 group/why">
                                                            <summary className="cursor-pointer list-none text-xs font-medium text-primary-k inline-flex items-center gap-1 hover:underline">
                                                                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/why:rotate-180" /> Why we flagged this
                                                            </summary>
                                                            <p className="mt-1.5 text-xs text-muted-k leading-relaxed">{fullDetail}</p>
                                                        </details>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-3 flex justify-end border-t border-primary-k/10 pt-2.5">
                                                <Link to={`/app/statements/${a.statement_id}`} className="text-xs font-medium text-primary-k inline-flex items-center gap-1 hover:underline">
                                                    View statement <ArrowRight className="h-3.5 w-3.5" />
                                                </Link>
                                            </div>
                                        </li>
                                        );
                                    })}
                                </ul>
                                {latestStatementAnomalies.length > 10 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllTtk((v) => !v)}
                                        data-testid="things-to-know-view-all"
                                        className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-pill border border-primary-k/25 bg-surface px-4 py-2.5 text-sm font-semibold text-primary-k hover:bg-primary-k/[0.05] transition-colors"
                                    >
                                        {showAllTtk ? "Show fewer" : `View all ${latestStatementAnomalies.length} on this statement`}
                                        <ChevronDown className={`h-4 w-4 transition-transform ${showAllTtk ? "rotate-180" : ""}`} />
                                    </button>
                                )}
                                </>
                            )}
                        </div>

                        {/* INVOICES — latest invoice only */}
                        <div data-testid="ttk-invoices-section" className="mt-6 pt-5 border-t border-kindred">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-clay" />
                                <span className="font-heading text-base text-primary-k">Invoices</span>
                            </div>
                            <p className="text-xs text-muted-k mt-0.5">
                                Based on the latest invoice{latestInvoice?.provider_name ? ` (${latestInvoice.provider_name})` : ""}.
                            </p>
                            {!latestInvoice ? (
                                <div className="mt-3 text-muted-k text-sm flex items-center gap-2">
                                    <Info className="h-4 w-4 text-muted-k" /> No invoice checked yet.{" "}
                                    <Link to="/app/tools/invoice-checker" className="text-primary-k underline">Check one</Link>.
                                </div>
                            ) : latestInvoiceFindings.length === 0 ? (
                                <div className="mt-3 text-muted-k text-sm flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-sage" /> Nothing unusual on your latest invoice.
                                </div>
                            ) : (
                                <ul className="mt-3 space-y-3">
                                    {latestInvoiceFindings.map((f, i) => {
                                        const isAlert = Number(f.tier) <= 2;
                                        const body = f.narrative || f.suggested_question || "";
                                        return (
                                        <li key={`${f.check_id}-${i}`} className={`rounded-xl border p-4 ${flagTint(i)}`}>
                                            <div className="flex items-start gap-3">
                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-none ${isAlert ? "bg-terracotta text-white" : "bg-gold text-white"}`}>
                                                    <AlertTriangle className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 text-white ${isAlert ? "bg-terracotta" : "bg-gold"}`}>
                                                        {isAlert ? "Alert" : "Heads up"}
                                                    </span>
                                                    {body && <p className="text-sm text-muted-k mt-1.5 leading-relaxed">{body}</p>}
                                                    {f.suggested_question && f.suggested_question !== body && (
                                                        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-gold/10 border border-gold/30 px-3 py-2">
                                                            <Lightbulb className="h-3.5 w-3.5 flex-none text-gold mt-0.5" />
                                                            <span className="text-xs text-primary-k leading-relaxed"><span className="font-semibold">What to ask: </span>{f.suggested_question}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-3 flex justify-end border-t border-primary-k/10 pt-2.5">
                                                <Link to={`/app/invoices/${latestInvoice.id}`} className="text-xs font-medium text-primary-k inline-flex items-center gap-1 hover:underline">
                                                    View invoice <ArrowRight className="h-3.5 w-3.5" />
                                                </Link>
                                            </div>
                                        </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </details>
            )}

            {/* Family thread, Family plan only — surfaced high on the page */}
            {isFamily && (
                <div className="bg-[linear-gradient(135deg,rgba(107,143,113,0.16),rgba(244,239,231,0.4))] border border-sage/30 rounded-xl p-6" data-testid="family-preview-card">
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

            {!isFree && (
                <div className="grid lg:grid-cols-3 gap-6">
                    <div className="bg-[linear-gradient(135deg,rgba(165,81,43,0.06),transparent)] border border-gold/25 rounded-xl p-6 lg:col-span-3" data-testid="recent-statements-card">
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

            {/* AI chat preview, Solo & Family */}
            {!isFree && (
                <details className="group bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="chat-preview-card">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-6 py-5 list-none select-none hover:brightness-[0.99] transition-colors">
                        <span className="overline flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Wayly Chat, last conversation</span>
                        <span className="flex items-center gap-3">
                            <Link to="/app/ask-wayly" onClick={(e) => e.stopPropagation()} className="text-xs text-primary-k underline">Open chat</Link>
                            <ChevronDown data-testid="chat-preview-toggle" className="h-5 w-5 text-primary-k transition-transform group-open:rotate-180" />
                        </span>
                    </summary>
                    <div className="px-6 pb-6 pt-1 border-t border-kindred">
                        {chatHistory.length === 0 ? (
                            <div className="mt-4 text-sm text-muted-k">
                                No chat yet. Ask Wayly anything about {persona.isParticipant ? "your" : `${household?.participant_name || "the participant"}\u2019s`} budget, statement, or care plan. <Link to="/app/ask-wayly" className="text-primary-k underline">Start a chat</Link>.
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
                </details>
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
