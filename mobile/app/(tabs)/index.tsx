import React, { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import {
  TrendingUp, Bell, FileText, CheckCircle2, AlertTriangle, Sparkles, ChevronRight,
  MessageCircle, Users, Activity, ArrowRight, Crown, Lock, Shield, Users2, Calendar,
} from "lucide-react-native";

import { WaylyHeader } from "@/src/components/WaylyHeader";
import { StreamProgress, Stream } from "@/src/components/StreamProgress";
import { Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, moneyWhole, sanitizeAI, shortDate, formatDateTime, greetingFor } from "@/src/utils/format";

const TOOL_COUNT = 9;

// Mirrors web CaregiverDashboard PLAN_LABELS verbatim.
const PLAN_LABELS: Record<string, { label: string; desc: string }> = {
  free: { label: "Free plan", desc: `2 of ${TOOL_COUNT} AI tools · no household tracking` },
  solo: { label: "Solo plan · Trial", desc: `All ${TOOL_COUNT} tools · 1 caregiver seat` },
  family: { label: "Family plan · Trial", desc: `All ${TOOL_COUNT} tools · 5 family seats · Sunday digest` },
};

type Budget = {
  quarter_label?: string; classification_label?: string; quarterly_usable?: number; quarterly_total?: number;
  streams?: Stream[]; streams_note?: string; allocation_source?: string;
  lifetime_cap?: number; lifetime_contributions?: number; lifetime_pct?: number; is_grandfathered?: boolean;
};
type Statement = { id: string; filename: string; period_label?: string | null; uploaded_at?: string; created_at?: string; anomalies?: any[]; provider_name?: string; summary?: string | null; line_items?: any[] };
type Pathway = { pathway: string; title: string; episode_aud?: number; duration_days?: number; reason?: string; section_ref?: string };
type AuditEntry = { id: string; actor_name?: string; action?: string; detail?: string; created_at?: string };
type ChatMsg = { id: string; role?: string; content?: string; created_at?: string };
type FamilyMsg = { id: string; author_name?: string; body?: string; created_at?: string; read?: boolean };
type Insight = { summary?: string; alerts?: { level: string; text: string }[] };

const Overline = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();
  return <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.8, color: colors.muted }}>{String(children).toUpperCase()}</T>;
};

