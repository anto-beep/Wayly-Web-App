import React, { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useScrollToTop } from "@react-navigation/native";
import {
  TrendingUp, Bell, FileText, CheckCircle2, AlertTriangle, Sparkles, ChevronRight,
  UploadCloud, MessageCircle, Users, Activity, ArrowRight,
} from "lucide-react-native";

import { WaylyHeader } from "@/src/components/WaylyHeader";
import { StreamProgress, Stream } from "@/src/components/StreamProgress";
import { Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, moneyWhole, sanitizeAI, shortDate, timeAgo, greetingFor } from "@/src/utils/format";

type Budget = {
  quarter_label?: string; classification_label?: string; quarterly_usable?: number; quarterly_total?: number;
  streams?: Stream[]; streams_note?: string; allocation_source?: string;
  lifetime_cap?: number; lifetime_contributions?: number; lifetime_pct?: number; is_grandfathered?: boolean;
};
type Statement = { id: string; filename: string; period_label?: string | null; uploaded_at?: string; created_at?: string; anomalies?: any[]; provider_name?: string };
type Pathway = { pathway: string; title: string; episode_aud?: number; duration_days?: number; reason?: string; section_ref?: string };
type AuditEntry = { id: string; actor_name?: string; action?: string; detail?: string; created_at?: string };
type Insight = { summary?: string; alerts?: { level: string; text: string }[] };

const Overline = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();
  return <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.8, color: colors.muted }}>{String(children).toUpperCase()}</T>;
};

export default function Dashboard() {
  const { user } = useAuth();
  const { activeId } = useParticipants();
  const { colors, shadow } = useTheme();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [b, stmts, pw, au] = await Promise.all([
        apiFetch<Budget>("/budget/current").catch(() => null),
        apiFetch<Statement[]>("/statements").catch(() => []),
        apiFetch<{ eligible: Pathway[] }>("/budget/eligible-pathways").catch(() => ({ eligible: [] })),
        apiFetch<AuditEntry[]>("/audit-log").catch(() => []),
      ]);
      setBudget(b);
      setStatements(Array.isArray(stmts) ? stmts : []);
      setPathways(pw?.eligible || []);
      setAudit(Array.isArray(au) ? au.slice(0, 5) : []);
      // AI wellbeing summary (non-blocking)
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
        {/* Wellbeing summary header */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Overline>Wellbeing summary</Overline>
            <View style={[styles.planBadge, { backgroundColor: colors.goldSoft }]}>
              <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: colors.gold }}>{(user?.plan || "free").toUpperCase()}</T>
            </View>
          </View>
          <T style={{ fontFamily: fonts.heading, fontSize: 30, marginTop: 6 }} testID="dashboard-greeting">{greetingFor()}, {firstName}</T>
          {budget ? (
            <T variant="bodyMuted" style={{ marginTop: 4 }}>
              {budget.quarter_label} · {budget.classification_label} · {moneyWhole(usable)} per quarter
            </T>
          ) : null}
        </View>

        {loading ? (
          <Loading label="Loading your dashboard…" />
        ) : error ? (
          <StatePanel testID="dashboard-error" icon={AlertTriangle} title="Couldn't load your dashboard" message="Please check your connection and try again." actionLabel="Retry" onAction={load} />
        ) : (
          <>
            {/* AI wellbeing summary */}
            {insight?.summary ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="dashboard-ai-summary" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Sparkles size={18} color={colors.sage} />
                    <T style={{ fontFamily: fonts.bodySemi, color: colors.sage }}>Wayly summary</T>
                  </View>
                  <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23 }}>{sanitizeAI(insight.summary)}</T>
                  {insight.alerts?.map((a, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm, alignItems: "flex-start" }}>
                      <ArrowRight size={16} color={colors.sage} style={{ marginTop: 3 }} />
                      <T variant="small" style={{ flex: 1, color: colors.text }}>{sanitizeAI(a.text)}</T>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            {/* Quick-glance stat cards */}
            {budget ? (
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
                  <Overline>Budget snapshot</Overline>
                  <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
                    {(budget.streams || []).map((s) => <StreamProgress key={s.stream} stream={s} />)}
                  </View>
                  {budget.streams_note ? (
                    <View testID="dashboard-streams-note" style={[styles.note, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                      <T variant="small" style={{ flex: 1 }}>{budget.streams_note}</T>
                      <View style={[styles.sourceBadge, { backgroundColor: budget.allocation_source === "statement" ? colors.sageSoft : colors.goldSoft }]}>
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
                        </View>
                        <ChevronRight size={16} color={colors.muted} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </Card>
            </View>

            {/* Recent statements */}
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
                    {statements.slice(0, 4).map((s) => (
                      <Pressable key={s.id} onPress={() => router.push(`/statement/${s.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <FileText size={18} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }} numberOfLines={1}>{s.period_label || s.filename}</T>
                          <T variant="small">{shortDate(s.uploaded_at || s.created_at)}</T>
                        </View>
                        <ChevronRight size={16} color={colors.muted} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </Card>
            </View>

            {/* Recent activity */}
            {audit.length > 0 ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Card testID="recent-activity-card">
                  <Overline>Recent activity</Overline>
                  <View style={{ marginTop: spacing.sm }}>
                    {audit.map((a) => (
                      <View key={a.id} style={{ flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Activity size={16} color={colors.sage} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13 }}>{a.detail || a.action}</T>
                          <T variant="small">{a.actor_name ? `${a.actor_name} · ` : ""}{timeAgo(a.created_at)}</T>
                        </View>
                      </View>
                    ))}
                  </View>
                </Card>
              </View>
            ) : null}

            {/* Quick actions */}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
              <Overline>Quick actions</Overline>
              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
                <ActionTile icon={UploadCloud} label="Upload a statement" onPress={() => router.push("/upload")} colors={colors} shadow={shadow} testID="action-upload" />
                <ActionTile icon={MessageCircle} label="Ask Wayly" onPress={() => router.push("/(tabs)/ask")} colors={colors} shadow={shadow} testID="action-ask" />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                <ActionTile icon={Users} label="Key Contacts" onPress={() => router.push("/key-contacts" as any)} colors={colors} shadow={shadow} testID="action-contacts" />
                <ActionTile icon={Sparkles} label="AI Tools" onPress={() => router.push("/(tabs)/ai-tools")} colors={colors} shadow={shadow} testID="action-tools" />
              </View>
            </View>
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

function ActionTile({ icon: Icon, label, onPress, colors, shadow, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card, pressed && { opacity: 0.85 }]}>
      <View style={[styles.actionIcon, { backgroundColor: colors.gold }]}><Icon size={20} color="#fff" /></View>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginTop: spacing.sm }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl, paddingTop: spacing.sm },
  planBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  stat: { flex: 1, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  note: { flexDirection: "row", gap: spacing.sm, alignItems: "center", borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  matchBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  bar: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: spacing.sm },
  action: { flex: 1, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, alignItems: "flex-start" },
  actionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
