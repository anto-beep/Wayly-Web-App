import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatAUD, formatAUD2 } from "@/lib/api";
import StreamProgress from "@/components/StreamProgress";
import {
    AlertTriangle, FileText, ArrowRight, Sparkles, Users2, Shield, MessageCircle,
    Crown, Lock, Calendar,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const PLAN_LABELS = {
    free: { label: "Free plan", tone: "bg-sage/15 text-[#3A5A40]", desc: "2 of 8 AI tools · no household tracking" },
    solo: { label: "Solo plan · Trial", tone: "bg-gold/20 text-primary-k", desc: "All 8 tools · 1 caregiver seat" },
    family: { label: "Family plan · Trial", tone: "bg-primary-k/15 text-primary-k", desc: "All 8 tools · 5 family seats · Sunday digest" },
};

function PlanBadge({ plan }) {
    const cfg = PLAN_LABELS[plan] || PLAN_LABELS.free;
    return (
        <div className="inline-flex items-center gap-2 rounded-full bg-surface border border-kindred px-3 py-1.5" data-testid="dashboard-plan-badge">
            <Crown className="h-3.5 w-3.5 text-gold" />
            <span className={`text-xs font-medium uppercase tracking-wider rounded-full px-2 py-0.5 ${cfg.tone}`}>{cfg.label}</span>
            <span className="text-xs text-muted-k hidden sm:inline">{cfg.desc}</span>
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
                    <h2 className="font-heading text-xl text-primary-k">Free plan — connected household tracking is on Solo and Family.</h2>
                    <p className="mt-2 text-sm text-muted-k leading-relaxed">
                        On Free you can use 2 public AI tools (Statement Decoder + Budget Calculator). To unlock budget tracking, anomaly alerts, family thread, audit log, and AI chat for your specific household — start a 14‑day free trial.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/pricing" className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a]" data-testid="dashboard-upgrade-cta">Compare plans</Link>
                        <Link to="/ai-tools" className="text-sm border border-kindred rounded-full px-5 py-2.5 text-primary-k hover:bg-surface-2">Try the AI tools</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CaregiverDashboard() {
    const { household, user } = useAuth();
    const [budget, setBudget] = useState(null);
    const [statements, setStatements] = useState([]);
    const [familyMsgs, setFamilyMsgs] = useState([]);
    const [audit, setAudit] = useState([]);
    const [chatHistory, setChatHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    const plan = user?.plan || "free";
    const isFree = plan === "free";
    const isFamily = plan === "family";

    useEffect(() => {
        (async () => {
            try {
                const [b, s, f, a, c] = await Promise.all([
                    api.get("/budget/current").catch(() => ({ data: null })),
                    api.get("/statements").catch(() => ({ data: [] })),
                    api.get("/family-thread").catch(() => ({ data: [] })),
                    api.get("/audit-log").catch(() => ({ data: [] })),
                    api.get("/chat/history").catch(() => ({ data: [] })),
                ]);
                setBudget(b.data);
                setStatements(s.data || []);
                setFamilyMsgs(f.data || []);
                setAudit(a.data || []);
                setChatHistory(c.data || []);
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
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="overline">Wellbeing summary</span>
                        <PlanBadge plan={plan} />
                    </div>
                    <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2">
                        {household?.participant_name ? `${household.participant_name}, this quarter` : "Your dashboard"}
                    </h1>
                    {budget && (
                        <p className="text-muted-k mt-2">
                            {budget.quarter_label} · {budget.classification_label} · {formatAUD(budget.quarterly_total)} per quarter · Provider: {household?.provider_name}
                        </p>
                    )}
                </div>
                {!isFree && (
                    <Link
                        to="/app/statements/upload"
                        data-testid="dashboard-upload-cta"
                        className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90 transition-colors"
                    >
                        <FileText className="h-4 w-4" /> Upload a statement
                    </Link>
                )}
            </div>

            {loading && <div className="text-muted-k">Loading…</div>}

            {/* Free plan: show paywall, hide all tracked household sections */}
            {isFree && !loading && <FreePlanLimitCard />}

            {!isFree && budget && (
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

            {!isFree && (
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
                                        <Link to={`/app/statements/${a.statement_id}`} className="text-xs text-primary-k underline">
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
            )}

            {!isFree && latest?.summary && (
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

            {/* AI chat preview — Solo & Family */}
            {!isFree && (
                <div className="grid lg:grid-cols-3 gap-6">
                    <div className="bg-surface border border-kindred rounded-xl p-6 lg:col-span-2" data-testid="chat-preview-card">
                        <div className="flex items-center justify-between">
                            <span className="overline flex items-center gap-2"><MessageCircle className="h-4 w-4" /> AI chat — last conversation</span>
                            <Link to="/app/chat" className="text-xs text-primary-k underline">Open chat</Link>
                        </div>
                        {chatHistory.length === 0 ? (
                            <div className="mt-4 text-sm text-muted-k">
                                No chat yet. Ask Kindred anything about {household?.participant_name || "the participant"}'s budget, statement, or care plan. <Link to="/app/chat" className="text-primary-k underline">Start a chat</Link>.
                            </div>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {chatHistory.slice(-3).map((m) => (
                                    <li key={m.id} className="text-sm">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-k">{m.role === "user" ? "You" : "Kindred"} · {new Date(m.created_at).toLocaleString()}</div>
                                        <div className="text-primary-k mt-0.5 line-clamp-2">{m.content}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="audit-preview-card">
                        <div className="flex items-center justify-between">
                            <span className="overline flex items-center gap-2"><Shield className="h-4 w-4" /> Audit log</span>
                            <Link to="/app/audit" className="text-xs text-primary-k underline">View all</Link>
                        </div>
                        {audit.length === 0 ? (
                            <div className="mt-4 text-sm text-muted-k">No actions logged yet.</div>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {audit.slice(0, 4).map((e) => (
                                    <li key={e.id} className="text-xs">
                                        <div className="font-medium text-primary-k">{e.action.replace(/_/g, " ")}</div>
                                        <div className="text-muted-k mt-0.5">{e.actor_name} · {new Date(e.created_at).toLocaleString()}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Family thread — Family plan only */}
            {isFamily && (
                <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="family-preview-card">
                    <div className="flex items-center justify-between">
                        <span className="overline flex items-center gap-2"><Users2 className="h-4 w-4" /> Family thread</span>
                        <Link to="/app/family" className="text-xs text-primary-k underline">Open thread</Link>
                    </div>
                    {familyMsgs.length === 0 ? (
                        <div className="mt-4 text-sm text-muted-k">
                            No family messages yet. Share what's happening with siblings or your advisor without group SMS chains.
                        </div>
                    ) : (
                        <ul className="mt-4 space-y-3">
                            {familyMsgs.slice(-3).map((m) => (
                                <li key={m.id} className="border-b border-kindred pb-2 last:border-0">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-k">{m.author_name} · {new Date(m.created_at).toLocaleString()}</div>
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
                        <p className="text-sm text-muted-k mt-1">Family plan adds 5 seats, role‑based permissions, and the Sunday digest. Upgrade any time — no card surprises.</p>
                    </div>
                    <Link to="/pricing" className="text-sm text-primary-k underline whitespace-nowrap">Compare plans</Link>
                </div>
            )}
        </div>
    );
}