export default function Dashboard() {
  const { user } = useAuth();
  const { activeId, active } = useParticipants();
  const { colors, shadow } = useTheme();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [familyMsgs, setFamilyMsgs] = useState<FamilyMsg[]>([]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const plan = user?.plan || "free";
  const isFree = plan === "free";
  const isFamily = plan === "family";

  const load = useCallback(async () => {
    setError(false);
    try {
      const [b, stmts, pw, au, chat, fam] = await Promise.all([
        apiFetch<Budget>("/budget/current").catch(() => null),
        apiFetch<Statement[]>("/statements").catch(() => []),
        apiFetch<{ eligible: Pathway[] }>("/budget/eligible-pathways").catch(() => ({ eligible: [] })),
        apiFetch<AuditEntry[]>("/audit-log").catch(() => []),
        apiFetch<ChatMsg[]>("/chat/history").catch(() => []),
        apiFetch<FamilyMsg[]>("/family-thread").catch(() => []),
      ]);
      setBudget(b);
      setStatements(Array.isArray(stmts) ? stmts : []);
      setPathways(pw?.eligible || []);
      setAudit(Array.isArray(au) ? au : []);
      setChatHistory(Array.isArray(chat) ? chat : []);
      setFamilyMsgs(Array.isArray(fam) ? fam : []);
      apiFetch<Insight>("/insights/summarise", { method: "POST", body: { page_key: "dashboard", context: { plan: user?.plan } } })
        .then(setInsight)
        .catch(() => setInsight(null));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId, user?.plan]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const firstName = user?.first_name || user?.name?.split(" ")[0] || "there";
  const displayName = active?.display_name || "";
  const displayProvider = active?.provider_name || "";
  const planCfg = PLAN_LABELS[plan] || PLAN_LABELS.free;
  const allAnomalies = statements.flatMap((s) => (s.anomalies || []).map((a: any) => ({ ...a, statement_id: s.id })));
  const spent = (budget?.streams || []).reduce((a, s) => a + (s.spent || 0), 0);
  const usable = budget?.quarterly_usable ?? budget?.quarterly_total ?? 0;
  const left = usable - spent;
  const latest = statements[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WaylyHeader notifications={allAnomalies.length} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Greeting + wellbeing summary header */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.sage }} testID="dashboard-greeting">{greetingFor()}, {firstName}</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6, flexWrap: "wrap" }}>
            <Overline>Wellbeing summary</Overline>
            <View testID="dashboard-plan-badge" style={[styles.planBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Crown size={13} color={colors.gold} />
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.4, color: colors.primary }}>{planCfg.label.toUpperCase()}</T>
            </View>
          </View>
          <T style={{ fontFamily: fonts.heading, fontSize: 30, marginTop: 8 }}>
            {displayName ? `${displayName}, this quarter` : "Your dashboard"}
          </T>
          <T variant="small" style={{ marginTop: 2 }}>{planCfg.desc}</T>
          {budget ? (
            <T variant="bodyMuted" style={{ marginTop: 6 }}>
              {budget.quarter_label} · {budget.classification_label} · {moneyWhole(usable)} per quarter{displayProvider ? ` · Provider: ${displayProvider}` : ""}
            </T>
          ) : null}

          {/* Header actions (parity with web) */}
          {!isFree ? (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
              <Pressable testID="dashboard-upload-cta" onPress={() => router.push("/upload")} style={[styles.headerBtn, { backgroundColor: colors.cta }]}>
                <FileText size={16} color={colors.primaryFg} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primaryFg }}>Upload a statement</T>
              </Pressable>
              {activeId ? (
                <Pressable testID="dashboard-key-contacts-cta" onPress={() => router.push("/key-contacts" as any)} style={[styles.headerBtnOutline, { borderColor: colors.primary }]}>
                  <Users size={16} color={colors.primary} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>Key Contacts</T>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {loading ? (
          <Loading label="Loading your dashboard…" />
        ) : error ? (
          <StatePanel testID="dashboard-error" icon={AlertTriangle} title="Couldn't load your dashboard" message="Please check your connection and try again." actionLabel="Retry" onAction={load} />
        ) : (
          <>
            {/* Smart AI summary (Your Wayly Insight) */}
            {insight?.summary ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="smart-ai-summary-dashboard" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                    <View style={[styles.summaryIcon, { backgroundColor: colors.primary }]}>
                      <Sparkles size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.primary }}>SMART SUMMARY</T>
                      <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, marginTop: 2, color: colors.primary }}>Your Wayly Insight</T>
                      <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, marginTop: 8 }}>{sanitizeAI(insight.summary)}</T>
                      {insight.alerts?.map((a, i) => (
                        <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm, alignItems: "flex-start" }}>
                          <ArrowRight size={16} color={colors.sage} style={{ marginTop: 3 }} />
                          <T variant="small" style={{ flex: 1, color: colors.text }}>{sanitizeAI(a.text)}</T>
                        </View>
                      ))}
                    </View>
                  </View>
                </Card>
              </View>
            ) : null}

            {/* Free plan paywall */}
            {isFree ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="free-plan-limit-card" style={{ borderColor: colors.gold }}>
                  <View style={{ flexDirection: "row", gap: spacing.md }}>
                    <View style={[styles.lockIcon, { backgroundColor: colors.goldSoft }]}><Lock size={20} color={colors.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.heading, fontSize: 20 }}>Your trial has ended. Choose a plan to bring everything back.</T>
                      <T variant="small" style={{ marginTop: 8, lineHeight: 21 }}>You can still view every statement, anomaly, contact and AT-HM record we have on file for you. To add new entries, decode new statements, lodge support tickets, or use the AI tools, choose a plan.</T>
                      <Pressable testID="dashboard-upgrade-cta" onPress={() => router.push("/plan-select")} style={[styles.headerBtn, { backgroundColor: colors.cta, marginTop: spacing.md }]}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primaryFg }}>Choose a Plan</T>
                      </Pressable>
                    </View>
                  </View>
                </Card>
              </View>
            ) : null}

            {/* Quick-glance stat cards */}
            {!isFree && budget ? (
              <>
                <View style={styles.statsRow}>
                  <StatCard testID="stat-spent" icon={TrendingUp} label="This quarter" value={moneyWhole(spent)} sub={`of ${moneyWhole(usable)} · ${moneyWhole(left)} left`} colors={colors} shadow={shadow} />
                  <StatCard testID="stat-anomalies" icon={Bell} label="Alerts" value={String(allAnomalies.length)} sub={allAnomalies.length === 0 ? "Nothing unusual" : "Things to review"} onPress={() => router.push("/budget-alerts")} colors={colors} shadow={shadow} />
                </View>
                <View style={styles.statsRow}>
                  <StatCard testID="stat-statements" icon={FileText} label="Statements" value={String(statements.length)} sub={latest ? `Latest ${shortDate(latest.uploaded_at || latest.created_at)}` : "None yet"} onPress={() => router.push("/(tabs)/statements")} colors={colors} shadow={shadow} />
                  <StatCard testID="stat-cap" icon={CheckCircle2} label="Lifetime cap" value={`${(budget.lifetime_pct ?? 0).toFixed(1)}%`} sub={`used of ${moneyWhole(budget.lifetime_cap)}`} onPress={() => router.push("/reports")} colors={colors} shadow={shadow} />
                </View>

                {/* Stream breakdowns */}
                <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                  <View style={{ gap: spacing.md }}>
                    {(budget.streams || []).map((s) => <StreamProgress key={s.stream} stream={s} />)}
                  </View>
                  {budget.streams_note ? (
                    <View testID="dashboard-streams-note" style={[styles.note, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                      <T variant="small" style={{ flex: 1 }}>{budget.streams_note}</T>
                      <View testID="dashboard-streams-source" style={[styles.sourceBadge, { backgroundColor: budget.allocation_source === "statement" ? colors.sageSoft : colors.goldSoft }]}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.5, color: budget.allocation_source === "statement" ? colors.sage : colors.gold }}>
                          {budget.allocation_source === "statement" ? "FROM YOUR LATEST STATEMENT" : "INDICATIVE SPLIT"}
                        </T>
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Pathways */}
                {pathways.length > 0 ? (
                  <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                    <Card testID="dashboard-pathways" style={{ borderColor: colors.sage }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Overline>Pathways the participant may qualify for</Overline>
                        <View style={[styles.matchBadge, { backgroundColor: colors.sageSoft }]}>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, color: colors.sage }}>{pathways.length} match{pathways.length === 1 ? "" : "es"}</T>
                        </View>
                      </View>
                      <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                        {pathways.map((p) => (
                          <View key={p.pathway} testID={`dashboard-pathway-${p.pathway}`} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
                              <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, flex: 1 }}>{p.title}</T>
                              {p.episode_aud ? <T variant="small">Up to {moneyWhole(p.episode_aud)} · {p.duration_days} days</T> : null}
                            </View>
                            {p.reason ? <T variant="small" style={{ marginTop: 4 }}>{sanitizeAI(p.reason)}</T> : null}
                            {p.section_ref ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: colors.muted, marginTop: 6 }}>{p.section_ref.toUpperCase()}</T> : null}
                          </View>
                        ))}
                      </View>
                    </Card>
                  </View>
                ) : null}

                {/* Lifetime contribution cap */}
                <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                  <Card testID="lifetime-cap-card">
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                      <Overline>Lifetime contribution cap</Overline>
                      <T variant="small">{budget.is_grandfathered ? "Grandfathered" : "New entrant"}</T>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: spacing.sm, flexWrap: "wrap" }}>
                      <T style={{ fontFamily: fonts.heading, fontSize: 22 }}>
                        {money(budget.lifetime_contributions)} <T variant="small">of {moneyWhole(budget.lifetime_cap)}</T>
                      </T>
                      <T variant="small">{(budget.lifetime_pct ?? 0).toFixed(2)}%</T>
                    </View>
                    <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
                      <View style={{ width: `${Math.min(100, budget.lifetime_pct ?? 0)}%`, height: "100%", backgroundColor: colors.sage, borderRadius: 999 }} />
                    </View>
                  </Card>
                </View>
              </>
            ) : null}

            {/* Things to know */}
            {!isFree ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="alerts-card">
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Overline>Things to know</Overline>
                    {allAnomalies.length > 0 ? <T variant="small">{allAnomalies.length} item{allAnomalies.length === 1 ? "" : "s"}</T> : null}
                  </View>
                  {allAnomalies.length === 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md }}>
                      <Sparkles size={16} color={colors.sage} />
                      <T variant="small">Nothing unusual at the moment.</T>
                    </View>
                  ) : (
                    <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                      {allAnomalies.slice(0, 6).map((a: any, i: number) => (
                        <Pressable key={a.id || i} onPress={() => router.push(`/statement/${a.statement_id}`)} style={{ flexDirection: "row", gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md }}>
                          <AlertTriangle size={16} color={a.severity === "alert" ? colors.terracotta : colors.sage} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{a.title}</T>
                            {a.detail ? <T variant="small" style={{ marginTop: 2 }}>{a.detail}</T> : null}
                            {a.suggested_action ? <T variant="small" style={{ marginTop: 6, fontStyle: "italic", color: colors.primary }}>{`→ ${a.suggested_action}`}</T> : null}
                          </View>
                          <ChevronRight size={16} color={colors.muted} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Recent statements */}
            {!isFree ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="recent-statements-card">
                  <Overline>Recent statements</Overline>
                  {statements.length === 0 ? (
                    <View style={{ marginTop: spacing.md }}>
                      <T variant="small">No statements yet.</T>
                      <Pressable onPress={() => router.push("/upload")}><T style={{ color: colors.gold, fontFamily: fonts.bodySemi, marginTop: 4 }}>Upload one</T></Pressable>
                    </View>
                  ) : (
                    <View style={{ marginTop: spacing.sm }}>
                      {statements.slice(0, 5).map((s) => (
                        <Pressable key={s.id} onPress={() => router.push(`/statement/${s.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <FileText size={18} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }} numberOfLines={1}>{s.period_label || s.filename}</T>
                            <T variant="small">{(s.line_items || []).length} line items</T>
                          </View>
                          <ArrowRight size={16} color={colors.muted} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Latest statement, in plain English */}
            {!isFree && latest?.summary ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="latest-summary-card" style={{ backgroundColor: colors.surface2, borderColor: colors.border }}>
                  <Overline>Latest statement, in plain English</Overline>
                  <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, marginTop: spacing.sm }}>{sanitizeAI(latest.summary)}</T>
                  <Pressable onPress={() => router.push(`/statement/${latest.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md }}>
                    <T style={{ color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 14 }}>Open full statement</T>
                    <ArrowRight size={13} color={colors.primary} />
                  </Pressable>
                </Card>
              </View>
            ) : null}

            {/* AI chat, last conversation */}
            {!isFree ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="chat-preview-card">
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <MessageCircle size={15} color={colors.muted} />
                      <Overline>AI chat, last conversation</Overline>
                    </View>
                    <Pressable onPress={() => router.push("/(tabs)/ask")}><T style={{ color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 12 }}>Open chat</T></Pressable>
                  </View>
                  {chatHistory.length === 0 ? (
                    <T variant="small" style={{ marginTop: spacing.md, lineHeight: 21 }}>{`No chat yet. Ask Wayly anything about ${displayName || "the participant"}'s budget, statement, or care plan.`}</T>
                  ) : (
                    <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                      {chatHistory.slice(-3).map((m) => (
                        <View key={m.id}>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.6, color: colors.muted }}>{(m.role === "user" ? "You" : "Wayly").toUpperCase()} · {formatDateTime(m.created_at)}</T>
                          <T variant="small" numberOfLines={2} style={{ marginTop: 2, color: colors.text }}>{m.content}</T>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Audit Log preview */}
            {!isFree ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="audit-preview-card">
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Shield size={15} color={colors.muted} />
                      <Overline>Audit Log</Overline>
                    </View>
                    <Pressable onPress={() => router.push("/audit")}><T style={{ color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 12 }}>View all</T></Pressable>
                  </View>
                  {audit.length === 0 ? (
                    <T variant="small" style={{ marginTop: spacing.md }}>No actions logged yet.</T>
                  ) : (
                    <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                      {audit.slice(0, 4).map((a) => (
                        <View key={a.id} style={{ flexDirection: "row", gap: spacing.sm }}>
                          <Activity size={15} color={colors.sage} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13 }}>{(a.action || "").replace(/_/g, " ")}</T>
                            <T variant="small">{a.actor_name ? `${a.actor_name} · ` : ""}{formatDateTime(a.created_at)}</T>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Family thread (Family plan only) */}
            {isFamily ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="family-preview-card">
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Users2 size={15} color={colors.muted} />
                      <Overline>Family thread</Overline>
                    </View>
                    <Pressable onPress={() => router.push("/(tabs)/family")}><T style={{ color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 12 }}>Open thread</T></Pressable>
                  </View>
                  {familyMsgs.length === 0 ? (
                    <T variant="small" style={{ marginTop: spacing.md, lineHeight: 21 }}>{`No family messages yet. Share what's happening with siblings or your advisor without group SMS chains.`}</T>
                  ) : (
                    <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                      {familyMsgs.slice(-3).map((m) => (
                        <View key={m.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm }}>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.6, color: colors.muted }}>{(m.author_name || "").toUpperCase()} · {formatDateTime(m.created_at)}</T>
                          <T variant="small" style={{ marginTop: 2, color: colors.text }}>{m.body}</T>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Solo upgrade nudge */}
            {plan === "solo" ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="upgrade-to-family-card" style={{ backgroundColor: colors.surface2, borderColor: colors.border }}>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Calendar size={20} color={colors.primary} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Want siblings, advisors, or a GP looped in?</T>
                      <T variant="small" style={{ marginTop: 4, lineHeight: 21 }}>Family plan adds 5 seats, role-based permissions, and the Sunday digest. Upgrade any time, no card surprises.</T>
                      <Pressable onPress={() => router.push("/plan-select")} style={{ marginTop: spacing.sm }}><T style={{ color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 14 }}>Compare plans</T></Pressable>
                    </View>
                  </View>
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ icon: Icon, label, value, sub, onPress, colors, shadow, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card, pressed && onPress && { opacity: 0.85 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon size={16} color={colors.muted} />
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.6, color: colors.muted }}>{label.toUpperCase()}</T>
      </View>
      <T style={{ fontFamily: fonts.heading, fontSize: 22, marginTop: 4 }} numberOfLines={1}>{value}</T>
      <T variant="small" style={{ marginTop: 2 }} numberOfLines={2}>{sub}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl, paddingTop: spacing.sm },
  planBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill },
  headerBtnOutline: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 2 },
  summaryIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  lockIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  stat: { flex: 1, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  note: { flexDirection: "row", gap: spacing.sm, alignItems: "center", borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  matchBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  bar: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: spacing.sm },
});
