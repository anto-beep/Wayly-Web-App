import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  ChevronRight,
  FileText,
  ReceiptText,
  AlertCircle,
  DollarSign,
  UploadCloud,
  MessageCircle,
  TrendingUp,
  Ribbon,
} from "lucide-react-native";

import { WaylyHeader } from "@/src/components/WaylyHeader";
import { ParticipantSwitcher } from "@/src/components/ParticipantSwitcher";
import { Card, Loading, StatePanel, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money, shortDate } from "@/src/utils/format";

type Statement = { id: string; filename: string; period_label?: string | null; uploaded_at: string; anomalies?: any[]; anomaly_dollar_impact_total?: number; line_items?: any[] };
type Pacing = { envelope?: number; actual_spent?: number; projected_end_of_quarter_total?: number; pace_status?: string; quarter?: { label?: string; total_days?: number; elapsed_days?: number } };

function paceMeta(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "over": return { label: "Over pace", color: "#B7791F" };
    case "under": return { label: "Under pace", color: "#1B5733" };
    case "on": case "on_track": return { label: "On track", color: "#1B5733" };
    default: return { label: "Tracking", color: "#524B42" };
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const { activeId, active } = useParticipants();
  const { colors, shadow } = useTheme();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [invoiceCount, setInvoiceCount] = useState<number | null>(null);
  const [pacing, setPacing] = useState<Pacing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [stmts, inv, pace] = await Promise.all([
        apiFetch<Statement[]>("/statements"),
        apiFetch<{ count: number }>("/invoices").catch(() => ({ count: 0 })),
        activeId ? apiFetch<Pacing>(`/qp1/pacing?participant_id=${activeId}`).catch(() => null) : Promise.resolve(null),
      ]);
      setStatements(Array.isArray(stmts) ? stmts : []);
      setInvoiceCount(inv?.count ?? 0);
      setPacing(pace);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const firstName = user?.first_name || user?.name?.split(" ")[0] || "there";
  const totalAnomalies = statements.reduce((s, st) => s + (st.anomalies?.length || 0), 0);
  const totalImpact = statements.reduce((s, st) => s + (st.anomaly_dollar_impact_total || 0), 0);
  const latest = statements[0];
  const planLabel = (user?.plan || "free").replace(/^\w/, (c) => c.toUpperCase());
  const pace = paceMeta(pacing?.pace_status);
  const envPct = pacing?.envelope ? Math.round(((pacing.actual_spent || 0) / pacing.envelope) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WaylyHeader notifications={totalAnomalies} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <View style={{ paddingHorizontal: spacing.lg }}>
          <T style={{ fontFamily: fonts.heading, fontSize: 28 }}>Hi, {firstName}</T>
          <T variant="bodyMuted" style={{ marginBottom: spacing.md }}>Here&apos;s your care overview</T>
          <ParticipantSwitcher householdName={user?.name} />
        </View>

        {loading ? (
          <Loading label="Loading your dashboard…" />
        ) : error ? (
          <StatePanel testID="dashboard-error" icon={AlertCircle} title="Couldn't load your dashboard" message="Please check your connection and try again." actionLabel="Retry" onAction={load} />
        ) : (
          <>
            {/* Quarterly Pacing */}
            {pacing?.envelope ? (
              <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
                <Pressable testID="pacing-card" onPress={() => router.push("/(tabs)/statements")} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TrendingUp size={18} color={colors.primary} />
                      <T variant="label" style={{ color: colors.muted }}>QUARTERLY PACING</T>
                    </View>
                    <ChevronRight size={18} color={colors.muted} />
                  </View>
                  <T style={{ fontFamily: fonts.heading, fontSize: 22, marginTop: 4, color: pace.color }}>
                    {pace.label} · {pacing.quarter?.label || ""}
                  </T>
                  <View style={styles.pacingRow}>
                    <PacingStat label="ENVELOPE" value={money(pacing.envelope)} colors={colors} />
                    <PacingStat label="SPENT SO FAR" value={money(pacing.actual_spent)} colors={colors} />
                    <PacingStat label="PROJECTED" value={money(pacing.projected_end_of_quarter_total)} colors={colors} />
                  </View>
                  <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
                    <View style={{ width: `${Math.min(envPct, 100)}%`, height: "100%", backgroundColor: pace.color, borderRadius: 999 }} />
                  </View>
                  <T variant="small" style={{ marginTop: 6 }}>
                    {envPct}% of envelope
                    {pacing.quarter?.elapsed_days != null && pacing.quarter?.total_days != null
                      ? ` · ${pacing.quarter.elapsed_days} of ${pacing.quarter.total_days} days elapsed`
                      : ""}
                  </T>
                </Pressable>
              </View>
            ) : null}

            {/* Plan */}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
              <Card testID="plan-status-card" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <T style={{ fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 }}>
                      {(user?.subscription_status || "free").toUpperCase()} PLAN
                    </T>
                    <T style={{ fontFamily: fonts.heading, fontSize: 24, color: "#fff", marginTop: 2 }}>{planLabel}</T>
                    <T style={{ fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>
                      {active?.display_name || user?.name}
                    </T>
                  </View>
                  <Ribbon size={26} color="rgba(255,255,255,0.9)" />
                </View>
              </Card>
            </View>

            {/* At a glance */}
            <View style={styles.statsRow}>
              <StatTile icon={FileText} value={String(statements.length)} label="Statements" onPress={() => router.push("/(tabs)/statements")} colors={colors} shadow={shadow} tint={colors.primary} testID="stat-statements" />
              <StatTile icon={ReceiptText} value={invoiceCount === null ? "—" : String(invoiceCount)} label="Invoices" onPress={() => router.push("/invoices")} colors={colors} shadow={shadow} tint={colors.primary} testID="stat-invoices" />
            </View>
            <View style={styles.statsRow}>
              <StatTile icon={AlertCircle} value={String(totalAnomalies)} label="Flags found" colors={colors} shadow={shadow} tint={colors.alert} testID="stat-flags" />
              <StatTile icon={DollarSign} value={money(totalImpact)} label="$ impact" colors={colors} shadow={shadow} tint={colors.gold} testID="stat-impact" />
            </View>

            {/* Quick actions */}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Quick actions</T>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <ActionTile icon={UploadCloud} label="Upload a document" onPress={() => router.push("/upload")} colors={colors} shadow={shadow} testID="action-upload" />
                <ActionTile icon={MessageCircle} label="Ask Wayly" onPress={() => router.push("/(tabs)/ask")} colors={colors} shadow={shadow} testID="action-ask" />
              </View>
            </View>

            {/* Latest statement */}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
              <T variant="h3" style={{ marginBottom: spacing.sm }}>Latest statement</T>
              {latest ? (
                <Card testID="latest-statement-card" style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <View style={[styles.docIcon, { backgroundColor: colors.sageSoft }]}>
                      <FileText size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }} numberOfLines={1}>{latest.period_label || latest.filename}</T>
                      <T variant="small">{shortDate(latest.uploaded_at)} · {latest.line_items?.length || 0} items</T>
                    </View>
                    <T testID="latest-statement-open" style={{ color: colors.gold, fontFamily: fonts.bodySemi }} onPress={() => router.push(`/statement/${latest.id}`)}>View</T>
                  </View>
                </Card>
              ) : (
                <StatePanel testID="dashboard-empty-statements" icon={FileText} title="No statements yet" message="Upload your first Support at Home statement to see it decoded here." actionLabel="Upload a statement" onAction={() => router.push("/upload")} />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PacingStat({ label, value, colors }: any) {
  return (
    <View style={{ flex: 1 }}>
      <T style={{ fontFamily: fonts.body, fontSize: 10, color: colors.muted, letterSpacing: 0.4 }}>{label}</T>
      <T style={{ fontFamily: fonts.monoMedium, fontSize: 16, color: colors.text, marginTop: 2 }}>{value}</T>
    </View>
  );
}

function StatTile({ icon: Icon, value, label, onPress, tint, colors, shadow, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card, pressed && onPress && { opacity: 0.85 }]}>
      <Icon size={22} color={tint} />
      <T style={{ fontFamily: fonts.heading, fontSize: 22, marginTop: 6 }} numberOfLines={1}>{value}</T>
      <T variant="small">{label}</T>
    </Pressable>
  );
}

function ActionTile({ icon: Icon, label, onPress, colors, shadow, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.tile, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: "flex-start" }, shadow.card, pressed && { opacity: 0.85 }]}>
      <View style={[styles.actionIcon, { backgroundColor: colors.gold }]}>
        <Icon size={22} color="#fff" />
      </View>
      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, marginTop: spacing.sm }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl, paddingTop: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  pacingRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  bar: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: 4 },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  tile: { flex: 1, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  actionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  docIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
